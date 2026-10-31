# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# Film 15 imports with a schema (intent is a code, not a number) and loads its label
# table from labels/ through PULSE_LABEL_TABLES_DIR.
node generate.js
"$PULSE" import csv -i t.csv -o t.pulse --schema t.schema.json >/dev/null
export PULSE_LABEL_TABLES_DIR=$PWD/labels
for r in a ac nr nt g m nw nl tot cells aux w long q lab laba sig; do api process $r; done
for r in a q aux sig; do api predict $r predict; done
unset PULSE_LABEL_TABLES_DIR
