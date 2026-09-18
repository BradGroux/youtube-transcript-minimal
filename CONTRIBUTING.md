# Contributing

Thanks for wanting to make this better. The project is intentionally small —
please help keep it that way.

## Ground rules

1. **Minimalism is the feature.** Every addition is weighed against the
   project's reason to exist: one click, transcript out, no nonsense. If a
   feature needs settings, it probably doesn't belong here.
2. **Private by design.** No analytics, no accounts, no third-party servers,
   no new permissions without a very good reason. See
   [docs/PRIVACY.md](docs/PRIVACY.md).
3. **Same-origin only.** All YouTube traffic must stay between the user's
   browser and YouTube, using the user's normal session.

## How to contribute

- **Bug reports:** open an issue with the video URL (if public), what you
  clicked, and the exact error text from the popup. Screenshots help.
- **Pull requests:** keep them small and focused — one change per PR. Fork,
  branch, commit, open the PR against `main`.

## What a good PR includes

- [ ] A clear description of the problem and the fix.
- [ ] No new permissions in `manifest.json` (or a justification in the PR).
- [ ] A `CHANGELOG.md` entry under `[Unreleased]`.
- [ ] Tested by loading the unpacked extension in Chrome against at least one
      real video (note which in the PR).

## Development

No build step, no dependencies, no bundler. Edit the files, then in
`chrome://extensions` hit the reload button on the extension and test.

Useful entry points:

- `content.js` — caption discovery (`getCaptions`), transcript fetching
  (`getTranscript` → `fetchTranscript` / `fetchTranscriptViaApi`).
- `popup.js` — parsing (`parseTranscript`), formatters (`toTXT`, `toMD`,
  `toSRT`, `toVTT`), download/copy wiring.

See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) for the architecture and
[AGENTS.md](AGENTS.md) for repo conventions.
