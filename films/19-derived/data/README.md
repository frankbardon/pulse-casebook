# Derived cohorts: recorded runs

- **Cohorts** (`generate.js`, seed 19; each imported with its `*.schema.json`, so every field has a real description):
  - `w.csv`: 48 rows, six stores (S1 to S6) by eight weeks (Mondays 5 January to 23 February 2026). Columns: `store_no` (u64), `store`, `region`, `format`, `opened`, `week`, `revenue` (S3's sixth week is null), `visits` and `promo`, a messy answer (`Yes`, `Y`, `No`, `Unsure`).
  - `wg.pulse` is `w.csv` imported with a parent group: key `store`, members `region`, `format`, `opened`.
  - `st.csv`: the store table for the join. It has five stores (S6 has no row), with `store_no` (u32), `manager` and `sqft`. `stf.pulse` is the same table with `store_no` declared `f64` (`stf.schema.json`).
  - `tx.csv`: six till receipts near midnight UTC, from 6 to 9 February 2026, with `at` as a datetime.
- **Steps:** `build.sh` regenerates the CSVs, imports them and records every output. Materialize runs use `pulse api materialize -r REQ.json -o OUT.pulse --overwrite`, and their predicts use `--predict`. Every `.pulse` it writes is deleted at the end. A few written cohorts are exported to `*.rows.csv` so the film can quote their rows.

The film copies its figures from these runs into `scenes.js`, next to a comment naming the run.

## Materialize

| Request | Run | What it shows |
|---|---|---|
| `rnfilter` | process | `FILTER_RANGE` on a `WIN_ROW_NUMBER` label in the same request: `SERVICE_VALIDATION`, "filter references unknown field: rank" |
| `mat` | predict, materialize → `wd.pulse` | `FEAT_LOG` revenue → `log_rev`, `ATTR_PREVIOUS_STATE` promo → `prev_promo`, `WIN_ROW_NUMBER` → `rank`, `WIN_LAG` → `rev_lag1`. Result: 48 records, `derived_columns` in that order. Predict: `valid` true, `risks` [], `container.kind` file. `wd.inspect.json`: each derived field is a nullable f64 with a generated description, except `prev_promo`, which is `categorical_u8` with promo's dictionary. `wd.rows.csv` holds the written rows |
| `exists` | materialize → `wd.pulse` again, no `--overwrite` | `SERVICE_VALIDATION`, `reason` target_exists |
| `top` | process on `wd.pulse` | `FILTER_RANGE` rank 1 to 2, grouped by store: 2 weeks each, top-two average revenue (S1 158.55 … S6 107.55) and log revenue; `filtered_rows` 12 of 48 |
| `shape` | predict, materialize → `ws.pulse` | an `output.columns` reshape: `store`, `week`, revenue as `rev` (`decimal128` 6,1), revenue bucketed as `band` (low, mid, high), promo recoded as `promo_yn` (`Y` → `Yes`, `Unsure` → null, order Yes, No), and `rank` cast to `u8`. Predict lists three `PULSE_MATERIALIZE_CAST_FAILED` risks. `ws.rows.csv` holds the written rows |
| `castfail` | materialize | revenue cast to `u16`: `PULSE_MATERIALIZE_CAST_FAILED`, row 0, value 122.4, `fractional`, nothing written |
| `castnull` | materialize | the same cast with `on_cast_error: "null"`: one `PULSE_MATERIALIZE_CAST_NULLED` warning, count 41 |
| `recodebad` | materialize | a recode map key `Yess`: `PULSE_MATERIALIZE_RECODE_UNKNOWN_LABEL`, suggestion `Yes` |
| `slot` | materialize | a `groups` slot: `PULSE_MATERIALIZE_SLOT_UNSUPPORTED` |
| `noderiv` | materialize | only a filter, with no output block: `PULSE_MATERIALIZE_NO_DERIVED` |
| `shard` | predict, materialize → `nm.pulse` | North and Mall only, `shards.max_records` 10, `elide_constants`. Predict: `shard_archive`, `max_shards` 5. Run: 16 records in two shards (10 and 6 in `nm.inspect.json`), `elided_constants` region and format |
| `grp` | predict, materialize on `wg.pulse` | `output.exclude` keeps the parent group: inherited, `admitted`, `byte_delta` −77 |
| `grpre` | predict, materialize on `wg.pulse` | recoding `format` leaves the group out: `PULSE_MATERIALIZE_GROUP_NOT_INHERITED`, `change` recoded |
| `grpdecl` | materialize on `wg.pulse` | the same with `output.groups` declared: `admitted` again |

## Recommend, chain, joins, filter to file

| Output | Command | What it shows |
|---|---|---|
| `rec.out.json` | `pulse recommend --intent distribution_shape --cohort w.pulse --field revenue --top 30` | the `FEAT_LOG` draft carries `steps`: `pulse_materialize` (label `log_value`, `out` placeholder), then `pulse_process` with `REG_OLS` reading `log_value` (`out`, `target` placeholders) |
| `rs1`, `rs2` | those two steps filled in (`out` wl.pulse, `target` visits) | `log_value` coefficient 31.84, `n_obs` 47 |
| `same` | process | the same model with the feature in the same request. At alpha.33 it also runs and gives the same fit, so the film does not repeat the draft's "a model cannot read a column its own request derives" |
| `chain` | `pulse api process-chain` | stage 0 sums revenue by region and store (48 records, `store_rev` n 47, n_null 1); stage 1 averages it per region: North 881.03 (best 1122.5), South 834.53 (best 1046.2) |
| `chainwin` | `pulse api process-chain` | a window in stage 0: `PULSE_CHAIN_NOT_MERGEABLE` |
| `join` | predict, process | inner join to `st.pulse` on `store_no` (u64 ↔ u32), `as` `st_`, grouped by `st_manager`: 40 joined rows, as S6 has no store row |
| `joinf` | predict, process | the right key as `f64`: `PULSE_JOIN_TYPE_MISMATCH`, `reason` u64_float_key, from both |
| `joinleft`, `joincol` | process | `kind` left: `PULSE_JOIN_KIND_NOT_IMPLEMENTED`; no `as`: `PULSE_JOIN_FIELD_COLLISION` on `store_no` |
| `nmtop.filter.json`, `nmtop.inspect.json` | `pulse cohort filter -i nm.pulse --filter 'rank <= 2'` | 4 records, archive layout kept (1 and 3 per shard) |
| `nmflat.filter.json` | `pulse cohort filter -i nmtop.pulse --flatten` | `flattened` true, 4 records in one file (`nmflat.rows.csv`) |
| `txutc`, `txny`, `txbad` (`.filter.json`) | `pulse cohort filter -i tx.pulse --filter 'weekday(to_day(at)) >= 6'`, with no zone, with `--time-zone America/New_York`, and with `--time-zone Mars/Olympus` | 3 weekend receipts in UTC and 4 in New York (`txw_*.rows.csv`); the unknown zone gives `PULSE_TIMEZONE_UNKNOWN` and writes nothing |
