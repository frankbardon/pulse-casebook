# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# Film 4 also records the no-execute reads (manifest, inspect, recommend, explain,
# errors lookup, features check) and one MCP session under a feature profile.
node generate.js
"$PULSE" import csv -i s.csv -o s.pulse --schema s.schema.json >/dev/null   # descriptions come from the schema
"$PULSE" --json --slim --intent compare_groups > manifest.compare_groups.json
"$PULSE" cohort inspect -i s.pulse --json > s.inspect.json
"$PULSE" recommend --intent compare_groups --top 3 --json > rec0.out.json
"$PULSE" recommend --intent compare_groups --cohort s.pulse --field spend --field arm --top 3 --json > rec.out.json
for r in ab split regions typo med; do api predict $r predict; done
for r in ab split regions typo par par2 undecl; do api process $r; done
api predict undecl predict
api facet fs
PULSE_DATA_DIR=$PWD "$PULSE" explain -r ab.json --json > ab.explain.json
PULSE_DATA_DIR=$PWD "$PULSE" explain -r ab.json --response ab.out.json --detail full --json > ab.found.json
"$PULSE" errors lookup PULSE_REQUEST_UNKNOWN_FIELD --json > unknown.errors.json
"$PULSE" errors lookup PULSE_TEST_SPLIT_GROUPS_LT_2 --json > split.errors.json
"$PULSE" features check profile.json --json > profile.check.json || true
node mcp.js "$PULSE" 2>/dev/null
