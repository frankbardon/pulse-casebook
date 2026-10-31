# Compose, fit, bind and optimize: result cards

- **Cohorts:** `generate.js` (node, `build/pyrandom.js`) writes two CSVs, and `build.sh` imports each to a git-ignored `.pulse`.
  - `m.csv` (seed 17, 208 rows): film 17's cohort, byte for byte. Weekly media and sales for two markets over 104 weeks: `market`, `week`, `year`, `tv` (four-week flights), `search` (always on) and `sales`. Sales are linear in the TV and search adstocks (geometric, 8 lags, unnormalised), with true decays of **0.6 for TV and 0.2 for search** and slopes of 1.6 and 3.2.
  - `h.csv` (noise seed 18, 208 rows): the same markets, weeks and spend, but each adstock enters sales through a Hill curve, `beta · x^s / (x^s + k^s)`: TV beta 240, k 70, s 1.6; search beta 140, k 14, s 2.2. The decays are the same.
- **Requests** are written by `requests.js` (Pulse v1.0.0-alpha.33; `api compose` unless noted):
  - `fit.json` → `fit.out.json`, and `fit.predict.json` (`predict-compose`): a `fits` entry `base` (`REG_OLS sales ~ tv_ad + search_ad + north` at the true decays, holdout `week >= 92`) and slots `north` and `south` scoring it with `ATTR_REG_PREDICT` and `coef("base", "tv_ad")`. `fits.base`: tv_ad 1.591, search_ad 3.269, holdout rmse 13.31.
  - `unknown.json` → `unknown.out.json`: slot 1 reads fit `bsae`, refused with `PULSE_MODEL_UNKNOWN`, `details.available` `["base"]`.
  - `bind.json` → `bind.out.json`, and `bind.predict.json`: film 17's `lhs` sweep (40 samples, `sweep_seed` 4503367277782454912) plus `fits: [{name: "best", from_sweep: {regression: "sales"}}]` and a `long_run` slot reading `sweep_axis("best", …)`. The winner is slot 39 (tv 0.577, search 0.659); `fits.best` equals that slot's regression exactly.
  - `norank.json` → `norank.out.json`: the same without `sweep.rank`, refused with `PULSE_FIT_INVALID`, reason `from_sweep_no_rank`.
  - `mmm.json` → `mmm.out.json`: the media-mix call on `h.pulse`. An `lhs` sweep of 400 samples (tv [0.3, 0.8], search [0, 0.6]) fitting `REG_MMM_HILL` `mmm`, ranked by holdout rmse; a `from_sweep` fit that saves `models/mmm.pulse-model.json`; a `contribution` slot rebuilding the adstocks from `WIN_LAG` `for_each` lags at the winning decays; and two `optimize` blocks. `allocation` (budget 33, search capped at 12) puts TV at 21 and search at its cap; `overspend` asks for 80 and fails alone with `PULSE_OPTIMIZE_INFEASIBLE`.
  - `popsave.json` → `popsave.out.json`: a vector fit (`MAT_COVARIANCE` of tv, search and sales over 2024) saved as `pops/y2024.pulse-population.json`.
  - `popload.json` → `popload.out.json` (`api process`): that population loaded under `populations` and read by `ATTR_MAHALANOBIS`, mean D² by year.
  - `load.json` → `load.out.json` (`api process`): the saved model loaded under `models` and scored by `ATTR_REG_PREDICT`. `requests.js load` writes it after `mmm.json` runs, with the winning decays from `ranking[0].axes`.
  - `bayes.json` → `bayes.out.json` (`api process`): `REG_MMM_BAYES` on market north (raw spend, `time` week, `max_lag` 8, `rng_seed` 18), which warns `PROCESSING_REGRESSION_DIAGNOSTIC` (17 divergences). `bayes99.json` → `bayes99.out.json` is the same with `target_accept` 0.99: no divergences.
- **Saved files** (`models/`, `pops/`) are outputs too. `build.sh` removes them before the runs, so no run warns `PULSE_MODEL_OVERWRITTEN`.
- **Steps:** `build.sh` regenerates both CSVs, imports them, writes the requests and runs them. A rebuild reproduces every output byte for byte; the two Bayesian fits take a few seconds each.

The film's result cards come from these runs. The response curves are drawn from `fits.mmm`'s recorded coefficients, and the current-mix figure (148.1 a week at 23.6 TV and 9.6 search, the cohort's mean weekly spend) is computed from them.
