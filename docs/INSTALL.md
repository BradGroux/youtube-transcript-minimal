# Install

## From a release (recommended)

1. Go to the [Releases](../../releases) page and download the latest
   `youtube-transcript-minimal-vX.Y.Z.zip`.
2. Unzip it anywhere (e.g. `~/apps/youtube-transcript-minimal`).
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (toggle, top right).
5. Click **Load unpacked** and select the unzipped folder.
6. Open any YouTube video — click the puzzle-piece icon in the toolbar and pin
   **Minimal Transcript** so it's one click away.

## From source

```bash
git clone https://github.com/BradGroux/youtube-transcript-minimal.git
```

Then follow steps 3–6 above, selecting the cloned folder.

## Updating

1. Download/unzip (or `git pull`) the new version.
2. In `chrome://extensions`, hit the **reload** (↻) button on Minimal Transcript.
3. Reload any open YouTube tabs.

## First-run check

1. Open any video with captions.
2. Click the extension icon — you should see the video title and a language
   dropdown.
3. Pick **TXT**, click **Download transcript** — a `.txt` file should save.

If the popup shows an error right after installing, reload the YouTube tab
once: Chrome only injects the content script into pages loaded *after* the
extension was installed. (The extension also self-injects on demand, but a
tab reload is the reliable fix.)

More: [Troubleshooting](TROUBLESHOOTING.md).

## Uninstall

`chrome://extensions` → **Remove** on Minimal Transcript. Nothing is left
behind — the extension stores no data, has no background page, and creates no
accounts.
