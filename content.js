/* Minimal Transcript — content script.
 * Runs in the YouTube tab. Reads the page's own player data (same-origin)
 * to find caption tracks, then fetches the transcript XML on request. */
(() => {
  'use strict';

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'GET_CAPTIONS') {
      getCaptions()
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;
    }
    if (msg.type === 'GET_TRANSCRIPT') {
      getTranscript(msg.baseUrl)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;
    }
  });

  async function getCaptions() {
    const res = await fetch(location.href, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load the video page.');
    const html = await res.text();
    const pr = extractPlayerResponse(html);
    if (!pr) throw new Error('No player data found on this page.');
    const list =
      (pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
    const title =
      (pr.videoDetails && pr.videoDetails.title) ||
      document.title.replace(/ - YouTube$/, '') ||
      'transcript';
    const tracks = list
      .filter((t) => t && t.baseUrl)
      .map((t) => ({
        lang: t.languageCode || 'und',
        name: nameOf(t),
        kind: t.kind || '',
        baseUrl: t.baseUrl,
      }));
    return { ok: true, title, tracks };
  }

  function nameOf(t) {
    try {
      if (t.name && t.name.runs) {
        const n = t.name.runs.map((r) => r.text).join('').trim();
        if (n && n.toLowerCase() !== (t.languageCode || '').toLowerCase()) return n;
      }
    } catch { /* fall through */ }
    // Auto-generated tracks often ship with a blank name; show "English" etc.
    const code = (t.languageCode || 'und').split('-')[0].toLowerCase();
    return LANG_NAMES[code] || t.languageCode || 'Unknown';
  }

  const LANG_NAMES = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
    hi: 'Hindi', ar: 'Arabic', nl: 'Dutch', sv: 'Swedish', pl: 'Polish',
    tr: 'Turkish', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai',
  };

  // Primary path: fetch the track's timedtext URL (legacy XML).
  // Falls back to the transcript API YouTube's own UI uses when YouTube
  // answers the timedtext request with an empty body (happens on some
  // videos, especially auto-generated captions).
  async function getTranscript(baseUrl) {
    try {
      const xml = await fetchTranscript(baseUrl);
      return { xml };
    } catch {
      /* fall through to the API fallback below */
    }
    const res = await fetch(location.href, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load the video page.');
    const cues = await fetchTranscriptViaApi(await res.text());
    return { cues };
  }

  async function fetchTranscript(baseUrl) {
    const res = await fetch(baseUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`Transcript request failed (${res.status}).`);
    const xml = await res.text();
    if (!xml.includes('<text')) throw new Error('No transcript data returned.');
    return xml;
  }

  // Same endpoint + params the "Show transcript" button in the video
  // description uses. Same-origin, uses the user's normal YouTube session.
  async function fetchTranscriptViaApi(html) {
    const { apiKey, visitorData, clientVersion, params } = extractInnertube(html);
    if (!apiKey || !params) {
      throw new Error('YouTube did not return captions for this video.');
    }
    const context = {
      client: { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' },
    };
    const headers = {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': clientVersion,
    };
    if (visitorData) {
      context.client.visitorData = visitorData;
      headers['X-Goog-Visitor-Id'] = visitorData;
    }
    const cues = [];
    let payload = { context, params };
    for (let page = 0; page < 20; page++) {
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(apiKey)}&prettyPrint=false`,
        { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) }
      );
      if (!res.ok) throw new Error(`Transcript request failed (${res.status}).`);
      const data = await res.json();
      const segments = [];
      collectNodes(data, 'transcriptSegmentRenderer', segments);
      for (const s of segments) {
        const runs = (s.snippet && s.snippet.runs) || [];
        const text = runs
          .map((r) => r.text || '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) continue;
        const startMs = parseFloat(s.startMs || '0');
        const endMs = parseFloat(s.endMs || '0');
        cues.push({
          start: startMs / 1000,
          dur: Math.max(0, (endMs - startMs) / 1000),
          text,
        });
      }
      const token = findContinuation(data);
      if (!token) break;
      payload = { context, continuation: token };
    }
    if (!cues.length) {
      throw new Error(
        "YouTube didn't return any captions for this video. " +
          'This happens on some videos where YouTube blocks caption downloads — ' +
          "YouTube's own transcript panel (video description → Show transcript) may still work."
      );
    }
    return cues;
  }

  function extractInnertube(html) {
    const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1] || '';
    const visitorData = (html.match(/"visitorData":"([^"]+)"/) || [])[1] || '';
    let clientVersion = '2.20240101.00.00';
    const ctxIdx = html.indexOf('"INNERTUBE_CONTEXT"');
    if (ctxIdx >= 0) {
      const m = html.slice(ctxIdx, ctxIdx + 6000).match(/"clientVersion":"([^"]+)"/);
      if (m) clientVersion = m[1];
    }
    let params = '';
    const tpIdx = html.indexOf('getTranscriptEndpoint');
    if (tpIdx >= 0) {
      const m = html.slice(tpIdx, tpIdx + 2000).match(/"params":"([^"]+)"/);
      if (m) {
        try {
          params = decodeURIComponent(m[1]);
        } catch {
          params = m[1];
        }
      }
    }
    return { apiKey, visitorData, clientVersion, params };
  }

  function collectNodes(obj, key, out) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const v of obj) collectNodes(v, key, out);
      return;
    }
    for (const k of Object.keys(obj)) {
      if (k === key) out.push(obj[k]);
      else collectNodes(obj[k], key, out);
    }
  }

  function findContinuation(data) {
    const lists = [];
    collectNodes(data, 'transcriptSegmentListRenderer', lists);
    for (const list of lists) {
      const conts = list.continuations || [];
      for (const c of conts) {
        const token =
          (c.nextContinuationData && c.nextContinuationData.continuation) ||
          (c.continuationCommand && c.continuationCommand.token);
        if (token) return token;
      }
    }
    const cmds = [];
    collectNodes(data, 'continuationCommand', cmds);
    return (cmds[0] && cmds[0].token) || '';
  }

  // Finds `ytInitialPlayerResponse = {...};` in the page HTML and parses the
  // balanced-brace JSON object that follows it.
  function extractPlayerResponse(html) {
    const marker = 'ytInitialPlayerResponse = ';
    const i = html.indexOf(marker);
    if (i < 0) return null;
    let j = i + marker.length;
    while (j < html.length && /\s/.test(html[j])) j++;
    if (html[j] !== '{') return null;
    const start = j;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let quote = '';
    for (; j < html.length; j++) {
      const c = html[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === quote) inStr = false;
      } else if (c === '"' || c === "'") {
        inStr = true;
        quote = c;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, j + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
})();
