# Reproducing the credit-risk showcase

Everything runs through the `pulse` CLI. The cohort is regenerated from its synth spec with a fixed seed. `synth from-schema` is deterministic, so the same spec and seed give a byte-identical `loans.pulse`. No request carries a number taken from another step's response, so nothing has to be re-transcribed when the spec or seed changes.

## 1. Build Pulse

```sh
# Needs a Pulse build that includes the synth-realism work (pulse roadmap U52): the cohort spec draws the
# outcome with `bernoulli()` / `uniform()` inside rules and keeps its true-PD helper out of the file with
# `"output": false`. That is the first alpha after v1.0.0-alpha.33; the casebook Makefile still pins alpha.33,
# so until the pin moves build from a pulse checkout that has U52 (a later tag/main works the same way):
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
pulse explain --root composed --request req/13_holdout_validation.compose.json     # -> results/15_explain_request.txt
pulse explain --root composed --request req/13_holdout_validation.compose.json \
  --response results/13_holdout_validation.json                                    # -> results/15_explain_response.txt
```

Wall time is about 2.5 minutes on a laptop-class machine. Step 12 accounts for most of it (three stepwise searches, then 1,000 bootstrap refits of the selected 12-parameter logistic model on 42,000 rows, ~2 min). Step 11 and the step-13 batch each run one stepwise search (~12–14 s). Every other step takes under a second.

To run one step by hand:

```sh
/tmp/pulse api predict-compose -r req/13_holdout_validation.compose.json --json   # validate without reading records
/tmp/pulse api compose         -r req/13_holdout_validation.compose.json --json
```

The committed `results/` directory holds the responses from the reference run. A rerun should match them; no timing fields are emitted.

## Expected key numbers

| Step | Response file → path | Expected |
|---|---|---|
| synth | stdout | `Generated 60000 rows -> loans.pulse (rejected 5316)`; `loans.pulse` SHA-256 `70be6c850db76768eb5bbe367953908e3c23f5262efd2947378ca9d0e822d960`; `results/00_inspect.txt` lists 20 fields, none of them simulation-only |
| all | every `results/*.json` | `errors: []`; `warnings: []` everywhere except step 7's leakage warning |
| 1 | `01_profile.json` → `data.data[0]` | `applications` 60000, `defaults` 7359, `default_rate` 0.12265, `total_principal_usd` `"724849873.00"`, `mean_principal_usd` `"12080.8312"`, `median_fico` 695, `null_emp_length` 3693, `null_revol_util` 1810 |
| 1 | `01_profile.json` → `components` `mean_dti_pct.operator.sum` | 1082157.02 |
| 2 | `02a` / `02b` → `default_rate` | 0.18711075… (3693 rows) / 0.11842222… (56307 rows) |
| 3 | `03_rate_by_band.json` | A 0.028503… (7192) … G 0.319595… (2475) |
| 5 | `05_leak_check.json` | defaulted: `mean_fico_at_month_12` 606.87…, `collections_rate` 0.857861…; performing: 704.22…, 0.008947… |
| 6 | `06_features_split.json` | split 0: 42000 loans, rate 0.122642…, `"508475160.00"`; split 1: 18000, 0.122666…, `"216374713.00"` |
| 6b | `06b_dti_buckets.json` | `under 10%` 9499 / 0.083271…, `10-20%` 26488, `20-30%` 19969, `30% and over` 4044 / 0.189910…, in that order |
| 7 | `07_target_encode_predict.predict.json` → `warnings[0].code` | `PULSE_FEAT_TARGET_LEAKAGE_RISK` |
| 8 | `08_leaky_vs_clean_fit.json` → `pseudo_r2` | clean 0.11398123…, `with_post_outcome_fields` 0.86058117… (`collections_flag` 6.7496300…, 10 iterations) |
| 8b | `08b_in_sample_fitted_ks.json` → `tests[].statistic` | clean 0.35079315…, leaky 0.93867329… |
| 8c | `08c_side_notes.json` | `collections_flag_only`: intercept −3.9083600…, `collections_flag` 6.4936599…, `pseudo_r2` 0.69218854…; ridge (`penalty` `l2`, `alpha` 0.01): `collections_flag` 2.0620450…, `pseudo_r2` 0.75851721… |
| 9 | `09_stepwise_bic.json` → `selected_features` | 10 predictors, `pseudo_r2` 0.11185196… |
| 10 | `10_purpose_te_train_only.predict.json` → `warnings` | `[]` |
| 10 | `10_purpose_te_train_only.json` | small_business holdout: `min_purpose_te` = `max_purpose_te` = 0.22801311…; training 221 of 960 |
| 11 | `11_stepwise_bic_with_safe_te.json` | 11 predictors incl. `purpose_te` (fifth), `pseudo_r2` 0.11646291… |
| 12 | `12_final_model_bootstrap.json` → `pd_final.coefficients` | `lti` 2.2211897…, `dti` 0.0371102…, `purpose_te` 7.3672539…; SE of `lti`: Wald 0.13822…, bootstrap 0.13489… (1000 of 1000 succeeded), jackknife 0.11979… (`jackknife_groups` 50) |
| 13 | `13_holdout_validation.json` → `responses[0].data` | D1 … D10 in order; D1 `observed_rate` 0.018333…, D10 0.326111…, D10 `lift` 2.6585144…; `cum_defaults` 2208 … 976, 587; D9 `cum_capture` 0.4420289… |
| 13b | `responses[1].data` | D10 `observed_rate` 0.986111…, `mean_true_pd` 0.201742…, `cum_capture` 0.803894… |
| 14 | `responses[2].data[0]` | `mean_predicted_pd` 0.12205853…, `observed_default_rate` 0.12266666…, `mean_true_pd` 0.11940215…; AUC: final 0.73602817…, all-22 0.73412466…, true-PD 0.73980952…, leaky 0.99331097… |
| 14 | `responses[2].components.aggregations` → `auc_final_model.operator` | `gini` 0.47205634…, `ci_lower` 0.72556286…, `ci_upper` 0.74649348… |
| 14 | `responses[2].tests[].statistic` | KS: final 0.35105694…, all-22 0.34985105…, true-PD 0.36006260…, leaky 0.93641799… |
| 15 | `15_explain_request.txt` line 2 / `15_explain_response.txt` line 1 | `valid: true`; "3 responses side by side and 3 regression fits; 45 of 61 inferential findings show evidence at their alpha" |

Reference run (pulse built from the synth-realism effort branch at fc253466, before the alpha that carries it), from a fresh copy of the directory: every value above matched.

## Notes

- `loans.pulse` (≈ 5.8 MB) is not committed (`*.pulse` is gitignored); `run.sh` regenerates it.
- The spec's true PD and its shared post-outcome draw are `"output": false` helper fields, so the file has no simulation-only column. Steps 13–14 rebuild the true PD in the request (`ATTR_FORMULA` `true_pd`) from application-time columns, only for the evaluation rows; it is never a model input.
