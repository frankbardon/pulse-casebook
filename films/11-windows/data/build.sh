# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
imp s
imp d
for q in win open rankfield ewdecay share adstock agg first firstall firstsort firstweight dow rnfilter; do api process "$q"; done
for q in open first; do api predict "$q" predict; done
# Top N: materialize the row number into ranked.pulse (git-ignored), then filter on it.
PULSE_DATA_DIR=$PWD "$PULSE" api materialize -r mat.json -o ranked.pulse --overwrite --json > mat.out.json || true
api process top
