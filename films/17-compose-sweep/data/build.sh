# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js; imp m; imp s
for r in batch collide fold fold0 grid zip decay badrank lhs random replay reseed cut badslot banner; do api compose $r; done
api predict-compose grid predict
api process fan; api predict fan predict
# the same batch on four workers: responses come back in request order, byte for byte
PULSE_DATA_DIR=$PWD "$PULSE" api compose -r batch.json --json --parallel 4 > batch.parallel.json || true
