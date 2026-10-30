# The cohort file: imports, inspects and archives

- **Cohorts** (all from `generate.js`, seed 3):
  - `m.csv` (1,200 members): `id`, a store block repeated on every row (`store`, `region`, `format`, `sqft`, `opened`), a sometimes-null `age`, `spend`, a multi-select `interests` (74 null, 77 empty `|`, 1,049 selections) and four 1–5 ratings `q1`..`q4` (48 blanks in `q3`).
  - `w.csv` (80 rows): the first 50 rows fit `u4` visits with no null age; row 64 holds 300 visits and row 71 a blank age.
  - `sv.csv` (40 rows): a small survey for the SPSS round trip. Income 998 is "don't know" and 999 "refused" (labels in `labels/`).
  - `s1.csv`..`s4.csv` (4 × 30,000 purchases, ids 1..120,000): written, imported and then deleted by `build.sh`, so they are not committed.
  - `naive.json`: plain left-to-right float sums of spend by region over the four quarters, in file order and reversed. `generate.js` computes these to show order dependence; they are not Pulse output.
- **The file** (`m.pulse`): `m.head.txt` (the 9-byte header, format `01`), `m.inspect.json` (the inferred schema). `nul`, `emp`, `sel`: the three set states on `interests`.
- **Import warnings**:
  - `w.import.txt`, `w.import.json`: `--sample-rows 50` gives `PULSE_IMPORT_WIDTH_PROMOTED` (visits `u4` → `u16`, source row 64) and `PULSE_IMPORT_NULL_PROMOTED` (`promoted_fields: ["age"]`).
  - `ws.import.json`: `--schema w.schema.json` (visits `u8`, age not nullable) imports 78 rows with `PULSE_IMPORT_ROWS_DROPPED` and two `row_errors`.
  - `wst.import.json`: the same with `--strict` fails; nothing is written (`w.written.txt`).
  - `wx.import.json`: `wx.schema.json` omits `age`, refused with `PULSE_IMPORT_SCHEMA_COLUMN_UNMAPPED`.
- **Parent groups and vectors**:
  - `mg.import.json`, `mg.inspect.json`, `mg.head.txt`, `mg.sizes.txt`: `--group store:region,format,sqft,opened`. Format `02`, 12 entries, ratio 100, stride 27 → 21 bytes, 32,785 → 25,744 bytes.
  - `rs`, `rsg`: the same request (mall stores by region) on `m.pulse` and `mg.pulse`; identical rows.
  - `mb.import.json`: adding `age` to the group fails with `PULSE_GROUP_MEMBER_NOT_CONSTANT`. `mn.import.json`: `store:format` is dropped with `PULSE_GROUP_TOO_NARROW`.
  - `mv.import.json`, `mv.inspect.json`: `--vector sat:q1,q2,q3,q4 --vector-kind sat:scale:1:5` (a `vec_f64`, dim 4). `vcor`: `MAT_CORRELATION` on `sat` (n 1,152, 48 dropped listwise). `vrej`: `AGG_AVERAGE` on `sat` is `PULSE_VECTOR_FIELD_NOT_SCALAR`.
- **SPSS**:
  - `sv0.export.json`: `sv.pulse` exported with `--labels` (region codes 1..4, income 998/999). Pulse's synthesised export declares no missing values, so `patch-sav.js` adds 998 and 999 as discrete missing codes on `INCOME`, as a survey tool would.
  - `svi.import.json`, `svi.inspect.json`: the import adds `income_missing` (sysmis, Don't know, Refused) and a derived `media` set beside `web`, `radio`, `tv`; region holds codes "1".."4".
  - `svm`: nulls in income by reason (4 and 4). `svn`, `sve`: media has 5 null and 3 empty sets after the trip.
  - `sv2.export.json`, `svi2.import.json`, `svi.roundtrip.txt`: export through the metadata sidecar and re-import; the two cohorts have the same SHA-256.
- **Shard archives**:
  - `sales.mismatch.json`: quarters imported with inferred schemas (ids `u16` then `u32`) are refused with `PULSE_SHARD_SCHEMA_MISMATCH`.
  - `sales.create.json`, `sales.add.json`, `sales.inspect.json`: with `sales.schema.json`, `shard create` takes q1–q3 and `shard add` appends q4 (120,000 records).
  - `sum.serial`, `sum`, `sumf.serial`, `sumf` (`.out.json`): `AGG_SUM` of spend by region on the archive (`--shard-workers 1` and `4`) and on the flattened file `flat.pulse` (`flat.filter.json`; `--decode-workers 1` and `4`). All four rows are identical.
  - `anc`: `sales.pulse#q4.pulse` read as one cohort (30,000 rows).
- **Sidecar indexes**: `idx.build.json` (one `.idx` per shard plus `sales.pulse.indexes.json`), `look.out.json` (id 90001), `rm.json` and `look.rm.out.json` (shard removed, `PULSE_SHARD_INDEXES_UPDATED`, then `PULSE_LOOKUP_NOT_FOUND`), `readd.json` and `look.readd.out.json` (added back, found again).
- **Steps:** `build.sh` regenerates everything above. It deletes the quarter CSVs, the `.sav` files and the sidecars when it finishes, and the `.pulse` files are git-ignored.

The film copies its figures from these outputs into `scenes.js`, next to a comment naming the run.
