# Features: recorded runs

- **Cohorts:** `generate.js` (seed 5) writes three CSVs.
  - `f.csv`: 240 customers with region (exact shares 30/25/25/20), occupation (a rare tail), plan, member (`packed_bool`), a right-skewed income, churned (0/1) and signup date. It is imported with `f.schema.json`, which only adds field descriptions.
  - `s.csv`: 60 customers for the split grid, with plan 7 Basic then 3 Pro in every ten. It is imported with `s.schema.json`, which keeps `id` a bounded categorical.
  - `d.csv`: one instant, `2024-03-15T02:30:00Z`, on four rows. Each row has its own IANA zone, and the last row has none.
- **Steps:** `build.sh` regenerates the CSVs, imports them, then runs each request through `pulse api process` (`<req>.out.json`) or `pulse api predict` (`<req>.predict.json`).

| Request | Scene | What the film quotes |
|---|---|---|
| `where.json` (process, predict) | Where features run, Two cost classes | Log, then quantile bucketize of `LOG_income`. Predict gives `streamable: false` because the bucketize cuts quantiles of an earlier feature's column. |
| `skew.json` | Taming skew | `AGG_SKEWNESS` of income, `SQRT_income` and `LOG_income`. The histogram bins the same 240 incomes. |
| `cat.json` | Encoding categories | `FREQ_region` and the region counts. One-hot of the `packed_bool` `member` makes `member_0` and `member_1`. |
| `te.json`, `tetrain.json`, `tetrainall.json` | Target encoding | Training n and mean per occupation, the training mean 0.25, and the encoded value with `fit_on: "split == 0"` at smoothing 0 and 10. |
| `leaky.json`, `folds.json`, `fiton.json` (predict) | Target encoding | Without `fit_on`, predict warns `PULSE_FEAT_TARGET_LEAKAGE_RISK`. With `folds` alone the warning stays, reworded. With `fit_on` there is no warning. |
| `dates.json` | Dates | `signup_dow` 4 (ISO Thursday). The per-row zone (`tz_field`) day, dow and hour, and nulls for the row with no zone. |
| `split.json` | Train, validation, test | The stratified split Pulse gave each of the 60 records. |
| `pipe.json` (predict) | A full pipeline | Valid, with no warnings. `streamable: false` for the bucketize and the encoder's `fit_on`. |
