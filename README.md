# Pulse Anatomy

Infographics and a series of narrated films that explain how Pulse works.

| | Page | Video |
|---|---|---|
| Plates | `pages/pulse-anatomy.html`: eight infographic plates | n/a |
| Film 1 | `pages/pulse-lifecycle.html`: the lifecycle of one request | `pulse-lifecycle-narrated.mp4`, 3:40 |
| Film 2 | `films/pulse-concepts.html`: features, filters, attributes, groupers, aggregators, windows, tests, regressions, matrices, overlays | `pulse-concepts.mp4` |
| Film 3 | `films/pulse-features.html`: feature operators in depth | `pulse-features.mp4`, 5:03 |

The MP4s are delivered separately because of upload size limits. Matching `.srt` subtitles are in `subtitles/`.

Open any page directly in a browser and press **Play with narration**. Each page needs its narration MP3 beside it. The pages load Archivo and IBM Plex Mono from Google Fonts and fall back to system fonts offline.

## Making a new film (film 2 onward)

`films/film-kit.js` is the shared engine. It holds the drawing helpers, the narration-driven timeline, the subtitles, the chapter chrome and the player. A film consists of three files:

- **`<name>.html`**: the page markup. Copy `pulse-concepts.html` and change the title, intro text and audio `src`.
- **`<name>.js`**: the scenes plus `PulseFilm.mount({ series, narr: NARR, scenes })`.
  - Each scene is `{ name, dur, draw(t), caps }`, where `caps` is a list of `[animTime, subtitle, spoken?, hideSubtitle?]`.
  - `draw(t)` must depend only on `t`, so the browser player and the rendered MP4 produce the same frames.
  - Keep the line `const NARR = /*NARR*/null/*END*/;`. The build fills it with narration lengths, and each cue window stretches to fit its spoken line.
- **`<name>-narration.mp3`**: produced by the build.

To narrate and render a film:

```sh
cd films/build
ln -s /path/to/kokoro-models models      # kokoro-v1.0.onnx + voices-v1.0.bin (see build/build.sh for URLs)
CHROMIUM=/path/to/chromium PY=python3 VOICE=af_heart \
  ./render-film.sh ../pulse-concepts.html ../pulse-concepts.js pulse-concepts
node stills.js ../pulse-concepts.html 10 60 120          # optional: preview frames
```

The script writes:

- `films/pulse-concepts-narration.mp3`
- `films/video/pulse-concepts.mp4`
- `films/video/pulse-concepts.srt`

Requirements: Node with `playwright`, `ffmpeg` (libx264, libmp3lame), and Python 3 with `kokoro-onnx`, `soundfile` and `numpy`.

`build/` holds the original scripts for film 1, which predates the kit. Its `build.sh` rebuilds `pages/pulse-lifecycle.html` the same way.

## Series conventions

- The deep-dive films never state how many feature operators exist; Pulse adds feature operators over time.
- The narration says so, and points viewers to the instance manifest for the current list.

## Accuracy

Operator names, slot order (`features → filterers → attributes → groups → aggregations → windows → sort`), category sizes and stage behaviour follow the Pulse source and its skill pack as of October 2026.

The cohorts, samples, p-values and correlations in the films are illustrative.
