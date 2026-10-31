# Attributes: result cards

Every figure on a result card in `07-attributes` comes from these Pulse v1.0.0-alpha.33 runs.

- **Cohorts:**
  - `m.csv` (hand-written, 12 members): the members on screen. Every member request filters `FILTER_RANGE` age 18–65, which drops members 2 and 5 and leaves ten. Member 10 has a null income and a null `joined` date, and an empty interests selection (`|`), which is not a null. Member 6 has a null rating and member 7 a null `interests` set. `wt` is an integer weight; `flat` holds 7 on every row (a constant field).
  - `p.csv` (hand-written, 12 snapshots): a long panel of four customers over three month-ends, rows not sorted by customer. C4's February plan is null.
  - `generate.js` → `reg.csv` and `mv.csv`: the regression and Mahalanobis scatters, drawn with the film kit's own `rng` and the seeds `scenes.js` uses (17 and 5), so Pulse scores the points that are on screen. `mv.csv` row 71 is the tall-but-light member.
  - `w.csv` (hand-written, six weeks): TV spend for the post-window example.
- **Requests** (per-member figures come from grouping by `id` and taking `AGG_MAX` of each label):
  - `scores.json`: `ATTR_ZSCORE`, `ATTR_TSCORE`, `ATTR_NORMALIZED` and `ATTR_PERCENTILE` on income (member 10 scores null on all four), and `ATTR_ZSCORE` on `flat` (null on every row).
  - `stats.json`: the income mean, population SD (`AGG_STDDEV` divides by n), min and max of the ten.
  - `formula.json`: `(income ?? 0) / age`, `region == "North"` and `has_any(interests, "food", "sport")`. `formula_err.json`: the unguarded `income / age` fails the request with `PROCESSING_RUNTIME`.
  - `total.json`: `total(income)` (658) and the guarded share. `total_fw.json`: the same total under a frequency weight on the slot (Σw·income = 898). `total_pw.json` (process and predict): a probability weight is refused with `PULSE_WEIGHT_UNSUPPORTED`.
  - `recodes.json`: `ATTR_CODE_IN` rating [4, 5]; `ATTR_DATE_PART` year, month, day, year_month, month_day and iso_weekday; `ATTR_SET_HAS` "tech" and `ATTR_SET_POPCOUNT`. `topbox.json`: the mean top box is 0.5. `topbox_inc.json`: after `FILTER_INCLUDE` rating 4, 5 the mean is 1.
  - `prev.json`: `ATTR_PREVIOUS_STATE` of plan, by customer, ordered by `wave`, grouped by `row` and `prev_plan`. The five rows missing from its output are the null previous states (the attribute's `n_null` is 5). `prev_window.json`: the March window only, as a `prev_plan × plan` crosstab, with the components `n_subjects` 4, `n_first` 4, `n_gap` 1 and `n_ambiguous` 0, counted over every record. `prev_filter.json`: a `FILTER_EXPRESSION` reads `prev_plan` and keeps the three plan changes.
  - `reg.json`, `reg_sums.json`: `ATTR_REG_FITTED`, `ATTR_REG_RESIDUAL` and `ATTR_REG_LEVERAGE` of sales on spend (n = 30, Σ leverage = 2, Σ residuals ≈ 0).
  - `mv.json`: `ATTR_MAHALANOBIS` over [height, weight] with `fit_on` rows 1–70, plus z-scores; member 71 scores D² 24.7.
  - `post.json` (process and predict): a `WIN_DISTRIBUTED_LAG` adstock, then `ATTR_FORMULA` `hill(tv_ad, 100, 1.5)`, which runs after the windows; predict reports `post_window` with `windows_first: true`. `post_refused.json`: `ATTR_ZSCORE` on the window label is refused with `PULSE_ATTRIBUTE_WINDOW_ORDER`.
- **Steps:** `build.sh` regenerates the scatters, imports the five cohorts and runs every request.

The film copies its result-card figures from these runs into `scenes.js`, next to a comment naming the run. The cards for `ATTR_SEM_SCORE`, the vector row scores and bound-fit scoring (`params.fit`) state rules from the skill pack and show no figures.
