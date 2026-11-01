# Privacy-safe data sharing with a synthetic twin

**Audience:** data-governance leads who must approve an external data share, and the analysts on
both sides of it.

**In one paragraph.** Kestrel Mobile, a fictional telecom, holds a 40,000-row customer table with
demographics, contract terms, products held, spend, support contacts, account dates and churn. A
regulator's research unit (the agency) wants to study what drives churn. Kestrel profiles the
table, generates a 40,000-row synthetic twin with Pulse, checks it three ways (Pulse's fidelity
report, business-rule violation counts, and the agency's own analysis run on both tables), and
checks that no synthetic row is a copy of a real customer. The result: every headline figure lands
between index 93.8 and 101.0 of the source value (source = 100), every churn driver keeps its
direction **and its size**, no impossible rows remain once structural rules are applied, and no real
record appears in the twin. The agency's logistic churn model has a McFadden pseudo-R² of 0.170 on
the source and 0.176 on the twin, a fit ratio of 1.04, and every driver's coefficient lands within
7% of its source value. The twin's weak spot is the plan effect on churn, which it carries at under
half its source strength.

> **Pulse version.** This walkthrough needs Pulse v1.0.0-alpha.35 or later, the release that
> carries the synth-realism work (roadmap U52): rule draws (`bernoulli()`, `uniform()`), `"output":
> false` helper fields, numeric predictors in `--fit-models`, within-set dependency capture, and
> `synth from-profile --synthetic-only` / `--fidelity-model` with the fidelity report's `utility` and
> `disclosure` sections. The casebook's `Makefile` pins alpha.35 (see [REPRODUCE.md](REPRODUCE.md)).

---

## 1. The business question

> *Can we give an outside agency a dataset it can analyse freely, so that its conclusions about
> churn hold for our real customers, without handing over a single real customer record?*

Governance needs four answers before signing off:

| # | Question | How this walkthrough answers it |
|---|---|---|
| G1 | Does the twin look like the source, field by field, and does it support the same analysis? | Pulse fidelity report: KS / χ² per field with effect sizes, set-option frequencies, model recovery, and a `utility` section that refits the agency's churn model on both tables |
| G2 | Does it obey our business logic, with no impossible customers? | Violation counts with Pulse expression attributes, with and without structural rules |
| G3 | Would the agency reach the same conclusions? | The same Compose requests run on both cohorts, with `OVERLAY_DELTA_VS_REF` / `OVERLAY_INDEX_VS_REF` comparing twin to source |
| G4 | Is any real customer in the twin? | The fidelity report's `disclosure` section (exact-match rate, Gower distance to closest record), exact-record joins, and a profile-match rate compared against the rate between two halves of the real table |

## 2. The source table

The "real" customer table is itself synthetic, so the showcase can be rerun anywhere. Pulse
generates it from [`data/customers.synth.json`](data/customers.synth.json) (seed `20260630`): 40,000
rows, snapshot date 2026-06-30. In the walkthrough it plays the part of the data that never leaves
the secure zone.

| Field | Pulse type | Meaning |
|---|---|---|
| `region` | `categorical_u8` | Sales region (North, South, East, West, Central) |
| `age` | `u8` | Account holder age, 18–85 |
| `plan` | `categorical_u8` | Basic, Standard, Premium, Unlimited |
| `contract` | `categorical_u8` | Monthly, One-Year, Two-Year |
| `tenure_months` | `u16` | Months from `start_date` to `end_date` (churned) or the snapshot (active) |
| `products_held` | `set_u8` | Multi-select: mobile, broadband, tv, landline, protection; empty = dormant account |
| `monthly_spend` | `f64` | Average monthly bill, USD; exactly 0 for dormant accounts |
| `support_contacts` | `u4` | Support calls/chats in the last 12 months |
| `frequent_caller` | `packed_bool` | Operational flag: `support_contacts ≥ 4` |
| `autopay` | `packed_bool` | Bill paid by automatic debit |
| `start_date` | `date` | Account opened |
| `end_date` | `date`, nullable | Account closed; null while active |
| `churned` | `packed_bool` | Closed between 2024-07-01 and 2026-06-30 |

**Built-in rules that hold on every source row:**

1. `end_date` is null exactly when `churned = 0`.
2. `end_date ≥ start_date`, and `tenure_months` matches the dates (to within half a month).
3. A dormant account (no products) has `monthly_spend = 0`.
4. `frequent_caller = 1` exactly when `support_contacts ≥ 4`.
5. TV is sold only over broadband: no customer has `tv` without `broadband`.

**Planted churn signal:** churn is driven by contract term (Monthly highest), short tenure, many
support contacts, no autopay, few products, and plan. Region and age have no effect. Contract
also drives tenure and autopay, plan and products drive spend, and older customers favour longer
contracts and landlines.

**How the spec plants it.** Every relationship above is a structural rule in the spec, and none of
the generator's working columns reach the file. Eleven helper fields are declared `"output":
false`: the contract draw, the spend noise, the extra contacts of a bad year, the dormant flag, one
flag per product, the product count and the true churn probability. The rules draw with
`bernoulli()` and `uniform()`:

```json
{"set_expr": {"has_tv": "has_broadband == 1 && bernoulli(0.52)"}},
{"set_expr": {"tenure_months": "min(142, round(-({\"Monthly\": 17, \"One-Year\": 36, \"Two-Year\": 58}[contract]) * log(1 - uniform())))"}},
{"set_expr": {"p_churn": "1 / (1 + exp(-(-0.1 + ({\"Monthly\": 0, \"One-Year\": -1.2, \"Two-Year\": -2.1}[contract]) + ({\"Basic\": 0.2, \"Standard\": 0, \"Premium\": -0.15, \"Unlimited\": 0.2}[plan]) - 0.0206 * tenure_months + 0.43 * support_contacts - 0.54 * autopay - 0.46 * n_products)))"}},
{"set_expr": {"churned": "bernoulli(p_churn)"}}
```

So the true churn model is known: logit coefficients of −1.2 (One-Year) and −2.1 (Two-Year), −0.0206
per tenure month, +0.43 per support contact, −0.54 for autopay and −0.46 per product, plus a plan
effect of −0.15 to +0.2.

**Source facts** (`req/01_source_overview.json`, `pulse api process`):

| Metric | Value |
|---|---|
| Customers | 40,000 |
| Churn rate | 19.29% (7,716 closed; 32,284 open with no `end_date`) |
| Average monthly spend | $70.31 |
| Average tenure | 26.5 months |
| Average support contacts | 1.01 per year (1,487 frequent callers) |
| Autopay | 56.3% |
| Products per customer | 1.97 (mobile 36,205 · broadband 18,200 · protection 9,614 · tv 9,571 · landline 5,341) |
| Dormant accounts | 1,228 |
| Account dates | opened from 2014-08-13; closures 2024-07-01 to 2026-06-30 |

## 3. Methodology

```
customers.synth.json ──synth from-schema──► customers.pulse ──profile create──► profile.json + suggested_rules.json
                                                                                        │ (review: rules.json)
               synth from-profile --rules --synthetic-only --fidelity-report --fidelity-model --emit-spec
                                                                                        │
                                      fidelity.json  ◄──────────  twin.pulse (shared)    spec.json
                                                                                        │
             same Compose requests on customers.pulse vs twin.pulse, overlays = twin − source
```

* The profile is the only thing that leaves the secure zone and reaches the generator. It holds
  summary statistics, fitted model coefficients and correlations, and **no rows**.
* `synth from-profile --synthetic-only` writes the **shareable** file directly: only synthetic
  rows, the source's 13 fields, no `_synthetic` column. The source is still read, so the fidelity
  report compares the generated rows with it. `--emit-spec` writes the spec that generated the
  twin; `synth from-schema` on that spec at the same seed rebuilds `twin.pulse` byte for byte.
* `--fidelity-model` hands the fidelity report the agency's churn model (a `pulse api process`
  request). The report fits it on the source and on the twin and puts the two fits side by side in
  `utility.model_fits`.
* Every comparison is one Compose call: matching slots over `customers.pulse` and `twin.pulse`,
  with Compose overlays computing twin − source (percentage points) and twin ÷ source × 100.

All commands run from this directory. The full sequence is in `run.sh`. Responses land in `out/`.

---

## 4. Walkthrough

### Step 1: Generate the source table

```bash
pulse synth from-schema -s data/customers.synth.json -o customers.pulse --seed 20260630 --json
pulse api process -r req/01_source_overview.json --json
```

40,000 rows generated, 0 rejected. The overview figures are the table in section 2.

### Step 2: Capture the profile and let Pulse propose rules

```bash
pulse profile create -i customers.pulse -o synth/profile.json \
  --include-stats --include-correlations --conditional \
  --fit-models --residual-correlations --fit-shape \
  --suggest-rules synth/suggested_rules.json --seed 7 --json
```

* `--fit-models` fits one model per numeric field on the categorical levels, set options and the
  numeric fields declared before it, keeping each candidate that explains at least 1% of the
  field's variance. It fitted 7 models:

  | Field | R² | Predictors kept |
  |---|---|---|
  | `monthly_spend` | 0.911 | plan + every product |
  | `frequent_caller` | 0.345 | `support_contacts` |
  | `tenure_months` | 0.198 | contract + age |
  | `churned` (probit) | 0.171 | contract, tenure, every product, spend, support contacts, autopay |
  | `age` | 0.094 | contract + products |
  | `autopay` (probit) | 0.051 | contract + tenure |
  | `support_contacts` | — | none cleared the 1% floor (warned) |

  The churn model is the one that matters for this share. It captures every planted driver except
  plan, including the numeric ones (tenure and support contacts): `churned` is drawn from them at
  generation, after they are drawn.
* `--conditional` also captures the dependency between two options of the one set field: every
  `tv` holder holds `broadband` (9,571 of 9,571 rows).
* `--residual-correlations` captures how the models' residuals co-move.
* `--fit-shape` replaces a plain normal with a two-component mixture where that is a genuine
  improvement.

`--suggest-rules` scanned the same pass and proposed **two** candidates (`synth/suggested_rules.json`):

| Detector | Proposed rule | Evidence |
|---|---|---|
| gating | `{"when": "round(churned) == 0", "set_null": ["end_date"], "owns_nulls": true}` | `end_date` null rate 1.0 when churned = 0 (32,284 rows), 0.0 when churned = 1 (7,716 rows) |
| dependency | `{"set_expr": {"frequent_caller": "round(support_contacts) >= 4"}}` | one value per level of `support_contacts` on all 40,000 rows, 0 exceptions (thin support warned: level 11 has 1 row) |

These are business rules 1 and 4, found without being told. Rules 2 and 3 involve dates, an
`f64` and a set field, which the detectors do not examine. Rule 5 needs no rule: the profile
captured it.

### Step 3: Write the structural rules (`synth/rules.json`)

Both suggestions were accepted, and three rules were written by hand:

```json
[
  {"when": "round(churned) == 0", "set_null": ["end_date"], "owns_nulls": true},
  {"set_expr": {"frequent_caller": "round(support_contacts) >= 4"}},
  {"set_expr": {"tenure_months": "round(tenure_months)"}},
  {"set_expr": {"start_date": "(round(churned) == 1 ? end_date : 20634) - round(tenure_months * 30.4375)"}},
  {"when": "!products_held[\"mobile\"] && !products_held[\"broadband\"] && !products_held[\"tv\"] && !products_held[\"landline\"] && !products_held[\"protection\"]",
   "set": {"monthly_spend": 0}}
]
```

Rule 4 rebuilds `start_date` from the account's end (or the snapshot, epoch day 20634 =
2026-06-30) minus its tenure. That makes `end_date ≥ start_date` and tenure-date consistency true
by construction. Rule 3 first rounds tenure to the whole month the file stores (rules read the
pre-rounding value).

### Step 4: Generate the twin, with and without rules

```bash
# baseline: no structural rules
pulse synth from-profile -p synth/profile.json --source customers.pulse -o twin_norules.pulse \
  --rows 40000 --seed 11 --synthetic-only --fidelity-report synth/fidelity_norules.json \
  --emit-spec synth/spec_norules.json --json
# the shareable twin, with the reviewed rules and the agency's churn model
pulse synth from-profile -p synth/profile.json --source customers.pulse -o twin.pulse \
  --rows 40000 --seed 11 --rules synth/rules.json --synthetic-only \
  --fidelity-report synth/fidelity.json --fidelity-model req/12_churn_fidelity_model.json \
  --emit-spec synth/spec.json --json
```

40,000 rows generated, 0 rejected. Pulse states what it did *not* model. The 28 generation
warnings say which captured relationship won where two claimed the same field, for example
`field "products_held" option "tv" is already claimed by set-set pair (products_held.broadband ->
products_held.tv); dropping set-categorical pair (products_held.tv <- plan)` and `field
"frequent_caller" is already claimed by structural rule 1 (set_expr); dropping linear model`.
Pairs compete by association strength, so the strongest relationship wins.

**Fidelity report (`synth/fidelity.json`), 40,000 source vs 40,000 synthetic rows.** Each field
carries an effect size beside its test, so a large-n rejection of a trivial gap reads as trivial:

| Field | Test | Statistic | p-value | Effect size | Reading |
|---|---|---|---|---|---|
| region | χ² | 3.07 | 0.546 | Cramér's V 0.006 | indistinguishable |
| plan | χ² | 4.39 | 0.222 | V 0.007 | indistinguishable |
| contract | χ² | 1.19 | 0.552 | V 0.004 | indistinguishable |
| autopay | χ² | 0.24 | 0.623 | V 0.002 | indistinguishable |
| frequent_caller | χ² | 0.20 | 0.655 | V 0.002 | indistinguishable |
| churned | χ² | 6.29 | 0.012 | V 0.009 (very small) | rejects at n = 80,000; 18.60% vs 19.29% |
| support_contacts | KS | D = 0.005 | 0.797 | Cohen's d 0.009 | indistinguishable |
| age | KS | D = 0.020 | 1.1e−7 | d −0.012 (very small) | rejects; max CDF gap 2.0 points |
| monthly_spend | KS | D = 0.056 | 6.2e−54 | d −0.037 (very small) | rejects; max CDF gap 5.6 points |
| tenure_months | KS | D = 0.063 | 1.4e−69 | d 0.003 (very small) | rejects; max CDF gap 6.3 points, same mean |
| start_date | KS | D = 0.044 | 1.0e−34 | d −0.001 | follows tenure |
| end_date | KS | D = 0.017 | 0.206 | d −0.012 | indistinguishable (closed accounts) |

With 80,000 rows a KS test rejects for very small gaps, so read D and the effect size rather than
p. Every effect size is "very small". The headline table in step 7 shows what the gaps mean in
units.

| Set option | Source frequency | Synthetic frequency |
|---|---|---|
| mobile | 90.51% | 90.62% |
| broadband | 45.50% | 45.65% |
| tv | 23.93% | 23.95% |
| landline | 13.35% | 13.33% |
| protection | 24.04% | 24.09% |

The broadband → tv dependency is scored in `set_set_pairwise`: its joint frequency moves by 0.15 pp.

**Model recovery** compares each captured model with the same model refitted on the twin. For churn,
the contract and numeric effects come back closely on the probit-score scale: Monthly 1.016
captured vs 0.968 recovered, tenure −0.0110 vs −0.0108 per month, support contacts 0.237 vs 0.229,
autopay −0.291 vs −0.260. Two models are flagged. `churned` is flagged on one term, protection
(−0.340 captured vs −0.214 recovered). `monthly_spend` is flagged on mobile (0.623 vs 1.067); that
flag comes from rule 5 pinning dormant spend to exactly $0 (the run without rules does not flag
spend). Residual correlations: 3 of the 10 pairs among the modelled fields can be scored (mean
|Δρ| 0.002); the 7 that involve a 0/1 field are listed as unmeasured.

**Utility (`utility`)** compares the twin with the **source**, not with the captured model:

* `target_rates`: the mean of each modelled field per level of its strongest categorical
  predictor, source vs twin. All five are `preserved`: churn by contract (Monthly 27.4% vs 26.6%,
  One-Year 8.2% vs 7.7%, Two-Year 2.8% vs 2.7%; spread ratio 0.97), tenure by contract (1.04),
  spend by plan (1.00), autopay by contract (0.99) and age by contract (1.04).
* `model_fits`: the agency's churn logit from [`req/12_churn_fidelity_model.json`](req/12_churn_fidelity_model.json),
  refitted on both tables. **Pseudo-R² 0.1698 on the source, 0.1760 on the twin: `fit_ratio`
  1.037.** Step 7e has the coefficients.

**Disclosure (`disclosure`)**, on by default: 0 of 40,000 synthetic rows match a source row on all
13 columns (`exact_match_rate` 0). Over a seeded sample of 10,000 synthetic rows, the Gower distance
to the closest source record has a median of **0.0170** and a 5th percentile of **0.0045** (0 would be
a copy; 1 is as far apart as two rows can be). The twin without rules sits further from the source
(median 0.058), because its rows break the business logic the source obeys.

### Step 5: Check the shareable file is reproducible

```bash
pulse cohort inspect --json twin.pulse
pulse synth from-schema -s synth/spec.json -o twin_rerun.pulse --seed 11 --json
cmp twin.pulse twin_rerun.pulse    # byte-identical
```

`twin.pulse` has the source's 13 fields, 40,000 rows, no `_synthetic` column, and no source rows.
It is the file the fidelity report scored. Regenerating from the emitted spec and the same seed gives
a byte-identical file, so anyone holding the spec can reproduce or audit the release.

### Step 6: Business-rule violations (G2)

```bash
pulse api compose -r req/03_business_rule_violations.json --json
```

Each check is an `ATTR_FORMULA` that yields 1 on a violating row, summed with `AGG_SUM`, in three
Compose slots:

| Violation (rows) | Source | Twin, no rules | Twin, with rules |
|---|---|---|---|
| `end_date` before `start_date` | 0 | 602 | **0** |
| active (`churned = 0`) but has `end_date` | 0 | 6,125 | **0** |
| churned but no `end_date` | 0 | 6,272 | **0** |
| tenure disagrees with the dates by > ½ month | 0 | 39,720 | **0** |
| no products but spend > 0 | 0 | 1,245 | **0** |
| `frequent_caller` disagrees with `support_contacts` | 0 | 1,727 | **0** |
| tv without broadband | 0 | **0** | **0** |

Without rules, almost every synthetic row breaks at least one business rule. Statistical summaries
alone do not carry hard logic. With five rules, every check reaches zero. The tv ⇒ broadband
dependency needs no rule at all: it is two options of the same set field, and the profile captured
it, so even the twin without rules has no tv-only customer.

### Step 7: The agency's analysis, run on both tables (G3)

#### 7a. Headline metrics (`req/04_headline_metrics.json`, `req/04b_headline_twin_vs_source.json`)

Request 04 puts the figures side by side. Request 04b repeats each metric as a source/twin slot pair
with one all-customer bucket and adds `OVERLAY_INDEX_VS_REF` and `OVERLAY_DELTA_VS_REF`:

| Metric | Source | Twin | Index (source = 100) | Δ |
|---|---|---|---|---|
| Churn rate | 19.29% | 18.60% | 96.4 | −0.69 pp |
| Avg monthly spend | $70.31 | $69.08 | 98.2 | −$1.23 |
| Median monthly spend | $67.33 | $63.13 | 93.8 | −$4.20 |
| Avg tenure | 26.48 months | 26.58 months | 100.4 | +0.10 months |
| Median tenure | 16 months | 16 months | — | — |
| Avg age | 44.09 | 43.92 | 99.6 | −0.17 yr |
| Avg support contacts | 1.007 | 1.017 | 101.0 | +0.010 |
| Autopay | 56.27% | 56.10% | 99.7 | −0.17 pp |
| Products per customer | 1.973 | 1.976 | 100.2 | +0.003 |

#### 7b. Segments, with Compose overlays (`req/05_segments_twin_vs_source.json`)

Fourteen slots (seven source/twin pairs), each with one grouped aggregation, plus 14 overlays:
`OVERLAY_DELTA_VS_REF` (twin − source) and `OVERLAY_INDEX_VS_REF` (twin ÷ source × 100), both
`scope: "group"`, with the source slot as reference.

**Churn rate by contract**

| Contract | Source | Twin | Δ (pp) | Index |
|---|---|---|---|---|
| Monthly | 27.4% | 26.6% | −0.8 | 96.9 |
| One-Year | 8.2% | 7.7% | −0.5 | 94.1 |
| Two-Year | 2.8% | 2.7% | −0.1 | 97.4 |

**Churn rate by autopay and by plan**

| Segment | Source | Twin | Δ (pp) |
|---|---|---|---|
| autopay = 0 | 26.1% | 25.0% | −1.1 |
| autopay = 1 | 14.0% | 13.6% | −0.4 |
| Basic | 23.3% | 21.2% | −2.1 |
| Standard | 18.4% | 18.2% | −0.2 |
| Premium | 15.8% | 17.2% | +1.4 |
| Unlimited | 18.8% | 16.1% | −2.7 |

**Churn rate by support contacts and by tenure band.** The contacts slots list buckets 0–7
(`include`), so the rare 8+ levels, which only one table may have, cannot make the overlay's key
sets diverge.

| Support contacts | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Source | 13.6% | 18.8% | 24.9% | 32.2% | 34.9% | 45.3% | 57.8% |
| Twin | 13.3% | 17.6% | 24.2% | 29.0% | 37.1% | 47.0% | 56.8% |

| Tenure (months) | 0–12 | 12–24 | 24–36 | 36–48 | 48–60 | 60–72 | 72–84 | 84–96 |
|---|---|---|---|---|---|---|---|---|
| Source | 26.5% | 21.2% | 16.8% | 12.4% | 7.3% | 6.8% | 5.1% | 2.9% |
| Twin | 26.9% | 19.8% | 14.1% | 10.1% | 8.7% | 6.9% | 4.2% | 2.8% |

**Average monthly spend by plan and by product held** (spend is the best-modelled field, R² 0.911)

| Group | Source | Twin | Index |
|---|---|---|---|
| Basic | $50.40 | $49.68 | 98.6 |
| Standard | $65.16 | $63.89 | 98.1 |
| Premium | $84.91 | $83.58 | 98.4 |
| Unlimited | $104.55 | $103.58 | 99.1 |
| holds mobile | $71.84 | $71.54 | 99.6 |
| holds landline | $82.87 | $81.00 | 97.7 |
| holds broadband | $97.95 | $98.77 | 100.8 |
| holds protection | $84.10 | $82.92 | 98.6 |
| holds tv | $109.50 | $110.84 | 101.2 |

#### 7c. Plan × contract churn crosstab (`req/06_churn_crosstab_twin_vs_source.json`)

Two crosstab slots (cell = `AGG_AVERAGE churned`) and a cell-scope `OVERLAY_DELTA_VS_REF`:

| Plan | Source M / 1Y / 2Y | Twin M / 1Y / 2Y | Δ pp M / 1Y / 2Y |
|---|---|---|---|
| Basic | 32.9 / 10.5 / 3.4 | 29.6 / 10.1 / 3.4 | −3.3 / −0.4 / 0.0 |
| Standard | 26.3 / 7.2 / 2.3 | 26.2 / 6.8 / 3.0 | 0.0 / −0.4 / +0.7 |
| Premium | 22.4 / 6.6 / 2.6 | 24.8 / 7.0 / 1.8 | +2.4 / +0.4 / −0.8 |
| Unlimited | 26.9 / 8.3 / 3.0 | 23.5 / 6.0 / 1.9 | −3.4 / −2.3 / −1.1 |

The contract gradient survives in every row of the crosstab, at the source's size. The plan
differences within a contract are flattened: Basic's Monthly excess over Premium is 10.5 points in
the source and 4.8 in the twin.

#### 7d. Independence tests (`req/07_chisq_tests.json`)

Ten crosstab slots (field × churned counts), each with `OVERLAY_CHISQ_MATRIX`:

| Field × churned | Source χ² (df) | p | Twin χ² | p | Same conclusion at α = 0.05? |
|---|---|---|---|---|---|
| contract | 2,763.4 (2) | < 1e−300 | 2,712.7 | < 1e−300 | yes |
| autopay | 935.9 (1) | 1.5e−205 | 846.2 | 4.8e−186 | yes |
| frequent_caller | 442.8 (1) | 2.7e−98 | 602.1 | 5.8e−133 | yes |
| plan | 197.2 (3) | 1.7e−42 | 84.6 | 3.1e−18 | yes, at less than half the χ² |
| region (a field with no effect) | 1.46 (4) | 0.83 | 3.20 | 0.53 | yes |

#### 7e. Logistic churn model (`req/08_churn_logistic_model.json`)

`REG_GLM` (binomial, logit) on `FEAT_ONE_HOT(contract)` dummies plus `ATTR_SET_POPCOUNT(products_held)`.
The same model is the `--fidelity-model` request, so these figures are also in the fidelity report's
`utility.model_fits`:

| Predictor | Planted | Source β | p | Twin β | p | Twin ÷ source |
|---|---|---|---|---|---|---|
| contract One-Year | −1.2 | −1.181 | 3e−174 | −1.237 | 1e−182 | 1.05 |
| contract Two-Year | −2.1 | −2.104 | 2e−124 | −2.006 | 1e−110 | 0.95 |
| support_contacts (per contact) | +0.43 | +0.429 | 1e−307 | +0.425 | 2e−295 | 0.99 |
| autopay | −0.54 | −0.522 | 5e−76 | −0.500 | 9e−68 | 0.96 |
| tenure_months (per month) | −0.0206 | −0.0202 | 1e−123 | −0.0210 | 2e−142 | 1.04 |
| products held (per product) | −0.46 | −0.470 | 1e−230 | −0.491 | 1e−238 | 1.05 |
| age | 0 | +0.0024 | 0.015 | +0.0030 | 0.004 | — |
| McFadden pseudo-R² | | 0.170 | | 0.176 | | 1.04 |

Every driver keeps its sign and lands within 7% of its source size, and the source recovers the
planted coefficients. Age has no planted effect, yet its coefficient is under the 0.05 line in the
source (p = 0.015): a chance finding of the kind a 0.05 threshold allows, worth +0.07 on the logit
over a 30-year age gap. The twin reproduces it, as it should: a twin copies the source's quirks
along with its signal.

#### 7f. Correlation matrix (`req/09_correlation_matrix.json`)

`MAT_CORRELATION` over age, tenure, spend, support contacts, autopay and churned (`coerce: "binary"`):

| Pair | Source r | Twin r |
|---|---|---|
| tenure – churned | −0.190 | −0.203 |
| support contacts – churned | +0.175 | +0.176 |
| autopay – churned | −0.153 | −0.145 |
| spend – churned | −0.137 | −0.143 |
| tenure – autopay | +0.116 | +0.105 |
| age – tenure | +0.110 | +0.115 |
| age – autopay | +0.060 | +0.068 |
| age – churned | −0.061 | −0.062 |
| determinant | 0.869 | 0.865 |

Every pair keeps its sign and size, and the determinant is unchanged to two decimals.

### Step 8: Is any real customer in the twin? (G4)

The fidelity report's disclosure section (step 4) already answers this at the row level: no exact
copies, and a closest-record distance well above zero. Two joins check it the way an auditor would.

**Exact copies** (`req/10_exact_record_match.json`). Each slot runs an inner join to
`customers.pulse` on all 11 non-null scalar columns. A post-join `FILTER_EXPRESSION` then compares
`products_held` and the nullable `end_date`.

| Slot | Matching row pairs |
|---|---|
| control: source joined to itself | 40,002 (each row matches itself; one pair of source rows is identical) |
| twin joined to source | **0** |

**Coincidental profile matches** (`req/11_profile_match_vs_chance.json`). Spend is continuous, so
an exact match is unlikely by design. The stricter test drops spend and asks how often a synthetic
customer shares *every other attribute* with a real one. The baseline is how often two *different
real* customers do. `pulse cohort filter` splits each table into halves of about 20,000 rows by
the parity of spend in cents:

| Comparison | Left rows | Right rows | Pairs matching on all 12 non-spend fields |
|---|---|---|---|
| real half A vs real half B | 20,633 | 19,367 | 88 |
| twin half A vs real half B | 20,798 | 19,367 | **76** |

With halves of similar size, synthetic customers coincide with real profiles 76 times, against 88
times between two sets of real customers. The twin does not memorise records. Its matches are
common, low-detail profiles that also recur among real customers.

### Step 9: Why `--fit-models` matters (comparison)

The same pipeline with a profile captured **without** `--fit-models` (`--conditional` only) keeps
just one driver per field: the strongest captured pair. For churn that is contract, so the twin
keeps the contract effect and loses the rest. On that twin (`req/08b_…`) the churn model has
pseudo-R² **0.084** against the source's 0.170, and tenure, support contacts, autopay and products
held are all non-significant (p ≥ 0.31). Read the generation warnings before trusting a twin; each
dropped relationship is named there.

---

## 5. Findings

1. **Headline figures match.** Churn rate 19.29% vs 18.60% (index 96.4), average spend index 98.2,
   tenure 100.4, support contacts 101.0. Set-option frequencies agree to within 0.15 pp, categorical
   marginals are indistinguishable (χ² p = 0.22–0.66), and every field's effect size is "very small".
   The agency can describe the customer base from the twin.
2. **The churn analysis carries over, effect sizes included.** The agency's logistic model fits the
   twin as well as the source (pseudo-R² 0.176 vs 0.170, fit ratio 1.04), with every driver's
   coefficient within 7% of its source value and the same signs and significance. Churn by contract,
   autopay, support contacts and tenure band all land within a few points, and the correlation
   matrix keeps every pair's size. This needs `--fit-models`: without it the twin keeps contract only
   (pseudo-R² 0.084).
3. **One effect is attenuated: plan.** The plan × churn χ² falls from 197 to 85, and within a
   contract the twin's plan differences are about half the source's. The captured churn model does
   not carry plan as a term; plan reaches churn only through products and spend. Quote plan effects
   from the source, not the twin.
4. **Structural rules turn an implausible twin into a coherent one.** Without rules, 39,720 of
   40,000 synthetic rows break the tenure/date logic, and 6,125 + 6,272 break the churn/end-date
   link. Five rules (two proposed by Pulse) bring every check to zero. The tv ⇒ broadband
   dependency needs no rule: the profile captures dependencies between options of one set field.
5. **No real record leaks.** There are 0 exact matches, a median Gower distance to the closest real
   record of 0.017, and 76 profile-level coincidences against a real-to-real baseline of 88. The
   release is reproducible byte for byte from `spec.json` and seed 11.

**Implications for the data-sharing agreement**

* Share `twin.pulse` together with this kind of report: the fidelity report with its utility and
  disclosure sections, the violation counts and a side-by-side of the agreed analyses. On this data
  the agency can use the twin for driver rankings and for the size of the contract, tenure, support,
  autopay and product effects. Run plan-level estimates on the source inside the secure zone, using
  the same request files, which run unchanged against `customers.pulse`.
* Review `synth/profile.json` and `synth/spec.json` before release. They hold no rows, but they do
  carry exact minima, maxima and category frequencies. This pipeline adds no formal privacy
  guarantee (such as differential-privacy noise). The disclosure metrics and the checks in step 8
  are evidence, not proof.
* Keep rules under version control next to the spec. They encode the business logic the agency
  would otherwise "discover" as data-quality errors.

## 6. Pulse features used

| Feature | Where |
|---|---|
| `pulse synth from-schema` with rule draws (`bernoulli()`, `uniform()`) and `"output": false` helper fields | Step 1 (source) |
| `pulse profile create` with `--conditional --fit-models --residual-correlations --fit-shape` (numeric predictors, within-set dependencies) | Step 2 |
| `--suggest-rules` (gating and dependency detectors) | Step 2 |
| Structural rules (`set_null` + `owns_nulls`, `set_expr`, `set`, `when`) via `--rules` | Steps 3–4 |
| `pulse synth from-profile` with `--synthetic-only`, `--fidelity-report`, `--fidelity-model` and `--emit-spec` | Step 4 |
| Fidelity report: per-field effect sizes, `utility` (`target_rates`, `model_fits`), `disclosure` | Step 4 |
| `pulse synth from-schema` for seed-deterministic, byte-identical regeneration | Step 5 |
| `pulse api compose` with labelled slots | Steps 6–8 |
| `OVERLAY_DELTA_VS_REF`, `OVERLAY_INDEX_VS_REF` (group and cell scope) | Steps 7b, 7c |
| Crosstab with margins + `OVERLAY_CHISQ_MATRIX` | Steps 7c, 7d |
| `ATTR_FORMULA`, `ATTR_SET_POPCOUNT`, `FEAT_ONE_HOT` | Steps 6, 7e |
| `AGG_AVERAGE`, `AGG_MEDIAN`, `AGG_SUM`, `AGG_SET_FREQUENCY`, `AGG_NULL_COUNT` | Steps 1, 7a |
| `GROUP_CATEGORY` (with `include`), `GROUP_RANGE`, `GROUP_SET_PER_ELEMENT` | Step 7b |
| `REG_GLM` (binomial / logit) | Steps 4, 7e |
| `MAT_CORRELATION` with a binary-coerced vector | Step 7f |
| Inner hash join (`joins`) + `FILTER_EXPRESSION` | Step 8 |
| `pulse cohort filter`, `pulse cohort inspect` | Steps 5, 8 |

To reproduce every number above, see [REPRODUCE.md](REPRODUCE.md).
