# Reproducing the retail-at-scale showcase

Requirements: Go (to build Pulse), `bash` and `jq` (the run script uses jq to
point a request at a different cohort file and to compare outputs), about
5.5 GB of free disk, and RAM for the customer chains in step 6. Without a
memory limit the retention chain peaks at a 17–23 GiB footprint, more than a
16 GB machine has; there, run it with `GOMEMLIMIT=14GiB` (it peaks at 14.8 GiB
and returns identical data). The spend chain needs about 11 GiB and every other
step peaks under 2 GB. A full run took about 12 minutes with 4 workers.

## 1. Build Pulse

The showcase needs Pulse `v1.0.0-alpha.22` or later: archive-wide lookups,
section-opened archives and the `--shard-workers` / `--decode-workers` flags
ship there.

```sh
cd <casebook repo root>
make pulse PULSE_REF=v1.0.0-alpha.22 && cp bin/pulse /tmp/pulse
```

There is no separate bench program. The worker-count comparisons the old
`bench/main.go` made in-process are now the CLI flags `--shard-workers` and
`--decode-workers`, and archive metadata and lookups are fast CLI calls.

## 2. Copy the showcase to a scratch directory and run it

```sh
cp -r showcase/retail-at-scale /tmp/retail && cd /tmp/retail
PULSE=/tmp/pulse ./run-all.sh            # WORKERS=4 by default; WORKERS=0 = one per CPU
```

`run-all.sh` runs every step in README order. It writes each response to `out/`,
appends `name<TAB>seconds<TAB>peak_rss_mb` per command to `out/timings.tsv`, and
writes one `identical` / `DIFFERENT` line per worker-count comparison to
`out/byte_equal.tsv`. On macOS it measures with `/usr/bin/time -l`; on Linux it
samples `VmHWM`.

What the script does, step by step (all commands run in the scratch dir; `P` is
`pulse --shard-workers $WORKERS --decode-workers $WORKERS`):

| Step | Command(s) |
|---|---|
| 0 | `pulse synth from-schema -s synth/orders-YYYY-MM.synth.json -o orders-YYYY-MM.pulse --seed YYYYMM` × 13 |
| 1 | `pulse cohort inspect orders-2025-12.pulse --json` |
| 2 | `pulse shard create orders.pulse -i orders-2025-01.pulse … -i orders-2025-12.pulse --json`; `pulse shard list orders.pulse`; `pulse shard verify orders.pulse --json`; `pulse cohort inspect orders.pulse --json`; then deletes January to November |
| 3 | `pulse api predict -r req/01_year_kpis.json --json`; `P api process -r req/01_year_kpis.json --json`, again with `--shard-workers 1`; the same request on `orders-2025-12.pulse` with `--decode-workers 4`, `1` and `--no-project` |
| 4 | `P api process -r req/02_monthly_trend.json --json`, again with `--shard-workers 1`, and `--stream` |
| 5 | `pulse api predict-compose -r req/04_dashboard_compose.json --json`; `P api compose -r req/04_dashboard_compose.json --json` (serial and `--parallel 4`) |
| 6 | `P api process-chain -r req/05_retention_chain.json --json --no-components`; same for `req/06_spend_distribution_chain.json` |
| 7 | `pulse index build orders.pulse --key customer_id --json`; `pulse index list orders.pulse`; `pulse api lookup -r req/07_lookup_customer.json --json`; `P api process -r req/03_customer_scan.json --json --no-components` on the archive and on December |
| 8 | `pulse cohort inspect orders-2026-01.pulse --json`; `pulse shard add orders.pulse orders-2026-01.pulse --json`; `shard list`, `cohort inspect`, `shard verify`; `pulse index verify orders.pulse --key customer_id --json`; the lookup again; KPIs at `--shard-workers 4` and `1` |

To run a single step by hand, `cd` into the scratch dir and use the command from
the table. Request files use `"data_dir": "."`, so run them from the directory
that holds the cohorts.

## 3. Expected results

Counts and sums are deterministic (spec + seed), and every 4-worker run returns
byte-identical data to its 1-worker twin. Timings are indicative only: they were
measured on an Apple M1 Max (10 cores, 32 GB, macOS) with every scan pinned to 4
workers, while other jobs were running and the system was swapping.

| Check | Where in `out/` | Expected |
|---|---|---|
| Rows per month | `synth-orders-*.txt` | 3.40 M, 3.20 M, 3.60 M, 3.70 M, 3.80 M, 3.80 M, 3.90 M, 4.10 M, 3.70 M, 3.90 M, 4.80 M, 5.60 M; 2026-01: 3.60 M; 0 rejected |
| December file size | `ls -l orders-2025-12.pulse` | 296,801,193 bytes |
| Archive records | `02_inspect_archive.json` `.data.record_count` | 47,500,000 (12 shards); archive 2,517,517,247 bytes |
| `shard verify` | `02_shard_verify.json` | `verified: true`, `error_n: 0`, `warning_n: 0` |
| Predict | `03_predict_kpis.json` | `valid: true`, `streamable: true`, `record_count: 47500000` |
| Year KPIs | `03_year_kpis.json` `.data.data[0]` | lines 47,500,000; revenue 2,009,100,128.8; units 89,324,817; avg_line_value 42.2968; return_rate 0.044969 |
| December KPIs | `03_dec_kpis.json` | lines 5,600,000; revenue 263,641,210.92; units 10,535,117 |
| Monthly trend | `04_monthly_trend.json` | 12 rows; 202501 revenue 139,089,049.52, online_share 0.25024; 202512 revenue 263,641,210.92, online_share 0.36023 |
| Dashboard | `05_dashboard.json` | Southeast revenue 65,756,980.11 (share 0.2494); Electronics 88,153,458.57 (share 0.334); loyalty `1`: 50,000 customers, 1,231,588 lines; discount 0 %: 3,918,911 lines |
| Retention chain | `06_retention_chain.json` | stage 0: 47,500,000 rows in, 2,603,647 customers; 202501 cohort 1,117,593 customers, m02 0.81844, m12 0.31874; 202512 cohort 129,663 |
| Spend chain | `06_spend_chain.json` | stage 1: 2,603,647 customers; band 7: 59,644 customers, spend 470,675,731.62, share 0.2343, member_share 0.8383 |
| Archive index | `07_index_archive.json` | `indexed_records` 47,500,000; 12 `shard_index_paths` |
| Lookup 4242 | `07_lookup_archive.json` `.data.rows` | 212 rows (the sum of `07_customer_scan_archive.json` `lines`); after step 8 (`08_lookup_archive.json`): 231 |
| Customer scan | `07_customer_scan_archive.json` | 202501: 20 lines, 12 orders, spend 837.7; 202512: 21 lines, 15 orders, spend 1,109.91 |
| After append | `08_kpis_13_months.json` | lines 51,100,000; revenue 2,155,846,607.88; units 96,086,095; archive 2,708,318,572 bytes |
| Index after append | `08_index_verify.json` | `fresh: true` |
| Worker comparisons | `byte_equal.tsv` | five lines, all `identical` |

Indicative timings from the reference run (seconds / peak RSS):

| Command | Time | RSS |
|---|---:|---:|
| synth one month | 7.8–13.4 | 0.84–1.64 GB |
| inspect one month | 0.11 | 50 MB |
| shard create, 12 months | 3.66 | 1.79 GB |
| list / verify / inspect archive | 0.12 / 0.73 / 0.12 | 50–52 MB |
| predict on the archive | 0.12 | 52 MB |
| KPIs on the archive, shard workers 4 / 1 | 8.52 / 19.10 | 63 / 54 MB |
| KPIs on the December file, decode workers 4 / 1 | 0.95 / 2.28 | 343 / 335 MB |
| Monthly trend, shard workers 4 / 1 / `--stream` | 13.95 / 37.94 / 14.02 | 59–64 MB |
| Compose dashboard (December), serial / `--parallel 4` | 4.71 / 2.76 | 527 MB / 1.40 GB |
| Retention chain / spend chain | 181–187 / 40.7–42.4 | 17.3–23.1 / 10.6 GiB footprint |
| Retention chain, `GOMEMLIMIT=14GiB` | 117 | 14.8 GiB footprint |
| Index build on the archive | 496 | 819 MB |
| Lookup on the archive (12 / 13 shards) | 0.15 / 0.19 | 51 MB |
| Customer scan, archive / December | 6.21 / 1.08 | 67 / 343 MB |
| shard add 2026-01 (with index upkeep) | 85.1 (19.6 on a quieter run) | 812 MB |
| inspect / verify / index verify, 13 shards | 0.29 / 1.32 / 1.88 | 51 MB |
| KPIs on 13 months, shard workers 4 / 1 | 11.31 / 20.50 | 79 / 56 MB |

The retention chain and the index build are the two steps most affected by
machine load: both ran while the system was swapping.

## Cleanup

The scratch directory peaks at about 5.5 GB (the 13 month files and the archive
side by side during step 2) and ends at about 4.5 GB: the archive, December,
January 2026 and 13 sidecar indexes. Remove it with `rm -rf /tmp/retail` when
done. None of it belongs in the repository.
