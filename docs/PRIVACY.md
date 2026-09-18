# Privacy

Minimal Transcript is private by design. This document states exactly what the
extension touches and what it doesn't.

## What the extension does with your data

- **Reads the YouTube video page** you're on (title, caption track list) to
  show you what's downloadable.
- **Fetches captions from YouTube** on your behalf, using your normal logged-in
  (or logged-out) YouTube session — the same session the video page itself
  uses.
- **Formats the transcript locally** in the popup and hands it to you as a
  file download or clipboard write.

## What the extension does NOT do

- No analytics, telemetry, or crash reporting. There is no code that measures
  anything about you.
- No accounts, no sign-ups, no identifiers created or stored.
- No third-party servers. The only hosts ever contacted are `*.youtube.com`
  and `raw.githubusercontent.com` — the latter solely to fetch this repo's
  public `manifest.json` for the version check behind automatic updates.
  That request carries no user data, cookies, or identifiers (it's a plain
  fetch of a public file). (You can verify: search for `https://` in the
  source — every request target is a YouTube host or that one manifest URL.)
- No storage: no `chrome.storage`, no cookies set, no localStorage writes.
- No ad injection, no DOM modification of the YouTube page beyond reading it.

## Permissions, justified

| Permission | Used for |
|---|---|
| `activeTab` | Reading the current tab's URL/title when you click the icon. |
| `scripting` | Injecting the content script if the extension was installed while a YouTube tab was already open. |
| `alarms` | Waking the self-updater to check for a new published version (browser startup + every 30 minutes). |
| `*://*.youtube.com/*` | Reading the video page's player data and fetching captions. Same-origin only. |
| `https://raw.githubusercontent.com/*` | Fetching this repo's public `manifest.json` for the version check behind automatic updates. No user data is sent. |

## Session values in flight

To fetch transcripts the extension sends what YouTube's own page already
sends: your session cookies (via `credentials: 'include'`), the page's
visitor data, and per-request continuation tokens. These go to YouTube and
nowhere else, are never logged, and are never persisted.

## Verifying this yourself

The source is five small files with no dependencies and no build step. Search
for `https://` across them — every request target is a YouTube host, plus the
single public `manifest.json` URL in `background.js` used for update checks.
That's the whole audit.
