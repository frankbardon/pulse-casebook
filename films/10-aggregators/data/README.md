# Aggregators: null-rule probe

- **Cohort:** `a.csv` (hand-written, 5 rows).
- **Requests:** `ar.json` → `ar.out.json`.
- **Steps:** `build.sh` imports `a.csv` and runs `ar.json` through `pulse api process`.

The film computes its on-screen figures in `scenes.js` from its own ten-member cohort `P`, not from `a.csv`. This run is a separate probe of the aggregator null rules, not the cohort on screen.
