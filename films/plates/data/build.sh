#!/usr/bin/env bash
# Re-capture the Plate VI crosstab: imports crosstab.csv (70 records: the 3 x 3 grid,
# record 2 with a null plan, record 3 with a null spend) and runs crosstab.json.
# Usage: PULSE=/path/to/pulse films/plates/data/build.sh   (default: <repo>/bin/pulse)
set -euo pipefail
cd "$(dirname "$0")"
PULSE=${PULSE:-../../../bin/pulse}
"$PULSE" import csv -i crosstab.csv -o crosstab.pulse >/dev/null
PULSE_DATA_DIR=$PWD "$PULSE" api process -r crosstab.json --json > crosstab.out.json
