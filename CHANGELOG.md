# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
