# Reproducing the credit-risk showcase

Everything runs through the `pulse` CLI. The cohort is regenerated from its synth spec with a fixed seed. `synth from-schema` is deterministic, so the same spec and seed give a byte-identical `loans.pulse`. No request carries a number taken from another step's response, so nothing has to be re-transcribed when the spec or seed changes.

## 1. Build Pulse

```sh
# Needs a Pulse build that includes the model-workbench work (pulse roadmap U49): FEAT_TARGET_ENCODE
# `fit_on` / `folds`, AGG_AUC, WIN_SHARE / WIN_LIFT, GROUP_NUMERIC_RANGES, bucket-ordered GROUP_QUANTILE keys,
# REG_GLM `penalty`, `jackknife_groups`, and GLM fits that converge on the collections flag. That is the U49
# effort branch or the first alpha after v1.0.0-alpha.16. Build it from a pulse checkout (a later tag/main
# works the same way):
(cd /path/to/pulse && go build -o /tmp/pulse ./cmd/pulse)
```

## 2. Copy the example to a scratch location

```sh
rm -rf /tmp/credit-risk && cp -r showcase/credit-risk-model /tmp/credit-risk
cd /tmp/credit-risk
```

## 3. Run every step

```sh
PULSE=/tmp/pulse ./run.sh
```

`run.sh` does the following, in order, and stops at the first command that fails (every `--json` command exits non-zero when its envelope carries `errors`):

```sh
pulse synth from-schema --spec data/loans.synth.json --output loans.pulse --seed 20240630
pulse cohort inspect loans.pulse                                       # -> results/00_inspect.txt
pulse api predict --request req/07_target_encode_predict.json --json   # -> results/07_target_encode_predict.predict.json
pulse api predict --request req/10_purpose_te_train_only.json --json   # -> results/10_purpose_te_train_only.predict.json
pulse api process --request req/<NN>.json --json                       # -> results/<NN>.json, for each of:
    01_profile 02a_emp_length_missing 02b_emp_length_present 03_rate_by_band 04_rate_by_purpose
    05_leak_check 06_features_split 06b_dti_buckets 07_target_encode_predict
    08_leaky_vs_clean_fit 08b_in_sample_fitted_ks 08c_side_notes 09_stepwise_bic
    10_purpose_te_train_only 11_stepwise_bic_with_safe_te 12_final_model_bootstrap
pulse api predict-compose --request req/13_holdout_validation.compose.json --json  # -> results/13_holdout_validation.predict.json
pulse api compose         --request req/13_holdout_validation.compose.json --json  # -> results/13_holdout_validation.json
pulse explain --request req/12_final_model_bootstrap.json                           # -> results/15_explain_request.txt
pulse explain --root composed --request req/13_holdout_validation.compose.json \
  --response results/13_holdout_validation.json                                    # -> results/15_explain_response.txt
```

Wall time is about 2.5 minutes on a laptop-class machine. Step 12 accounts for most of it (three stepwise searches, then 1,000 bootstrap refits of the selected 14-parameter logistic model on 42,000 rows, ~2 min). Step 11 and the step-13 batch each run one stepwise search (~12–14 s). Every other step takes under a second.

To run one step by hand:

```sh
/tmp/pulse api predict-compose -r req/13_holdout_validation.compose.json --json   # validate without reading records
/tmp/pulse api compose         -r req/13_holdout_validation.compose.json --json
```

The committed `results/` directory holds the responses from the reference run. A rerun should match them; no timing fields are emitted.

## Expected key numbers

| Step | Response file → path | Expected |
|---|---|---|
| synth | stdout | `Generated 60000 rows -> loans.pulse (rejected 5289)`; `loans.pulse` SHA-256 `d5476127b84bb2dc7386f6cf1c0307501bc56ba519d917e4d70f1b2c6aaae2be` |
| all | every `results/*.json` | `errors: []`; `warnings: []` everywhere except step 7's leakage warning |
| 1 | `01_profile.json` → `data.data[0]` | `applications` 60000, `defaults` 7162, `default_rate` 0.11936666…, `total_principal_usd` `"724730103.82"`, `mean_principal_usd` `"12078.8351"`, `median_fico` 694, `null_emp_length` 3603, `null_revol_util` 1798 |
| 1 | `01_profile.json` → `components` `mean_dti_pct.operator.sum` | 1082182.2600000112 |
| 2 | `02a` / `02b` → `default_rate` | 0.16985845… (3603 rows) / 0.11614092… (56397 rows) |
| 3 | `03_rate_by_band.json` | A 0.027623… (7204) … G 0.296603… (2532) |
| 5 | `05_leak_check.json` | defaulted: `mean_fico_at_month_12` 607.33…, `collections_rate` 0.848506…; performing: 704.04…, 0.009671… |
| 6 | `06_features_split.json` | split 0: 42000 loans, rate 0.119357…, `"508110479.20"`; split 1: 18000, 0.119388…, `"216619624.62"` |
| 6b | `06b_dti_buckets.json` | `under 10%` 9476 / 0.082313…, `10-20%` 26388, `20-30%` 20162, `30% and over` 3974 / 0.177654…, in that order |
| 7 | `07_target_encode_predict.predict.json` → `warnings[0].code` | `PULSE_FEAT_TARGET_LEAKAGE_RISK` |
| 8 | `08_leaky_vs_clean_fit.json` → `pseudo_r2` | clean 0.10546631…, `with_post_outcome_fields` 0.84754528… (`collections_flag` 6.5200718…, 10 iterations) |
| 8b | `08b_in_sample_fitted_ks.json` → `tests[].statistic` | clean 0.33133877…, leaky 0.93468800… |
| 8c | `08c_side_notes.json` | `collections_flag_only`: intercept −3.8699458…, `collections_flag` 6.3355068…, `pseudo_r2` 0.67477061…; ridge (`penalty` `l2`, `alpha` 0.01): `collections_flag` 2.0293111…, `pseudo_r2` 0.74749391… |
| 9 | `09_stepwise_bic.json` → `selected_features` | 12 predictors, `pseudo_r2` 0.10356824… |
| 10 | `10_purpose_te_train_only.predict.json` → `warnings` | `[]` |
| 10 | `10_purpose_te_train_only.json` | small_business holdout: `min_purpose_te` = `max_purpose_te` = 0.19302191…; training 175 of 899 |
| 11 | `11_stepwise_bic_with_safe_te.json` | 13 predictors incl. `purpose_te` (sixth), `pseudo_r2` 0.10667469… |
| 12 | `12_final_model_bootstrap.json` → `pd_final.coefficients` | `lti` 2.0785888…, `dti` 0.0325797…, `purpose_te` 7.3872079…; SE of `lti`: Wald 0.13838…, bootstrap 0.14505… (1000 of 1000 succeeded), jackknife 0.15996… (`jackknife_groups` 50) |
| 13 | `13_holdout_validation.json` → `responses[0].data` | D1 … D10 in order; D1 `observed_rate` 0.012222…, D10 0.336666…, D10 `lift` 2.8199162…; `cum_defaults` 2149 … 990, 606; D9 `cum_capture` 0.4606793… |
| 13b | `responses[1].data` | D10 `observed_rate` 0.980555…, `mean_true_pd` 0.204313…, `cum_capture` 0.821312… |
| 14 | `responses[2].data[0]` | `mean_predicted_pd` 0.11877157…, `observed_default_rate` 0.11938888…; AUC: final 0.74351369…, all-22 0.74101770…, true-PD 0.74608671…, leaky 0.99077372… |
| 14 | `responses[2].components.aggregations` → `auc_final_model.operator` | `gini` 0.48702738…, `ci_lower` 0.73293794…, `ci_upper` 0.75408944… |
| 14 | `responses[2].tests[].statistic` | KS: final 0.36496663…, all-22 0.35628477…, true-PD 0.36846524…, leaky 0.93543177… |

Reference run (pulse `v1.0.0-alpha.16-47-gc2b64f5f`, the U49 effort branch), from a fresh copy of the directory: every value above matched.

## Notes

- `loans.pulse` (≈ 6.6 MB) is not committed (`*.pulse` is gitignored); `run.sh` regenerates it.
- `gt_true_pd` and `gt_uniform_draw` are simulation ground-truth columns. They are used only for evaluation in steps 13–14, never as model inputs.
- The request-side `pulse explain` in step 15 describes step 12, a single request. On this build, explaining the step-13 batch's request reports its `ATTR_REG_PREDICT` attributes as unbound (`PULSE_MODEL_UNKNOWN`), although `pulse api predict-compose` accepts the batch. The response-side explanation of the batch is unaffected.
