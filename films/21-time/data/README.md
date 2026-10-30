# Time zones and panels: recorded runs

- **Cohorts:** `generate.js` (node, `build/pyrandom.js`) writes four CSVs, and `build.sh` imports them to git-ignored `.pulse` files.
  - `o.csv` (seed 21, 219 rows): orders from three stores, `ny` (America/New_York), `london` (Europe/London) and `tokyo` (Asia/Tokyo), each over its own local Monday 16 to Sunday 22 March 2026. Columns: `id`, `store`, `zone` (IANA name), `at` (UTC instant, `Z`) and `amount`. In that week New York is on EDT (UTC-4), London on GMT and Tokyo on JST (UTC+9). Order 219 has an empty `zone` cell.
  - `h.csv` (288 rows, no randomness): one Berlin meter read every 30 minutes (UTC) over 28–30 March and 24–26 October 2026, the UTC days around Berlin's two DST changes (29 March: 02:00 CET jumps to 03:00 CEST; 25 October: 03:00 CEST falls back to 02:00 CET).
  - `w.csv` (hand-written, 6 rows): naive wall-clock readings with a per-row `zone` column. `w2` (Berlin 02:30 on 29 March) does not exist, and `w4` (Berlin 02:30 on 25 October) happens twice.
  - `p.csv` (seed 2121, 1,204 rows): a long monthly panel. 300 subjects join on `trial` in January, February or March, are observed on the first of each month to June (`month`, a date), move between `trial`, `basic` and `pro`, and are last observed in the month they churn. `spend` is 0 on trial and churned, about 20 on basic and about 50 on pro. `p.inspect.json` records the `plan` dictionary (trial, basic, churned, pro).
- **Imports** of `w.csv` (`<name>.import.json`, then `<name>.export.csv` from `pulse export csv`):
  - `w_naive`: no source zone. Every value is stored as if it were UTC.
  - `w_err`: `--source-tz Europe/Berlin`. Refused with `PULSE_IMPORT_DST_NONEXISTENT` (row 2, value `2026-03-29T02:30:00`); no file is written.
  - `w_earlier`: `--source-tz Europe/Berlin --dst-policy earlier`. `PULSE_IMPORT_DST_RESOLVED` counts 1 ambiguous and 3 nonexistent: the one file zone reads the Tokyo and New York rows as Berlin too.
  - `w_rows`: `--source-tz-field zone --dst-policy later`. 1 ambiguous and 1 nonexistent; each row lands on its own zone's instant. `w_rows.berlin.csv` is the same cohort exported with `--tz Europe/Berlin`.
- **Requests** (`api process` unless noted; each `<name>.json` → `<name>.out.json`):
  - `day_utc`, `day_ny`, `day_field`: `GROUP_DATE` day on `o.csv` with no zone, request `time_zone` America/New_York, and request `time_zone_field` `zone`. The zone-field run gives exactly 16–22 March and counts order 219 in the grouper's `n_null` (1).
  - `badzone`: request `time_zone` `EST`, refused with `PULSE_TIMEZONE_UNKNOWN`.
  - `resolve` (`api predict` → `resolve.predict.json`): request zone New York, one `ATTR_DATE_PART` that inherits it, one with `tz_field`, and a `GROUP_DATE` with slot `tz` Asia/Tokyo. `time_zones[]` echoes the sources `request`, `field` and `slot`.
  - `dst_utc`, `dst_berlin`: `GROUP_DATE` day on `h.csv`. Every UTC day holds 48 readings; Berlin's 29 March holds 46 and its 25 October holds 50.
  - `spring`, `fall`: `FILTER_DATE_RANGES` on the one DST day plus `GROUP_DATE` hour, request zone Berlin. The March keys skip `T02`; the October `T02` bucket holds 4 readings.
  - `spring_utc`, `spring_day`: `FILTER_DATE_RANGES` 2026-03-29 to 2026-03-29 with no zone (`n_out` 48) and with request zone Berlin (`n_out` 46), `n_in` 288 both times: the local day (issue #403).
  - `cal`: request zone New York, orders 1, 9 and 39. `ATTR_DATE_PART` `iso_weekday` with `tz_field` gives 1 (Monday) for all three; `weekday(to_day(at))` gives 7 (Sunday) for the Tokyo order. `bare` (`api predict`): `weekday(at)` is `PULSE_FORMULA_COMPILE_ERROR`.
  - `panel`: `ATTR_PREVIOUS_STATE` (`plan`, `subject_field` subject, `order_field` month) for s001 and s002, grouped by subject and month with `AGG_MODE`, which returns `plan` dictionary codes. Components: `n_subjects` 300, `n_first` 300, `n_gap` 0, `n_ambiguous` 0.
  - `june`: the same attribute with `FILTER_DATE_RANGES` June: 1,204 → 178 rows, every one with a previous state (basic 114, pro 61, trial 3). The attribute's components still count every record (`n` 904, `n_null` 300).
  - `trans`: crosstab `prev` × `plan`, `AGG_COUNT`: 904 transitions. `churned` is a column only.
  - `markov`: `trans` plus `OVERLAY_MARKOV` with `absorbing` [churned], `steps` [3] and `initial` {trial: 1}. Transition matrix, `step_3`, `distribution_3` and `absorption_time`; warnings `PULSE_OVERLAY_REF_ZERO` (unit row for churned) and `PULSE_OVERLAY_MARKOV_NOT_ERGODIC` (no `steady_state`).
  - `retention`: `trans` plus `OVERLAY_RETENTION` with `absorbing` [churned]: stay, switch and churn per starting state, pooled stay 0.546 over 904.
  - `winfirst` (and `winfirst.predict.json`): `WIN_DELTA` spend per subject by month, read by the crosstab cell `AGG_AVERAGE spend_change`, so the windows run first over the records. Predict reports `post_window.windows_first` true.
- `manifest.tz.json`: `pulse_version` and `tzdata_version` (2026c) from `pulse manifest --json`.
- **Steps:** `build.sh` regenerates the CSVs, imports them, runs the four `w.csv` imports and their exports, and runs every request. A rebuild reproduces every output byte for byte.

The film copies its figures from these runs into `scenes.js`, each next to a comment naming the run.
