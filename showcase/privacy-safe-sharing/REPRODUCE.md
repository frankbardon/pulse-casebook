# Reproducing the privacy-safe sharing showcase

Every figure in [README.md](README.md) comes from a Pulse response produced by `run.sh`. Each run
regenerates the `.pulse` cohorts (they are git-ignored) and writes the responses to `out/`. Every
step is a Pulse CLI call; `jq` only checks the envelopes.

## From a fresh checkout

The showcase needs the Pulse alpha after v1.0.0-alpha.33, the release that carries the
synth-realism work (roadmap U52). Until the casebook `Makefile` pin moves to that release, build
Pulse from a checkout that has it:

```bash
# 1. build the CLI (a pulse checkout with U52; `make pulse` once the pin carries it)
(cd /path/to/pulse && go build -o /tmp/pulse ./cmd/pulse)

# 2. work on a scratch copy so nothing is written into the repo
rm -rf /tmp/pss && cp -r showcase/privacy-safe-sharing /tmp/pss && cd /tmp/pss

# 3. run every step (about 15 s)
PULSE=/tmp/pulse ./run.sh
```

`run.sh` executes these commands in order, all from the example directory:

| Step | Command |
|---|---|
| 1 | `pulse synth from-schema -s data/customers.synth.json -o customers.pulse --seed 20260630 --json` |
| 1 | `pulse api process -r req/01_source_overview.json --json` |
| 2 | `pulse profile create -i customers.pulse -o synth/profile.json --include-stats --include-correlations --conditional --fit-models --residual-correlations --fit-shape --suggest-rules synth/suggested_rules.json --seed 7 --json` |
| 3/4 | `pulse synth from-profile -p synth/profile.json --source customers.pulse -o twin_norules.pulse --rows 40000 --seed 11 --synthetic-only --fidelity-report synth/fidelity_norules.json --emit-spec synth/spec_norules.json --json` |
| 4 | `pulse synth from-profile -p synth/profile.json --source customers.pulse -o twin.pulse --rows 40000 --seed 11 --rules synth/rules.json --synthetic-only --fidelity-report synth/fidelity.json --fidelity-model req/12_churn_fidelity_model.json --emit-spec synth/spec.json --json` |
| 5 | `pulse cohort inspect --json twin.pulse` |
| 5 | `pulse synth from-schema -s synth/spec.json -o twin_rerun.pulse --seed 11 --json`, then `cmp twin.pulse twin_rerun.pulse` |
| 6 | `pulse api compose -r req/03_business_rule_violations.json --json` |
| 7 | `pulse api compose -r req/04_headline_metrics.json --json`, `req/04b_headline_twin_vs_source.json`, `req/05_segments_twin_vs_source.json`, `req/06_churn_crosstab_twin_vs_source.json`, `req/07_chisq_tests.json`, `req/08_churn_logistic_model.json`, `req/09_correlation_matrix.json` |
| 8 | `pulse api compose -r req/10_exact_record_match.json --json` |
| 8 | `pulse cohort filter` ×3 (`source_half_a/b.pulse`, `twin_half_a.pulse`, split on `int(round(monthly_spend * 100)) % 2`), then `pulse api compose -r req/11_profile_match_vs_chance.json --json` |
| 9 | `pulse profile create … --conditional` (no `--fit-models`) → `synth from-profile … --synthetic-only` → `pulse api compose -r req/08b_churn_logistic_conditional_only_twin.json --json` |

Validate any single request before running it with `pulse api predict -r req/01_source_overview.json --json`
(single requests) or `pulse api predict-compose -r req/NN_….json --json` (Compose batches).

`run.sh` stops on the first command that exits non-zero, and at the end checks that every envelope
in `out/` has an empty `errors` array. A clean run ends with `done; responses are in out/`.

The files in `synth/` are rewritten by the run and should come back byte-identical to the
committed copies (`git diff --stat synth/` in a checkout, or `diff -r` against the repo copy).

## Expected key numbers

| Where | Figure | Expected |
|---|---|---|
| `out/00_source.json` | `data.rows_generated` / `rows_rejected` | 40000 / 0 |
| `out/01_source_overview.json` | churn_rate / dormant_accounts / frequent_callers | 0.1929 / 1228 / 1487 |
| `synth/suggested_rules.json` | candidates | 2 (gating `round(churned) == 0` → `end_date`; dependency `frequent_caller = round(support_contacts) >= 4`) |
| `synth/profile.json` | model R² for monthly_spend / tenure_months / churned | 0.911 / 0.198 / 0.171 (rounded) |
| `synth/profile.json` | `conditional.set_set_pairs` | 1 (`products_held.broadband` → `products_held.tv`) |
| `out/04_synth_rules.json` | rows_generated / rows_rejected / warnings | 40000 / 0 / 28 |
| `synth/fidelity.json` | χ² p region / plan / contract | 0.5460 / 0.2219 / 0.5523 |
| `synth/fidelity.json` | KS D age / monthly_spend / tenure_months | 0.02045 / 0.0555 / 0.0631 |
| `synth/fidelity.json` | models flagged | `monthly_spend`, `churned` |
| `synth/fidelity.json` | `utility.model_fits[0]` source_fit / synthetic_fit / fit_ratio | 0.16978 / 0.17599 / 1.0366 |
| `synth/fidelity.json` | `utility.target_rates` verdicts | 5 × `preserved` |
| `synth/fidelity.json` | `disclosure` exact_matches / dcr_median / dcr_p5 (sample_rows) | 0 / 0.01702 / 0.00448 (10000) |
| run log | determinism | `twin.pulse and twin_rerun.pulse are byte-identical` |
| `out/06_violations.json` | twin_without_rules: end_before_start / active_with_end_date / churned_without_end_date / tenure_disagrees / no_products_but_spend / flag_disagrees / tv_without_broadband | 602 / 6125 / 6272 / 39720 / 1245 / 1727 / 0 |
| `out/06_violations.json` | twin_with_rules: same order | 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| `out/07_headline.json` | twin churn_rate / avg_monthly_spend_usd / avg_tenure_months | 0.18595 / 69.0759 / 26.5768 |
| `out/07_headline_overlays.json` | index churn / spend / tenure | 96.397 / 98.247 / 100.377 |
| `out/07_segments.json` | churn by contract, source (M/1Y/2Y) | 0.27417 / 0.08206 / 0.02810 |
| `out/07_segments.json` | churn by contract, twin (M/1Y/2Y) | 0.26568 / 0.07720 / 0.02737 |
| `out/07_segments.json` | avg spend of tv holders, source / twin | 109.499 / 110.838 |
| `out/07_crosstab.json` | `churn_pp_gap` Basic × Monthly | −0.03254 |
| `out/07_chisq.json` | plan × churned χ², source / twin | 197.202 / 84.649 (p 1.70e−42 / 3.09e−18) |
| `out/07_glm.json` | pseudo_r2 source / twin | 0.16978 / 0.17599 |
| `out/07_glm.json` | tenure_months β source / twin | −0.020204 / −0.021049 |
| `out/07_corr.json` | tenure–churned r source / twin; determinant | −0.190 / −0.203; 0.8693 / 0.8654 |
| `out/08_exact_match.json` | control / twin matching_row_pairs | 40002 / 0 |
| `out/08_half_a.json`, `08_half_b.json`, `08_twin_half_a.json` | written_records | 20633 / 19367 / 20798 |
| `out/08_profile_match.json` | real-half vs real-half / twin-half vs real-half | 88 / 76 |
| `out/09_glm_conditional_only.json` | twin pseudo_r2 | 0.08447 |

```bash
jq -c '.utility.model_fits[] | {source_fit, synthetic_fit, fit_ratio}' synth/fidelity.json
jq -c '.disclosure' synth/fidelity.json
jq -c '.data.responses[2].data' out/06_violations.json
```

The numbers were produced with Pulse built from the synth-realism effort branch (commit fc253466,
before the alpha that carries it). A later build that changes the synth samplers or the profile
capture may move the synthetic figures; the source figures depend only on
`data/customers.synth.json` and its seed.
