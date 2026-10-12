# Films

Pulse Anatomy: infographics and a series of narrated films that explain how Pulse works. This folder is the repo of record for their sources.

| | Folder | Topic |
|---|---|---|
| Plates | [`plates/`](plates/index.html) | eight infographic plates |
| Film 1 | [`01-lifecycle/`](01-lifecycle/) | the lifecycle of one request |
| Film 2 | [`02-concepts/`](02-concepts/) | every concept on one cohort |
| Film 3 | [`03-features/`](03-features/) | feature operators in depth |
| Film 4 | [`04-filters/`](04-filters/) | filters in depth |
| Film 5 | [`05-attributes/`](05-attributes/) | attributes in depth |
| Film 6 | [`06-aggregators/`](06-aggregators/) | aggregators in depth |
| Film 7 | [`07-windows/`](07-windows/) | windows in depth |
| Film 8 | [`08-tests/`](08-tests/) | tests and regressions in depth |
| Film 9 | [`09-matrices/`](09-matrices/) | matrices in depth |
| Film 10 | [`10-overlays/`](10-overlays/) | overlays in depth |

- **Playing a film:** open its `index.html` in a browser and press **Play with narration**.
- **Rendering a film:** to produce an MP4, follow **[RENDERING.md](RENDERING.md)**. In short:

  ```sh
  cd films/build
  ./setup.sh
  ./render.sh filters
  ```

- **Film data:** films 6 to 10 keep the cohorts, requests and captured outputs behind their result cards in their own `data/` folder. `build/data.sh` rebuilds them; see **[DATA.md](DATA.md)**.
- **Series rules:** **[SERIES-RULES.md](SERIES-RULES.md)** holds the rules every film follows. These include no catalog counts, always saying that more are added over time, and checking every fact against the code.

## Layout

```
NN-<topic>/            one film, numbered in series order
  index.html           page markup (film 1 also keeps its scenes inline here)
  scenes.js            scenes and script
  narration.mp3        its narration (Kokoro, voice af_heart)
  subtitles.srt        subtitles matching the committed narration
  data/                cohort generator or CSV, requests, captured outputs (films 6 to 10)
  render/              rendered MP4s and fresh subtitles (gitignored)
kit/film-kit.js        shared engine: drawing helpers, narration-driven timeline, subtitles, player
plates/index.html      infographic plates (static SVG)
build/                 render.sh, setup.sh, data.sh and the pipeline scripts
```

## Accuracy

Operator names, parameters, null rules, components, error codes and stage order follow the Pulse source and its skill pack as of October 2026. The cohorts, samples, p-values and correlations in the films are illustrative. From film 6 on, every figure on a result card comes from a real Pulse run recorded in that film's `data/` folder.
