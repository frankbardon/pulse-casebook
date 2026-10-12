#!/usr/bin/env bash
# Rebuild every Pulse Anatomy sample cohort and re-capture every output the
# films quote. Usage:  make data [FILM=overlays], or PULSE=/path/to/pulse ./data.sh [film...]
# Films: aggregators windows tests matrices overlays (default: all).
# Each film keeps its cohort and requests in films/<film>/data/. Needs node.
# Outputs land beside their requests as *.out.json.
set -euo pipefail
source "$(dirname "$0")/film.sh"
PULSE=${PULSE:-$(dirname "$FILMS")/bin/pulse}   # `make pulse` installs the pinned release there
PULSE=$(command -v "$PULSE" || realpath "$PULSE" 2>/dev/null || echo "$PULSE")
[ -x "$PULSE" ] || { echo "no pulse binary at $PULSE: run 'make pulse' or set PULSE" >&2; exit 1; }

imp() { "$PULSE" import csv -i "$1.csv" -o "$1.pulse" >/dev/null; }
api() { PULSE_DATA_DIR=$PWD "$PULSE" api "$1" -r "$2.json" --json > "$2.${3:-out}.json" || true; }

aggregators() { imp a; api process ar; }
windows()     { imp w; api process wr; }
tests()       { node generate.js; imp t; api process tr; }
matrices()    { node generate.js; imp m; api process mr; api predict mp predict; api process mp; }
overlays() {
  node generate.js; imp o; imp o2025
  for r in A A0 B C F G H I; do api process $r; done
  api facet D; api compose E
  for r in B G; do api predict $r predict; done
}

for film in "${@:-aggregators windows tests matrices overlays}"; do
  for f in $film; do (cd "$(film_dir $f)/data" && echo "== $f" && $f); done
done
