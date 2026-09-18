/* Minimal Transcript — popup logic. No tracking, no popups, no nonsense. */
'use strict';

const $ = (id) => document.getElementById(id);

let tracks = [];
let videoTitle = 'transcript';
let format = 'txt';
let tabId = null;

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

async function getTranscriptXml(tid, baseUrl) {
  const res = await chrome.tabs.sendMessage(tid, { type: 'GET_TRANSCRIPT', baseUrl });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Transcript download failed.');
  return res.xml;
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').classList.remove('hidden');
  $('video-title').textContent = '';
}

function trackLabel(t) {
  return t.kind === 'asr' ? `${t.name} (auto-generated)` : t.name;
}

function fillLanguages() {
  const sel = $('lang');
  sel.innerHTML = '';
  tracks.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = trackLabel(t);
    sel.appendChild(opt);
  });
  // Prefer a manual (non-auto) track, English first, else the first track.
  let pick = tracks.findIndex((t) => t.kind !== 'asr' && t.lang.startsWith('en'));
  if (pick < 0) pick = tracks.findIndex((t) => t.kind !== 'asr');
  if (pick < 0) pick = 0;
  sel.value = String(pick);
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
  const xml = await getTranscriptXml(tabId, track.baseUrl);
  const cues = parseTranscript(xml);
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

document.addEventListener('DOMContentLoaded', async () => {
  // Format segmented control.
  $('format').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    format = b.dataset.fmt;
    document.querySelectorAll('#format button').forEach((x) => x.classList.toggle('active', x === b));
    $('ts-row').style.display = (format === 'txt' || format === 'md') ? '' : 'none';
  });

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
    fillLanguages();
    $('controls').classList.remove('hidden');
  } catch {
    showError('Could not reach the video tab. Reload the page and try again.');
  }
});
