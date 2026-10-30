# Groupers: result cards

- **Cohort:** `generate.js` → `g.csv` (seed 9): 300 orders over the four weeks of Monday 2 March to Sunday 29 March 2026.
  - `region` (North, South, East, West; 10 blank, so null), `plan` (Basic, Plus, Pro; 5 blank). West never buys Pro, so West × Pro is never observed.
  - `spend` (12 blank), `ts` (the order instant, a UTC `Z` literal, imported as `datetime`), `zone` (the store's IANA zone, one per region).
  - `channels`: a multi-select of web, app and store, imported as `set_u8`. A bare `|` is an answered-but-empty selection (14 orders); a blank is null (11 orders).
  - `customer`: 90 customer ids, for the windows-first visit number.
- **Requests**, each run with `pulse api process` (or `predict`) at v1.0.0-alpha.33. Outputs are `<request>.out.json`; predict runs are `<request>.predict.json`.
- **Steps:** `build.sh` regenerates `g.csv`, imports it and runs every request.

The film's result cards come from these runs; `scenes.js` names the run beside each figure.

## Requests

| Request | Command | What it shows |
|---|---|---|
| `none` | process | no `groups`: one bucket, 300 orders, average spend 36.16 |
| `one` | process | `GROUP_CATEGORY` region: East 61, North 95, South 80, West 54. Grouper floor `total_n` 290, `n_null` 10; `AGG_AVERAGE` spend in East reads `n` 57 of 61 orders (`n_null` 4) |
| `defaults` | predict | four entries with `field` and no `type`: `defaults_applied` fills `GROUP_RANGE` (f64), `GROUP_CATEGORY` (categorical), `GROUP_DATE` (datetime) and `GROUP_SET_PER_ELEMENT` (set), each with its rule |
| `range` | process | `GROUP_RANGE` interval 40 on spend: `0-40` 189, `40-80` 78, `80-120` 19, `120-160` 2 |
| `rounded` | process | `GROUP_ROUNDED` interval 40: the same counts keyed `0`, `40`, `80`, `120` |
| `nranges` | process | `GROUP_NUMERIC_RANGES` small (< 25) 139, mid [25, 60) 105, large (≥ 60) 44 |
| `quant` | process | `GROUP_QUANTILE` interval 4: Q1–Q4, 72 orders each, with min and max spend per quartile |
| `dow` | process | `GROUP_DATE` `day_of_week` in UTC, Monday first: 38, 39, 37, 34, 41, 62, 49 |
| `dowlocal` | process | the same with `tz_field: "zone"` (each store's local calendar): 47, 30, 39, 31, 47, 57, 49 |
| `dranges` | process | `GROUP_DATE_RANGES` listed promo (23–29 March) then launch (9–15 March): promo 75, launch 72, unmatched 153, in supplied order with unmatched last |
| `perel` | process | `GROUP_SET_PER_ELEMENT` channels: app 123, store 74, web 196 (393 label observations from 289 answered orders) |
| `setval` | process | `GROUP_SET_VALUE` channels: one bucket per exact combination, including the empty key (14, `n_empty_mask`); `n_null` 11 |
| `combo` | process, predict | region × plan: 11 observed rows (no West × Pro), outer → inner; region `n_null` 10, plan `n_null` 5; the rows hold 285 of 300 orders |
| `limit` | process, predict | `combo` under `--limit max_groups=8`: predict `limit_findings` estimated 12 (4 × 3), grade `possible`; the run is refused with `PULSE_LIMIT_EXCEEDED` (observed 9, configured 8) |
| `fanout` | process | plan × `GROUP_SET_PER_ELEMENT` channels: each order lands once per ticked channel inside its plan |
| `dupkey` | process | two `GROUP_CATEGORY` entries on region: `SERVICE_VALIDATION` ("group[1] field region collides with group[0] field region") |
| `include` | process | `GROUP_CATEGORY` region with `include: ["West", "North"]`: West 54, North 95, in that order; the skipped records take the null path (`n_null` 151) |
| `winfirst` | process, predict | `WIN_ROW_NUMBER` per customer by `ts`, read by `GROUP_NUMERIC_RANGES` first [1, 2) and repeat [2, ∞): first 87, repeat 213. Predict: `post_window.windows_first` true |

## Notes

- `perel` and `fanout` report the per-option grouper's `total_n` as 393, the label observations, with no `n_null`, although 11 orders have a null selection. The skill says the floor counts records and that null rows count in `n_null`. The film does not show the per-option grouper's floor; it quotes `n_null` from `setval` only.
