# Lifecycle: the request's recorded runs

- **Cohorts:** `generate.js` writes `l.csv` (140 members; the same seed-11 stream the film's record loop draws, so the animated records are these records), its four 35-record shards `l1.csv`…`l4.csv`, and `x.csv` (69 members for the crosstab: 68 with a region and a plan, plus record 2, East with no plan). `l.schema.json` fixes the field types the film's schema table shows.
- **Layout:** `l.inspect.json` (`pulse cohort inspect`) gives the offsets, bit positions and the region dictionary; `layout.js` decodes every record of `l.pulse` against `l.csv` and writes `l.layout.json` (9-byte header, stride 17 B with a 1 B null bitmap, 2,380 B of records).
- **Request A** (`a.json`, filter → formula → region → average): `a.out.json` on the shard archive `members.pulse`; `a.serial.out.json` with `--shard-workers 1` (byte-identical to the parallel run); `af.out.json` on the single file (identical but for `shard_count`); `a1`…`a4` on each shard alone (the per-shard kept counts and partials).
- **Refusals:** `u.json` (`filters` for `filterers`) → `PULSE_REQUEST_UNKNOWN_FIELD`; `b.json` (median) under `--limit max_estimated_memory=8388608` → `b.predict.json` (grade `certain`) and `b.out.json` (`PULSE_LIMIT_EXCEEDED`, estimated 16,828,707 B).
- **Crosstab:** `x.json` (counts with margins) → `x.out.json`: East margin 18, grand total 68, record 2 in no margin; `xc.json` (normalize column) → `xc.out.json`, "% of those asked".
- **Fold:** `c.json` (request A + `TEST_T` by `opted_in` per region, a rank-deficient `REG_OLS`, Bonferroni, `OVERLAY_INDEX_VS_TOTAL`) → `c.out.json`: the regression slot fails alone with `PULSE_SLOT_FAILED`; `cr.json` adds `return.exclude: ["components"]` → `cr.out.json`.
- **Steps:** `build.sh` regenerates the CSVs, imports them, builds the archive and runs every request.

The film's figures come from these runs.
