# Matrices: result cards

- **Cohort:** `generate.js` → `m.csv` (seed 11, 300 rows). `build.sh` imports it twice: `m.pulse` (scalar columns) and `mv.pulse` (s1–v3 folded into one native `vec_f64` field `items`, kind `scale` 1–7).
- **Requests** (Pulse v1.0.0-alpha.33):
  - `mr.json` (twelve matrix specs: covariance, correlation, pairwise, Spearman, partial, reliability raw and reversed, PCA, varimax PCA, factor analysis, collinearity, distance) → `mr.out.json`.
  - `mi.json` (`MAT_CORRELATION` with `params.inference` and a Holm `multiplicity` block, family `matrix`, m 15) → `mi.out.json`.
  - `mv.json` (the native vector named directly in a `vector` slot, plus `items[1..3]` element refs) → `mv.out.json`.
  - `mc.json` (an `ATTR_FORMULA` member `v3_fill`, vector `standardize: "zscore"`, `ddof` 0, `encoding: "records"`) → `mc.out.json`.
  - `mp.json` (grouped pairwise/upper Pearson and Spearman) → `mp.predict.json` (predict) and `mp.out.json` (process).
- **Steps:** `build.sh` regenerates `m.csv`, imports it and runs the requests.

The film's result cards come from these runs.
