# SEM: result cards

- **Cohort:** `generate.js` → `sem.csv` (seed 14, 900 rows): `wave` (w1, w2, w3; 300 each), `channel` (online, store), five-point items `s1`–`s3` (service) and `v1`–`v3` (value), and `recommend` (0–10). `s3` also leans on value, and across the waves the value mean falls while the service mean rises. `build.sh` imports it to `sem.pulse` (git-ignored).
- **Requests** (Pulse v1.0.0-alpha.33):
  - `fit.json` → `fit.out.json`: two `MAT_SEM` slots under semopy's default convention. `model` (service and value, each with three items, both driving recommend: χ² 77.2 on 12 dof, CFI 0.971, RMSEA 0.078, with `residual_covariance` pointing at `s3`) and `freed` (`s3` also loads on value: χ² 2.53 on 11 dof). Every later request uses the freed measurement model.
  - `ladder.json` → `ladder.out.json`: `group: "channel"` configural, metric (`group_equal: ["loadings"]`) and scalar (`["loadings","intercepts"]`), one slot per step.
  - `pair.json` → `pair.predict.json` (predict) and `pair.out.json` (process): a wave pair picked by request `params` (`from_wave` w1, `to_wave` w3) through an `ATTR_FORMULA` `period`, declared with `group_levels` (from, to), under scalar invariance with per-level latent means and four `:=` rows (`dv`, `ds`, `dtot`, `share`). Slot `delta` is analytic (delta method); slot `boot` adds `resample: "bootstrap"`, 500 replicates, `rng_seed` 14. Wave w2 maps to 0 and warns `PULSE_MATRIX_GROUP_LEVEL_UNDECLARED` (count 300).
  - `bad.json` → `bad.out.json`: the `delta` slot with a `:=` line reading an undefined label, refused as `SERVICE_VALIDATION` (`defined_invalid`, `unknown_label`).
  - `ord.json` → `ord.out.json`: the measurement model under ML and under `estimator: "wlsmv"` with all six items `ordered` (thresholds, scaled test).
  - `score.json` → `score.out.json`: `ATTR_SEM_SCORE` for value and service, averaged by wave.
- **Steps:** `build.sh` regenerates `sem.csv`, imports it and runs the requests.

The film's result cards come from these runs. The path diagram's layout is a sketch; its numbers come from `fit.out.json`.
