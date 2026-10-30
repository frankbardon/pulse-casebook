# Windows: recorded runs

- **Cohorts:**
  - `s.csv` (hand-written, 12 rows): monthly sales for North and South, January to June 2026, stored out of order. North's April is null and February is 0; North's May and June tie at 48.
  - `d.csv` (7 rows): sales 1 to 7, one row a day for the week of 2 March 2026 (Monday) to 8 March (Sunday), stored out of order.
- **Requests** (each `<name>.json` → `<name>.out.json`):
  - `win`: every row-level window the film shows, partitioned by region and ordered by date: lag, lead, lag with default 0, delta, percent change, running sum and average, trailing-3 and centred-3 moving averages, EWMA α 0.5, and row number, rank and dense rank by sales descending.
  - `open`: `WIN_MOVING_AVG` with an open start. `PULSE_WINDOW_INVALID` at the run and at predict (`open.predict.json`).
  - `rankfield`: `WIN_RANK` naming a field. `PULSE_WINDOW_INVALID`.
  - `ewdecay`: `WIN_EWMA` alpha 0.3 beside decay 0.7: identical columns.
  - `share`: `WIN_SHARE`, cumulative `WIN_SHARE`, and `WIN_DISTRIBUTED_LAG` (geometric, decay 0.5, max_lag 2, normalize false).
  - `adstock`: `WIN_ADSTOCK`. `PULSE_WINDOW_INVALID` with `renamed_to: WIN_DISTRIBUTED_LAG`.
  - `agg`: `GROUP_DATE` month on `date`, `AGG_SUM`, then `WIN_RUNNING_SUM` and `WIN_PCT_CHANGE` over the totals (the default order).
  - `first`: windows-first. `WIN_DELTA` partitioned by region, read by `AGG_AVERAGE` grouped by region: North 6, South 3. `first.predict.json` reports `post_window.windows_first: true`.
  - `firstall`: the same with no `partition_by`: the deltas cross regions (North 0.75, South −1).
  - `firstsort`, `firstweight`: a sort on the window label (`SERVICE_VALIDATION`) and a request weight (`PROCESSING_CONFIG`) on the windows-first request.
  - `dow`: `GROUP_DATE` day_of_week with `WIN_ROW_NUMBER` ordered by the grouper key: Monday 1 … Sunday 7.
  - `rnfilter`: a filter on a window label in the same request. `SERVICE_VALIDATION` unknown field `rn`.
  - `mat` → `ranked.pulse` (git-ignored) via `pulse api materialize`, then `top`: `FILTER_RANGE` rn 1–2 grouped by region and month. North May and June, South April and June.
- **Steps:** `build.sh` imports both cohorts and runs every request.

The film copies its figures from these runs into `scenes.js`, next to a comment naming the run.
