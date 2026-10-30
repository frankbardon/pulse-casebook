#!/usr/bin/env bash
# Rebuild the Pulse Anatomy sample cohorts and re-capture every output the films
# quote. Usage:  make data [FILM=overlays], or PULSE=/path/to/pulse ./data.sh [film...]
#                ./data.sh --index   rewrite the per-film index in films/DATA.md
# A film takes part by owning films/NN-<topic>/data/build.sh (default: every such
# film, in series order). Each build.sh is sourced from its data/ folder with two
# helpers defined:
#   imp NAME                  import NAME.csv to NAME.pulse (git-ignored)
#   api CMD REQ [SUFFIX]      pulse api CMD -r REQ.json > REQ.SUFFIX.json (default suffix: out)
# Outputs land beside their requests. Needs node and $PULSE.
set -euo pipefail
source "$(dirname "$0")/film.sh"

# data_films: every film folder with a data/build.sh, in series order.
data_films() { local d; for d in "$FILMS"/[0-9][0-9]-*/data/build.sh; do [ -f "$d" ] && { d="${d%/data/build.sh}"; echo "${d##*/}"; }; done; return 0; }

if [ "${1:-}" = --index ]; then
  # The per-film index in DATA.md, between the index markers: one row per data/README.md.
  rows=$(for d in "$FILMS"/[0-9][0-9]-*/data/README.md; do
    [ -f "$d" ] || continue; f="${d%/data/README.md}"; f="${f##*/}"
    t=$(sed -n '1s/^# *//p' "$d"); echo "| \`$f/\` | [$t]($f/data/README.md) |"
  done)
  node -e '
    const fs = require("fs"), [file, rows] = process.argv.slice(1);
    const s = fs.readFileSync(file, "utf8"), a = "<!-- data-index:start -->", b = "<!-- data-index:end -->";
    if (!s.includes(a) || !s.includes(b)) { console.error("no index markers in " + file); process.exit(1); }
    const block = a + "\n| Folder | Notes |\n|---|---|\n" + rows + (rows ? "\n" : "") + b;
    fs.writeFileSync(file, s.slice(0, s.indexOf(a)) + block + s.slice(s.indexOf(b) + b.length));
  ' "$FILMS/DATA.md" "$rows"
  echo "indexed $(printf '%s' "$rows" | grep -c . || true) films in DATA.md"; exit 0
fi

PULSE=${PULSE:-$(dirname "$FILMS")/bin/pulse}   # `make pulse` installs the pinned release there
PULSE=$(command -v "$PULSE" || realpath "$PULSE" 2>/dev/null || echo "$PULSE")
[ -x "$PULSE" ] || { echo "no pulse binary at $PULSE: run 'make pulse' or set PULSE" >&2; exit 1; }

imp() { "$PULSE" import csv -i "$1.csv" -o "$1.pulse" >/dev/null; }
api() { PULSE_DATA_DIR=$PWD "$PULSE" api "$1" -r "$2.json" --json > "$2.${3:-out}.json" || true; }

for f in ${*:-$(data_films)}; do
  dir="$(film_dir "$f")"
  [ -f "$dir/data/build.sh" ] || { echo "${dir##*/} has no data/build.sh" >&2; exit 1; }
  (cd "$dir/data" && echo "== ${dir##*/}" && source ./build.sh)
done
