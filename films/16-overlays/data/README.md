# Overlays: result cards

- **Cohort:** `generate.js` → `o.csv` (seed 5, 2024–2025) and `o2025.csv` (its 2025 rows).
- **Requests:** `A`–`I` and `B2`, below. Outputs are `<request>.out.json`; predict runs are `<request>.predict.json`.
- **Steps:** `build.sh` regenerates both CSVs, imports them and runs every request.

The film's result cards come from these runs.

## Requests

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
