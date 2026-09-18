# How it works

Everything below happens between the user's browser and YouTube. There is no
backend, no proxy, no third party.

## Components

```
YouTube tab                      Extension popup
┌──────────────┐                ┌──────────────┐
│ content.js   │──messages──▶  │ popup.js     │
│ (same-origin │  GET_CAPTIONS  │ (parsing,    │
│  page helper)│  GET_TRANSCRIPT│  formatting, │
└──────────────┘                │  download)   │
                                └──────────────┘
```

- **`content.js`** — a content script injected into `youtube.com/watch`,
  `/shorts/`, and `/embed/` pages. It reads the page's own data and fetches
  transcripts. It has no UI.
- **`popup.js`** — runs in the extension popup. It asks the content script
  for caption tracks and transcript data, parses it into cues
  (`{ start, dur, text }`, seconds as floats), formats it, and triggers the
  download or clipboard write.
- **No background service worker.** Nothing runs when the popup is closed.

## Caption discovery (`GET_CAPTIONS`)

1. The content script re-fetches the current tab URL with
   `fetch(location.href, { credentials: 'include' })` — same-origin, so it
   carries the user's normal YouTube session.
2. It locates `ytInitialPlayerResponse = {...};` in the HTML and parses the
   balanced-brace JSON object that follows it.
3. From `captions.playerCaptionsTracklistRenderer.captionTracks` it builds
   the track list: language code, display name, kind (`asr` = auto-generated),
   and each track's `baseUrl`.
4. Auto-generated tracks often ship with a blank display name; those are
   labeled from the language code ("English (auto-generated)").

The popup lists the tracks and pre-selects a manual (non-ASR) English track
when one exists.

## Transcript fetching (`GET_TRANSCRIPT`)

Two paths, tried in order:

### Path 1 — classic timedtext endpoint

`fetch(track.baseUrl, { credentials: 'include' })`. The response is the
legacy caption XML:

```xml
<transcript>
  <text start="0" dur="2.5">Jev is here and it&#39;s a big deal.</text>
  ...
</transcript>
```

The popup's `parseTranscript` turns `<text>` elements into cues. This path
works for most videos.

### Path 2 — transcript API fallback

On some videos (observed mostly with auto-generated captions) YouTube answers
Path 1 with `200 OK` and an **empty body** — the track exists but the endpoint
won't serve it. When that happens, the content script falls back to the same
endpoint YouTube's own *"Show transcript"* panel uses:

```
POST https://www.youtube.com/youtubei/v1/get_transcript?key=<INNERTUBE_API_KEY>&prettyPrint=false
Content-Type: application/json
X-Goog-Visitor-Id: <page visitorData>
X-Youtube-Client-Name: 1
X-Youtube-Client-Version: <page clientVersion>

{
  "context": { "client": { "clientName": "WEB", "clientVersion": "…",
                           "hl": "en", "gl": "US", "visitorData": "…" } },
  "params": "<transcript params from the page's getTranscriptEndpoint>"
}
```

Notes on the inputs, all extracted at runtime from the already-loaded page —
nothing is hardcoded:

- `INNERTUBE_API_KEY` is YouTube's public web-client key, embedded in every
  page load. It's not a secret and is never committed to this repo.
- `params` comes from the `getTranscriptEndpoint` command in the video
  description's transcript section (percent-decoded).
- `visitorData` / `clientVersion` come from the page's `INNERTUBE_CONTEXT`.

The response contains `transcriptSegmentRenderer` nodes
(`startMs`, `endMs`, `snippet.runs[].text`). The fallback follows
`transcriptSegmentListRenderer.continuations` so long videos come back whole,
and returns structured cues to the popup — no XML involved. On logged-in
sessions it also sends `X-Youtube-Identity-Token` (from the page's `ID_TOKEN`),
matching what YouTube's web client sends.

### Path 3 — transcript-panel fallback

YouTube has started rejecting hand-rolled `get_transcript` calls on some
videos with `400` — the endpoint wants attestation data that only YouTube's
own player JavaScript generates, and this extension deliberately does not run
that code. When Path 2 fails, the content script drives YouTube's own *"Show
transcript"* UI instead: it expands the description (`...more`), clicks *Show
transcript*, waits for `ytd-transcript-segment-renderer` nodes to render,
scrapes each segment's `.segment-timestamp` and text, then closes the panel
and collapses the description again (best effort). Segment durations are
derived from consecutive start times. This rides YouTube's real request path,
so it works whenever the panel itself works — at the cost of briefly
expanding the description, which is why it's the last resort, not the first.

## Formatting

All in `popup.js`, pure functions over the cue list:

| Format | Function | Notes |
|---|---|---|
| TXT | `toTXT` | One cue per line; optional `[mm:ss]` / `[h:mm:ss]` timestamps |
| Markdown | `toMD` | `# Title` header, then the same lines as TXT |
| SRT | `toSRT` | Numbered cues, `HH:MM:SS,mmm` timing, always timed |
| VTT | `toVTT` | `WEBVTT` header, `HH:MM:SS.mmm` timing, always timed |

Download filenames look like `Video Title.en.txt` (`sanitize` strips
filesystem-hostile characters).

## What can break

YouTube changes its markup and endpoints regularly. Known sensitivities:

- If `ytInitialPlayerResponse` moves or is renamed, caption discovery fails
  with "No player data found on this page."
- YouTube's `get_transcript` endpoint now requires attestation data on some
  videos/sessions (confirmed: hand-rolled calls get `400` while the real panel
  works). Path 3 exists for exactly this case — it rides the real UI instead
  of re-implementing the request.
- The extension deliberately does **not** run YouTube's botguard/attestation
  JavaScript. Keeping it that way is a design decision, not an oversight.

When all three paths fail, the popup shows a plain-language error pointing at
YouTube's own transcript panel (video description → *Show transcript*).
