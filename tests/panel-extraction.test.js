/* Minimal Transcript — panel-extraction regression tests.
 *
 * Dependency-free Node harness. Builds a minimal fake DOM, loads content.js,
 * and exercises the transcript-panel extraction against fixtures modeled on
 * real YouTube markup (including the <transcript-segment-view-model>
 * redesign observed 2026-09-18).
 *
 * Run: node tests/panel-extraction.test.js
 */
'use strict';

// ---------- Minimal fake DOM ----------

function matches(el, sel) {
  let tag = null;
  let cls = null;
  let attr = null;
  let val = null;
  const attrMatch = sel.match(/\[([^\]=]+)="([^"]*)"\]/);
  let base = sel;
  if (attrMatch) {
    attr = attrMatch[1];
    val = attrMatch[2];
    base = sel.slice(0, attrMatch.index);
  }
  if (base.startsWith('.')) cls = base.slice(1);
  else if (base) tag = base.toLowerCase();
  if (tag && (el.tagName || '').toLowerCase() !== tag) return false;
  if (cls && !(el.className || '').split(/\s+/).includes(cls)) return false;
  if (attr && el.getAttribute(attr) !== val) return false;
  return true;
}

class El {
  constructor(tag, attrs = {}, text = '') {
    this.tagName = String(tag).toUpperCase();
    this._attrs = { ...attrs };
    this._text = text;
    this.children = [];
    this.parentElement = null;
    this._rect = { width: 120, height: 40 }; // visible by default
  }
  get className() {
    return this._attrs.class || '';
  }
  getAttribute(name) {
    return this._attrs[name] !== undefined ? this._attrs[name] : null;
  }
  hasAttribute(name) {
    return this._attrs[name] !== undefined;
  }
  get textContent() {
    let s = this._text;
    for (const c of this.children) s += c.textContent;
    return s;
  }
  get childNodes() {
    const out = [];
    if (this._text) out.push({ nodeType: 3, textContent: this._text });
    for (const c of this.children) out.push(c);
    return out;
  }
  get nodeType() {
    return 1;
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentElement) {
      const i = this.parentElement.children.indexOf(this);
      if (i >= 0) this.parentElement.children.splice(i, 1);
      this.parentElement = null;
    }
  }
  cloneNode(deep) {
    const c = new El(this.tagName.toLowerCase(), { ...this._attrs }, this._text);
    c._rect = { ...this._rect };
    if (deep) for (const ch of this.children) c.appendChild(ch.cloneNode(true));
    return c;
  }
  getRootNode() {
    return this.parentElement ? { host: this.parentElement } : this;
  }
  getBoundingClientRect() {
    return { ...this._rect };
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      if (matches(node, sel)) out.push(node);
      for (const c of node.children) walk(c);
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  hide() {
    this._rect = { width: 0, height: 0 };
    return this;
  }
}

// ---------- Globals content.js expects ----------

global.chrome = { runtime: { onMessage: { addListener() {} } } };
global.getComputedStyle = () => ({
  display: 'block',
  visibility: 'visible',
  clipPath: 'none',
  clip: 'auto',
});

const panels = [];
global.document = {
  querySelectorAll(sel) {
    const out = [];
    for (const p of panels) out.push(...p.querySelectorAll(sel));
    return out;
  },
  body: new El('body'),
  documentElement: new El('html'),
};

const ct = require('../content.js');

// ---------- Fixtures (modeled on real YouTube markup) ----------

// One <transcript-segment-view-model> row, exactly as dumped from a live
// video page 2026-09-18 (video 4TOyv0CtmPE), wrapped like the real DOM.
function modernSegment(time, a11y, caption) {
  const seg = new El('transcript-segment-view-model', {
    class: 'ytwTranscriptSegmentViewModelHost',
  });
  seg.appendChild(
    new El(
      'div',
      { 'aria-hidden': 'true', class: 'ytwTranscriptSegmentViewModelTimestamp' },
      time
    )
  );
  seg.appendChild(
    new El('div', { class: 'ytwTranscriptSegmentViewModelTimestampA11yLabel' }, a11y)
  );
  seg.appendChild(
    new El(
      'span',
      { role: 'text', class: 'ytAttributedStringHost ytAttributedStringLinkInheritColor' },
      caption
    )
  );
  const content = new El('div', { class: 'ytwTimelineItemViewModelContentItems' });
  content.appendChild(seg);
  const tl = new El('timeline-item-view-model', {
    class: 'ytwTimelineItemViewModelHost ytwTimelineItemViewModelHostSmallerPadding',
  });
  tl.appendChild(content);
  const item = new El('macro-markers-panel-item-view-model', {
    class: 'ytwMacroMarkersPanelItemViewModelHost',
    tabindex: '0',
    role: 'button',
  });
  item.appendChild(tl);
  const wrap = new El('div');
  wrap.appendChild(item);
  return wrap;
}

// The chip-driven transcript panel: no target-id, no search input, modern segments.
function modernTranscriptPanel(rows) {
  const p = new El('ytd-engagement-panel-section-list-renderer');
  for (const [t, a11y, caption] of rows) p.appendChild(modernSegment(t, a11y, caption));
  return p;
}

// A chapter-list panel: timestamp pills + titles, no segment elements,
// no transcript affordance (like engagement-panel-structured-description).
function chapterPanel(targetId) {
  const p = new El('ytd-engagement-panel-section-list-renderer', {
    'target-id': targetId,
  });
  for (const [t, title] of [
    ['0:00', 'Intro'],
    ['0:30', 'Setup'],
    ['2:15', 'Demo'],
    ['5:00', 'Outro'],
  ]) {
    const row = new El('div', { class: 'chapter-row' });
    row.appendChild(new El('div', { class: 'chapter-timestamp' }, t));
    row.appendChild(new El('div', { class: 'chapter-title' }, title));
    p.appendChild(row);
  }
  return p;
}

// Classic renderer panel with a transcript search input (old YouTube DOM).
function classicTranscriptPanel() {
  const p = new El('ytd-engagement-panel-section-list-renderer', {
    'target-id': 'engagement-panel-searchable-transcript',
  });
  p.appendChild(new El('input', { placeholder: 'Search transcript' }));
  const r = new El('ytd-transcript-segment-renderer');
  r.appendChild(new El('div', { class: 'segment-timestamp' }, '0:07'));
  r.appendChild(new El('yt-formatted-string', {}, 'Hello world'));
  const sr = new El('span', { class: 'sr-only' }, '7 seconds');
  sr.hide(); // zero-area box, like YouTube's visually-hidden spans
  r.appendChild(sr);
  p.appendChild(r);
  return p;
}

// Chip strip with a Transcript tab button (role=tab), as dumped live.
function chipPanel(selected) {
  const p = new El('ytd-engagement-panel-section-list-renderer');
  const btn = new El(
    'button',
    {
      role: 'tab',
      'aria-selected': selected ? 'true' : 'false',
      class: 'ytChipShapeButtonReset',
    },
    'Transcript'
  );
  p.appendChild(btn);
  return { panel: p, btn };
}

// ---------- Test runner ----------

let passed = 0;
let failed = 0;
function test(name, fn) {
  panels.length = 0;
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function safeStr(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg} (expected ${safeStr(b)}, got ${safeStr(a)})`);
}

const MODERN_ROWS = [
  ['0:00', '0 seconds', 'For years, I built these 3D animations by hand.'],
  ['0:05', '5 seconds', 'Every keyframe placed with obsessive care.'],
  ['1:02', '1 minute, 2 seconds', 'Then I discovered procedural workflows.'],
];

test('modern segment: cueFromModernSegment extracts time + clean caption', () => {
  const seg = modernSegment('1:02', '1 minute, 2 seconds', 'Then I discovered procedural workflows.')
    .querySelector('transcript-segment-view-model');
  const cue = ct.cueFromModernSegment(seg);
  assert(cue, 'expected a cue');
  eq(cue.start, 62, 'start seconds');
  eq(cue.text, 'Then I discovered procedural workflows.', 'caption text');
  assert(!/second/i.test(cue.text), 'screen-reader label must not leak into text');
});

test('modern panel: extractCuesFromPanel returns sorted cues with durations', () => {
  const cues = ct.extractCuesFromPanel(modernTranscriptPanel(MODERN_ROWS));
  eq(cues.length, 3, 'cue count');
  eq(cues[0].start, 0, 'first start');
  eq(cues[1].start, 5, 'second start');
  eq(cues[2].start, 62, 'third start');
  eq(cues[0].dur, 5, 'first dur');
  eq(cues[1].dur, 57, 'second dur');
  eq(cues[0].text, 'For years, I built these 3D animations by hand.', 'first text');
  for (const c of cues) assert(!/second/i.test(c.text), `no sr junk in "${c.text}"`);
});

test('affordance: modern transcript panel accepted, chapter panels rejected', () => {
  assert(
    ct.panelHasTranscriptAffordance(modernTranscriptPanel(MODERN_ROWS)),
    'modern panel should have transcript affordance'
  );
  assert(
    !ct.panelHasTranscriptAffordance(
      chapterPanel('engagement-panel-structured-description')
    ),
    'structured-description chapter panel must be rejected'
  );
  assert(
    !ct.panelHasTranscriptAffordance(
      chapterPanel('engagement-panel-macro-markers-description-chapters')
    ),
    'macro-markers chapter panel must be rejected'
  );
});

test('best panel: visible modern transcript beats chapter list', () => {
  const chapters = chapterPanel('engagement-panel-structured-description');
  chapters.hide();
  const modern = modernTranscriptPanel(MODERN_ROWS);
  panels.push(chapters, modern); // chapter panel first in DOM order
  const found = ct.extractPanelCuesFromBest();
  assert(found.cues.length === 3, `expected 3 transcript cues, got ${found.cues.length}`);
  eq(found.cues[0].text, 'For years, I built these 3D animations by hand.', 'transcript text, not chapters');
  assert(
    !found.cues.some((c) => /^(Intro|Setup|Demo|Outro)$/.test(c.text)),
    'chapter titles must not appear'
  );
});

test('chapter-only DOM: best panel yields no cues (v1.4.2 guard holds)', () => {
  panels.push(chapterPanel('engagement-panel-structured-description'));
  const found = ct.extractPanelCuesFromBest();
  eq(found.cues.length, 0, 'no cues from chapter-only DOM');
  eq(found.panel, null, 'no panel selected');
});

test('classic DOM still works: renderer + search input', () => {
  const p = classicTranscriptPanel();
  assert(ct.panelHasTranscriptAffordance(p), 'classic panel affordance');
  const cues = ct.extractCuesFromPanel(p);
  eq(cues.length, 1, 'one cue');
  eq(cues[0].start, 7, 'start');
  eq(cues[0].text, 'Hello world', 'sr-only span filtered from classic renderer');
});

test('transcript-named panel id counts as affordance', () => {
  const p = new El('ytd-engagement-panel-section-list-renderer', {
    'target-id': 'engagement-panel-searchable-transcript',
  });
  assert(ct.panelHasTranscriptAffordance(p), 'transcript target-id accepted');
});

test('chip tab: findTranscriptTab finds it, isTabSelected honors aria-selected', () => {
  const unselected = chipPanel(false);
  const tab = ct.findTranscriptTab(unselected.panel);
  eq(tab, unselected.btn, 'finds the Transcript chip button');
  assert(!ct.isTabSelected(tab), 'aria-selected=false is not selected');
  const selected = chipPanel(true);
  assert(
    ct.isTabSelected(ct.findTranscriptTab(selected.panel)),
    'aria-selected=true is selected'
  );
});

test('deepText: a11y label excluded by class even with a non-zero box', () => {
  const seg = modernSegment('0:05', '5 seconds', 'Every keyframe placed with obsessive care.')
    .querySelector('transcript-segment-view-model');
  const text = ct.deepText(seg);
  assert(!/5 seconds/.test(text), `a11y label leaked: "${text}"`);
  assert(/obsessive care/.test(text), 'caption kept');
  assert(/0:05/.test(text), 'timestamp kept');
});

test('deepText: visible duration-like prose is kept', () => {
  const el = new El('span', { class: 'caption' }, '5 seconds later, the render finished.');
  eq(ct.deepText(el), '5 seconds later, the render finished.', 'prose kept');
});

test('parseTsText + finalizeCues basics', () => {
  eq(ct.parseTsText('1:02:03'), 3723, 'h:mm:ss');
  eq(ct.parseTsText('0:05'), 5, 'm:ss');
  const cues = ct.finalizeCues([
    { start: 10, dur: 0, text: 'b' },
    { start: 5, dur: 0, text: 'a' },
    { start: 5, dur: 0, text: 'a longer' },
  ]);
  eq(cues.length, 2, 'dedupes identical starts');
  eq(cues[0].text, 'a longer', 'keeps longer duplicate');
  eq(cues[0].dur, 5, 'dur from next start');
});

test('isShortsPage: detects /shorts/ URLs', () => {
  const real = globalThis.location;
  try {
    globalThis.location = { hostname: 'www.youtube.com', pathname: '/shorts/abc123DEF45' };
    eq(ct.isShortsPage(), true, 'shorts url');
    globalThis.location = { hostname: 'm.youtube.com', pathname: '/shorts/abc123DEF45' };
    eq(ct.isShortsPage(), true, 'shorts subdomain');
    globalThis.location = { hostname: 'www.youtube.com', pathname: '/watch' };
    eq(ct.isShortsPage(), false, 'watch url');
    globalThis.location = { hostname: 'www.youtube.com', pathname: '/embed/abc123DEF45' };
    eq(ct.isShortsPage(), false, 'embed url');
    globalThis.location = { hostname: 'www.notyoutube.com', pathname: '/shorts/abc123DEF45' };
    eq(ct.isShortsPage(), false, 'wrong host');
  } finally {
    if (real === undefined) delete globalThis.location;
    else globalThis.location = real;
  }
});

test('isShortsPage: false with no location (Node)', () => {
  const real = globalThis.location;
  try {
    delete globalThis.location;
    eq(ct.isShortsPage(), false, 'no location');
  } finally {
    if (real !== undefined) globalThis.location = real;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
