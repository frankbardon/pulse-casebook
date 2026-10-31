# Concepts: result cards

- **Cohorts:**
  - `c.csv` (hand-written, 12 rows): the twelve members on screen. Member 7 has a null income; member 12 has an empty interests selection (`|`), not a null.
  - `generate.js` → `s.csv` (seed 21, 80 rows, 20 per region): the samples behind the test, regression and matrix cards.
  - `generate.js` → `r.csv` (18 orders, three per month, January to June 2026): the windows and series-overlay scenes.
- **Requests:**
  - `feat.json` → `feat.out.json`: `FEAT_LOG` and `FEAT_BUCKETIZE` on all twelve members (grouped by `id` so each member is one row).
  - `spine.json` → `spine.out.json`: `FILTER_RANGE` age 18–65 and its components, then `ATTR_FORMULA` and `ATTR_ZSCORE` (member 7 scores null).
  - `pass1.json` → `pass1.out.json`: the z-score's first-pass statistics as an ungrouped request (n, mean, population sd), which is also the "no groups, one bucket" case.
  - `agg.json` → `agg.out.json`: `GROUP_CATEGORY` region with `AGG_AVERAGE` income (`n` / `n_null`) and `OVERLAY_SHARE_OF_TOTAL`.
  - `win.json` → `win.out.json`: `GROUP_DATE` month and `AGG_SUM` revenue, with `WIN_LAG`, `WIN_PCT_CHANGE`, `WIN_RUNNING_SUM` and `OVERLAY_DELTA_VS_PRIOR`.
  - `tr.json` → `tr.out.json`: `FILTER_INCLUDE` North and West, then `TEST_WELCH` income split by region (exactly two groups).
  - `sm.json` → `sm.out.json`: `REG_OLS` income ~ age and `MAT_CORRELATION` over the vector `profile`.
- **Steps:** `build.sh` regenerates `s.csv` and `r.csv`, imports the three cohorts and runs every request through `pulse api process`.

The film copies its result-card figures from these runs into `scenes.js`, next to a comment naming the run.
