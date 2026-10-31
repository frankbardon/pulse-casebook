# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# f.csv and s.csv carry explicit schemas: field descriptions for f, and a bounded id for s.
node generate.js
"$PULSE" import csv -i f.csv -o f.pulse --schema f.schema.json >/dev/null
"$PULSE" import csv -i s.csv -o s.pulse --schema s.schema.json >/dev/null
imp d
for q in where skew cat te tetrain tetrainall split dates; do api process $q; done
for q in where leaky folds fiton pipe; do api predict $q predict; done
