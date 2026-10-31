# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# rk runs `pulse rake` the same way: rk REQ writes the request's new cohort and REQ.out.json.
rk() { "$PULSE" rake -r "$1.json" --json > "$1.out.json" || true; }
node generate.js
imp survey
imp freq
imp dup
imp inv
for q in kinds_dup kinds_freq kinds_prob; do api process "$q"; done
api predict resolve predict
api process resolve
for q in invalid invalid_p neff max mwu tukey win win_slot total_fw total_dup total_pw; do api process "$q"; done
rk rake
rk rake_cap
rk rake_cell
rk rake_pooled
rk rake_bad
for q in use use_age pooled_cells overlay; do api process "$q"; done
PULSE_DATA_DIR=$PWD "$PULSE" api process -r invalid.json --strict --json > invalid.strict.json || true
