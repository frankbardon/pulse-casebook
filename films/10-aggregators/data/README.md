# Aggregators: result cards and the null-rule probe

- **Cohorts:**
  - `p.csv` (hand-written, 10 rows): the ten members on screen (`P` in `scenes.js`). Member 5 has a null spend. `spend_calm` is `spend` with member 8 at 62 instead of 240, the start of the centre chapter's outlier animation. `w` is the weights chapter's row weight; `score` and `renewed` (0/1) feed `AGG_AUC`.
  - `s.csv` (hand-written, 8 rows): the multi-select chapter. Member 5 is null; member 7 is an empty selection (`|`), not a null.
  - `z.csv` (hand-written, 7 rows): the shape null rule. One row, three equal values, and three spread values.
  - `generate.js` → `h.csv` (400 rows): the shape chapter's lognormal sample. It replays the film's own generator (the kit's `rng(11)`), so the histogram draws exactly these values.
  - `a.csv` (hand-written, 5 rows): a separate probe of the aggregator null rules, not shown on screen.
- **Requests:**
  - `count.json` → `count.out.json`: count, null count, distinct count, frequency of North (with `share`), mode count and mode (a dictionary index).
  - `centre.json` → `centre.out.json`: sum, average and median of `spend` and `spend_calm`; min, max, range, variance, stddev, Welford and ratio, with their components.
  - `ci8.json`, `ci4.json`, `ci2.json`, `ci1.json` → `.out.json`: the CI bounds as the rows fall with member 8 (spend 240) left out: eight members, then members 1–4, 1–2 and 1 alone (both bounds null).
  - `ci9.json` → `ci9.out.json`: all nine members with member 8 back in, the widest interval: spread widens it too.
  - `rowratio.json` → `rowratio.out.json`: the average of the row ratios (`ATTR_FORMULA` spend / cost, then `AGG_AVERAGE`), for contrast with `AGG_RATIO`.
  - `acc.json` → `acc.out.json`: MAE, RMSE and MAPE of `spend` against `pred`, and `AGG_AUC` of `score` against `renewed` (AUC 0.78, gini, `n_pos`, `n_neg`, DeLong interval).
  - `shape.json` → `shape.out.json`: skewness, kurtosis and the 90th percentile of `h.csv`.
  - `shapenull.json` → `shapenull.out.json`: skewness and kurtosis per `z.csv` group. One row and no spread are both null.
  - `sets.json` → `sets.out.json`: set frequency, union, intersection, cardinality average and distinct values.
  - `weights.json` → `weights.out.json`: weighted count (Σw 9.5) and average under a request weight, and an unweighted average opted out with `"weight": null`.
  - `ar.json` → `ar.out.json`: the null-rule probe on `a.csv`. An average over an all-null field is `null`; its count is 0.
- **Steps:** `build.sh` regenerates `h.csv`, imports the five cohorts and runs every request through `pulse api process`.

The film copies its result-card figures from these runs into `scenes.js` (the `REC` table, each entry naming its run). Per-row arithmetic drawn on screen (each row's spend ÷ cost, each member's error bar) is plain arithmetic on `p.csv`.
