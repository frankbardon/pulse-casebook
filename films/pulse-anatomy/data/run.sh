#!/usr/bin/env bash
# Rebuild every Pulse Anatomy sample cohort and re-capture every output the
# films quote. Usage:  PULSE=/path/to/pulse ./run.sh [film...]
# Films: aggregators windows tests matrices overlays (default: all).
# Needs python3 (stdlib only). Outputs land beside their requests as *.out.json.
set -euo pipefail
PULSE=${PULSE:-pulse}
PULSE=$(command -v "$PULSE" || realpath "$PULSE")
HERE=$(cd "$(dirname "$0")" && pwd)

imp() { "$PULSE" import csv -i "$1.csv" -o "$1.pulse" >/dev/null; }
api() { PULSE_DATA_DIR=$PWD "$PULSE" api "$1" -r "$2.json" --json > "$2.${3:-out}.json" || true; }

aggregators() { imp a; api process ar; }
windows()     { imp w; api process wr; }
tests()       { python3 generate.py; imp t; api process tr; }
matrices()    { python3 generate.py; imp m; api process mr; api predict mp predict; api process mp; }
overlays() {
  python3 generate.py; imp o; imp o2025
  for r in A A0 B C F G H I; do api process $r; done
  api facet D; api compose E
  for r in B G; do api predict $r predict; done
}

for film in "${@:-aggregators windows tests matrices overlays}"; do
  for f in $film; do (cd "$HERE/$f" && echo "== $f" && $f); done
done
