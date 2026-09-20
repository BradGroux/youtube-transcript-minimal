/* Minimal Transcript — popup logic. No tracking, no popups, no nonsense. */
'use strict';

const $ = (id) => document.getElementById(id);

let tracks = [];
let videoTitle = 'transcript';
let format = 'md';
let tabId = null;

// Preferences: remembered across popup opens via chrome.storage.local.
// Defaults are Markdown with timestamps — change them in the popup and
// your choice sticks. The language picker works the same way: pick a
// language once and it becomes your preferred language for every video.
const PREFS_KEY = 'minimal-transcript-prefs';
const DEFAULT_PREFS = { format: 'md', timestamps: true, lang: null };
const FORMATS = ['txt', 'md', 'srt', 'vtt'];

function validLang(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function loadPrefs() {
  try {
    const stored = await chrome.storage.local.get(PREFS_KEY);
    const p = (stored && stored[PREFS_KEY]) || {};
    return {
      format: FORMATS.includes(p.format) ? p.format : DEFAULT_PREFS.format,
      timestamps: typeof p.timestamps === 'boolean' ? p.timestamps : DEFAULT_PREFS.timestamps,
      lang: validLang(p.lang),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function selectedTrackLang() {
  try {
    const t = tracks[Number($('lang').value)];
    return (t && t.lang) || null;
  } catch {
    return null;
  }
}

function savePrefs() {
  try {
    chrome.storage.local.set({
      [PREFS_KEY]: {
        format,
        timestamps: $('timestamps').checked,
        lang: selectedTrackLang(),
      },
    });
  } catch {
    // Storage unavailable — preferences just won't persist this session.
  }
}

function applyPrefs(prefs) {
  format = prefs.format;
  document
    .querySelectorAll('#format button')
    .forEach((x) => x.classList.toggle('active', x.dataset.fmt === format));
  $('timestamps').checked = prefs.timestamps;
  $('ts-row').style.display = format === 'txt' || format === 'md' ? '' : 'none';
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('youtube.com')) return null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(shorts|embed)\/([\w-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

async function getCaptions(tid) {
  try {
    return await chrome.tabs.sendMessage(tid, { type: 'GET_CAPTIONS' });
  } catch {
    // Content script not injected yet (extension installed mid-session).
    await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tid, { type: 'GET_CAPTIONS' });
  }
}

async function getTranscript(tid, baseUrl) {
  const res = await chrome.tabs.sendMessage(tid, { type: 'GET_TRANSCRIPT', baseUrl });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Transcript download failed.');
  return res;
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').classList.remove('hidden');
  $('video-title').textContent = '';
}

function trackLabel(t) {
  return t.kind === 'asr' ? `${t.name} (auto-generated)` : t.name;
}

// Which track index to pre-select. Pure function (no DOM), so the Node
// test harness can cover it. Preference order:
//   1. the user's saved preferred language (manual track first, then auto)
//   2. the browser's locale language (manual track first, then auto)
//   3. any manual (non-auto-generated) track
//   4. the video's default (first) track
// Language codes match loosely: 'en' satisfies 'en-US' and vice versa.
function pickTrackIndex(trackList, prefLang) {
  const norm = (s) => String(s || '').toLowerCase();
  const matches = (trackLang, want) => {
    const t = norm(trackLang), w = norm(want);
    return t.startsWith(w) || w.startsWith(t);
  };
  const wants = [];
  if (validLang(prefLang)) wants.push(prefLang);
  const nav = norm((typeof navigator !== 'undefined' && navigator.language) || '').split('-')[0];
  if (nav && !wants.some((w) => matches(w, nav))) wants.push(nav);
  for (const want of wants) {
    let i = trackList.findIndex((t) => t.kind !== 'asr' && matches(t.lang, want));
    if (i < 0) i = trackList.findIndex((t) => matches(t.lang, want));
    if (i >= 0) return i;
  }
  const manual = trackList.findIndex((t) => t.kind !== 'asr');
  return manual >= 0 ? manual : 0;
}

function fillLanguages(prefLang) {
  const sel = $('lang');
  sel.innerHTML = '';
  tracks.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = trackLabel(t);
    sel.appendChild(opt);
  });
  sel.value = String(pickTrackIndex(tracks, prefLang));
}

function parseTranscript(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const nodes = doc.getElementsByTagName('text');
  const cues = [];
  for (const n of nodes) {
    const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    cues.push({
      start: parseFloat(n.getAttribute('start') || '0'),
      dur: parseFloat(n.getAttribute('dur') || '0'),
      text,
    });
  }
  return cues;
}

const pad = (n, l = 2) => String(n).padStart(l, '0');

function fmtSRT(s) {
  const ms = Math.round(s * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function fmtVTT(s) {
  const ms = Math.round(s * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

function fmtClock(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `[${h}:${pad(m)}:${pad(sec)}]` : `[${pad(m)}:${pad(sec)}]`;
}

function toTXT(cues, withTs) {
  return cues.map((c) => (withTs ? `${fmtClock(c.start)} ${c.text}` : c.text)).join('\n');
}

function toSRT(cues) {
  return cues.map((c, i) => `${i + 1}\n${fmtSRT(c.start)} --> ${fmtSRT(c.start + c.dur)}\n${c.text}`).join('\n\n') + '\n';
}

function toVTT(cues) {
  return 'WEBVTT\n\n' + cues.map((c) => `${fmtVTT(c.start)} --> ${fmtVTT(c.start + c.dur)}\n${c.text}`).join('\n\n') + '\n';
}

function toMD(cues, withTs, title) {
  const lines = cues.map((c) => (withTs ? `${fmtClock(c.start)} ${c.text}` : c.text));
  return `# ${title}\n\n` + lines.join('\n') + '\n';
}

function sanitize(name) {
  return (name || 'transcript').replace(/[^\w\-. ]+/g, '').trim().slice(0, 80) || 'transcript';
}

function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function buildTranscript() {
  const track = tracks[Number($('lang').value)];
  const res = await getTranscript(tabId, track.baseUrl);
  // Content script returns ready-made cues when it used YouTube's transcript
  // API fallback; otherwise raw XML for the classic parser.
  const cues = res.cues && res.cues.length ? res.cues : parseTranscript(res.xml || '');
  if (!cues.length) throw new Error('Transcript came back empty.');
  let text, ext, mime;
  if (format === 'srt') { text = toSRT(cues); ext = 'srt'; mime = 'text/srt'; }
  else if (format === 'vtt') { text = toVTT(cues); ext = 'vtt'; mime = 'text/vtt'; }
  else if (format === 'md') { text = toMD(cues, $('timestamps').checked, videoTitle); ext = 'md'; mime = 'text/markdown'; }
  else { text = toTXT(cues, $('timestamps').checked); ext = 'txt'; mime = 'text/plain'; }
  return { text, filename: `${sanitize(videoTitle)}.${track.lang}.${ext}`, mime };
}

async function withBusy(fn) {
  const btn = $('download');
  btn.disabled = true;
  $('status').textContent = 'Working…';
  try {
    await fn();
    $('status').textContent = 'Done.';
  } catch (e) {
    $('status').textContent = e.message || 'Something went wrong.';
  } finally {
    btn.disabled = false;
  }
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', async () => {
      const prefs = await loadPrefs();
      applyPrefs(prefs);

    // About links open in a new tab (in-page navigation is blocked in popups).
    document.querySelectorAll('a[data-ext]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: a.href });
      });
    });

    // Format segmented control.
    $('format').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      format = b.dataset.fmt;
      document.querySelectorAll('#format button').forEach((x) => x.classList.toggle('active', x === b));
      $('ts-row').style.display = (format === 'txt' || format === 'md') ? '' : 'none';
      savePrefs();
    });

    $('timestamps').addEventListener('change', savePrefs);

    // Changing the language picker sets the preferred language for every video.
    $('lang').addEventListener('change', savePrefs);

    $('download').addEventListener('click', () =>
      withBusy(async () => {
        const { text, filename, mime } = await buildTranscript();
        downloadFile(filename, text, mime);
      })
    );

    $('copy').addEventListener('click', () =>
      withBusy(async () => {
        const { text } = await buildTranscript();
        await navigator.clipboard.writeText(text);
      })
    );

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !extractVideoId(tab.url)) {
      showError('Open a YouTube video, then click the extension icon.');
      return;
    }
    tabId = tab.id;
    $('video-title').textContent = 'Loading captions…';

    try {
      const res = await getCaptions(tabId);
      if (!res || !res.ok) {
        showError((res && res.error) || 'Could not read this page. Reload the video tab and try again.');
        return;
      }
      if (!res.tracks.length) {
        $('video-title').textContent = res.title || '';
        showError('This video has no captions available.');
        return;
      }
      tracks = res.tracks;
      videoTitle = res.title || 'transcript';
      $('video-title').textContent = videoTitle;
      fillLanguages(prefs.lang);
      $('controls').classList.remove('hidden');
    } catch {
      showError('Could not reach the video tab. Reload the page and try again.');
    }
    });
}

// Test hook (Node only): expose the pure track-selection helpers to the
// dependency-free test harness in tests/. Guarded so browser behavior is
// unchanged — `module` is undefined inside the extension.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pickTrackIndex, validLang };
}
