# Tests and regressions: result cards

- **Cohort:** `generate.js` → `t.csv` (240 rows). The original six columns use seed 7; `id`, `pre_spend` (the CUPED covariate) and `checkout_mins` (above 0 only for a converted row, so it separates the outcome) come from a second stream, seed 8, so the seed-7 columns are unchanged.
- **Requests**, each run with `pulse api process` at v1.0.0-alpha.33:
  - `tr.json` → `tr.out.json`: `TEST_T`, `TEST_CHISQ` (region × arm), `TEST_PEARSON_R` and `TEST_ANOVA_F` under a Holm block, plus `REG_OLS` and a binomial `REG_GLM`.
  - `xp.json` → `xp.out.json`: the sample-ratio check (`TEST_CHISQ` with `params.expected`), `TEST_T` with `reference: "A"`, and the same test with `covariate: "pre_spend"` (CUPED).
  - `grp.json` → `grp.out.json`: `TEST_T` once per `region` group.
  - `fit.json` → `fit.out.json`: `REG_OLS` with `covariance: {type: "hc3"}`, `REG_OLS` with `holdout: "id > 192"`, and `REG_BAYES_LINEAR`.
  - `sep.json` → `sep.out.json`: a separated `REG_GLM` (`converted ~ checkout_mins`) that fails alone with `PROCESSING_REGRESSION_SEPARATION` and a `PULSE_SLOT_FAILED` warning, beside a `REG_OLS` that still returns.
- **Steps:** `build.sh` regenerates `t.csv`, imports it and runs each request.

The film's result cards come from these runs.
