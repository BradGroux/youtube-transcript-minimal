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
      fetchTranscript(msg.baseUrl)
        .then((xml) => sendResponse({ ok: true, xml }))
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
      if (t.name && t.name.runs) return t.name.runs.map((r) => r.text).join('');
    } catch { /* fall through */ }
    return t.languageCode || 'Unknown';
  }

  async function fetchTranscript(baseUrl) {
    const res = await fetch(baseUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`Transcript request failed (${res.status}).`);
    const xml = await res.text();
    if (!xml.includes('<text')) throw new Error('No transcript data returned.');
    return xml;
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
