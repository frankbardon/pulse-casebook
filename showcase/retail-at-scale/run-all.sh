#!/usr/bin/env bash
# Runs every step of the retail-at-scale showcase end to end.
# Usage: PULSE=/path/to/pulse ./run-all.sh   (run from a scratch copy of this directory)
# Every number is computed by Pulse; this script only invokes Pulse, records
# wall-clock time and peak resident memory per command, and compares outputs.
# No GOMEMLIMIT: Pulse opens a shard archive by section, so memory follows the
# request, not the archive size.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd); PULSE=${PULSE:-$([ -x "$ROOT/bin/pulse" ] && echo "$ROOT/bin/pulse" || echo pulse)}   # `make pulse` builds bin/pulse
# Worker count for every scan (--shard-workers / --decode-workers). The reference
# run pins 4 to match a 4-vCPU machine; 0 means one per CPU.
WORKERS=${WORKERS:-4}
P=("$PULSE" --shard-workers "$WORKERS" --decode-workers "$WORKERS")
mkdir -p out
: > out/timings.tsv

# step NAME OUTFILE CMD... : runs CMD, stdout -> out/OUTFILE, logs seconds + peak RSS (MB)
step() {
  local name=$1 outfile=$2; shift 2
  local secs rss
  if [ "$(uname -s)" = Darwin ]; then
    /usr/bin/time -l -o out/.time "$@" > "out/$outfile"
    secs=$(awk '/ real /{print $1}' out/.time)
    rss=$(awk '/maximum resident set size/{printf "%d", $1/1048576}' out/.time)
  else
    local start end hwm=0 v pid
    start=$(date +%s.%N)
    "$@" > "out/$outfile" &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
      v=$(awk '/VmHWM/{print $2}' "/proc/$pid/status" 2>/dev/null || true)
      [ -n "$v" ] && hwm=$v
      sleep 0.05
    done
    wait "$pid"
    end=$(date +%s.%N)
    secs=$(echo "$end - $start" | bc); rss=$((hwm / 1024))
  fi
  printf '%s\t%.2f\t%d\n' "$name" "$secs" "$rss" | tee -a out/timings.tsv
}

# same LABEL FILE_A FILE_B JQ_PATH : byte-compares one JSON path of two outputs
same() {
  if cmp -s <(jq -c "$4" "out/$2") <(jq -c "$4" "out/$3"); then r=identical; else r=DIFFERENT; fi
  printf '%s\t%s\n' "$1" "$r" | tee -a out/byte_equal.tsv
}
: > out/byte_equal.tsv

# 0. Generate thirteen monthly single-file cohorts (deterministic: spec + seed).
for spec in synth/orders-*.synth.json; do
  m=$(basename "$spec" .synth.json)            # orders-2025-01
  seed=$(echo "$m" | tr -d 'a-z-')             # 202501
  step "synth $m" "synth-$m.txt" "$PULSE" synth from-schema -s "$spec" -o "$m.pulse" --seed "$seed"
done

# 1. Header-only inspect of one month (reads no records).
step "inspect month (single file)" 01_inspect_month.json "$PULSE" cohort inspect orders-2025-12.pulse --json

# 2. Bundle 2025 into a shard archive, then list, verify and inspect it.
includes=(); for m in 01 02 03 04 05 06 07 08 09 10 11 12; do includes+=(-i "orders-2025-$m.pulse"); done
step "shard create (12 months)" 02_shard_create.json "$PULSE" shard create orders.pulse "${includes[@]}" --json
step "shard list" 02_shard_list.txt "$PULSE" shard list orders.pulse
step "shard verify" 02_shard_verify.json "$PULSE" shard verify orders.pulse --json
step "inspect archive" 02_inspect_archive.json "$PULSE" cohort inspect orders.pulse --json
# The archive now answers every question, lookups included, so January to
# November are no longer needed as separate files. December stays for the
# single-file comparisons below.
rm -f orders-2025-0[1-9].pulse orders-2025-1[01].pulse

# 3. Predict, then run, the full-year KPI request: archive at 4 and 1 shard
#    workers, December file at 4 and 1 decode workers and without projection.
step "predict 01 (archive)" 03_predict_kpis.json "$PULSE" api predict -r req/01_year_kpis.json --json
step "process 01 (archive, shard workers $WORKERS)" 03_year_kpis.json "${P[@]}" api process -r req/01_year_kpis.json --json
step "process 01 (archive, shard workers 1)" 03_year_kpis_sw1.json "$PULSE" --shard-workers 1 api process -r req/01_year_kpis.json --json
same "year KPIs: shard workers $WORKERS vs 1" 03_year_kpis.json 03_year_kpis_sw1.json .data.data
jq '.cohort.filename = "orders-2025-12.pulse"' req/01_year_kpis.json > out/01_dec_kpis.req.json
step "process 01 (December, decode workers $WORKERS)" 03_dec_kpis.json "${P[@]}" api process -r out/01_dec_kpis.req.json --json
step "process 01 (December, decode workers 1)" 03_dec_kpis_dw1.json "$PULSE" --decode-workers 1 api process -r out/01_dec_kpis.req.json --json
step "process 01 (December, --no-project)" 03_dec_kpis_noproject.json "${P[@]}" api process -r out/01_dec_kpis.req.json --json --no-project
same "December KPIs: decode workers $WORKERS vs 1" 03_dec_kpis.json 03_dec_kpis_dw1.json .data.data

# 4. Monthly trend, buffered (4 and 1 shard workers) and streamed.
step "process 02 (archive, shard workers $WORKERS)" 04_monthly_trend.json "${P[@]}" api process -r req/02_monthly_trend.json --json
step "process 02 (archive, shard workers 1)" 04_monthly_trend_sw1.json "$PULSE" --shard-workers 1 api process -r req/02_monthly_trend.json --json
same "monthly trend: shard workers $WORKERS vs 1" 04_monthly_trend.json 04_monthly_trend_sw1.json .data.data
step "process 02 --stream (archive)" 04_monthly_trend.ndjson "${P[@]}" api process -r req/02_monthly_trend.json --stream

# 5. December dashboard: five questions in one Compose call.
step "predict-compose 04" 05_predict_dashboard.json "$PULSE" api predict-compose -r req/04_dashboard_compose.json --json
step "compose 04 (serial)" 05_dashboard.json "${P[@]}" api compose -r req/04_dashboard_compose.json --json
step "compose 04 (--parallel 4)" 05_dashboard_parallel.json "${P[@]}" api compose -r req/04_dashboard_compose.json --json --parallel 4
same "dashboard: serial vs --parallel 4" 05_dashboard.json 05_dashboard_parallel.json .data

# 6. Customer-level rollups with process-chain, over every customer.
#    Without a memory limit the retention chain peaks above 16 GB (17-23 GiB
#    footprint); on a 16 GB machine run this script with GOMEMLIMIT=14GiB
#    (14.8 GiB peak, identical output). See README step 6.
step "process-chain 05 retention" 06_retention_chain.json "${P[@]}" api process-chain -r req/05_retention_chain.json --json --no-components
step "process-chain 06 spend bands" 06_spend_chain.json "${P[@]}" api process-chain -r req/06_spend_distribution_chain.json --json --no-components

# 7. Customer 360: one sidecar index over the archive, point lookup vs filtered scans.
step "index build (archive)" 07_index_archive.json "$PULSE" index build orders.pulse --key customer_id --json
step "index list (archive)" 07_index_list.txt "$PULSE" index list orders.pulse
step "lookup 4242 (archive)" 07_lookup_archive.json "$PULSE" api lookup -r req/07_lookup_customer.json --json
step "scan 03 for customer 4242 (archive)" 07_customer_scan_archive.json "${P[@]}" api process -r req/03_customer_scan.json --json --no-components
jq '.cohort.filename = "orders-2025-12.pulse"' req/03_customer_scan.json > out/03_dec_scan.req.json
step "scan 03 for customer 4242 (December file)" 07_customer_scan_dec.json "${P[@]}" api process -r out/03_dec_scan.req.json --json --no-components

# 8. A new month arrives: append it (the archive index follows), verify, re-run.
step "inspect month 2026-01" 08_inspect_2026-01.json "$PULSE" cohort inspect orders-2026-01.pulse --json
step "shard add 2026-01" 08_shard_add.json "$PULSE" shard add orders.pulse orders-2026-01.pulse --json
step "shard list (13)" 08_shard_list.txt "$PULSE" shard list orders.pulse
step "inspect archive (13)" 08_inspect_archive.json "$PULSE" cohort inspect orders.pulse --json
step "shard verify (13)" 08_shard_verify.json "$PULSE" shard verify orders.pulse --json
step "index verify (archive, 13)" 08_index_verify.json "$PULSE" index verify orders.pulse --key customer_id --json
step "lookup 4242 (archive, 13)" 08_lookup_archive.json "$PULSE" api lookup -r req/07_lookup_customer.json --json
step "process 01 (archive, 13 months, shard workers $WORKERS)" 08_kpis_13_months.json "${P[@]}" api process -r req/01_year_kpis.json --json
step "process 01 (archive, 13 months, shard workers 1)" 08_kpis_13_months_sw1.json "$PULSE" --shard-workers 1 api process -r req/01_year_kpis.json --json
same "13-month KPIs: shard workers $WORKERS vs 1" 08_kpis_13_months.json 08_kpis_13_months_sw1.json .data.data

echo "steps 0-8 done; see out/timings.tsv and out/byte_equal.tsv"
