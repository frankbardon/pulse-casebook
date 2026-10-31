# Filters: recorded runs

- **Cohorts:**
  - `f.csv` (hand-written, 10 rows): the ten members on screen. #3 has a null age, #4 a null `opted_in`, #5 a null region and #7 a null interests set; #10's interests is an empty selection (`|`), not a null. `f.inspect.json` records its dictionaries (the interests bits are travel, tech, sport, food).
  - `generate.js` → `k.csv` (seed 6, 1,000 rows, a few null regions and ages): the chain scene.
  - `b.csv` (3 rows): one instant, `2026-02-28T23:30Z`, with a Berlin, a UTC and a null per-row zone.
  - `p.csv` (12 rows): a long panel of plans (trial, paid, churned) for five subjects.
- **Requests** (each `<name>.json` → `<name>.out.json`, grouped by `id` so the kept members are listed):
  - `chain`, `swap`: `FILTER_NULL` age is_not_null, `FILTER_RANGE` age 18–65, `FILTER_INCLUDE` region North/South on `k.csv`, then with the first two swapped. 1,000 → 304 either way; the null ages (41) move to `FILTER_RANGE`.
  - `inc`, `exc`: include / exclude region North, South. Both report `n_null_input` 1: exclude keeps #5 and still counts it.
  - `rng`: `FILTER_RANGE` age 18–65. `dr`: `FILTER_DATE_RANGES` joined, spring 2023 and since 2024.
  - `tru`, `trut`, `fal`, `fals`, `nul`: `FILTER_TRUE` strict and truthy, `FILTER_FALSE` truthy and strict, `FILTER_NULL` age is_null. Every one reports `n_null_input` 1, kept or dropped.
  - `set_any`, `set_all`, `set_none`, `set_equals`: the set filters with query {travel, tech}. Only none keeps the null set (#7); all four count it.
  - `expr`: `age >= 30 and "travel" in interests` (no field, so `n_null_input` 0). `par`: `age >= params.min_age`. `cal`: `weekday(joined) >= 6`.
  - `prev`: `ATTR_PREVIOUS_STATE` plan → `prev`, read by `FILTER_EXPRESSION` `prev == "trial" and plan == "paid"` on `p.csv`.
  - `berlin`, `utc`, `rowtz`: `FILTER_DATE_RANGES` March 2026 on `b.csv` with slot `tz` Europe/Berlin, no zone, and `tz_field` zone.
  - `bad`, `badday`: an expression typo and a bare datetime in `weekday()`. Both are `PULSE_FORMULA_COMPILE_ERROR` at predict (`.predict.json`) and at the run (`.out.json`).
  - `unk`: `FILTER_INCLUDE` with an unknown label. The run fails with `PROCESSING_CONFIG`; predict at alpha.33 reports it valid (`unk.predict.json`), so the film does not claim predict catches it.
- **Steps:** `build.sh` regenerates `k.csv`, imports the four cohorts, inspects `f.pulse` and runs every request.

The film copies its counts from these runs into `scenes.js`, next to a comment naming the run. The chain scene's figures come from `k.csv`; the per-member scenes from `f.csv`.
