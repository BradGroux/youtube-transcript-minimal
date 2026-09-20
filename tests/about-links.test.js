/* Minimal Transcript — about-section tests.
 *
 * Dependency-free Node harness. Statically asserts the popup's about
 * section carries the right links (Brad's Twitter, Digital Meld, the
 * SSTB.ai community) and that popup.js opens data-ext links via
 * chrome.tabs.create instead of navigating the popup.
 *
 * Run: node tests/about-links.test.js
 */
'use strict';

const { readFileSync } = require('fs');
const { join } = require('path');

const DIR = join(__dirname, '..');
const html = readFileSync(join(DIR, 'popup.html'), 'utf8');
const js = readFileSync(join(DIR, 'popup.js'), 'utf8');
const css = readFileSync(join(DIR, 'popup.css'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log('ok   -', name);
  } else {
    failed++;
    console.log('FAIL -', name);
  }
}

const links = [...html.matchAll(/<a href="([^"]+)" data-ext>([^<]+)<\/a>/g)].map(
  (m) => m[2] + '=' + m[1]
);
check(
  'about links',
  links.join(' | ') ===
    'Brad Groux=https://twitter.com/bradgroux | ' +
      'Digital Meld=https://go.sstb.ai/extensions | ' +
      'SSTB.ai community=https://go.sstb.ai/transcript-minimal'
);
check('about section styled', css.includes('.about'));
check(
  'data-ext opens via tabs.create',
  js.includes("querySelectorAll('a[data-ext]')") &&
    js.includes('chrome.tabs.create({ url: a.href })')
);

console.log(`about-links: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
