#!/usr/bin/env bash
# Rebuilds the brand-tracker cohort and runs every step of the walkthrough.
# Usage: PULSE=/path/to/pulse ./run.sh   (run from anywhere; outputs land in ./out and ./deliver)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd); PULSE=${PULSE:-$([ -x "$ROOT/bin/pulse" ] && echo "$ROOT/bin/pulse" || echo pulse)}   # `make pulse` builds bin/pulse
cd "$(dirname "$0")"
export PULSE_LABEL_TABLES_DIR=./labels
mkdir -p out deliver

echo "== 00 synthesize the unweighted sample (seed 2025)"
"$PULSE" synth from-schema -s spec/brand_tracker.synth.json -o brand_tracker_sample.pulse --seed 2025 --json > out/00_synth.json

echo "== 00 rake each wave to the census targets -> brand_tracker.pulse (weight column \"weight\")"
rm -f brand_tracker.pulse
"$PULSE" rake brand_tracker_sample.pulse -o brand_tracker.pulse --margins spec/census_targets.json \
  --by wave --weight-field weight --json > out/00_rake.json
echo "== 00_rake: errors=$(jq -c '.errors|length' out/00_rake.json) warnings=$(jq -c '.warnings|length' out/00_rake.json) converged=$(jq -c '.data.converged' out/00_rake.json)"
"$PULSE" cohort inspect brand_tracker.pulse --json > out/00_inspect.json

run() {  # run <request file>: predict first, then execute
  local f=$1 n; n=$(basename "$f" .json)
  if grep -q '"requests"' "$f"; then
    "$PULSE" api predict-compose -r "$f" --json > "out/${n}.predict.json"
    "$PULSE" api compose -r "$f" --json > "out/${n}.json"
  else
    "$PULSE" api predict -r "$f" --json > "out/${n}.predict.json"
    "$PULSE" api process -r "$f" --json > "out/${n}.json"
  fi
  echo "== ${n}: errors=$(jq -c '.errors|length' "out/${n}.json") warnings=$(jq -c '.warnings|length' "out/${n}.json")"
}

for f in req/0*.json req/10_*.json; do run "$f"; done

echo "== 11 client hand-off: SPSS .sav (+ labelled Excel)"
SPSS_LABELS=(--labels wave=wave_names --labels age_band=age_names --labels gender=gender_names --labels region=region_names)
"$PULSE" export predict -i brand_tracker.pulse --format spss --sanitize-names "${SPSS_LABELS[@]}" --json > out/11_export_predict.json
"$PULSE" export spss -i brand_tracker.pulse -o deliver/brand_tracker_2025.sav --sanitize-names "${SPSS_LABELS[@]}" \
  --json > out/11_export_spss.json
"$PULSE" export excel -i brand_tracker.pulse -o deliver/brand_tracker_2025.xlsx \
  --labels wave=wave_names:augment --labels region=region_names:augment --json > out/11_export_excel.json
rm -f deliver/roundtrip.pulse deliver/roundtrip.pulse.spss.json
"$PULSE" import spss -i deliver/brand_tracker_2025.sav -o deliver/roundtrip.pulse --json > out/11_import_spss.json
"$PULSE" cohort inspect deliver/roundtrip.pulse --json > out/11_roundtrip_inspect.json

run req/12_roundtrip_check.json
