# Synthetic data: specs, profiles and recorded runs

Every figure, hash, warning and error code on screen in `22-synth` comes from these Pulse v1.0.0-alpha.33 runs. A synth run writes a `.pulse` file (git-ignored); its `--json` envelope is recorded as `<spec>.out.json`. Process requests over the generated cohorts are `q-<name>.json` → `q-<name>.out.json`.

- **Specs** (`shop.json` by hand; the rest written from it by `mk.js`, which also writes the `q-*.json` requests). All run with `--seed 22`.
  - `shop.json`: 2,000 rows, seven fields (`monotonic_from`, `weighted_categorical`, clamped `normal`, `lognormal`, `poisson`, `bernoulli`, `uniform_date`). `shop.out.json`: 2,000 generated, 0 rejected. `shop.head.csv`: its first five rows.
  - `q-shop`, `q-shop-region`, `q-shop-member`: the marginals read back (regions 800 / 626 / 383 / 191; age mean 42.19, 18 to 80; visits mean 2.9345; 702 members; spend mean 62.58; highest id 2,000).
  - `badparam.json`: `"rate"` on the poisson field, refused with `PULSE_REQUEST_UNKNOWN_FIELD` (`fields[4].params.rate`, suggestion `lambda`).
- **The copula**:
  - `cop.json`: `correlations` age ~ spend, rho 0.6. `q-r-cop-spearman` 0.587 and `q-r-cop-pearson` 0.552 (`MAT_CORRELATION`), against `q-r-shop-*` −0.019 and −0.013 without it. `q-cop`: spend mean 62.30, age mean 41.94.
  - `coppois.json`: a poisson field in `correlations`, refused with `SERVICE_VALIDATION`.
  - `copgap.json`: three participants and two named pairs; warns that the third pair is drawn independent (rho = 0).
- **Constraints and rules**:
  - `cons.json`: `spend >= 30`; 240 rows rejected. `q-cons`: 2,000 rows, lowest spend 30.07, highest id 2,000.
  - `consx.json`: the same with `max_rejection_rate` 0.1, refused with `PULSE_SYNTH_CONSTRAINT_INFEASIBLE` (73 accepted, 10 rejected); no file is written.
  - `rules.json`: a nullable `tier` and a `vip` flag; rule 0 nulls `tier` for non-members, rule 1 derives `vip` from spend, rule 2 (`age > 90`) never fires and warns. `q-rules`: tier present on 0 of 1,268 non-members and 732 of 732 members; vip true on 146 + 77 rows.
  - `rulesbad.json`: `set_null` on the non-nullable `region`, refused with `PULSE_SYNTH_RULE_FIELD_NOT_NULLABLE`.
  - `claim.json`: the copula pair plus an unconditional `set_expr` on spend. The rule claims spend first; the correlation drops it with a conflict warning. `q-r-claim-pearson`: 0.023.
- **Earlier rows**: `lag.json` (104 weekly rows; `week = row()`, `stock = spend + 0.6 * lag("stock", 1, 0)`). `lag.head.csv`: its first eight rows.
- **Profile and top-up**:
  - `members.csv` (1,000 rows: region, age, spend, plan) is drawn by `generate.js` (seed 22) with `../../build/pyrandom.js`, the way the series' other generated cohorts are. It is not made with synth.
  - `members.profile.json`: `profile create --include-stats --include-correlations --seed 22`.
  - `topup.out.json`, `topup.spec.json`, `topup.fidelity.json`: `synth from-profile --rows 500 --fidelity-report`. Spend is rebuilt as a clamped normal and fails its KS test (D 0.162); region, age and plan pass; age ~ spend comes back at 0.449 against 0.452. `q-topup`: 1,000 rows with `_synthetic` false and 500 true.
  - `shape.profile.json`, `shape.out.json`, `shape.spec.json`, `shape.fidelity.json`: the same with `--fit-shape`. Spend becomes a two-component mixture and passes (D 0.070, p 0.076); the shape claims spend ahead of the correlation, which is dropped with a warning, so the report has no pairwise section.
  - `collide.out.json`: `--output` equal to `--source`, refused with `PULSE_SYNTH_OUTPUT_COLLISION`.
- **Determinism**: `determinism.sha256.txt` and `determinism.cmp.txt`. `shop.json` at seed 22 twice gives the same SHA-256; seed 23 differs (from byte 56). Two profile captures of `members.pulse` at seed 22 hash the same.
- **Steps:** `build.sh` regenerates everything above. The `.pulse` files are git-ignored.

The film copies its figures from these outputs into `scenes.js`, next to a comment naming the run.
