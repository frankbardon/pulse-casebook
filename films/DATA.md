# Film data

The cohorts, requests and captured Pulse outputs behind the films, recorded with Pulse `v1.0.0-alpha.33`. A film that quotes real runs keeps them in its own `data/` folder, with two files of its own:

- `data/build.sh`: the steps that rebuild its data. `build/data.sh` finds every `films/NN-<topic>/data/build.sh` by itself, so a film never edits a shared script.
- `data/README.md`: its cohort, its requests and what each one shows. Its first line is the title used in the index below.

A film with no recorded runs has no `data/` folder.

## Index

The index is written by `films/build/data.sh --index` from each film's `data/README.md`; do not edit it by hand.

<!-- data-index:start -->
| Folder | Notes |
|---|---|
| `01-lifecycle/` | [Lifecycle: the request's recorded runs](01-lifecycle/data/README.md) |
| `02-concepts/` | [Concepts: result cards](02-concepts/data/README.md) |
| `03-cohort/` | [The cohort file: imports, inspects and archives](03-cohort/data/README.md) |
| `04-asking/` | [Asking before running: result cards](04-asking/data/README.md) |
| `05-features/` | [Features: recorded runs](05-features/data/README.md) |
| `06-filters/` | [Filters: recorded runs](06-filters/data/README.md) |
| `07-attributes/` | [Attributes: result cards](07-attributes/data/README.md) |
| `08-expressions/` | [The expression language: result cards](08-expressions/data/README.md) |
| `09-groupers/` | [Groupers: result cards](09-groupers/data/README.md) |
| `10-aggregators/` | [Aggregators: result cards and the null-rule probe](10-aggregators/data/README.md) |
| `11-windows/` | [Windows: recorded runs](11-windows/data/README.md) |
| `12-tests/` | [Tests and regressions: result cards](12-tests/data/README.md) |
| `13-matrices/` | [Matrices: result cards](13-matrices/data/README.md) |
| `14-sem/` | [SEM: result cards](14-sem/data/README.md) |
| `15-crosstabs/` | [Crosstabs: result cards](15-crosstabs/data/README.md) |
| `16-overlays/` | [Overlays: result cards](16-overlays/data/README.md) |
| `17-compose-sweep/` | [Compose, batch and sweep: result cards](17-compose-sweep/data/README.md) |
| `18-compose-fit/` | [Compose, fit, bind and optimize: result cards](18-compose-fit/data/README.md) |
| `19-derived/` | [Derived cohorts: recorded runs](19-derived/data/README.md) |
| `20-weights/` | [Weights and raking: result cards](20-weights/data/README.md) |
| `21-time/` | [Time zones and panels: recorded runs](21-time/data/README.md) |
| `22-synth/` | [Synthetic data: specs, profiles and recorded runs](22-synth/data/README.md) |
| `23-embedding/` | [Embedding Pulse: recorded runs](23-embedding/data/README.md) |
<!-- data-index:end -->

## Rebuilding

```sh
make data                  # from the repo root: builds Pulse into bin/, then rebuilds every film
make data FILM=overlays    # one film, by topic or folder
PULSE=/path/to/pulse films/build/data.sh overlays   # with another Pulse binary
films/build/data.sh --index                         # refresh the index above
```

While Pulse heads to v1, `make pulse` builds it from a committed ref of a local checkout (`PULSE_SRC`, default `../pulse`; `PULSE_REF`, pinned to the tag `v1.0.0-alpha.33`) and installs it as `bin/pulse`. It leaves the checkout's working tree alone and rebuilds only when that ref moves. `make pulse-release` instead installs the release pinned as `PULSE_VERSION` (also `v1.0.0-alpha.33`), checked against its release checksums.

`data.sh` sources each film's `data/build.sh` from inside its `data/` folder, with two helpers defined:

| Helper | What it does |
|---|---|
| `imp NAME` | imports `NAME.csv` to `NAME.pulse` (git-ignored) with `pulse import csv` |
| `api CMD REQ [SUFFIX]` | runs `pulse api CMD -r REQ.json` and writes `REQ.SUFFIX.json` beside the request (default suffix `out`; predict runs use `predict`) |

It uses only `node` (no packages) and the `pulse` binary. The generators are deterministic: `build/pyrandom.js` reproduces the random number generator the cohorts were first drawn with, and the committed CSVs were checked byte-for-byte against the cohorts the films were first built from. A newer Pulse can change an output; diff it before you re-cut a film.
