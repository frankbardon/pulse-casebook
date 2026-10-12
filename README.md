# Pulse Anatomy

Infographics and a series of narrated films that explain how Pulse works. This branch (`pulse-anatomy-films`) is an archive of their sources and is not meant to be merged.

| | Source | Narration |
|---|---|---|
| Plates | `pages/pulse-anatomy.html`: eight infographic plates | — |
| Film 1 | `films/pulse-lifecycle.html`: the lifecycle of one request | `films/pulse-lifecycle-narration.mp3` |
| Film 2 | `films/pulse-concepts.html` + `.js`: every concept on one cohort | `films/pulse-concepts-narration.mp3` |
| Film 3 | `films/pulse-features.html` + `.js`: feature operators in depth | `films/pulse-features-narration.mp3` |
| Film 4 | `films/pulse-filters.html` + `.js`: filters in depth | `films/pulse-filters-narration.mp3` |
| Film 5 | `films/pulse-attributes.html` + `.js`: attributes in depth | `films/pulse-attributes-narration.mp3` |
| Film 6 | `films/pulse-aggregators.html` + `.js`: aggregators in depth | `films/pulse-aggregators-narration.mp3` |
| Film 7 | `films/pulse-windows.html` + `.js`: windows in depth | `films/pulse-windows-narration.mp3` |

- **Playing a film:** open any page in a browser and press **Play with narration**. Each page needs its narration MP3 beside it, as committed.
- **Rendering a film:** to produce an MP4, follow **[RENDERING.md](RENDERING.md)**. In short:

  ```sh
  cd films/build
  ./setup.sh
  ./render.sh pulse-filters
  ```

- **Series rules:** **[SERIES-RULES.md](SERIES-RULES.md)** holds the rules every film follows. These include no catalog counts, always saying that more are added over time, and checking every fact against the code.

## Layout

```
pages/pulse-anatomy.html     infographic plates (static SVG)
films/film-kit.js            shared engine: drawing helpers, narration-driven timeline, subtitles, player
films/<name>.html / .js      one film: page markup + scenes and script
films/<name>-narration.mp3   its narration (Kokoro, voice af_heart)
films/build/                 render.sh, setup.sh and the pipeline scripts
subtitles/<name>.srt         subtitles matching each committed narration
```

## Accuracy

Operator names, parameters, null rules, components, error codes and stage order follow the Pulse source and its skill pack as of October 2026. The cohorts, samples, p-values and correlations in the films are illustrative.
