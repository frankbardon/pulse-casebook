# Weights and raking: result cards

- **Cohorts:** `generate.js` (seed 20) writes three CSVs, and `build.sh` imports each one to a git-ignored `.pulse`.
  - `survey.csv`: 600 illustrative survey rows over two waves (`w1`, `w2`; 300 each), with `age` (18-34, 35-54, 55+), `gender` (F, M), `region` (north, south), a design weight `dwt` (north 0.8, south 1.3), `satisfied` (0/1) and `spend`. The sample runs young and male against the made-up census targets (age 29/33/38, gender 51/49). Older respondents are more often satisfied.
  - `freq.csv` and `dup.csv`: one table stored two ways, as six rows with a count `n`, and as the twenty rows those counts stand for.
  - `inv.csv`: ten rows whose weight `w` holds a null, a negative (-1), a zero and a fraction (1.5).
- **Requests** (Pulse v1.0.0-alpha.33; `pulse api process` unless noted):
  - `kinds_dup.json`, `kinds_freq.json` and `kinds_prob.json`: count, mean, median and CI bounds of `score`, over the twenty rows unweighted and over the six rows under `n` as a frequency and as a probability weight. Frequency matches the twenty rows exactly (count 20, mean 6.5, CI 5.54–7.46). Probability keeps the mean and widens the CI (4.51–8.49) on `n_eff` 5.41.
  - `neff.json`: mean and CI of `spend` under `dwt` (Σw 593.5, `n_eff` 566.0 of 600), plus `TEST_T` spend by gender, weighted (p 0.199; `n_eff` 229.2 and 336.8) and with `"weight": null` (p 0.167).
  - `resolve.json` → `resolve.predict.json` (predict) and `resolve.out.json`: wave w1 by gender under a request weight. Predict's `data.weights[]` lists the mean as applied from the request, a slot-weighted count as applied from the slot, a `"weight": null` base as opted out, and `GROUP_CATEGORY` as `skipped_not_weight_aware`.
  - `invalid.json` (frequency) and `invalid_p.json` (probability): `n_weight_invalid` 3 and 2, `n` stays 10, and a `PULSE_WEIGHT_INVALID_ROWS` warning with `by_reason`. `invalid.strict.json` is the frequency run with `--strict`, which turns the warning into an error.
  - Refusals: `max.json` (`AGG_MAX` under a request weight: `PROCESSING_CONFIG`), `mwu.json` (`TEST_MANN_WHITNEY_U` under a probability weight: `PULSE_WEIGHT_UNSUPPORTED`, `supported_kinds` frequency) and `tukey.json` (`TEST_TUKEY_HSD` post-test: `PULSE_WEIGHT_UNSUPPORTED` with a `reason`).
  - `win.json`: a request weight with `WIN_RANK` is refused with `PROCESSING_CONFIG`. `win_slot.json` puts the weight on the aggregation instead and ranks the weighted means by age.
  - `total_fw.json`, `total_dup.json` and `total_pw.json`: `ATTR_FORMULA` `total(score)` is 130 under the frequency weight (38 unweighted), 130 over the twenty rows, and refused under a probability weight (`PULSE_WEIGHT_UNSUPPORTED`).
  - `pulse rake -r <req>.json --json` (the `rk` helper in `build.sh`):
    - `rake.json` → `rake.out.json`: age and gender rim margins, `by: "wave"`. It converges in 3 sweeps with efficiency 76.9% (`n_eff` 461.4; w1 70.3%, w2 84.9%) and writes `raked.pulse` with `rake_weight`.
    - `rake_cap.json`: the same with `max_weight` 2. Efficiency is 79.1% and 79 weights are capped. w1 stops at 100 sweeps with `PULSE_RAKE_NOT_CONVERGED` (residual 0.033; 55+ at 34.7%), and w2 converges in 6.
    - `rake_cell.json`: one joint age × gender margin (cell weighting), exact after 1 sweep, with efficiency 76.2%.
    - `rake_pooled.json`: the rim rake without `by`, for comparison with the overlay.
    - `rake_bad.json`: an age margin without a 55+ target is refused with `PULSE_RAKE_UNTARGETED_CATEGORY` (127 rows), and nothing is written.
  - `use.json` and `use_age.json` over `raked.pulse` with `rake_weight`. Satisfied goes from 51.7% [47.7, 55.7] unweighted to 54.6% [50.0, 59.1] raked, and the weighted counts by age are 174 / 198 / 228 (29 / 33 / 38%) beside the opted-out base of 294 / 179 / 127.
  - `overlay.json`: an age × gender count crosstab with `OVERLAY_RAKE` to the same shares. It returns the fitted table, `parts.factors`, and 4 iterations, converged. `pooled_cells.json` shows that the mean and sum of `rake_weight` from `rake_pooled` per cell match those factors and fitted counts.
- **Steps:** `build.sh` regenerates the CSVs, imports them, runs every request and the rakes, then reads the raked cohort.

The film's result cards come from these runs. The census targets are made up.
