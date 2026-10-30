# Compose, batch and sweep: result cards

- **Cohorts:** `generate.js` (node, `build/pyrandom.js`) writes two CSVs, and `build.sh` imports each to a git-ignored `.pulse`.
  - `m.csv` (seed 17, 208 rows): weekly media and sales. `market` (north, south), `week` (1–104), `year` (2024 for weeks 1–52, 2025 after), `tv` spend (four-week flights, else 0), `search` spend (always on) and `sales`. Sales are a market base plus a seasonal wave, 1.6 × the TV adstock and 3.2 × the search adstock, plus noise. Both adstocks are geometric over 8 lags and unnormalised, with true decays of **0.6 for TV and 0.2 for search**.
  - `s.csv` (seed 1717, 600 rows): a brand survey for the banner. Columns are `gender`, `age` (18-34, 35-54, 55+), `aware` (yes/no, imported as a boolean) and `brand` (Alto, Brio, Cora), with brand leaning on age.
- **The request style film 18 reuses.** Every decay request builds one body (see `decay.json`):
  - an `ATTR_FORMULA` `north` (1 or 0);
  - `WIN_DISTRIBUTED_LAG` `tv` → `tv_ad` and `search` → `search_ad`, each with `partition_by` market, `order_by` week, `kernel` geometric, `max_lag` 8 and `normalize` false;
  - a `REG_OLS` named **`sales`** (`sales ~ tv_ad + search_ad + north`) with `holdout` `week >= 92`, which holds out the last 13 weeks of each market (26 rows);
  - `return` `{exclude: ["data"]}`;
  - `rank.by` `regressions.sales.holdout.rmse`.

  Film 18 can bind the winner with `fits: [{name: …, from_sweep: {regression: "sales"}}]` and read the decays with `sweep_axis()`. It can also swap the `REG_OLS` for `REG_MMM_HILL` and keep the axes.
- **Requests** (Pulse v1.0.0-alpha.33; `api compose` unless noted):
  - `batch.json` → `batch.out.json`: three slots: `total` (sum of sales and tv), `by_market` (average sales) and an unlabelled no-TV slot, which comes back as `request_3`, 87 rows. `batch.parallel.json` is the same batch with `--parallel 4` and is byte-identical to the serial run.
  - `collide.json` → `collide.out.json`: slot 1 relabelled `request_3`, which gives `PULSE_COMPOSE_LABEL_COLLISION` with indices [1, 2].
  - `fold.json` → `fold.out.json`: slots `y2024` and `y2025` (sales by market), with Compose overlays `OVERLAY_INDEX_VS_REF` (north 94.8, south 96.4) and `OVERLAY_DELTA_VS_REF`. `fold0.json` is the same without overlays, and its `responses` are byte-identical.
  - `grid.json` → `grid.out.json` and `grid.predict.json` (`predict-compose`): a market × year grid, label `{{market}}_{{year}}`, `$var` in the filter values. Predict reports `expanded_count` 4 and the labels.
  - `zip.json` → `zip.out.json`: band, lo and hi zipped into three TV-spend bands (`tv_off`, `tv_low`, `tv_high`).
  - `decay.json` → `decay.out.json`: a grid over the TV decay (0, 0.2, 0.4, 0.6 and 0.8), search fixed at 0.2, ranked by holdout RMSE. The winner is `tv=0.6` at 13.31.
  - `badrank.json` → `badrank.out.json`: the same sweep ranked by `…holdout.rsme`, which is refused with `PULSE_SWEEP_RANK_PATH` (reason `missing`).
  - `lhs.json` → `lhs.out.json`: `lhs`, 40 samples, `tv` and `search` ranges [0, 0.95], every slot ranked. The derived `sweep_seed` is 4503367277782454912, and both axes hit all 40 strata.
  - `random.json` → `random.out.json`: the same body in `random` mode. Its draws cover 25 of the 40 TV strata and 29 of the 40 search strata.
  - `replay.json` → `replay.out.json`: `lhs.json` with `rng_seed` pinned to that seed. Its ranking is identical to the `lhs` run.
  - `reseed.json` → `reseed.out.json`: `rng_seed` 7, a fresh set of draws.
  - `fan.json` → `fan.out.json` (`api process`) and `fan.predict.json`: one `WIN_DISTRIBUTED_LAG` item with `for_each` zip over `d` (30, 60, 90) and `decay` (0.3, 0.6, 0.9), giving `tv_ad30`, `tv_ad60` and `tv_ad90` for north weeks 1–8.
  - `cut.json` → `cut.out.json`: the holdout start swept through `params.cut` (79, 92, 105). At 105 the regression fails alone with `PROCESSING_REGRESSION_INSUFFICIENT_DATA` (`holdout_empty`). That adds `PULSE_SLOT_FAILED` and a `PULSE_SWEEP_RANK_PATH` warning, and the ranking keeps two slots.
  - `badslot.json` → `badslot.out.json`: a misspelt field (`salse`) in slot 1, which refuses the batch with `SERVICE_VALIDATION`, `details.request` 1.
  - `banner.json` → `banner.out.json`: a banner over `s.pulse`. It has brand rows, column shares, sections `all` and `aware`, groups Gender and Age, a Total block, and `OVERLAY_PAIRWISE_PROP_Z` letters. It runs as six slots, `all:Total` … `aware:Age`.
- **Steps:** `build.sh` regenerates both CSVs, imports them and runs every request. A rebuild reproduces every output byte for byte.

The film's result cards come from these runs. The sampling plots place the recorded draws, and the stratum counts are computed from them.
