# Pricing-page A/B test: an honest readout

A fictional SaaS company redesigned its pricing page and ran a four-week A/B test on 40,000 users. This
walkthrough reads out the test from start to finish with Pulse. It covers the checks that decide whether
the test can be trusted at all, a six-metric scorecard with multiple-comparison correction, a skewed
revenue metric, regression adjustment on a pre-period covariate, and a segment breakdown. It ends with
the whole readout as one Compose call.

Every number below was returned by a Pulse request in [`req/`](req/), run against a cohort that Pulse
generated from [`data/ab_test.synth.json`](data/ab_test.synth.json). [`REPRODUCE.md`](REPRODUCE.md)
has the commands and the expected values.

> **Pulse version.** The spec keeps its working columns out of the file with `"output": false` helper
> fields and lets rule-determined categoricals omit their sampler. Both arrive in the Pulse alpha after
> v1.0.0-alpha.33 (the synth-realism work, roadmap U52). The casebook `Makefile` still pins alpha.33;
> build Pulse from a checkout that has U52 until the pin moves (see [`REPRODUCE.md`](REPRODUCE.md)).

## The business question

> Should we ship the redesigned pricing page (`new_page`) in place of the current one (`old_page`)?

Six metrics were pre-registered, all measured per randomized user over a 28–30 day window:

| Metric | Field | Type | Test |
|---|---|---|---|
| Trial start | `trial_started` | yes/no | two-proportion z |
| Paid conversion | `paid_converted` | yes/no | two-proportion z |
| Revenue per user (USD) | `revenue` | continuous; zero for most users, long right tail | Welch t (Mann-Whitney U as a sensitivity check) |
| Pages viewed | `pages_viewed` | count | Welch t; regression-adjusted on `prior_sessions` |
| Days to convert | `days_to_convert` | continuous; payers only (null otherwise) | Welch t |
| 30-day retention | `retained_30d` | yes/no | two-proportion z |

Decision rule: a metric counts as moved only if its Holm-corrected p-value across the six metrics is
below 0.05.

## The dataset

The cohort is synthetic. `pulse synth from-schema` builds it from a spec with marginal distributions and
structural rules that plant every effect exactly (see below). A fixed seed (`--seed 2026`) makes the file
byte-identical on every run. It has 40,000 rows, one per user, and 15 fields:

| Field | Pulse type | What it is |
|---|---|---|
| `user_id` | `u32` | Pseudonymous id (100001…140000) |
| `arm` | `categorical_u8` | `old_page` (control) or `new_page` (variant), randomized in matched pairs: exactly 50/50 |
| `is_variant` | `u8` | 1 if `new_page`, else 0 (numeric copy of `arm` for regression) |
| `assign_week` | `categorical_u8` | `w1`…`w4`, week of first assignment |
| `device` | `categorical_u8` | desktop 50% / mobile 40% / tablet 10% |
| `plan_tier` | `categorical_u8` | individual 55% / team 33% / business 12% |
| `region` | `categorical_u8` | NA 40% / EMEA 30% / APAC 20% / LATAM 10% |
| `user_type` | `categorical_u8` | new 60% / returning 40% |
| `prior_sessions` | `u16` | **Pre-period covariate**: sessions in the 30 days before assignment (normal, mean 10, sd 4) |
| `pages_viewed` | `u16` | Pages viewed after assignment: 8 + 0.78 × (`prior_sessions` − 10) + noise (sd 2.5), so mean 8, sd 4 and correlation 0.78 with `prior_sessions` |
| `trial_started` | `categorical_u8` | `yes` / `no` |
| `paid_converted` | `categorical_u8` | `yes` / `no` (only trial starters can convert) |
| `revenue` | `f64` | First-invoice revenue in USD; 0 for non-payers |
| `days_to_convert` | `f32`, nullable | Days from assignment to paid conversion; null for non-payers |
| `retained_30d` | `categorical_u8` | `yes` / `no` |

### Ground truth built into the generator

The rules in the spec plant these effects, so the readout can be checked against them:

| Metric | Planted truth |
|---|---|
| Trial start | `old_page` 10.0%. `new_page`: desktop 10.3%, **mobile 13.0%**, tablet 10.0%, which is about +1.35 pp overall. The lift is real and concentrated on mobile. |
| Paid conversion | 30% of trial starters in both arms, so the trial lift carries through as about +0.4 pp. |
| Revenue | `new_page` payers book 15% less per invoice (`order_value × 0.85`). More payers, smaller invoices. |
| Pages viewed | +0.07 pages for `new_page`. Real but tiny. |
| Days to convert, retention | No effect. |
| Plan tier, region, user type | No true difference in effect. Any segment "win" on these is the overall lift or noise. |

**The effects are planted exactly, so no seed was searched for.** Three design choices make each
realized effect equal its planted value, whatever the seed:

* **Matched-pair randomization.** Users arrive in consecutive pairs that share their device, their
  prior sessions and the noise in their page views; one of each pair gets each page. The arms are
  therefore exactly 20,000 each, identical on device and prior activity, and the page-view difference
  is the planted +0.07 up to the rounding to whole pages. Assignment week, plan, region and user type
  are still drawn independently, so their balance checks carry ordinary randomization noise.
* **Systematic allocation of the binary outcomes.** Within each arm × device cell, trial starts are
  allocated in arrival order at the cell's planted rate: a running count in an `"output": false`
  helper field (read back with `lag()`) gives each user its position k, and the user starts a trial
  when ⌊k × rate + ½⌋ steps up. Each cell's trial rate is then its planted rate to within one user. Paid conversion takes exactly 30% of each arm's trial starters the same way, and retention
  spreads each user's planted probability over the arm with a running sum.
* **Helpers stay out of the file.** The counters, running sums, the shared page-view noise and the
  invoice value a payer would book are `"output": false` fields: the rules read them, the cohort never
  carries them.

What stays random is what should: who is in which segment, invoice sizes and days to convert. So the
segment-level lifts, the revenue figures and the days-to-convert test carry real noise, and a different
seed moves them while leaving every planted lift where it is. With seeds 1, 7 and 99 the trial lift is
+1.35 to +1.36 pp and paid conversion +0.40 to +0.41 pp, with the same Holm verdicts.

The binary outcomes are categorical `yes`/`no` rather than `packed_bool`, because the two-proportion
z-test in this build accepts only categorical fields.

## Walkthrough

All commands run from this directory with `pulse` on the PATH (see [`REPRODUCE.md`](REPRODUCE.md)).
Every request names its cohort as `{"filename": "ab_test.pulse", "data_dir": "."}`.

### Step 0 — Generate the cohorts

```bash
pulse synth from-schema -s data/ab_test.synth.json -o ab_test.pulse --seed 2026
pulse cohort inspect ab_test.pulse
```

Excerpt of the spec, showing how the treatment effects are encoded as structural rules (the
`n_cell` and `p_trial` helpers hold the user's position in its arm × device cell and that cell's
planted rate):

```json
"rules": [
  {"when": "row() % 2 == 1", "set_expr": {"arm": "lag(\"arm\", 1) == \"old_page\" ? \"new_page\" : \"old_page\"",
                                          "device": "lag(\"device\", 1)", "prior_sessions": "lag(\"prior_sessions\", 1)",
                                          "pages_noise": "lag(\"pages_noise\", 1)"}},
  {"set_expr": {"pages_viewed": "max(0, min(60, round(8 + 0.78 * (prior_sessions - 10) + pages_noise + (arm == \"new_page\" ? 0.07 : 0))))"}},
  {"set_expr": {"p_trial": "arm == \"old_page\" ? 0.100 : (device == \"mobile\" ? 0.130 : (device == \"desktop\" ? 0.103 : 0.100))"}},
  {"set_expr": {"trial_started": "floor(n_cell * p_trial + 0.5) > floor((n_cell - 1) * p_trial + 0.5) ? \"yes\" : \"no\""}},
  {"set_expr": {"revenue": "paid_converted == \"yes\" ? (arm == \"new_page\" ? order_value * 0.85 : order_value) : 0"}},
  {"when": "paid_converted == \"no\"", "set_null": ["days_to_convert"]}
]
```

Result: `rows_generated: 40000`, `rows_rejected: 0`, no warnings. The cohort file is 1,281,594 bytes.
The planned 50/50 split needs no second cohort: Step 2 states it as a parameter of the test.

### Step 1 — Predict before running

`pulse api predict` reads only the header and schema, never the records. It validates the request,
reports whether the request can stream in one pass, and counts the p-values the request will produce.
[`req/01_predict_battery.json`](req/01_predict_battery.json) is the six-metric battery plus the
Mann-Whitney revenue test, with no correction. It has tests and no aggregation at all, and predict
accepts that:

```bash
pulse api predict -r req/01_predict_battery.json --json
pulse api predict -r req/04_metric_battery.json  --json   # same battery with a Holm block, no Mann-Whitney
```

| Request | `valid` | `streamable` | `streamable_reasons` | `p_values` |
|---|---|---|---|---|
| 01 (7 tests, no correction) | true | **false** | `test TEST_MANN_WHITNEY_U is not streamable` | total 7, **uncorrected 7**, threshold 10 |
| 04 (6 tests, `holm` block) | true | **true** | — | total 6, **uncorrected 0** |

Two practical takeaways. The rank test forces a buffered pass over all values, while every other test
in the battery streams on running counts and moments. Predict also tracks how many p-values would go
out uncorrected. At 10 or more with no `multiplicity` block it raises the `PULSE_ADVISORY_MANY_TESTS`
advisory; this battery stays under that threshold, so no advisory fires.

### Step 2 — Sample-ratio mismatch (SRM): does the split match the design?

The planned 50/50 split is a parameter of a `TEST_CHISQ` goodness-of-fit test: `params.expected` maps
each `arm` value to its planned share. With no `cols`, the test compares the observed assignment counts
with those shares. It is one test in a plain process request, with no aggregation and no second cohort
([`req/02_srm_gof.json`](req/02_srm_gof.json)):

```json
{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "."},
  "tests": [
    {"type": "TEST_CHISQ", "rows": "arm", "label": "srm_vs_50_50",
     "params": {"expected": {"new_page": 0.5, "old_page": 0.5}}}
  ]
}
```

```bash
pulse api process -r req/02_srm_gof.json --json
```

| Arm | Users | Expected under 50/50 |
|---|---|---|
| new_page | 20,000 | 20,000 |
| old_page | 20,000 | 20,000 |

**χ² = 0, df = 1, p = 1. No sample-ratio mismatch.** Pair randomization makes the split exact here, so
the check passes trivially. On a live test, where assignment logs can drop or duplicate users, it is
the first check to run: a gap of a few hundred users on 40,000 is ordinary noise, a gap of a few
thousand is a broken pipeline. A one-sample `TEST_PROP_Z` on `arm` with `params.success = "new_page"` and
`params.p0 = 0.5` asks the same question for a two-arm split.

### Step 3 — SRM over time and covariate balance

The split should also hold week by week, and randomization should balance the pre-treatment attributes.
[`req/03_srm_by_week_and_balance.json`](req/03_srm_by_week_and_balance.json) runs five χ² independence
tests of `arm` against each attribute and a Welch t-test on the pre-period covariate. A `holm` block
corrects across the six:

```json
{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "."},
  "multiplicity": {"method": "holm", "family": "request"},
  "tests": [
    {"type": "TEST_CHISQ", "rows": "arm", "cols": "assign_week", "label": "srm_by_week"},
    {"type": "TEST_CHISQ", "rows": "arm", "cols": "device", "label": "balance_device"},
    {"type": "TEST_CHISQ", "rows": "arm", "cols": "plan_tier", "label": "balance_plan_tier"},
    {"type": "TEST_CHISQ", "rows": "arm", "cols": "region", "label": "balance_region"},
    {"type": "TEST_CHISQ", "rows": "arm", "cols": "user_type", "label": "balance_user_type"},
    {"type": "TEST_WELCH", "field": "prior_sessions", "split_by": "arm", "label": "balance_prior_sessions",
     "params": {"reference": "old_page"}}
  ]
}
```

| Check | Statistic | df | p | Holm p |
|---|---|---|---|---|
| arm × assign_week (SRM by week) | χ² = 1.50 | 3 | 0.682 | 1.000 |
| arm × device | χ² = 0 | 2 | 1.000 | 1.000 |
| arm × plan_tier | χ² = 0.52 | 2 | 0.770 | 1.000 |
| arm × region | χ² = 2.66 | 3 | 0.446 | 1.000 |
| arm × user_type | χ² = 0.13 | 1 | 0.720 | 1.000 |
| prior_sessions, Welch | t = 0 | 39,998 | 1.000 | 1.000 |

Weekly assignment counts (from the contingency table in the response):

| | w1 | w2 | w3 | w4 |
|---|---|---|---|---|
| new_page | 5,044 | 5,058 | 4,888 | 5,010 |
| old_page | 4,982 | 5,078 | 4,979 | 4,961 |

**Every guardrail passes.** The test can be trusted, and the arms are comparable on device, plan,
region, user type and prior activity. Device and prior sessions balance exactly, because the pairs are
matched on them; the other four checks show what independent randomization looks like.

### Step 4 — The six-metric scorecard, raw and Holm-corrected

[`req/04_metric_battery.json`](req/04_metric_battery.json) runs all six pre-registered tests in one
streaming pass, with no aggregation. The `multiplicity` block adds `p_adjusted` and `significant_adjusted` next to each raw
p-value, which stays unchanged:

```json
{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "."},
  "multiplicity": {"method": "holm", "family": "request"},
  "tests": [
    {"type": "TEST_PROP_Z", "field": "trial_started", "split_by": "arm", "label": "trial_start",
     "params": {"success": "yes", "reference": "old_page"}},
    {"type": "TEST_PROP_Z", "field": "paid_converted", "split_by": "arm", "label": "paid_conversion",
     "params": {"success": "yes", "reference": "old_page"}},
    {"type": "TEST_WELCH", "field": "revenue", "split_by": "arm", "label": "revenue_per_user",
     "params": {"reference": "old_page"}},
    {"type": "TEST_WELCH", "field": "pages_viewed", "split_by": "arm", "label": "pages_viewed",
     "params": {"reference": "old_page"}},
    {"type": "TEST_WELCH", "field": "days_to_convert", "split_by": "arm", "label": "days_to_convert",
     "params": {"reference": "old_page"}},
    {"type": "TEST_PROP_Z", "field": "retained_30d", "split_by": "arm", "label": "retention_30d",
     "params": {"success": "yes", "reference": "old_page"}}
  ]
}
```

Every two-group test sets `params.reference` to `old_page`, so each lift reads `new_page − old_page`
by declaration, not by the alphabetical order of the group names. A positive number means the redesign
is higher; no figure below is sign-flipped.

| Metric | new_page | old_page | Diff (new − old) | 95% CI | Raw p | Holm p (m = 6) | Verdict |
|---|---|---|---|---|---|---|---|
| Trial start | 11.36% (2,271 / 20,000) | 10.00% (2,000 / 20,000) | **+1.36 pp** | +0.75 to +1.96 pp | 0.0000115 | **0.000069** | **significant** |
| Paid conversion | 3.41% (681) | 3.00% (600) | +0.41 pp | +0.06 to +0.75 pp | **0.021** | **0.107** | not significant after correction |
| Revenue per user | $4.35 | $4.15 | +$0.20 | −$0.48 to +$0.88 | 0.569 | 1.000 | no difference |
| Pages viewed | 8.127 | 8.059 | +0.068 pages | −0.009 to +0.145 | 0.084 | 0.335 | no difference without the covariate (Step 8) |
| Days to convert (payers) | 8.93 days (n = 681) | 8.88 days (n = 600) | +0.05 days | −0.91 to +1.00 | 0.924 | 1.000 | no difference |
| 30-day retention | 42.52% | 42.52% | 0.00 pp | −0.97 to +0.97 pp | 1.000 | 1.000 | no difference |

Two metrics clear p < 0.05 uncorrected. **Only trial start survives the correction.** Paid conversion
is the metric a growth team would most like to announce, and its uncorrected p of 0.021 becomes 0.107.
Holm ranks it second of six, so its p-value is multiplied by 5 (0.0214 × 5 = 0.107). The planted page-view
lift of +0.07 is real but too small for the raw test to see (p = 0.084). The days-to-convert test uses
only the 1,281 payers, because the null rows for non-payers drop out of the test.

### Step 5 — Revenue is mostly zeros with a long tail

Before testing revenue, look at its shape. [`req/05_revenue_shape.compose.json`](req/05_revenue_shape.compose.json)
is a two-slot Compose request: all users grouped by arm, and paying users only (`FILTER_INCLUDE
paid_converted = yes`) grouped by arm:

```bash
pulse api compose -r req/05_revenue_shape.compose.json --json
```

| Arm | Users | Mean | SD | Median | Skewness | Max |
|---|---|---|---|---|---|---|
| new_page | 20,000 | $4.35 | $35.38 | $0 | 17.1 | $1,671 |
| old_page | 20,000 | $4.15 | $34.01 | $0 | 14.3 | $1,226 |

| Arm (payers only) | Payers | Revenue per payer | Median | p95 |
|---|---|---|---|---|
| new_page | 681 | $127.74 | $88.06 | $359.99 |
| old_page | 600 | $138.40 | $93.57 | $419.89 |

The redesign brings in **81 more payers** who book **smaller first invoices**: $128 against $138 per
payer, and a median of $88 against $94. The planted cut is 15%; invoice sizes are the one input drawn at
random per payer, so the realized cut is 8% and noisy (the payer means have standard errors of about $6).

### Step 6 — Revenue: the t-test and the rank test disagree

[`req/06_revenue_tests.json`](req/06_revenue_tests.json):

```json
"tests": [
  {"type": "TEST_WELCH", "field": "revenue", "split_by": "arm", "label": "revenue_welch"},
  {"type": "TEST_MANN_WHITNEY_U", "field": "revenue", "split_by": "arm", "label": "revenue_mann_whitney"}
]
```

| Test | Statistic | p | Effect size | Reading |
|---|---|---|---|---|
| Welch t (difference in means) | t = +0.57 | **0.569** | Cohen's d = +0.006 | mean revenue per user is unchanged; the CI spans −$0.48 to +$0.88 |
| Mann-Whitney U (rank) | z = +2.26 | **0.024** | rank-biserial = +0.004 (new_page tends higher) | "new_page users tend to rank higher" |

Pulse attaches `PULSE_TEST_TIES_DOMINATE` to the Mann-Whitney result: "≥ 50% of values are tied; the
asymptotic p-value is unreliable." That is the key to reading the disagreement. About 97% of users
have revenue exactly 0, so the rank test is mostly asking whether more users moved from zero to
non-zero. That is the paid-conversion question again, and both give p ≈ 0.021–0.024. It says nothing
about dollars. The Welch test answers the dollar question, and the extra payers' smaller invoices
offset each other: no detectable change in revenue per user.

**Read revenue from the Welch test and the payer breakdown, not the rank test.** Do not report the
rank test's p = 0.024 as "revenue went up".

### Step 7 — Regression adjustment with the pre-period covariate

`pages_viewed` is strongly predicted by `prior_sessions`, which was measured before assignment.
Regressing the metric on the treatment indicator and the covariate removes that predictable variance
from the treatment estimate without biasing it. [`req/07_regression_adjustment.json`](req/07_regression_adjustment.json)
is a regression-only request:

```json
{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "."},
  "regressions": [
    {"type": "REG_OLS", "name": "pages_unadjusted", "target": "pages_viewed", "predictors": ["is_variant"]},
    {"type": "REG_OLS", "name": "pages_adjusted",   "target": "pages_viewed", "predictors": ["is_variant", "prior_sessions"]}
  ]
}
```

| Model | Treatment effect (pages) | Std. error | 95% CI | p | R² |
|---|---|---|---|---|---|
| `pages ~ is_variant` | +0.0680 | 0.0393 | −0.009 to +0.145 | 0.0839 | 0.0001 |
| `pages ~ is_variant + prior_sessions` | +0.0680 | **0.0247** | **+0.020 to +0.116** | **0.0059** | 0.605 |

Adding the covariate cuts the standard error of the treatment effect from 0.0393 to 0.0247 pages, about
37% smaller. The estimate does not move, because the pairs are matched on prior sessions: the arms have
the same covariate mean, so the adjustment removes noise and no imbalance. The regression's `ci_lower` / `ci_upper` are Student-t intervals on the residual degrees
of freedom (39,997 here), the same inference the p-values use.

### Step 8 — The same adjustment as a CUPED test, in one call

CUPED subtracts the part of the metric that the pre-period covariate predicts. A mean test does it
itself when it is given `params.covariate`: Pulse estimates the slope θ from the data, adjusts each value
by `θ·(covariate − mean)`, and tests the adjusted metric. No separate regression to fetch θ, and no
hand-built formula attribute ([`req/08_cuped_welch.json`](req/08_cuped_welch.json)):

```json
"tests": [
  {"type": "TEST_WELCH", "field": "pages_viewed", "split_by": "arm", "label": "pages_raw",
   "params": {"reference": "old_page"}},
  {"type": "TEST_WELCH", "field": "pages_viewed", "split_by": "arm", "label": "pages_cuped",
   "params": {"reference": "old_page", "covariate": "prior_sessions"}}
]
```

| Version | Diff (pages) | 95% CI | Per-arm variance (new / old) | p |
|---|---|---|---|---|
| Raw | +0.068 | −0.009 to +0.145 | 15.50 / 15.45 | 0.0839 |
| CUPED-adjusted | +0.068 | **+0.020 to +0.116** | 6.12 / 6.10 | **0.0059** |

The adjusted result carries its own working in `details`: `theta` = **0.7672**, `covariate_mean` =
10.0347, `variance_reduction` = **0.605**, and `diff_unadjusted` = 0.068 beside the adjusted `diff`.
They match the Step 7 regression: the same +0.0680 estimate, the same interval, the same p.

**The covariate cuts the per-arm variance by 60% and narrows the 95% CI from 0.154 to 0.097 pages
wide.** The estimate stays at +0.068 pages (the planted truth is +0.07; the rest is rounding to whole
pages). Only the uncertainty shrinks. This is the legitimate way to recover the power that the correction in Step 4 took
away. Pre-register the covariate before the test starts; do not pick it after seeing results.

### Step 9 — Segments: most "wins" vanish after correction

A test can run once per group. Naming a segment variable in `groups` makes Pulse run the same
`TEST_PROP_Z` on each group's own records, and each result carries its `group_key`. Each segment
variable is its own question (device, plan tier, region and user type are marginal splits, not a
product), so the readout is four grouped requests in one Compose call instead of twelve filtered slots.
All 12 segment tests (3 + 3 + 4 + 2) still share one Holm family (`"family": "compose"`), so the
correction is computed over the same 12 p-values as before.
[`req/09_segments.compose.json`](req/09_segments.compose.json), with one of its four slots shown:

```json
{
  "multiplicity": {"method": "holm", "family": "compose"},
  "requests": [
    {
      "label": "by device",
      "cohort": {"filename": "ab_test.pulse", "data_dir": "."},
      "groups": [{"type": "GROUP_CATEGORY", "field": "device"}],
      "aggregations": [{"type": "AGG_COUNT", "field": "user_id", "label": "users"}],
      "tests": [{"type": "TEST_PROP_Z", "field": "trial_started", "split_by": "arm",
                 "label": "trial_start_lift", "params": {"success": "yes", "reference": "old_page"}}]
    }
  ]
}
```

`tests` in a grouped slot are group-major within each test: slot `by device` returns `data` rows for
desktop, mobile and tablet, and `tests[0..2]` carry `group_key` `["desktop"]`, `["mobile"]`,
`["tablet"]`. A test cannot `split_by` the grouper itself (`PULSE_TEST_SPLIT_GROUPS_LT_2`); the arm
split is a different field, so this is fine. Every per-segment figure below is identical to the
twelve-slot version of this step, which was run against the same cohort and compared test by test
(statistic, p, CI, effect size, Holm p, `m = 12`). Slots come back in request order and groups in
dictionary order, so the plan and region rows are listed alphabetically in `out/09_segments.json`.

A single request for all four variables would need a banner layout (one request, several marginal
splits). That form is the survey-tables work in pulse roadmap unit
[U47](https://github.com/frankbardon/pulse/blob/main/docs/roadmap/units/U47-survey-tables.md); until it
lands, one grouped slot per variable is the shortest form.

Trial-start lift by segment:

| Segment | Users | new_page | old_page | Lift | 95% CI | Raw p | Holm p (m = 12) |
|---|---|---|---|---|---|---|---|
| device = desktop | 19,822 | 10.3% | 10.0% | +0.30 pp | −0.54 to +1.14 | 0.480 | 1.000 |
| **device = mobile** | 16,058 | 13.0% | 10.0% | **+3.00 pp** | +2.02 to +3.99 | 2.5 × 10⁻⁹ | **3.0 × 10⁻⁸** ✔ |
| device = tablet | 4,120 | 10.0% | 10.0% | 0.00 pp | −1.83 to +1.83 | 1.000 | 1.000 |
| plan = individual | 21,864 | 11.4% | 10.2% | +1.12 pp | +0.30 to +1.95 | **0.0074** | 0.059 |
| plan = team | 13,256 | 11.2% | 9.9% | +1.35 pp | +0.30 to +2.39 | **0.012** | 0.070 |
| plan = business | 4,880 | 11.7% | 9.3% | +2.41 pp | +0.69 to +4.13 | **0.0061** | 0.055 |
| **region = NA** | 15,994 | 11.8% | 9.9% | +1.82 pp | +0.86 to +2.79 | **0.00021** | **0.0023** ✔ |
| region = EMEA | 11,919 | 11.0% | 9.8% | +1.17 pp | +0.08 to +2.26 | **0.036** | 0.182 |
| region = APAC | 8,014 | 10.8% | 10.3% | +0.47 pp | −0.88 to +1.82 | 0.493 | 1.000 |
| region = LATAM | 4,073 | 12.0% | 10.2% | +1.83 pp | −0.10 to +3.76 | 0.062 | 0.250 |
| **user = new** | 24,167 | 11.5% | 10.1% | +1.41 pp | +0.63 to +2.19 | **0.00039** | **0.0039** ✔ |
| user = returning | 15,833 | 11.2% | 9.9% | +1.27 pp | +0.31 to +2.22 | **0.0094** | 0.066 |

The device rows are the planted cell rates exactly (desktop 10.3%, mobile 13.0%, tablet 10.0% against
10.0%). Eight of twelve segments "win" uncorrected. After Holm correction across the 12 tests, three
remain: mobile, overwhelmingly, NA and new users. A segment lift that survives correction is still not
evidence that the segment *differs*. NA's lift could simply be the overall lift, which every large
segment carries. That calls for a different test.

### Step 10 — Heterogeneity: is the effect really different in a segment?

To ask whether the lift *differs* in a segment, fit a linear probability model with a treatment ×
segment interaction. The 0/1 columns are built in-request with `ATTR_FORMULA`
([`req/10_heterogeneity.json`](req/10_heterogeneity.json)):

```json
"attributes": [
  {"type": "ATTR_FORMULA", "field": "trial_started", "label": "trial", "expression": "trial_started == \"yes\" ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "device", "label": "mobile", "expression": "device == \"mobile\" ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "device", "label": "new_page_x_mobile", "expression": "(device == \"mobile\" && arm == \"new_page\") ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "region", "label": "na", "expression": "region == \"NA\" ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "region", "label": "new_page_x_na", "expression": "(region == \"NA\" && arm == \"new_page\") ? 1 : 0"}
],
"multiplicity": {"method": "holm", "family": "request"},
"regressions": [
  {"type": "REG_OLS", "name": "trial_by_mobile", "target": "trial", "predictors": ["is_variant", "mobile", "new_page_x_mobile"],
   "multiplicity": {"method": "holm", "coefficients": ["new_page_x_mobile"]}},
  {"type": "REG_OLS", "name": "trial_by_na",     "target": "trial", "predictors": ["is_variant", "na", "new_page_x_na"],
   "multiplicity": {"method": "holm", "coefficients": ["new_page_x_na"]}}
]
```

The request-level `multiplicity` block sets the family, and each regression's own `multiplicity` block
makes its named coefficient a member of it. The two interaction hypotheses form one Holm family
(`m = 2`); the other coefficients stay uncorrected and are not in the family.

| Model | Lift outside the segment (`is_variant`) | Extra lift inside the segment (interaction) | SE | 95% CI | Interaction p | Holm p (m = 2) |
|---|---|---|---|---|---|---|
| mobile vs. not mobile | +0.25 pp (p = 0.530) | **+2.75 pp** | 0.63 pp | +1.52 to +3.99 pp | **1.2 × 10⁻⁵** | **2.5 × 10⁻⁵** |
| NA vs. not NA | +1.05 pp (p = 0.0087) | +0.78 pp | 0.63 pp | −0.46 to +2.01 pp | 0.217 | 0.217 |

**The redesign works on mobile and does almost nothing elsewhere.** Outside mobile the lift is
+0.25 pp and indistinguishable from zero (the planted desktop lift is +0.3 pp on desktop, none on
tablet); on mobile it is 2.75 pp higher, which is the planted 13.0% − 10.0% less that small desktop
lift. NA's lift is not distinguishable from other regions' (p = 0.22). It survived Step 9 only because
NA is the largest region and carries its share of mobile users. Plan tier, region and user type show no
real heterogeneity, which matches the planted truth. The mobile interaction survives the two-hypothesis
Holm correction with room to spare (2.5 × 10⁻⁵).

### Step 11 — The whole readout in one Compose call

[`req/11_readout.compose.json`](req/11_readout.compose.json) bundles the guardrails (the SRM goodness-of-fit
test, kept out of the correction, plus the balance checks), the final scorecard (with the pre-registered
CUPED version of pages viewed in place of the raw metric), the revenue rank sensitivity check and the
regression adjustment into four labelled slots. No slot has an aggregation. Each slot keeps its own Holm
family:

```bash
pulse api predict-compose -r req/11_readout.compose.json --json   # valid: true
pulse api compose -r req/11_readout.compose.json --json
pulse api compose -r req/11_readout.compose.json --json --parallel 0   # same bytes in data
```

Final scorecard (slot `scorecard`, Holm across 6):

| Metric | Diff (new − old) | 95% CI | Raw p | Holm p | Moved? |
|---|---|---|---|---|---|
| Trial start | +1.36 pp | +0.75 to +1.96 pp | 0.0000115 | **0.000069** | **yes** |
| Pages viewed (CUPED) | +0.068 pages | +0.020 to +0.116 | 0.0059 | **0.030** | **yes**, but tiny |
| Paid conversion | +0.41 pp | +0.06 to +0.75 pp | 0.021 | 0.086 | no |
| Revenue per user | +$0.20 | −$0.48 to +$0.88 | 0.569 | 1.000 | no |
| Days to convert | +0.05 days | −0.91 to +1.00 | 0.924 | 1.000 | no |
| 30-day retention | 0.00 pp | −0.97 to +0.97 pp | 1.000 | 1.000 | no |

The `guardrails` slot repeats Steps 2 and 3: the SRM p of 1 stays out of the family, and the six balance Holm p-values are all 1.000. `revenue_sensitivity` repeats the
Mann-Whitney p = 0.024. `regression_adjustment` repeats the SE drop from 0.0393 to 0.0247. Serial and
`--parallel 0` runs return identical `data`.

## Findings

1. **The test is clean.** Assignment matches the 50/50 design exactly (χ² = 0, p = 1), holds week by
   week (p = 0.68), and the arms are balanced on device, plan, region, user type and prior activity
   (every Holm p = 1.00).
2. **The redesign lifts trial starts by about 1.4 points**: 11.36% against 10.00%, +1.36 pp with a 95% CI
   of +0.75 to +1.96 pp. It survives Holm correction across the six metrics (p = 0.00007).
3. **Do not claim a paid-conversion win.** +0.41 pp at p = 0.021 looks like one, but it does not survive
   correction for six metrics (Holm p = 0.107). It is exactly the trial lift flowing through at the
   planted 30%, but this test cannot confirm it. Extend the test or make paid conversion the sole
   primary metric of a follow-up.
4. **Revenue per user did not change** ($4.35 vs. $4.15, p = 0.57). The rank test's p = 0.024 reflects
   the 81 extra payers, not extra dollars: new-page payers book about $11 less on their first invoice
   ($128 vs. $138). Check whether the new page steers buyers toward cheaper plans before shipping.
5. **The lift is a mobile effect.** Mobile trial starts rise +3.00 pp (10.0% → 13.0%). The interaction
   with mobile is +2.75 pp (p = 1 × 10⁻⁵), and outside mobile the effect is about zero. Of eight segment
   "wins" before correction, mobile, NA and new users survive. NA shows no real difference
   (interaction p = 0.22).
6. **Use pre-period covariates by default.** Adjusting pages viewed for prior sessions cut its variance
   by 60% and narrowed the CI from 0.154 to 0.097 pages wide. That turned a result the raw test could
   not see (p = 0.084, Holm p = 0.335) into one that passes correction (Holm p = 0.030). The effect itself
   is +0.07 pages per user, which is real but commercially irrelevant.

**Recommendation:** Ship the redesign on mobile, where it clearly works. Before shipping it more
broadly, investigate the smaller first invoices: on the current evidence the page does not increase
revenue. Pre-register the next test with paid conversion as the primary metric and prior-period
activity as a covariate.

## Pulse features used

| Feature | Where | What it did here |
|---|---|---|
| `pulse synth from-schema` (distributions, `rules` with `when` / `set_expr` / `set_null`, `row()` / `lag()`, `"output": false` helper fields, fixed `--seed`) | Step 0 | Deterministic 40,000-user cohort with exactly planted effects |
| `pulse cohort inspect` | Step 0 | Self-describing schema with field descriptions |
| `pulse api predict` / `predict-facet` / `predict-compose` | Steps 1, 11 | Validation, streamability and reasons, p-value accounting without reading records |
| `TEST_CHISQ` with `params.expected` | Step 2 | χ² goodness-of-fit SRM check against the planned split |
| `TEST_CHISQ` | Step 3 | SRM by week and covariate balance |
| `TEST_PROP_Z` | Steps 4, 9 | Binary metrics: rates, diff (treatment − `reference`), Wald CI, Cohen's h |
| `TEST_WELCH` (`params.reference`, `params.covariate`) | Steps 3, 4, 6, 8 | Continuous metrics, with CI; the CUPED adjustment in one call |
| `TEST_MANN_WHITNEY_U` | Step 6 | Rank-based sensitivity check on revenue (plus its ties warning) |
| `multiplicity` (`holm`, families `request` and `compose`; per-test `none`; per-regression `coefficients`) | Steps 2, 3, 4, 9, 10, 11 | Adjusted p-values next to the raw ones; interaction coefficients in the same family |
| `REG_OLS` | Steps 7, 10 | Regression adjustment with Student-t CI; treatment × segment interaction |
| `ATTR_FORMULA` | Step 10 | 0/1 indicator and interaction columns |
| `GROUP_CATEGORY`, `FILTER_INCLUDE`, `AGG_COUNT` / `AVERAGE` / `STDDEV` / `MEDIAN` / `PERCENTILE` / `SKEWNESS` / `MAX` | Steps 5, 9 | Revenue shape; per-variable grouped segment tests (`groups` + `tests`) |
| `pulse api compose` (labelled slots, `--parallel`) | Steps 5, 9, 11 | Whole readout in one call; serial and parallel give identical results |
