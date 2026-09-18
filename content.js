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
  // videos, especially auto-generated captions). As a last resort, drives
  // YouTube's own "Show transcript" UI and scrapes the rendered panel —
  // that rides YouTube's real request path, so it works whenever the panel
  // itself works. The description is expanded and collapsed again.
  async function getTranscript(baseUrl) {
    try {
      const xml = await fetchTranscript(baseUrl);
      return { xml };
    } catch {
      /* fall through to the fallbacks below */
    }
    const res = await fetch(location.href, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load the video page.');
    const html = await res.text();
    try {
      const cues = await fetchTranscriptViaApi(html);
      return { cues };
    } catch {
      /* fall through to the panel fallback below */
    }
    const cues = await fetchTranscriptViaPanel();
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
    const { apiKey, visitorData, clientVersion, idToken, params } = extractInnertube(html);
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
    // Logged-in sessions: the web client sends its identity token on
    // youtubei requests; without it the endpoint can reject the call.
    if (idToken) headers['X-Youtube-Identity-Token'] = idToken;
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

  // Last-resort path: drive YouTube's own "Show transcript" UI and scrape
  // the rendered panel. This rides YouTube's real request path — including
  // whatever attestation its player code attaches — so it works whenever
  // Last-resort path: drive YouTube's own "Show transcript" UI and scrape
  // the rendered panel. This rides YouTube's real request path — including
  // whatever attestation its player code attaches — so it works whenever
  // the panel itself works. The description is expanded and collapsed
  // again afterwards (best effort).
  //
  // YouTube can show transcript content in more than one engagement panel
  // (the classic transcript panel and the newer "In this video" panel), and
  // the classic one may open empty on videos where YouTube gates caption
  // data. So every candidate panel is scored and the first one that yields
  // cues wins — an empty classic panel can never shadow a content-bearing
  // one. Traversal pierces open shadow roots, which YouTube uses heavily.
  async function fetchTranscriptViaPanel() {
    // Fast path: a panel is already open (e.g. opened manually) — scrape it.
    let found = extractPanelCuesFromBest();
    if (!found.cues.length) {
      let showBtn = findShowTranscriptButton();
      if (!showBtn) {
        const more = findExpandDescriptionButton();
        if (more) {
          try { more.scrollIntoView({ block: 'center' }); } catch { /* noop */ }
          more.click();
          await sleep(1500);
        }
        showBtn = findShowTranscriptButton();
      }
      if (!showBtn) throw new Error('No transcript panel found for this video.');
      try { showBtn.scrollIntoView({ block: 'center' }); } catch { /* noop */ }
      showBtn.click();
      const deadline = Date.now() + 20000;
      while (!found.cues.length && Date.now() < deadline) {
        await sleep(300);
        found = extractPanelCuesFromBest();
      }
      if (!found.cues.length) {
        throw new Error(
          "The transcript panel opened but stayed empty. If YouTube shows an " +
            "'In this video' panel with a Transcript tab, open it and try again."
        );
      }
    }
    const cues = await loadAllPanelCues(found);
    try {
      closeTranscriptPanel();
    } catch { /* best effort */ }
    if (!cues.length) throw new Error('The transcript panel was empty.');
    return cues;
  }

  // Every element under root, including inside open shadow roots.
  function deepElements(root) {
    const out = [];
    const walk = (node) => {
      if (!node || node.nodeType !== 1) return;
      out.push(node);
      const kids = node.children;
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
      if (node.shadowRoot) {
        const skids = node.shadowRoot.children;
        for (let i = 0; i < skids.length; i++) walk(skids[i]);
      }
    };
    walk(root);
    return out;
  }

  // Text content including text inside open shadow roots, in DOM order.
  function deepText(root) {
    let s = '';
    for (const el of deepElements(root)) {
      const nodes = el.childNodes;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].nodeType === 3) s += nodes[i].textContent + ' ';
      }
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  // Parent chain that crosses shadow boundaries (element -> shadow host).
  function deepParent(el) {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
    if (root && root.host) return root.host;
    return null;
  }

  // Visibility proxy for ranking (not filtering): a zero-area rect means
  // the element or an ancestor is display:none — typical of hidden panels.
  function isVisibleish(el) {
    try {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch {
      return false;
    }
  }

  // All candidate transcript panels, best first: visible panels holding
  // timestamp pills outrank hidden or empty ones.
  function findTranscriptPanels() {
    const candidates = [];
    const seen = new Set();
    const add = (el) => {
      if (el && !seen.has(el)) {
        seen.add(el);
        candidates.push(el);
      }
    };
    for (const el of document.querySelectorAll('ytd-engagement-panel-section-list-renderer')) {
      add(el);
    }
    // Fallback: walk up from any "transcript" search input to the smallest
    // ancestor holding several timestamp pills. This covers panels whose
    // target-id doesn't mention transcripts (e.g. the "In this video" panel).
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const panel of candidates.slice()) {
      for (const el of deepElements(panel)) {
        if ((el.tagName || '').toUpperCase() === 'INPUT') inputs.push(el);
      }
    }
    for (const input of inputs) {
      if (!/transcript/i.test(input.getAttribute('placeholder') || '')) continue;
      let el = deepParent(input);
      for (let d = 0; d < 16 && el && el !== document.body && el !== document.documentElement; d++) {
        if (countTimestampPills(el) >= 2) {
          add(el);
          break;
        }
        el = deepParent(el);
      }
    }
    candidates.sort((a, b) => {
      const va = isVisibleish(a) ? 1 : 0;
      const vb = isVisibleish(b) ? 1 : 0;
      if (va !== vb) return vb - va;
      return countTimestampPills(b) - countTimestampPills(a);
    });
    return candidates;
  }

  // The best candidate panel and its cues (first candidate that yields any).
  function extractPanelCuesFromBest() {
    for (const panel of findTranscriptPanels()) {
      const cues = extractCuesFromPanel(panel);
      if (cues.length) return { panel, cues };
    }
    return { panel: null, cues: [] };
  }

  function extractPanelCues() {
    return extractPanelCuesFromBest().cues;
  }

  const TS_RE = /^\d{1,3}:\d{2}(?::\d{2})?$/;

  function countTimestampPills(root) {
    let n = 0;
    for (const el of deepElements(root)) {
      if (el.children.length > 1) continue;
      if (TS_RE.test((el.textContent || '').trim())) {
        n++;
        if (n >= 2) return n;
      }
    }
    return n;
  }

  function extractCuesFromPanel(panel) {
    const els = deepElements(panel);
    // Strategy 1: classic segment renderers.
    const renderers = els.filter((el) =>
      /^ytd-transcript-segment-renderer$/i.test(el.tagName || '')
    );
    if (renderers.length) {
      const cues = [];
      for (const el of renderers) {
        const tsEl = el.querySelector('.segment-timestamp');
        const start = parseTsText(tsEl ? tsEl.textContent : '');
        if (start == null) continue;
        const clone = el.cloneNode(true);
        const cTs = clone.querySelector('.segment-timestamp');
        if (cTs) cTs.remove();
        const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        cues.push({ start, dur: 0, text });
      }
      if (cues.length) return finalizeCues(cues);
    }
    // Strategy 2: timestamp pills (redesigned "In this video" panel).
    return cuesFromTimestampPills(els);
  }

  function cuesFromTimestampPills(els) {
    const cues = [];
    const seen = new Set();
    for (const el of els) {
      if (el.children.length > 1) continue; // want leaf-ish nodes only
      const t = (el.textContent || '').trim();
      if (!TS_RE.test(t)) continue;
      const start = parseTsText(t);
      if (start == null) continue;
      // Walk up to the segment container: the nearest ancestor whose deep
      // text (shadow roots included) is substantially longer than the
      // timestamp itself.
      let node = deepParent(el);
      let container = null;
      for (let d = 0; d < 8 && node && node.nodeType === 1; d++) {
        if (deepText(node).length > t.length + 15) {
          container = node;
          break;
        }
        node = deepParent(node);
      }
      if (!container || seen.has(container)) continue;
      seen.add(container);
      // The pill is the first timestamp-like token in DOM order; strip just it.
      let text = deepText(container);
      const idx = text.indexOf(t);
      if (idx >= 0) text = text.slice(0, idx) + ' ' + text.slice(idx + t.length);
      text = text.replace(/\s+/g, ' ').trim();
      if (!text || TS_RE.test(text)) continue;
      cues.push({ start, dur: 0, text });
    }
    return finalizeCues(cues);
  }

  function finalizeCues(cues) {
    cues.sort((a, b) => a.start - b.start);
    const out = [];
    for (const c of cues) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.start - c.start) < 0.001) {
        if (c.text.length > last.text.length) out[out.length - 1] = c;
      } else {
        out.push(c);
      }
    }
    for (let i = 0; i < out.length; i++) {
      out[i].dur = i + 1 < out.length ? Math.max(0, out[i + 1].start - out[i].start) : 3;
    }
    return out;
  }

  // The segment list can be virtualized; scroll it to load the rest.
  async function loadAllPanelCues(found) {
    let cues = found.cues;
    let panel = found.panel;
    if (!panel) {
      const f = extractPanelCuesFromBest();
      panel = f.panel;
      if (!panel) return cues;
    }
    const scroller = findPanelScroller(panel);
    if (!scroller) return cues;
    let stable = 0;
    for (let i = 0; i < 8 && stable < 2; i++) {
      scroller.scrollTop = scroller.scrollHeight;
      await sleep(600);
      const now = extractPanelCuesFromBest();
      if (now.cues.length > cues.length) {
        cues = now.cues;
        if (now.panel) panel = now.panel;
        stable = 0;
      } else {
        stable++;
      }
    }
    try {
      scroller.scrollTop = 0;
    } catch { /* noop */ }
    return cues;
  }

  function findPanelScroller(panel) {
    const candidates = deepElements(panel).filter((el) => {
      try {
        return el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 100;
      } catch {
        return false;
      }
    });
    candidates.sort((a, b) => a.clientHeight - b.clientHeight);
    return candidates[0] || null;
  }

  function findShowTranscriptButton() {
    const els = Array.from(
      document.querySelectorAll('button, a, tp-yt-paper-button, ytd-button-renderer')
    );
    const isMatch = (b) => (b.textContent || '').trim().toLowerCase() === 'show transcript';
    const visible = els.filter((b) => isMatch(b) && b.offsetParent !== null);
    const el = visible[0] || els.find(isMatch) || null;
    // Custom elements wrap a real button — click that instead.
    if (el && /-/.test(el.tagName || '') && !/^button$/i.test(el.tagName)) {
      const inner = el.querySelector('button, a');
      if (inner) return inner;
    }
    return el;
  }

  function findExpandDescriptionButton() {
    const expander = document.querySelector('ytd-text-inline-expander');
    const byId = expander && expander.querySelector('#expand');
    if (byId) return byId;
    return (
      Array.from(document.querySelectorAll('tp-yt-paper-button, button')).find((b) =>
        /^\s*(\.\.\.|…)?\s*more\s*$/i.test(b.textContent || '')
      ) || null
    );
  }

  function closeTranscriptPanel() {
    const closeBtn = document.querySelector(
      '[aria-label="Close transcript"], ytd-engagement-panel-section-list-renderer[target-id*="transcript" i] [aria-label="Close"]'
    );
    if (closeBtn) closeBtn.click();
    const less = Array.from(document.querySelectorAll('tp-yt-paper-button, button')).find(
      (b) => /^\s*show less\s*$/i.test(b.textContent || '') && b.offsetParent !== null
    );
    if (less) less.click();
  }

  function parseTsText(t) {
    const parts = (t || '').trim().split(':').map((p) => parseInt(p, 10));
    if (!parts.length || parts.some((n) => Number.isNaN(n))) return null;
    let s = 0;
    for (const p of parts) s = s * 60 + p;
    return s;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function extractInnertube(html) {
    const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1] || '';
    const visitorData = (html.match(/"visitorData":"([^"]+)"/) || [])[1] || '';
    const idToken = (html.match(/"ID_TOKEN":"([^"]+)"/) || [])[1] || '';
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
    return { apiKey, visitorData, clientVersion, idToken, params };
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
