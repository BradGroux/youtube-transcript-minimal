# Minimal Transcript

A minimalist Chrome extension that downloads YouTube captions in one click.
No popups, no ads, no accounts, no third-party servers, no clutter.

Pick a language, pick a format (**TXT**, **Markdown**, **SRT**, or **VTT**),
hit download — or copy the transcript straight to your clipboard.

![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-purple.svg)
![Chrome](https://img.shields.io/badge/Chrome-88%2B-purple.svg)

## Features

- **One-click downloads** — open any YouTube video, click the extension icon, download.
- **Four formats** — TXT, Markdown, SRT, and VTT. SRT/VTT always carry timing;
  TXT/Markdown have an optional timestamps toggle.
- **Language picker** — lists every caption track YouTube serves for the video,
  preferring manual captions over auto-generated ones when both exist.
- **Copy to clipboard** — paste the transcript anywhere without saving a file.
- **Smart fallback** — on videos where YouTube blocks the classic caption
  endpoint (common with auto-generated captions), the extension automatically
  retries through the same transcript API YouTube's own *"Show transcript"*
  panel uses. See [How it works](docs/HOW-IT-WORKS.md).
- **Private by design** — everything happens between your browser and YouTube.
  No analytics, no accounts, no external servers. See [Privacy](docs/PRIVACY.md).

## Install

The extension isn't on the Chrome Web Store (deliberately — see
[FAQ](#faq)). Install it unpacked in under a minute:

1. Download the [latest release](../../releases/latest) and unzip it
   (or `git clone` this repo).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the repo folder.
5. Open any YouTube video and click the extension icon.

> **Just installed and seeing an error?** Chrome only injects the helper into
> pages loaded *after* install — reload the YouTube tab once. Details in
> [Troubleshooting](docs/TROUBLESHOOTING.md).

Full walkthrough: [docs/INSTALL.md](docs/INSTALL.md).

## Use

1. Pick a language (manual captions are preferred over auto-generated when
   both are available).
2. Pick a format: **TXT**, **MD**, **SRT**, or **VTT**.
3. Optionally include timestamps (TXT and Markdown only — SRT/VTT always
   carry timing).
4. **Download transcript** saves a file named like
   `Video Title.en.txt`, or use **Copy to clipboard** to paste it anywhere.

## How it works

A content script reads the video page's own player data (same-origin, using
your normal YouTube session) to find the caption tracks YouTube already
serves. The transcript is fetched directly from YouTube and formatted locally
in the popup — nothing ever leaves the round-trip between your browser and
YouTube.

When YouTube answers the classic caption endpoint with an empty body (it does
this on some videos, mostly auto-generated captions), the extension falls back
to the `youtubei/v1/get_transcript` endpoint with the page's own transcript
parameters — the exact request YouTube's *"Show transcript"* panel makes.

Deep dive: [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

## Project layout

```
├── manifest.json      # Manifest V3, minimal permissions
├── content.js         # Tab helper: finds caption tracks, fetches transcripts
├── popup.html         # Popup markup
├── popup.css          # Popup styles
├── popup.js           # Popup logic: parsing, formatting, download, copy
├── icons/             # Extension icons (16/48/128)
├── docs/              # Install guide, architecture, privacy, troubleshooting
├── CHANGELOG.md       # Release history (Keep a Changelog format)
├── CONTRIBUTING.md    # How to contribute
└── AGENTS.md          # Instructions for AI agents working in this repo
```

## Permissions — and why each one is needed

| Permission | Why |
|---|---|
| `activeTab` | Read the current tab's URL/title when you click the icon. |
| `scripting` | Inject the content script if the extension was installed mid-session. |
| Host `*://*.youtube.com/*` | Read the video page's player data and fetch captions (same-origin). |

That's the whole list. No `<all_urls>`, no cookies permission, no background
service worker phoning home — there isn't one.

## FAQ

**Why isn't this on the Chrome Web Store?**
Publishing there costs a developer fee, adds review delays, and invites
feature-creep pressure. Sideloading keeps it free, instant, and exactly this
minimal.

**Does it work on Shorts / embeds / age-restricted videos?**
Watch pages, Shorts, and embeds are supported. Age-restricted videos work if
you're signed in to an account that can play them — the extension uses your
normal YouTube session.

**A video has captions on YouTube but the extension says none are available.**
Some videos gate caption *downloads* while still showing captions in the
player. The extension tries both of YouTube's transcript paths; if both are
blocked, it tells you plainly instead of failing silently.

**Does it upload anything anywhere?**
No. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Releases are cut from git tags
(`v1.0.0`, `v1.1.0`, …) — each with notes on the
[Releases](../../releases) page.

## Contributing

Bug reports and small, focused PRs are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) first — the short version: keep it minimal,
keep it private-by-design, add a CHANGELOG entry.

## License

[MIT](LICENSE) — do whatever you want with it.
