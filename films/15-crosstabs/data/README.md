# Crosstabs: result cards

- **Cohort:** `generate.js` → `t.csv` (seed 15): 600 respondents to a two-wave brand tracker, with `wave` (W1 is ids 1–300, W2 is 301–600), `region`, `age`, `aware`, `brand` (asked only of those aware of the category, so null for the other 180), `intent` (a code: 1, 2 or 3), `score` (0–10, null when skipped) and `wt` (a probability design weight that down-weights the over-sampled 18–34 band). It is imported with `t.schema.json`, so `intent` is categorical, not a number.
- **Label table:** `labels/intent_names.json` maps the intent codes to Unlikely, Maybe and Likely. `build.sh` loads it by pointing `PULSE_LABEL_TABLES_DIR` at `labels/`.
- **Requests:** below. Process outputs are `<request>.out.json` and predict outputs `<request>.predict.json`.
- **Steps:** `build.sh` regenerates the CSV, imports it and records every output.

The film's result cards come from these runs.

| Request | Command | What it shows |
|---|---|---|
| `a` | process, predict | `AGG_COUNT` by region × brand, all margins: East 22 / 30 / 41 (row margin 93), North 65 / 37 / 32 (134), South 33 / 41 / 27 (101), West 32 / 37 / 23 (92); column margins 152 / 145 / 123; grand total 420, the respondents asked. Predict: `crosstab_fusable` true, `streamable` false with its two reasons |
| `tot` | process | the same rows with no `columns`: one `Total` column (header type `TOTAL`), normalize column. Row margins (records) East 142, North 190, South 143, West 125; grand 600. Shares 24% / 32% / 24% / 21% |
| `ac`, `nr`, `nt` | process | `a` normalized by column, row and total. North Acorn: 43% of Acorn users (column), 49% of North's brand users (row), 15% of the 420 (total); East Acorn by column is 14% |
| `g` | process | a crosstab beside `groups` + `aggregations`: refused with `PULSE_CROSSTAB_CONFLICTS_WITH_GROUPS` |
| `m` | process | `AGG_AVERAGE` of score by brand × wave: Acorn 6.61 / 7.20, row margin 6.95 (the average of the two cells would be 6.91); column margins 6.32 / 6.68; grand 6.52 |
| `nw` | process | region × (wave, brand), normalize row, `normalize_within` 0: shares sum to 1 per region within each wave; East Cedar 37% in W1, 49% in W2 |
| `nl` | process | region × (wave, brand), normalize column, `normalize_level` 0: each cell is a share of its whole wave; North Acorn 15% of W1, 16% of W2 |
| `cells` | process | two measures, `base` (`AGG_COUNT` id) and `mean_score` (`AGG_AVERAGE` score), by brand × wave: Acorn base 65 / 87, mean 6.61 / 7.20, etc. `matrix.measures`: base 190 / 230, grand 420; mean_score 6.32 / 6.68, grand 6.52 |
| `w` | process | `a` normalized by column under `weight` `wt`: North Acorn 44% (43% unweighted); weighted margins 93.4 / 133.4 / 97.5 / 88.4 and 143.5 / 145.5 / 123.7, grand 412.6. Components keep `grand_total_count` 420, with `sum_weights` 412.641 and `n_eff` 383.54 |
| `aux` | process, predict | weighted `AGG_AVERAGE` of score by region × wave, with an unweighted auxiliary `base` (`AGG_COUNT` id, `"weight": null`). Weighted row margins 6.53 / 6.71 / 6.30 / 6.45; bases 139 / 186 / 138 / 123, 293 / 293, grand 586. East: 142 records, the cell's margin n 139 and n_null 3. Predict `weights`: the cell `applied` (source request), the auxiliary `opted_out` |
| `long` | process | `a` with `shape` long: one row per cell in `data`, then margin rows tagged `_margin` row, column and grand |
| `q` | process, predict | a `GROUP_QUANTILE` score axis (quartiles) × wave. Predict: `crosstab_fusable` false, `crosstab_fusion_reasons` "non-streamable grouper on row axis (GROUP_QUANTILE)" |
| `lab` | process | intent × wave, normalize column, label binding `replace`: row keys Unlikely / Maybe / Likely; Likely 26% in W1, 30% in W2; row margins 205 / 229 / 166 |
| `laba` | process | the same in `augment` mode: warning `PULSE_LABEL_NOT_APPLIED` (reason `augment_on_matrix_axis`), keys stay 1 / 2 / 3 |
| `sig` | process, predict | brand × region, normalize column, `OVERLAY_PAIRWISE_PROP_Z` scope column with `letters`. Letters East A, North B, South C, West D; significant "above": Acorn North over A, C, D; Birch South over B and West over B; Cedar East over B, C, D. Predict: 18 uncorrected p-values and `PULSE_ADVISORY_MANY_TESTS`, suggesting holm |
