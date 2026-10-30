# Film data

The cohorts, requests and captured Pulse outputs for films 6 to 10, recorded with Pulse `v1.0.0-alpha.33`. The result cards in films 8 to 10 come from these runs. Films 6 and 7 compute their on-screen figures in `scenes.js` from their own cohorts (film 6's ten-member `P`; film 7's North/South rows), which differ from `a.csv` and `w.csv`: those two files are separate probes of the null rules, not the cohorts on screen.

| Folder | Film | Cohort | Requests |
|---|---|---|---|
| `06-aggregators/data/` | 6, aggregators | `a.csv` (hand-written, 5 rows) | `ar.json` |
| `07-windows/data/` | 7, windows | `w.csv` (hand-written, 9 rows) | `wr.json` |
| `08-tests/data/` | 8, tests and regressions | `generate.js` → `t.csv` (seed 7, 240 rows) | `tr.json` |
| `09-matrices/data/` | 9, matrices | `generate.js` → `m.csv` (seed 11, 300 rows) | `mr.json` (twelve matrix specs), `mp.json` (grouped Spearman, predict and process) |
| `10-overlays/data/` | 10, overlays | `generate.js` → `o.csv` (seed 5, 2024–2025) and `o2025.csv` (its 2025 rows) | `A`–`I` and `B2`, below |

Films 1 to 5 have no recorded runs, so they have no `data/` folder.

## Rebuilding

```sh
make data                  # from the repo root: builds Pulse into bin/, then rebuilds every film
make data FILM=overlays    # one film
PULSE=/path/to/pulse films/build/data.sh overlays   # with another Pulse binary
```

While Pulse heads to v1, `make pulse` builds it from a committed ref of a local checkout (`PULSE_SRC`, default `../pulse`; `PULSE_REF`, pinned to the tag `v1.0.0-alpha.33`) and installs it as `bin/pulse`. It leaves the checkout's working tree alone and rebuilds only when that ref moves. `make pulse-release` instead installs the release pinned as `PULSE_VERSION` (also `v1.0.0-alpha.33`), checked against its release checksums.

`data.sh` runs each generator, imports each CSV to a `.pulse` file (git-ignored) with `pulse import csv`, and writes each output beside its request as `<request>.out.json`. Predict runs are written as `<request>.predict.json`. It uses only `node` (no packages) and the `pulse` binary. The generators are deterministic: `build/pyrandom.js` reproduces the random number generator the cohorts were first drawn with, and the committed CSVs were checked byte-for-byte against the cohorts the films were first built from. A newer Pulse can change an output; diff it before you re-cut a film.

## Overlay requests

| Request | Command | What it shows |
|---|---|---|
| `A` | process | crosstab region × plan with share of row, index vs margin, χ² matrix and z-score vs margin |
| `A0` | process | the same crosstab with no overlays; `A`'s data minus `overlays` equals `A0`'s |
| `B` | process, predict | monthly series with month-on-month, rolling z-score (window 3), year over year and baseline. Under the default warm-up (a full window of priors) the rolling z is null through 2024-03, so its layer `count` is 21 |
| `B2` | process | `B` with `"min_periods": 2` on the rolling z-score: 2024-03 answers (1.19) and the layer `count` is 22 |
| `C` | process | region siblings, including an unknown `West` (`PULSE_OVERLAY_REF_UNKNOWN`, still succeeds), and share of total. On a series host `OVERLAY_SHARE_OF_TOTAL` must leave `ref` empty; a populated `ref` is refused with `PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE` |
| `D` | facet | `o2025.pulse` against population `o.pulse` |
| `E` | compose | 2024 against 2025 (`FILTER_RANGE` `values` are strings) |
| `F` | process | formula overlay: lift |
| `G` | process, predict | share of row with a column-axis ref. At alpha.33 it still runs as a row share (predict says `valid: true`) with `summary.baseline` 0, where the skill says it is refused and the baseline is 1. This is Pulse issue #405; the films treat it as fixed and never show this run |
| `H` | process | rolling z-score without `window`: `PULSE_OVERLAY_PARAM_MISSING` |
| `I` | process | a series kind (`OVERLAY_INDEX_VS_PRIOR`) on a crosstab with columns: predict and the runtime both refuse it with `PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE` |

`I` is settled: predict and the runtime agree. `G` is the one logged mismatch left (see `SERIES-RULES.md`), and the film does not show it.
