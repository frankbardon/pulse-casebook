#!/usr/bin/env bash
# Regenerates the cohort and runs every request of the credit-risk showcase, in order.
# Usage: PULSE=/path/to/pulse ./run.sh        (run from this directory, or a copy of it)
# Responses land in results/NN_*.json; the cohort (loans.pulse) is written next to this script.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd "$(dirname "$0")/../.." && pwd); PULSE=${PULSE:-$([ -x "$ROOT/bin/pulse" ] && echo "$ROOT/bin/pulse" || echo pulse)}   # `make pulse` builds bin/pulse
mkdir -p results

"$PULSE" synth from-schema --spec data/loans.synth.json --output loans.pulse --seed 20240630
"$PULSE" cohort inspect loans.pulse > results/00_inspect.txt

# Both target encodings are PREDICTED first. The naive one (07) warns before anything runs;
# the train-only one (10, fit_on + folds) does not.
"$PULSE" api predict --request req/07_target_encode_predict.json --json > results/07_target_encode_predict.predict.json
"$PULSE" api predict --request req/10_purpose_te_train_only.json --json > results/10_purpose_te_train_only.predict.json

for r in 01_profile 02a_emp_length_missing 02b_emp_length_present 03_rate_by_band 04_rate_by_purpose \
         05_leak_check 06_features_split 06b_dti_buckets 07_target_encode_predict \
         08_leaky_vs_clean_fit 08b_in_sample_fitted_ks 08c_side_notes 09_stepwise_bic \
         10_purpose_te_train_only 11_stepwise_bic_with_safe_te 12_final_model_bootstrap; do
  echo "== $r" >&2
  "$PULSE" api process --request "req/$r.json" --json > "results/$r.json"
done

# Steps 13, 13b and 14: one Compose batch. Its `fits` train each model once on the training split;
# every holdout slot scores them with ATTR_REG_PREDICT.
echo "== 13_holdout_validation" >&2
"$PULSE" api predict-compose --request req/13_holdout_validation.compose.json --json > results/13_holdout_validation.predict.json
"$PULSE" api compose --request req/13_holdout_validation.compose.json --json > results/13_holdout_validation.json

"$PULSE" explain --request req/12_final_model_bootstrap.json > results/15_explain_request.txt
"$PULSE" explain --root composed --request req/13_holdout_validation.compose.json \
  --response results/13_holdout_validation.json > results/15_explain_response.txt
echo "done: responses in results/" >&2
