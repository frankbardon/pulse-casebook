#!/usr/bin/env bash
# Runs the whole privacy-safe sharing walkthrough with the Pulse CLI only.
# Usage (from this directory):  PULSE=/path/to/pulse ./run.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd); PULSE=${PULSE:-$([ -x "$ROOT/bin/pulse" ] && echo "$ROOT/bin/pulse" || echo pulse)}   # `make pulse` builds bin/pulse
mkdir -p out

echo "== 1. generate the source table (the stand-in for the real customer data)"
$PULSE synth from-schema -s data/customers.synth.json -o customers.pulse --seed 20260630 --json > out/00_source.json
$PULSE api process -r req/01_source_overview.json --json > out/01_source_overview.json

echo "== 2. capture the profile (+ rule candidates)"
$PULSE profile create -i customers.pulse -o synth/profile.json \
  --include-stats --include-correlations --conditional \
  --fit-models --residual-correlations --fit-shape \
  --suggest-rules synth/suggested_rules.json --seed 7 --json > out/02_profile.json

echo "== 3. synthesize WITHOUT structural rules (for comparison)"
$PULSE synth from-profile -p synth/profile.json --source customers.pulse -o twin_norules.pulse \
  --rows 40000 --seed 11 --synthetic-only --fidelity-report synth/fidelity_norules.json \
  --emit-spec synth/spec_norules.json --json > out/03_synth_norules.json

echo "== 4. synthesize the shareable twin WITH the reviewed structural rules"
$PULSE synth from-profile -p synth/profile.json --source customers.pulse -o twin.pulse \
  --rows 40000 --seed 11 --rules synth/rules.json --synthetic-only \
  --fidelity-report synth/fidelity.json --fidelity-model req/12_churn_fidelity_model.json \
  --emit-spec synth/spec.json --json > out/04_synth_rules.json
$PULSE cohort inspect --json twin.pulse > out/04_inspect_twin.json

echo "== 5. determinism: regenerate from the emitted spec and compare"
$PULSE synth from-schema -s synth/spec.json -o twin_rerun.pulse --seed 11 --json > out/05_twin_rerun.json
cmp twin.pulse twin_rerun.pulse && echo "twin.pulse and twin_rerun.pulse are byte-identical"

echo "== 6. business-rule violations"
$PULSE api compose -r req/03_business_rule_violations.json --json > out/06_violations.json

echo "== 7. the agency's analysis on source vs twin"
$PULSE api compose -r req/04_headline_metrics.json --json > out/07_headline.json
$PULSE api compose -r req/04b_headline_twin_vs_source.json --json > out/07_headline_overlays.json
$PULSE api compose -r req/05_segments_twin_vs_source.json --json > out/07_segments.json
$PULSE api compose -r req/06_churn_crosstab_twin_vs_source.json --json > out/07_crosstab.json
$PULSE api compose -r req/07_chisq_tests.json --json > out/07_chisq.json
$PULSE api compose -r req/08_churn_logistic_model.json --json > out/07_glm.json
$PULSE api compose -r req/09_correlation_matrix.json --json > out/07_corr.json

echo "== 8. disclosure checks"
$PULSE api compose -r req/10_exact_record_match.json --json > out/08_exact_match.json
$PULSE cohort filter -i customers.pulse -o source_half_a.pulse --filter 'int(round(monthly_spend * 100)) % 2 == 0' --json > out/08_half_a.json
$PULSE cohort filter -i customers.pulse -o source_half_b.pulse --filter 'int(round(monthly_spend * 100)) % 2 == 1' --json > out/08_half_b.json
$PULSE cohort filter -i twin.pulse -o twin_half_a.pulse --filter 'int(round(monthly_spend * 100)) % 2 == 0' --json > out/08_twin_half_a.json
$PULSE api compose -r req/11_profile_match_vs_chance.json --json > out/08_profile_match.json

echo "== 9. (comparison) the same pipeline without --fit-models"
$PULSE profile create -i customers.pulse -o synth/profile_conditional_only.json \
  --include-stats --include-correlations --conditional --seed 7 --json > out/09_profile_conditional_only.json
$PULSE synth from-profile -p synth/profile_conditional_only.json --source customers.pulse \
  -o twin_conditional_only.pulse --rows 40000 --seed 11 --rules synth/rules.json --synthetic-only \
  --emit-spec synth/spec_conditional_only.json --json > out/09_synth_conditional_only.json
$PULSE api compose -r req/08b_churn_logistic_conditional_only_twin.json --json > out/09_glm_conditional_only.json

# --json reports a refused request inside its envelope; stop on any.
for f in out/*.json; do
  if [ "$(jq 'if type == "object" and has("errors") then (.errors | length) else 0 end' "$f")" != "0" ]; then
    echo "FAILED: $f"; jq '.errors' "$f"; exit 1
  fi
done
echo "done; responses are in out/"
