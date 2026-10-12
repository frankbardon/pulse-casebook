# Film data

The cohorts, requests and captured Pulse outputs behind the result cards in films 6 to 10. Every figure those films show comes from these runs.

| Folder | Film | Cohort | Requests |
|---|---|---|---|
| `06-aggregators/data/` | 6, aggregators | `a.csv` (hand-written, 5 rows) | `ar.json` |
| `07-windows/data/` | 7, windows | `w.csv` (hand-written, 9 rows) | `wr.json` |
| `08-tests/data/` | 8, tests and regressions | `generate.js` → `t.csv` (seed 7, 240 rows) | `tr.json` |
| `09-matrices/data/` | 9, matrices | `generate.js` → `m.csv` (seed 11, 300 rows) | `mr.json` (twelve matrix specs), `mp.json` (grouped Spearman, predict and process) |
| `10-overlays/data/` | 10, overlays | `generate.js` → `o.csv` (seed 5, 2024–2025) and `o2025.csv` (its 2025 rows) | `A`–`I`, below |

Films 1 to 5 have no recorded runs, so they have no `data/` folder.

## Rebuilding

```sh
make data                  # from the repo root: builds Pulse into bin/, then rebuilds every film
make data FILM=overlays    # one film
PULSE=/path/to/pulse films/build/data.sh overlays   # with another Pulse binary
```

While Pulse heads to v1, `make pulse` builds it from the committed `main` of a local checkout (`PULSE_SRC`, default `../pulse`; `PULSE_REF` picks another branch or tag) and installs it as `bin/pulse`. It leaves the checkout's working tree alone and rebuilds only when that ref moves. `make pulse-release` instead installs the release pinned as `PULSE_VERSION`, checked against its release checksums.

`data.sh` runs each generator, imports each CSV to a `.pulse` file (git-ignored) with `pulse import csv`, and writes each output beside its request as `<request>.out.json`. Predict runs are written as `<request>.predict.json`. It uses only `node` (no packages) and the `pulse` binary. The generators are deterministic: `build/pyrandom.js` reproduces the random number generator the cohorts were first drawn with, and the committed CSVs and outputs were checked byte-for-byte against the runs the films were built from. A newer Pulse can change an output; diff it before you re-cut a film.

## Overlay requests

| Request | Command | What it shows |
|---|---|---|
| `A` | process | crosstab region × plan with share of row, index vs margin, χ² matrix and z-score vs margin |
| `A0` | process | the same crosstab with no overlays; `A`'s data minus `overlays` equals `A0`'s |
| `B` | process, predict | monthly series with month-on-month, rolling (window 3), year over year and baseline |
| `C` | process | region siblings, including an unknown `West` (`PULSE_OVERLAY_REF_UNKNOWN`, still succeeds) |
| `D` | facet | `o2025.pulse` against population `o.pulse` |
| `E` | compose | 2024 against 2025 (`FILTER_RANGE` `values` are strings) |
| `F` | process | formula overlay: lift |
| `G` | process, predict | share of row with a column-axis ref: runs as a row share instead of being refused |
| `H` | process | rolling z-score without `window`: `PULSE_OVERLAY_PARAM_MISSING` |
| `I` | process | a series kind on a crosstab: predict says `PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE`, the runtime says `PULSE_OVERLAY_KIND_UNKNOWN` |

`G` and `I` are logged mismatches (see `SERIES-RULES.md`); the film avoids both behaviours.
