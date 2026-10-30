# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js
# The 140-member cohort, as one file (l.pulse) and as a shard archive of four 35-record
# shards (members.pulse), all under one explicit schema.
for f in l l1 l2 l3 l4; do "$PULSE" import csv -i $f.csv -o $f.pulse --schema l.schema.json >/dev/null; done
rm -f members.pulse
"$PULSE" shard create -i l1.pulse -i l2.pulse -i l3.pulse -i l4.pulse members.pulse >/dev/null
"$PULSE" cohort inspect l.pulse --json --full-dict > l.inspect.json
node layout.js >/dev/null
imp x
run() { PULSE_DATA_DIR=$PWD "$PULSE" "$@" || true; }   # pass instance options before `api`
# Request A on the archive (shard-parallel), serially (--shard-workers 1), on the single
# file, and on each shard alone.
api process a
run --shard-workers 1 api process -r a.json --json > a.serial.out.json
api process af
for s in 1 2 3 4; do sed "s/members.pulse/l$s.pulse/" a.json > a$s.json; api process a$s; done
# Admission refusals: an unknown key, and request B over an 8 MiB memory limit.
api process u
run --limit max_estimated_memory=8388608 api predict -r b.json --json > b.predict.json
run --limit max_estimated_memory=8388608 api process -r b.json --json > b.out.json
# The crosstab (counts, then column %), and the fold: tests, a failing regression slot,
# multiplicity and an overlay, then the same request with components excluded.
api process x
api process xc
api process c
api process cr
