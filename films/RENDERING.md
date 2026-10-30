# Rendering the films yourself

Every film is a web page that draws its frames on a canvas. Its narration MP3 is committed beside it. Rendering an MP4 means three steps:

1. Open the page in headless Chromium.
2. Ask it for every frame at 30 fps.
3. Mux the frames with the narration in ffmpeg.

Because each frame depends only on its time value, a render always matches what the page plays in the browser.

All commands below run from `films/build/`. A film is named by its folder: its topic (`filters`), its number (`06`) or the whole folder name (`06-filters`) all work. The topic never changes when a folder is renumbered.

## Quick start: an MP4 from the committed narration

This needs only Node and ffmpeg. No speech synthesis is involved.

```sh
cd films/build
./setup.sh                          # npm install playwright + its Chromium (one time)
./render.sh filters                 # → films/06-filters/render/pulse-filters.mp4
./render.sh --all                     # every film
```

| Film | Name to pass (folder) |
|---|---|
| 1. Lifecycle of a request | `lifecycle` (`01-lifecycle/`) |
| 2. Concepts overview | `concepts` (`02-concepts/`) |
| 3. Cohort file and scale (*planned*) | `cohort` (`03-cohort/`) |
| 4. Asking before running (*planned*) | `asking` (`04-asking/`) |
| 5. Features in depth | `features` (`05-features/`) |
| 6. Filters in depth | `filters` (`06-filters/`) |
| 7. Attributes in depth | `attributes` (`07-attributes/`) |
| 8. The expression language (*planned*) | `expressions` (`08-expressions/`) |
| 9. Groupers (*planned*) | `groupers` (`09-groupers/`) |
| 10. Aggregators in depth | `aggregators` (`10-aggregators/`) |
| 11. Windows in depth | `windows` (`11-windows/`) |
| 12. Tests and regressions in depth | `tests` (`12-tests/`) |
| 13. Matrices in depth | `matrices` (`13-matrices/`) |
| 14. SEM (*planned*) | `sem` (`14-sem/`) |
| 15. Crosstabs and survey tables (*planned*) | `crosstabs` (`15-crosstabs/`) |
| 16. Overlays in depth | `overlays` (`16-overlays/`) |
| 17. Compose: batch and sweep (*planned*) | `compose-sweep` (`17-compose-sweep/`) |
| 18. Compose: fit, bind and optimize (*planned*) | `compose-fit` (`18-compose-fit/`) |
| 19. Derived cohorts (*planned*) | `derived` (`19-derived/`) |
| 20. Weights and raking (*planned*) | `weights` (`20-weights/`) |
| 21. Time zones and panels (*planned*) | `time` (`21-time/`) |
| 22. Synthetic data (*planned*) | `synth` (`22-synth/`) |
| 23. Embedding Pulse (*planned*) | `embedding` (`23-embedding/`) |

Planned films have their folder name reserved; `render.sh` finds them once the folder exists. `--all` renders every folder that exists, in series order.

A full 1080p render takes a few minutes per film. To check something fast, render a short preview:

```sh
./render.sh --preview 20 filters      # first 20 seconds → films/06-filters/render/pulse-filters-preview.mp4
RES=1280 ./render.sh filters          # 720p, roughly twice as fast
```

To look at individual frames instead of a video:

```sh
node stills.js ../06-filters/index.html 10 60 120    # still_10.jpg, still_60.jpg, still_120.jpg (seconds)
```

## Requirements

| Tool | Needed for | Notes |
|---|---|---|
| Node 18+ and npm | every render | `setup.sh` installs the pinned `playwright` and `kokoro-js` from `package.json` |
| Chromium | every render | `setup.sh` runs `npx playwright install chromium`. To use a browser you already have, set `CHROMIUM=/path/to/chrome`. |
| ffmpeg | every render | must include `libx264`; `libmp3lame` is needed for `--narrate` |
| Kokoro v1.0 model | `--narrate` only | about 330 MB; `setup.sh --with-narration` downloads it into `build/models/`. Synthesis runs in Node through `kokoro-js`. |
| Internet | best results | pages load Archivo and IBM Plex Mono from Google Fonts. Offline, they fall back to system fonts, so the frames will differ slightly. |

## Re-narrating (after changing the script or the voice)

The spoken lines live in each film's scene list as `caps` entries: `[animationTime, subtitle, spokenText?, hideSubtitle?]`. Film 1 keeps them inline in `01-lifecycle/index.html`; every other film keeps them in its `scenes.js`.

After editing them:

```sh
./setup.sh --with-narration                     # one time: Kokoro model
./render.sh --narrate filters                    # new narration, new subtitles, then the MP4
./render.sh --narrate-only filters               # narration + subtitles only, no video
VOICE=am_michael ./render.sh --narrate filters   # a different Kokoro voice
```

`--narrate` changes three things:

1. It writes the measured line lengths into the film's `NARR` slot. Each cue's window stretches to fit its spoken line, with 0.25 s before and 0.75 s after.
2. It replaces the film's `narration.mp3`.
3. It writes `<film>/render/pulse-<topic>.srt`. Copy it over the film's `subtitles.srt` to update the committed subtitles.

Commit the changed `scenes.js` or `index.html` and the MP3 together, because the page and the audio must agree. Synthesis is deterministic: the same text and voice give the same timings. The committed narration was made with the earlier Python Kokoro runtime; the Node one matches it to within a few hundredths of a second per line, so re-narrating a film shifts its cues very slightly. The series voice is `af_heart` (see `SERIES-RULES.md`).

## Where things go

| Path | Committed? | What |
|---|---|---|
| `<film>/index.html`, `<film>/scenes.js`, `kit/film-kit.js` | yes | the film itself |
| `<film>/narration.mp3` | yes | narration the page and the render both use |
| `<film>/subtitles.srt` | yes | reference subtitles; `--narrate` writes fresh ones to `<film>/render/` |
| `<film>/data/` | yes | cohort, requests and captured outputs (see `DATA.md`) |
| `<film>/render/` | no (gitignored) | rendered MP4s and fresh `.srt` files |
| `build/work/<film>/` | no | per-film scratch space. Every run gets its own, so films can render in parallel. |
| `build/node_modules`, `build/models` | no | installed by `setup.sh` |

## Making a new film

1. Make the film's folder under its reserved name from the table above, for example `08-expressions/`, and copy `06-filters/index.html` into it. Change the title and intro text; the `src` paths (`../kit/film-kit.js`, `scenes.js`, `narration.mp3`) stay as they are.
2. Write `08-expressions/scenes.js`:
   - Draw with the helpers from `PulseFilm.h`, and end with `PulseFilm.mount({ series, narr: NARR, scenes })`.
   - Keep the line `const NARR = /*NARR*/null/*END*/;`.
   - `draw(t)` must depend only on `t`.
3. Check layouts with `node stills.js ../08-expressions/index.html …` before narrating, or `./shots.sh <topic> sheet 10 40 70 100` for 2×2 contact sheets (needs ImageMagick).
   Put the film's cohort, requests and captured outputs in `08-expressions/data/`, with a `data/build.sh` holding its data steps (`build/data.sh` finds it by itself; see `DATA.md` for the `imp` and `api` helpers) and a `data/README.md` describing them.
4. Run `./render.sh --narrate <topic>`, then copy `08-expressions/render/pulse-<topic>.srt` to `08-expressions/subtitles.srt`.
5. Check it against `SERIES-RULES.md`, then commit the page, script, MP3, subtitles and `data/`.

Everything a film needs lives in its own folder. The build scripts and the site find films by folder, so a new or changed film does not edit `build/data.sh`, `DATA.md` (its index is regenerated by `build/data.sh --index`) or `site/scripts/sync.mjs`.

## Troubleshooting

- **`Cannot find module 'playwright'`:** run `./setup.sh` (or `npm install`) inside `films/build/`.
- **`browserType.launch: Executable doesn't exist`:** run `npx playwright install chromium`, or set `CHROMIUM`.
- **`Unknown encoder 'libx264'`:** your ffmpeg build lacks x264. Install a full build (for example, `brew install ffmpeg`, or the static builds from ffmpeg.org).
- **`missing …/narration.mp3`:** the film has no committed narration yet. Run with `--narrate`.
- **Video and voice drift apart:** the page's `NARR` slot and the MP3 come from different narration runs. Re-run `--narrate`, or restore both files from the same commit.
