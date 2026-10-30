# Windows: null-rule probe

- **Cohort:** `w.csv` (hand-written, 9 rows).
- **Requests:** `wr.json` → `wr.out.json`.
- **Steps:** `build.sh` imports `w.csv` and runs `wr.json` through `pulse api process`.

The film computes its on-screen figures in `scenes.js` from its own North/South rows, not from `w.csv`. This run is a separate probe of the window null rules, not the cohort on screen.
