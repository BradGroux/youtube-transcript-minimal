# Troubleshooting

## The popup shows an error right after installing

**Reload the YouTube tab once.** Chrome only injects content scripts into
pages loaded *after* the extension was installed. (The extension also tries to
inject itself on demand, but a tab reload is the reliable fix.)

## "Could not reach the video tab. Reload the page and try again."

Same cause as above — the helper script isn't in the tab yet. Reload the tab.
If it persists, remove and re-add the extension in `chrome://extensions`.

## "Open a YouTube video, then click the extension icon."

The active tab isn't a YouTube watch/shorts/embed page. Navigate to a video
first. Note the extension only activates on `youtube.com` URLs.

## "This video has no captions available."

YouTube's player data lists zero caption tracks for this video. Nothing to
download — this is YouTube's data, not an extension bug.

## "YouTube didn't return any captions for this video…"

The video *lists* caption tracks, but YouTube blocked all three download paths
(the classic caption endpoint returned an empty body, the transcript API
fallback was rejected, and driving YouTube's own transcript panel didn't
produce segments either). This happens on some videos — usually
auto-generated captions that YouTube gates. What to try:

1. Open the video description → **…more** → **Show transcript**. If YouTube's
   own panel shows captions, copy from there.
2. If the panel is also empty, YouTube genuinely isn't serving captions for
   this video right now.

If YouTube's panel works but the extension consistently fails on the same
video, [open an issue](../../issues) with the video URL.

## The page visibly expands the description during a download

That's the last-resort fallback: YouTube rejected both invisible download
paths, so the extension briefly drives YouTube's own *Show transcript* UI to
get the captions, then collapses the description again. It only happens on
videos where YouTube gates the direct endpoints.

## "Transcript came back empty."

The fetch succeeded but contained no usable cues — typically a video whose
caption track exists but has no content yet (e.g. auto-generated captions
still processing on a fresh upload). Try again later.

## Downloads save with a weird filename

Filenames are `Video Title.<lang>.<ext>` with filesystem-hostile characters
stripped. If a title sanitizes down to nothing, it falls back to
`transcript`.

## It worked yesterday and broke today

YouTube changes its page markup and endpoints regularly. Check the
[Issues](../../issues) page — someone may have reported it already. Include
the video URL and the exact popup error text when reporting.
