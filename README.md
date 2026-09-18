# Minimal Transcript

A minimalist Chrome extension that downloads YouTube captions in one click.
No popups, no ads, no accounts, no clutter.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open any YouTube video and click the extension icon.

## Use

1. Pick a language (manual captions preferred over auto-generated when available).
2. Pick a format: **TXT**, **MD** (Markdown), **SRT**, or **VTT**.
3. Optionally include timestamps (TXT and Markdown only — SRT/VTT always carry timing).
4. **Download transcript** saves a file named like `Video Title.en.txt`,
   or **Copy to clipboard** to paste it anywhere.

## How it works

- A content script reads the video page's own player data (same-origin, using
  your normal YouTube session) to find the caption tracks YouTube already
  serves — no third-party servers involved.
- The transcript is fetched directly from YouTube's timedtext endpoint and
  formatted locally in the popup.

## Notes

- Videos with no captions show a plain "no captions available" message.
- If the icon shows an error right after installing, reload the YouTube tab
  once (Chrome only injects the helper into pages loaded after install).

## Files

- `manifest.json` — extension manifest (Manifest V3)
- `popup.html` / `popup.css` / `popup.js` — the popup UI and formatting logic
- `content.js` — tab helper that reads caption tracks and fetches transcripts
- `icons/` — extension icons
