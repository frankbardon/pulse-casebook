# Films

Pulse Anatomy: infographics and a series of narrated films that explain how Pulse works. This folder is the repo of record for their sources.

Twenty-three films in five parts (the order in [SERIES-RULES.md](SERIES-RULES.md) §4). The folder number is the viewing order; the topic after it is the name `build/render.sh` takes. Films marked *planned* have a reserved folder name but no folder yet.

| | Folder | Topic |
|---|---|---|
| Plates | [`plates/`](plates/index.html) | eight infographic plates |
| **Part 1** | | **Foundations** |
| Film 1 | [`01-lifecycle/`](01-lifecycle/) | the lifecycle of one request |
| Film 2 | [`02-concepts/`](02-concepts/) | every concept on one cohort |
| Film 3 | `03-cohort/` | the cohort file and scale (*planned*) |
| Film 4 | `04-asking/` | asking before running (*planned*) |
| **Part 2** | | **The request spine** |
| Film 5 | [`05-features/`](05-features/) | feature operators in depth |
| Film 6 | [`06-filters/`](06-filters/) | filters in depth |
| Film 7 | [`07-attributes/`](07-attributes/) | attributes in depth |
| Film 8 | `08-expressions/` | the expression language (*planned*) |
| Film 9 | `09-groupers/` | groupers (*planned*) |
| Film 10 | [`10-aggregators/`](10-aggregators/) | aggregators in depth |
| Film 11 | [`11-windows/`](11-windows/) | windows in depth |
| **Part 3** | | **Analysis** |
| Film 12 | [`12-tests/`](12-tests/) | tests and regressions in depth |
| Film 13 | [`13-matrices/`](13-matrices/) | matrices in depth |
| Film 14 | `14-sem/` | SEM (*planned*) |
| Film 15 | `15-crosstabs/` | crosstabs and survey tables (*planned*) |
| Film 16 | [`16-overlays/`](16-overlays/) | overlays in depth |
| **Part 4** | | **Beyond one request** |
| Film 17 | `17-compose-sweep/` | Compose: batch and sweep (*planned*) |
| Film 18 | `18-compose-fit/` | Compose: fit, bind and optimize (*planned*) |
| Film 19 | `19-derived/` | derived cohorts (*planned*) |
| Film 20 | `20-weights/` | weights and raking (*planned*) |
| Film 21 | `21-time/` | time zones and panels (*planned*) |
| **Part 5** | | **Around Pulse** |
| Film 22 | `22-synth/` | synthetic data (*planned*) |
| Film 23 | `23-embedding/` | embedding Pulse (*planned*) |

The folders were renumbered into this order in the films refresh; [`slugs.json`](slugs.json) maps each old folder name to its new one.

- **Playing a film:** open its `index.html` in a browser and press **Play with narration**.
- **Rendering a film:** to produce an MP4, follow **[RENDERING.md](RENDERING.md)**. In short:

  ```sh
  cd films/build
  ./setup.sh
  ./render.sh filters
  ```

- **Film data:** each film keeps the cohorts, requests and captured outputs behind their result cards in their own `data/` folder, with a `data/build.sh` that rebuilds them and a `data/README.md` that explains them. `build/data.sh` finds and runs every `data/build.sh`; see **[DATA.md](DATA.md)**.
- **Series rules:** **[SERIES-RULES.md](SERIES-RULES.md)** holds the rules every film follows. These include no catalog counts, always saying that more are added over time, and checking every fact against the code.

## Layout

```
NN-<topic>/            one film, numbered in series order
  index.html           page markup (film 1 also keeps its scenes inline here)
  scenes.js            scenes and script
  narration.mp3        its narration (Kokoro, voice af_heart)
  subtitles.srt        subtitles matching the committed narration
  data/                cohort generator or CSV, requests, captured outputs
    build.sh           the film's data steps (found and run by build/data.sh)
    README.md          what the data is (indexed from DATA.md)
  render/              rendered MP4s and fresh subtitles (gitignored)
kit/film-kit.js        shared engine: drawing helpers, narration-driven timeline, subtitles, player
plates/index.html      infographic plates (static SVG)
build/                 render.sh, setup.sh, data.sh and the pipeline scripts
slugs.json             old folder name → new folder name, from the renumbering
```

## Accuracy

Operator names, parameters, null rules, components, error codes and stage order follow the Pulse source and its skill pack as of Pulse `v1.0.0-alpha.33`. The cohorts, samples, p-values and correlations in the films are illustrative. Every figure on a result card comes from a real Pulse run recorded in that film's `data/` folder.
