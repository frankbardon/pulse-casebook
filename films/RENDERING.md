# Rendering the films yourself

Every film is a web page that draws its frames on a canvas. Its narration MP3 is committed beside it. Rendering an MP4 means three steps:

1. Open the page in headless Chromium.
2. Ask it for every frame at 30 fps.
3. Mux the frames with the narration in ffmpeg.

Because each frame depends only on its time value, a render always matches what the page plays in the browser.

All commands below run from `films/build/`. A film is named by its folder: `filters`, `04` and `04-filters` all work.

## Quick start: an MP4 from the committed narration

This needs only Node and ffmpeg. No speech synthesis is involved.

```sh
cd films/build
./setup.sh                          # npm install playwright + its Chromium (one time)
./render.sh filters                 # → films/04-filters/render/pulse-filters.mp4
./render.sh --all                     # every film
```

| Film | Name to pass (folder) |
|---|---|
| 1. Lifecycle of a request | `lifecycle` (`01-lifecycle/`) |
| 2. Concepts overview | `concepts` (`02-concepts/`) |
| 3. Features in depth | `features` (`03-features/`) |
| 4. Filters in depth | `filters` (`04-filters/`) |
| 5. Attributes in depth | `attributes` (`05-attributes/`) |
| 6. Aggregators in depth | `aggregators` (`06-aggregators/`) |
| 7. Windows in depth | `windows` (`07-windows/`) |
| 8. Tests and regressions in depth | `tests` (`08-tests/`) |
| 9. Matrices in depth | `matrices` (`09-matrices/`) |
| 10. Overlays in depth | `overlays` (`10-overlays/`) |

A full 1080p render takes a few minutes per film. To check something fast, render a short preview:

```sh
./render.sh --preview 20 filters      # first 20 seconds → films/04-filters/render/pulse-filters-preview.mp4
RES=1280 ./render.sh filters          # 720p, roughly twice as fast
```

To look at individual frames instead of a video:

```sh
node stills.js ../04-filters/index.html 10 60 120    # still_10.jpg, still_60.jpg, still_120.jpg (seconds)
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
| `<film>/data/` | yes | cohort, requests and captured outputs (films 6 to 10; see `DATA.md`) |
| `<film>/render/` | no (gitignored) | rendered MP4s and fresh `.srt` files |
| `build/work/<film>/` | no | per-film scratch space. Every run gets its own, so films can render in parallel. |
| `build/node_modules`, `build/models` | no | installed by `setup.sh` |

## Making a new film

1. Make the next numbered folder, for example `11-<topic>/`, and copy `04-filters/index.html` into it. Change the title and intro text; the `src` paths (`../kit/film-kit.js`, `scenes.js`, `narration.mp3`) stay as they are.
2. Write `11-<topic>/scenes.js`:
   - Draw with the helpers from `PulseFilm.h`, and end with `PulseFilm.mount({ series, narr: NARR, scenes })`.
   - Keep the line `const NARR = /*NARR*/null/*END*/;`.
   - `draw(t)` must depend only on `t`.
3. Check layouts with `node stills.js ../11-<topic>/index.html …` before narrating, or `./shots.sh <topic> sheet 10 40 70 100` for 2×2 contact sheets (needs ImageMagick).
   Put the film's cohort, requests and captured outputs in `11-<topic>/data/` and add a step for it to `build/data.sh`.
4. Run `./render.sh --narrate <topic>`, then copy `11-<topic>/render/pulse-<topic>.srt` to `11-<topic>/subtitles.srt`.
5. Check it against `SERIES-RULES.md`, then commit the page, script, MP3 and subtitles.

## Troubleshooting

- **`Cannot find module 'playwright'`:** run `./setup.sh` (or `npm install`) inside `films/build/`.
- **`browserType.launch: Executable doesn't exist`:** run `npx playwright install chromium`, or set `CHROMIUM`.
- **`Unknown encoder 'libx264'`:** your ffmpeg build lacks x264. Install a full build (for example, `brew install ffmpeg`, or the static builds from ffmpeg.org).
- **`missing …/narration.mp3`:** the film has no committed narration yet. Run with `--narrate`.
- **Video and voice drift apart:** the page's `NARR` slot and the MP3 come from different narration runs. Re-run `--narrate`, or restore both files from the same commit.
