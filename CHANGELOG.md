# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Renamed from "Minimal Transcript" to "Transcript Minimal" — popup title,
  extension name, and README now match the minimal-family naming.

### Added

- **About section**: the popup now ends with a small about footer — brought
  to you by Brad Groux and Digital Meld, with a link to learn to build tools
  like this in the SSTB.ai community. Links open in a new tab via
  `chrome.tabs.create`.

## [1.4.4] - 2026-09-18

### Added

- **Preferred language**: the language picker now remembers your choice across
  videos via `chrome.storage.local`. With no saved choice, the picker
  defaults to your browser's language (manual captions still preferred over
  auto-generated), then falls back to any manual track, then the video
  default. The preference drives track selection for the primary caption
  download; YouTube's own transcript surfaces (API + panel fallbacks) serve
  the video's default language, which YouTube doesn't let third parties
  override.
- `tests/language-preference.test.js`: dependency-free Node tests for the
  track-selection order (saved preference → browser locale → manual →
  default), including loose `en`/`en-US` code matching.

### Fixed

- Shorts edge cases: the panel fallback now detects `/shorts/` pages and
  fails with a clear message instead of hunting for a "Show transcript"
  entry point the Shorts player doesn't offer. Caption discovery and the
  timedtext/transcript-API paths never touch page DOM, so they work
  unchanged on Shorts whenever the Short has captions.

## [1.4.3] - 2026-09-18

### Fixed

- The panel fallback now recognizes YouTube's newest transcript markup:
  `transcript-segment-view-model` segments (timestamp pill +
  screen-reader label + `span[role="text"]` caption, no search input),
  reached through the Transcript chip. v1.4.2's chapter-list guard only
  knew the classic `ytd-transcript-segment-renderer` shape, so on videos
  using the new markup it rejected the real transcript panel and failed
  with "The transcript panel opened but stayed empty."
- Screen-reader timestamp labels (`*A11yLabel`) are now excluded by class
  in addition to the hidden-box check, so "0 seconds"-style descriptions
  can't leak into downloads however YouTube hides the label.
- Classic `ytd-transcript-segment-renderer` text now goes through the same
  screen-reader filter instead of raw `textContent`.

### Added

- `tests/panel-extraction.test.js`: dependency-free Node regression tests
  for the panel fallback, with fixtures modeled on real YouTube markup
  (modern segments, chapter-list panels, classic renderers, chip tabs).
  Run with `node tests/panel-extraction.test.js`.

## [1.4.2] - 2026-09-18

### Fixed

- The panel fallback no longer mistakes the *"In this video"* panel's
  **Chapters** tab for a transcript: it now clicks the panel's Transcript tab
  before scraping, and skips candidates that only hold a chapter list (no
  transcript UI affordance). Residual chapter rows are further cleaned by
  collapsing repeated visible + screen-reader title copies and stripping a
  trailing copy of the cue's own timestamp.
- The screen-reader duration filter now also catches 1px `clip-path`-clipped
  spans (not just zero-area rects), so hidden "0 seconds"-style descriptions
  can't leak through either way YouTube hides them.

## [1.4.1] - 2026-09-18

### Fixed

- Panel-scraped transcripts no longer include YouTube's visually-hidden
  screen-reader timestamp descriptions ("0 seconds", "1 minute, 5 seconds").
  They are now filtered out of the scraped text; real transcript text that
  merely starts with a duration phrase is unaffected.

## [1.4.0] - 2026-09-18

### Fixed

- Transcript-panel fallback now scores every engagement panel on the page
  instead of stopping at the classic transcript panel. On videos where
  YouTube gates caption data, the classic panel can open empty while the
  newer *"In this video"* panel holds the transcript — the scraper finds it
  now. Panel traversal also pierces open shadow roots, and the error message
  tells you to open YouTube's *"In this video"* Transcript tab and retry when
  the classic panel stays empty.

### Added

- The popup remembers your format and timestamp toggle between opens
  (`chrome.storage.local`, new `storage` permission — preferences only,
  nothing leaves your device). Defaults are now **Markdown with timestamps**.

## [1.3.0] - 2026-09-18

### Added

- Self-updating installs: a tiny background worker (`background.js`) checks
  this repo's published `manifest.json` on browser startup and every 30
  minutes, and reloads the extension when a newer version is available. Pair
  it with the new macOS LaunchAgent
  (`scripts/com.minimal-transcript.gitpull.plist`), which `git pull`s the
  repo every 15 minutes, and unpacked installs stay current with no manual
  reloads. The only network call the worker makes is fetching the repo's own
  public `manifest.json` — no user data, no identifiers, no telemetry. See
  [Automatic updates](README.md#automatic-updates).

## [1.2.1] - 2026-09-18

### Fixed

- Transcript-panel fallback now recognizes YouTube's redesigned transcript
  panel (the *"In this video"* view with chapter headers), which no longer
  uses the classic `ytd-transcript-segment-renderer` elements. The scraper
  first tries the classic renderers, then falls back to timestamp-pill
  detection, and scrolls virtualized segment lists to load long transcripts.
  It also scrapes directly when the panel is already open.

## [1.2.0] - 2026-09-18

### Added

- Transcript-panel fallback: if both the timedtext endpoint and the
  `get_transcript` API refuse the request (YouTube now rejects hand-rolled
  API calls on some videos with a `400`), the extension drives YouTube's own
  *\"Show transcript\"* UI and scrapes the rendered panel. That rides
  YouTube's real request path, so it works whenever the panel itself works.
  The description is expanded and collapsed again afterwards.
- The `get_transcript` API fallback now sends YouTube's identity token
  (`X-Youtube-Identity-Token`) on logged-in sessions, matching what the web
  client sends.

### Fixed

- `400` failure on videos where YouTube gates caption endpoints (e.g. some
  auto-generated-caption videos): the extension no longer gives up after the
  API fallback and instead falls through to the transcript panel.

## [1.1.0] - 2026-09-18

### Added

- Transcript API fallback: when YouTube answers the classic timedtext caption
  endpoint with an empty body (observed on videos with auto-generated captions),
  the extension now retries via the `youtubei/v1/get_transcript` endpoint using
  the page's own transcript parameters — the same request YouTube's *"Show
  transcript"* panel makes. Same-origin, still no third-party servers.
- Structured cue handoff: the content script can now return parsed cues
  (`{ start, dur, text }`) directly; the popup accepts cues or legacy XML.
- Language-name labels for blank auto-generated tracks (e.g. a nameless `en`
  ASR track now shows as "English (auto-generated)" instead of "en").
- Pagination support: the API fallback follows transcript continuations for
  long videos.

### Changed

- Clearer error when YouTube blocks caption downloads on a video, pointing at
  YouTube's own transcript panel as a fallback.

## [1.0.0] - 2026-09-18

### Added

- Initial release.
- One-click caption downloads from any YouTube watch page.
- Formats: TXT, Markdown, SRT, VTT; optional timestamps for TXT/Markdown.
- Copy-to-clipboard button.
- Language picker preferring manual captions over auto-generated.
- Filenames like `Video Title.en.txt`.
- Manifest V3, minimal permissions, no background service worker.

[Unreleased]: https://github.com/BradGroux/youtube-transcript-minimal/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/BradGroux/youtube-transcript-minimal/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/BradGroux/youtube-transcript-minimal/releases/tag/v1.0.0
