# Tests and regressions: result cards

- **Cohort:** `generate.js` → `t.csv` (seed 7, 240 rows).
- **Requests:** `tr.json` → `tr.out.json`.
- **Steps:** `build.sh` regenerates `t.csv`, imports it and runs `tr.json` through `pulse api process`.

The film's result cards come from this run.
