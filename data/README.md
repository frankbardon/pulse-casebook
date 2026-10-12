# Film data

The cohorts, requests and captured Pulse outputs behind the result cards in films 6 to 10. Every figure those films show comes from these runs.

| Folder | Film | Cohort | Requests |
|---|---|---|---|
| `aggregators/` | 6, aggregators | `a.csv` (hand-written, 5 rows) | `ar.json` |
| `windows/` | 7, windows | `w.csv` (hand-written, 9 rows) | `wr.json` |
| `tests/` | 8, tests and regressions | `generate.py` → `t.csv` (seed 7, 240 rows) | `tr.json` |
| `matrices/` | 9, matrices | `generate.py` → `m.csv` (seed 11, 300 rows) | `mr.json` (twelve matrix specs), `mp.json` (grouped Spearman, predict and process) |
| `overlays/` | 10, overlays | `generate.py` → `o.csv` (seed 5, 2024–2025) and `o2025.csv` (its 2025 rows) | `A`–`I`, below |

Films 1 to 5 have no recorded runs here.

## Rebuilding

```sh
PULSE=/path/to/pulse ./run.sh              # every film
PULSE=/path/to/pulse ./run.sh overlays     # one film
```

`run.sh` runs each generator, imports each CSV to a `.pulse` file (git-ignored) with `pulse import csv`, and writes each output beside its request as `<request>.out.json`. Predict runs are written as `<request>.predict.json`. It uses only `python3` (standard library) and the `pulse` binary. The generators are deterministic, and the committed CSVs and outputs were checked byte-for-byte against the runs the films were built from. A newer Pulse can change an output; diff it before you re-cut a film.

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
