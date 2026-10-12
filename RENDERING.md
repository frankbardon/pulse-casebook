# Rendering the films yourself

Every film is a web page that draws its frames on a canvas. Its narration MP3 is committed beside it. Rendering an MP4 means three steps:

1. Open the page in headless Chromium.
2. Ask it for every frame at 30 fps.
3. Mux the frames with the narration in ffmpeg.

Because each frame depends only on its time value, a render always matches what the page plays in the browser.

All commands below run from `pulse-anatomy/films/build/`.

## Quick start: an MP4 from the committed narration

This needs only Node and ffmpeg. No speech synthesis is involved.

```sh
cd pulse-anatomy/films/build
./setup.sh                          # npm install playwright + its Chromium (one time)
./render.sh pulse-filters           # → films/video/pulse-filters.mp4
./render.sh --all                   # every film
```

| Film | Name to pass |
|---|---|
| 1. Lifecycle of a request | `pulse-lifecycle` |
| 2. Concepts overview | `pulse-concepts` |
| 3. Features in depth | `pulse-features` |
| 4. Filters in depth | `pulse-filters` |

A full 1080p render takes a few minutes per film. To check something fast, render a short preview:

```sh
./render.sh --preview 20 pulse-filters      # first 20 seconds → films/video/pulse-filters-preview.mp4
RES=1280 ./render.sh pulse-filters          # 720p, roughly twice as fast
```

To look at individual frames instead of a video:

```sh
node stills.js ../pulse-filters.html 10 60 120    # still_10.jpg, still_60.jpg, still_120.jpg (seconds)
```

## Requirements

| Tool | Needed for | Notes |
|---|---|---|
| Node 18+ and npm | every render | `setup.sh` installs the pinned `playwright` from `package.json` |
| Chromium | every render | `setup.sh` runs `npx playwright install chromium`. To use a browser you already have, set `CHROMIUM=/path/to/chrome`. |
| ffmpeg | every render | must include `libx264`; `libmp3lame` is needed for `--narrate` |
| Python 3.10+ | `--narrate` only | `setup.sh --with-narration` creates `build/.venv` from `requirements.txt` |
| Kokoro v1.0 model | `--narrate` only | about 350 MB; `setup.sh --with-narration` downloads it into `build/models/` |
| Internet | best results | pages load Archivo and IBM Plex Mono from Google Fonts. Offline, they fall back to system fonts, so the frames will differ slightly. |

## Re-narrating (after changing the script or the voice)

The spoken lines live in each film's scene list as `caps` entries: `[animationTime, subtitle, spokenText?, hideSubtitle?]`. Film 1 keeps them inline in `pulse-lifecycle.html`; every other film keeps them in its `.js` file.

After editing them:

```sh
./setup.sh --with-narration                     # one time: Python venv + Kokoro model
./render.sh --narrate pulse-filters             # new narration, new subtitles, then the MP4
./render.sh --narrate-only pulse-filters        # narration + subtitles only, no video
VOICE=am_michael ./render.sh --narrate pulse-filters   # a different Kokoro voice
```

`--narrate` changes three things:

1. It writes the measured line lengths into the film's `NARR` slot. Each cue's window stretches to fit its spoken line, with 0.25 s before and 0.75 s after.
2. It replaces `<name>-narration.mp3`.
3. It writes `films/video/<name>.srt`.

Commit the changed `.js` or `.html` file and the MP3 together, because the page and the audio must agree. Synthesis is deterministic: the same text and voice give the same timings. The series voice is `af_heart` (see `SERIES-RULES.md`).

## Where things go

| Path | Committed? | What |
|---|---|---|
| `films/<name>.html`, `films/<name>.js`, `films/film-kit.js` | yes | the film itself |
| `films/<name>-narration.mp3` | yes | narration the page and the render both use |
| `subtitles/<name>.srt` | yes | reference subtitles; `--narrate` writes fresh ones to `films/video/` |
| `films/video/` | no (gitignored) | rendered MP4s and fresh `.srt` files |
| `films/build/work/<name>/` | no | per-film scratch space. Every run gets its own, so films can render in parallel. |
| `films/build/node_modules`, `.venv`, `models` | no | installed by `setup.sh` |

## Making a new film

1. Copy `films/pulse-filters.html` to `films/pulse-<topic>.html`. Change the title, intro text, audio `src` (`pulse-<topic>-narration.mp3`) and script `src`.
2. Write `films/pulse-<topic>.js`:
   - Draw with the helpers from `PulseFilm.h`, and end with `PulseFilm.mount({ series, narr: NARR, scenes })`.
   - Keep the line `const NARR = /*NARR*/null/*END*/;`.
   - `draw(t)` must depend only on `t`.
3. Check layouts with `node stills.js ../pulse-<topic>.html …` before narrating.
4. Run `./render.sh --narrate pulse-<topic>`.
5. Check it against `SERIES-RULES.md`, then commit the page, script and MP3.

## Troubleshooting

- **`Cannot find module 'playwright'`:** run `./setup.sh` (or `npm install`) inside `films/build/`.
- **`browserType.launch: Executable doesn't exist`:** run `npx playwright install chromium`, or set `CHROMIUM`.
- **`Unknown encoder 'libx264'`:** your ffmpeg build lacks x264. Install a full build (for example, `brew install ffmpeg`, or the static builds from ffmpeg.org).
- **`missing …-narration.mp3`:** the film has no committed narration yet. Run with `--narrate`.
- **Video and voice drift apart:** the page's `NARR` slot and the MP3 come from different narration runs. Re-run `--narrate`, or restore both files from the same commit.
