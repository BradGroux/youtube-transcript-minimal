# AGENTS.md — instructions for AI agents working in this repo

This file tells an AI coding agent how to work in this repository. Humans:
the same conventions apply to you.

## What this is

A minimalist Chrome extension (Manifest V3) that downloads YouTube captions.
No build step, no dependencies, no bundler, no backend. Four files do the
work: `content.js`, `popup.js`, `popup.html`, `popup.css`.

## Non-negotiables

- **Minimalism is the feature.** Reject feature requests that need settings
  pages, options UIs, or onboarding. One click, transcript out.
- **Private by design.** No analytics, no accounts, no third-party servers.
  All traffic stays between the user's browser and `*.youtube.com`, using the
  user's normal session. Never add a network call to any other host.
- **Minimal permissions.** `activeTab`, `scripting`, and host access to
  `*.youtube.com` only. Any PR touching `manifest.json` permissions needs an
  explicit justification.
- **No secrets in the repo.** The `INNERTUBE_API_KEY` used by the transcript
  fallback is YouTube's public web-client key, extracted at runtime from the
  page — it must never be hardcoded. Continuation tokens and visitor data are
  per-session values, never committed.

## How to make changes

1. Edit the files directly — there is no build.
2. Syntax-check with `node --check content.js popup.js`.
3. Test by loading the folder unpacked in Chrome (`chrome://extensions` →
   Developer mode → Load unpacked) against a real video. YouTube serves
   bot-check pages to datacenter IPs, so automated end-to-end tests from a
   server are unreliable; verify parsing/formatting logic locally and note
   what was/wasn't live-tested in your summary.
4. Add a `CHANGELOG.md` entry under `[Unreleased]` for every user-facing
   change. Keep a Changelog format, SemVer.
5. Bump `manifest.json` `version` when cutting a release, and write release
   notes on the GitHub Releases page summarizing the CHANGELOG section.

## Code conventions

- Plain, dependency-free JavaScript. ES2019+ is fine for Chrome 88+.
- `content.js` runs in the YouTube tab: keep it defensive — YouTube's markup
  changes. Prefer balanced-brace/structured parsing over brittle regexes where
  feasible; when regex is the pragmatic choice, anchor it tightly and fail
  with a clear message.
- `popup.js` owns all formatting (`toTXT`, `toMD`, `toSRT`, `toVTT`). Cue
  shape is `{ start, dur, text }` with seconds as floats.
- Error messages are user-facing: say what happened and what to try next.
  Never surface raw stack traces in the popup.
- Keep the UI quiet: no animations for their own sake, no extra chrome.

## Docs

- `README.md` is the front door: features, install, use, FAQ. Keep it
  scannable; deep dives live in `docs/`.
- `docs/` holds `INSTALL.md`, `HOW-IT-WORKS.md`, `PRIVACY.md`,
  `TROUBLESHOOTING.md`. Update the doc that matches your change.
- Write for a smart reader who hasn't seen the codebase. Concrete file and
  function names, real request/response shapes, no hand-waving.

## Commit style

Short imperative subject line, blank line, then what/why if it's not obvious.
Example: `Add transcript API fallback for gated caption endpoints`.
