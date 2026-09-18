// Minimal Transcript — self-updater.
//
// Unpacked Chrome extensions never update themselves: Chrome only loads new
// code when you hit reload (or restart the browser). This worker closes that
// gap. It pairs with a scheduled `git pull` of this repo (see
// scripts/com.minimal-transcript.gitpull.plist): the pull puts new code on
// disk, and this worker notices the published version is newer than the
// installed one and reloads the extension so the new code takes effect.
//
// The only network call it makes is fetching this repo's public
// manifest.json from raw.githubusercontent.com. No user data, no
// identifiers, no telemetry — just a version number.

const REPO = "BradGroux/youtube-transcript-minimal";
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/manifest.json`;
const CHECK_INTERVAL_MINUTES = 30;
const ALARM_NAME = "minimal-transcript-update-check";

// Numeric dot-segment compare: true when `remote` is strictly newer.
function isNewer(remote, local) {
  const r = String(remote).split(".").map(Number);
  const l = String(local).split(".").map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = Number.isFinite(r[i]) ? r[i] : 0;
    const b = Number.isFinite(l[i]) ? l[i] : 0;
    if (a !== b) return a > b;
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const remote = await res.json();
    const local = chrome.runtime.getManifest().version;
    if (remote && remote.version && isNewer(remote.version, local)) {
      // New code is already on disk (the scheduled git pull fetched it);
      // reload so Chrome picks it up.
      chrome.runtime.reload();
    }
  } catch {
    // Offline, DNS hiccup, GitHub unreachable — stay quiet, retry on the next alarm.
  }
}

// `chrome.alarms.create` is idempotent for an existing name, so calling it at
// the top level guarantees the schedule exists even for installs that
// predated this worker (their `onInstalled` fired long ago).
chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });

chrome.runtime.onInstalled.addListener(() => checkForUpdate());
chrome.runtime.onStartup.addListener(() => checkForUpdate());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) checkForUpdate();
});
