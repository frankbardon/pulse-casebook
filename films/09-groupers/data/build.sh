# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js; imp g
for q in none one range rounded nranges quant dow dowlocal dranges perel setval combo fanout dupkey include winfirst; do api process "$q"; done
for q in defaults combo winfirst; do api predict "$q" predict; done
# max_groups: the same composite request under an instance limit of 8 groups, predicted and run.
PULSE_DATA_DIR=$PWD "$PULSE" --limit max_groups=8 api predict -r combo.json --json > limit.predict.json || true
PULSE_DATA_DIR=$PWD "$PULSE" --limit max_groups=8 api process -r combo.json --json > limit.out.json || true
