# Reproducing the A/B test readout

Everything is regenerated from the synth spec in `data/`, with a fixed seed. No `.pulse` file is
committed. The commands use `jq` only to pull numbers out of the Pulse JSON envelopes.

## 1. Build Pulse and copy the example to a scratch directory

```bash
# Needs a Pulse build that includes the synth-realism work (pulse roadmap U52): the spec's
# `"output": false` helper fields and sampler-less rule-determined categoricals. That is the first alpha
# after v1.0.0-alpha.33; the casebook Makefile still pins alpha.33, so until the pin moves build from a
# pulse checkout that has U52 (a later tag/main works the same way):
(cd /path/to/pulse && go build -o /tmp/pulse ./cmd/pulse)
rm -rf /tmp/ab-test-readout && cp -r showcase/ab-test-readout /tmp/ab-test-readout
cd /tmp/ab-test-readout
```

## 2. Run every step

```bash
PULSE=/tmp/pulse ./run_all.sh        # writes 16 JSON envelopes to out/
```

`run_all.sh` runs these commands in order (all from this directory):

```bash
P=/tmp/pulse
$P synth from-schema -s data/ab_test.synth.json -o ab_test.pulse --seed 2026 --json
$P cohort inspect ab_test.pulse --json
$P api predict -r req/01_predict_battery.json --json
$P api predict -r req/04_metric_battery.json --json
$P api process -r req/02_srm_gof.json --json
$P api process -r req/03_srm_by_week_and_balance.json --json
$P api process -r req/04_metric_battery.json --json
$P api compose -r req/05_revenue_shape.compose.json --json
$P api process -r req/06_revenue_tests.json --json
$P api process -r req/07_regression_adjustment.json --json
$P api process -r req/08_cuped_welch.json --json
$P api compose -r req/09_segments.compose.json --json
$P api process -r req/10_heterogeneity.json --json
$P api predict-compose -r req/11_readout.compose.json --json
$P api compose -r req/11_readout.compose.json --json
$P api compose -r req/11_readout.compose.json --json --parallel 0
```

Expected:
- `ab_test.pulse` is 1,281,594 bytes, SHA-256 `33bd741c2ddcc9880b8568e80fcc50ab1db2b70627d974e723c3975d145feceb`.
- Every envelope has `errors: []` and `warnings: []`.

## 3. Check the key numbers

```bash
# every envelope clean
for f in out/*.json; do echo "$f $(jq -c '[(.errors|length),(.warnings|length)]' $f)"; done

jq -c '.data | {streamable, streamable_reasons, p_values}' out/01_predict_battery.json out/01_predict_corrected.json
jq -c '.data.tests[] | {statistic, df, p_value, observed: .details.observed}' out/02_srm_gof.json
jq -c '.data.tests[] | {label, statistic, p_value, p_adjusted}' out/03_srm_by_week_and_balance.json
jq -c '.data.tests[] | {label, diff: .details.diff, ci: [.details.ci_low, .details.ci_high], p_value, p_adjusted}' out/04_metric_battery.json
jq -c '.data.responses[].data' out/05_revenue_shape.json
jq -c '.data.tests[] | {label, statistic, p_value, z: .details.z, warnings}' out/06_revenue_tests.json
jq -c '.data.regressions[] | {name, coefficients, std_errors, ci_lower, ci_upper, p_values, r2}' out/07_regression_adjustment.json
jq -c '.data.tests[] | {label, diff: .details.diff, ci: [.details.ci_low, .details.ci_high], variance: .details.variance, theta: .details.theta, variance_reduction: .details.variance_reduction, p_value}' out/08_cuped_welch.json
jq -r '.data.responses[] | .data as $d | .tests | to_entries[] | [.value.group_key[0], $d[.key].users, .value.details.diff, .value.p_value, .value.p_adjusted, .value.multiplicity.m] | @tsv' out/09_segments.json
jq -c '.data.regressions[] | {name, coefficients, std_errors, p_values, p_adjusted, m: .multiplicity.m}' out/10_heterogeneity.json
jq -c '.data.responses[] | .label as $l | (.tests[]? | {slot: $l, label, p_value, p_adjusted})' out/11_readout.json
cmp out/11_readout.json out/11_readout_parallel.json && echo "serial == parallel"
```

| Step | Output | Expected |
|---|---|---|
| 1 | predict 01: `streamable` / reasons / `p_values` | `false` / `test TEST_MANN_WHITNEY_U is not streamable` / total 7, uncorrected 7, threshold 10 |
| 1 | predict 04: `streamable` / `p_values` | `true` / total 6, uncorrected 0 |
| 2 | observed arm counts (expected 20000 each) | new_page 20000, old_page 20000 (pair randomization) |
| 2 | SRM GOF χ², df, p | 0, 1, 1 |
| 3 | srm_by_week χ², p | 1.5029, 0.68159 |
| 3 | balance p: device / plan / region / user_type / prior_sessions | 1 / 0.77037 / 0.44621 / 0.72045 / 1; all `p_adjusted` 1 |
| 4 | trial_start diff, CI, p, Holm p; successes | 0.01355, [0.0074986, 0.0196014], 1.1462e-5, 6.8774e-5; [2271, 2000] |
| 4 | paid_conversion diff, p, Holm p; successes | 0.00405, 0.021433, 0.10717; [681, 600] |
| 4 | revenue_per_user diff, p | 0.19759, 0.56911 |
| 4 | pages_viewed diff, p, Holm p | 0.068, 0.083861, 0.33544 |
| 4 | days_to_convert diff, p, Holm p; n | 0.046429, 0.92409, 1; [681, 600] |
| 4 | retention_30d diff, p; successes | 0, 1; [8503, 8503] |
| 5 | revenue/user new, old; payers; revenue/payer | 4.34944, 4.15185; 681, 600; 127.737, 138.395 |
| 6 | Welch p; Mann-Whitney z, p | 0.56911; 2.26100, 0.023759 (+ `PULSE_TEST_TIES_DOMINATE` test warning) |
| 7 | is_variant coef / SE / p, unadjusted | 0.068 / 0.039335 / 0.083861 |
| 7 | is_variant coef / SE / p, adjusted; R² | 0.068 / 0.024720 / 0.0059469; 0.60510 |
| 7 | is_variant 95% CI (Student-t), unadjusted; adjusted | [−0.009097, 0.145097]; [0.019549, 0.116451] |
| 8 | pages_cuped (`params.covariate`) diff, CI, p; variance | 0.068, [0.019549, 0.116451], 0.0059463; [6.1222, 6.0988] |
| 8 | pages_cuped `theta`, `variance_reduction`, `covariate_mean` | 0.767199, 0.60507, 10.0347 |
| 9 | four grouped slots (device, plan_tier, region, user_type), 12 tests, `group_key` on each; same figures as the former 12 filtered slots |
| 9 | Holm p (m = 12) below 0.05 | mobile 3.0089e-8, NA 0.0022938, new 0.0039499; all other slots ≥ 0.054 |
| 9 | raw p below 0.05 | mobile, business (0.00607), individual (0.00738), team (0.01168), NA (0.00021), EMEA (0.03633), new (0.00039), returning (0.00941) |
| 10 | new_page_x_mobile coef / SE / p / Holm p | 0.027510 / 0.0062959 / 1.2483e-5 / 2.4967e-5 |
| 10 | new_page_x_na coef / p / Holm p | 0.0077880 / 0.21662 / 0.21662; both with `multiplicity.m` 2 |
| 11 | guardrails: `srm` p (no `p_adjusted`); balance Holm p | 1; all 1, m = 6 |
| 11 | scorecard Holm p: trial / pages_cuped / paid | 6.8774e-5 / 0.029732 / 0.085732 |
| 11 | serial vs `--parallel 0` | byte-identical envelopes |
