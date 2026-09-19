/* Minimal Transcript — language-preference tests.
 *
 * Dependency-free Node harness. Loads popup.js (its DOM wiring is guarded,
 * so requiring it in Node is safe) and exercises pickTrackIndex, the pure
 * function behind the popup's language picker: saved preference first,
 * then the browser locale, then any manual track, then the video default.
 *
 * Run: node tests/language-preference.test.js
 */
'use strict';

const { pickTrackIndex, validLang } = require('../popup.js');

function setLocale(tag) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: tag },
    configurable: true,
  });
}

const T = (lang, kind = '', name = lang) => ({ lang, kind, name });

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
  }
}

// Saved preference wins, manual track preferred over auto-generated.
check(
  'saved es picks manual Spanish',
  pickTrackIndex([T('en'), T('es'), T('es', 'asr')], 'es'),
  1
);
check(
  'saved es picks ASR Spanish when no manual Spanish exists',
  pickTrackIndex([T('en'), T('es', 'asr')], 'es'),
  1
);
// Language codes match loosely in both directions.
check(
  'saved en-US matches en track',
  pickTrackIndex([T('en')], 'en-US'),
  0
);
check(
  'saved en matches en-US track',
  pickTrackIndex([T('en-US')], 'en'),
  0
);
// Browser locale is the default when nothing is saved.
setLocale('fr-FR');
check(
  'fr locale picks French ASR over manual English',
  pickTrackIndex([T('en'), T('fr', 'asr')], null),
  1
);
check(
  'fr locale falls back to manual track when no French',
  pickTrackIndex([T('en'), T('de')], null),
  0
);
setLocale('en-US');
check(
  'en locale keeps the old manual-English default',
  pickTrackIndex([T('de'), T('en', 'asr'), T('en')], null),
  2
);
// Degenerate inputs.
check('empty list returns 0', pickTrackIndex([], 'es'), 0);
check('unknown preference falls back to locale then manual', pickTrackIndex([T('de')], 'xx'), 0);
setLocale('de-DE');
check('unknown preference with matching locale', pickTrackIndex([T('en'), T('de', 'asr')], 'xx'), 1);

// validLang: only non-blank strings survive.
check('validLang trims', validLang(' es '), 'es');
check('validLang rejects blank', validLang('   '), null);
check('validLang rejects non-string', validLang(42), null);
check('validLang rejects null', validLang(null), null);

console.log(`language-preference: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
