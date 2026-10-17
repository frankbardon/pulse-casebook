# Pricing-page A/B test: an honest readout

A fictional SaaS company redesigned its pricing page and ran a four-week A/B test on 40,000 users. This
walkthrough reads out the test from start to finish with Pulse. It covers the checks that decide whether
the test can be trusted at all, a six-metric scorecard with multiple-comparison correction, a skewed
revenue metric, regression adjustment on a pre-period covariate, and a segment breakdown. It ends with
the whole readout as one Compose call.

Every number below was returned by a Pulse request in [`req/`](req/), run against a cohort that Pulse
generated from [`data/ab_test.synth.json`](data/ab_test.synth.json). [`REPRODUCE.md`](REPRODUCE.md)
has the commands and the expected values.

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

The cohort is synthetic. `pulse synth from-schema` builds it from a spec with marginal distributions, one
Gaussian-copula correlation and seven structural rules. A fixed seed (`--seed 64`) makes the file
byte-identical on every run. It has 40,000 rows, one per user, and 19 fields:

| Field | Pulse type | What it is |
|---|---|---|
| `user_id` | `u32` | Pseudonymous id (100001…140000) |
| `arm` | `categorical_u8` | `old_page` (control) or `new_page` (variant), 50/50 |
| `is_variant` | `u8` | 1 if `new_page`, else 0 (numeric copy of `arm` for regression) |
| `assign_week` | `categorical_u8` | `w1`…`w4`, week of first assignment |
| `device` | `categorical_u8` | desktop 50% / mobile 40% / tablet 10% |
| `plan_tier` | `categorical_u8` | individual 55% / team 33% / business 12% |
| `region` | `categorical_u8` | NA 40% / EMEA 30% / APAC 20% / LATAM 10% |
| `user_type` | `categorical_u8` | new 60% / returning 40% |
| `prior_sessions` | `u16` | **Pre-period covariate**: sessions in the 30 days before assignment (normal, mean 10, sd 4) |
| `pages_viewed` | `u16` | Pages viewed after assignment (normal, mean 8, sd 4; correlation 0.78 with `prior_sessions`) |
| `trial_started` | `categorical_u8` | `yes` / `no` |
| `paid_converted` | `categorical_u8` | `yes` / `no` (only trial starters can convert) |
| `revenue` | `f64` | First-invoice revenue in USD; 0 for non-payers |
| `days_to_convert` | `f32`, nullable | Days from assignment to paid conversion; null for non-payers |
| `retained_30d` | `categorical_u8` | `yes` / `no` |
| `u_trial`, `u_paid`, `u_ret`, `order_value` | `f32` / `f64` | Generator latents that the rules turn into outcomes. Not metrics, and never analysed. |

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

These are the parameters the rules use. A finite sample adds noise on top of them. Seed 64 was chosen,
by generating and testing candidate seeds with these same requests, as a realization where each lesson
shows up clearly. Other seeds give the same truths with different noise.

The binary outcomes are categorical `yes`/`no` rather than `packed_bool`, because the two-proportion
z-test in this build accepts only categorical fields.

## Walkthrough

All commands run from this directory with `pulse` on the PATH (see [`REPRODUCE.md`](REPRODUCE.md)).
Every request names its cohort as `{"filename": "ab_test.pulse", "data_dir": "."}`.

### Step 0 — Generate the cohorts

```bash
pulse synth from-schema -s data/ab_test.synth.json -o ab_test.pulse --seed 64
pulse cohort inspect ab_test.pulse
```

Excerpt of the spec, showing how the treatment effects are encoded as structural rules:

```json
"correlations": [{"a": "prior_sessions", "b": "pages_viewed", "correlation": 0.78}],
"rules": [
  {"set_expr": {"is_variant": "arm == \"new_page\" ? 1 : 0"}},
  {"when": "arm == \"new_page\"", "set_expr": {"pages_viewed": "pages_viewed + 0.07"}},
  {"set_expr": {"trial_started": "u_trial < (arm == \"old_page\" ? 0.100 : (device == \"mobile\" ? 0.130 : (device == \"desktop\" ? 0.103 : 0.100))) ? \"yes\" : \"no\""}},
  {"set_expr": {"paid_converted": "trial_started == \"yes\" && u_paid < 0.30 ? \"yes\" : \"no\""}},
  {"set_expr": {"revenue": "paid_converted == \"yes\" ? (arm == \"new_page\" ? order_value * 0.85 : order_value) : 0"}},
  {"when": "paid_converted == \"no\"", "set_null": ["days_to_convert"]},
  {"set_expr": {"retained_30d": "u_ret < 0.35 + 0.015 * min(prior_sessions, 20) / 2 ? \"yes\" : \"no\""}}
]
```

Result: `rows_generated: 40000`, `rows_rejected: 0`, no warnings. The cohort file is 2,121,853 bytes.
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
| new_page | 20,087 | 20,000 |
| old_page | 19,913 | 20,000 |

**χ² = 0.757, df = 1, p = 0.384. No sample-ratio mismatch.** A 174-user gap on 40,000 users is
ordinary randomization noise. A one-sample `TEST_PROP_Z` on `arm` with `params.success = "new_page"` and
`params.p0 = 0.5` asks the same question for a two-arm split (z = 0.87, the same p = 0.384).

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
| arm × assign_week (SRM by week) | χ² = 3.09 | 3 | 0.378 | 1.000 |
| arm × device | χ² = 2.47 | 2 | 0.290 | 1.000 |
| arm × plan_tier | χ² = 1.72 | 2 | 0.422 | 1.000 |
| arm × region | χ² = 1.39 | 3 | 0.708 | 1.000 |
| arm × user_type | χ² = 0.39 | 1 | 0.535 | 1.000 |
| prior_sessions, Welch | t = 0.25 | 39,997.6 | 0.802 | 1.000 |

Weekly assignment counts (from the contingency table in the response):

| | w1 | w2 | w3 | w4 |
|---|---|---|---|---|
| new_page | 5,035 | 5,110 | 4,977 | 4,965 |
| old_page | 4,870 | 5,022 | 5,026 | 4,995 |

**Every guardrail passes.** The test can be trusted, and the arms are comparable on device, plan,
region, user type and prior activity.

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
| Trial start | 11.29% (2,267 / 20,087) | 10.27% (2,045 / 19,913) | **+1.02 pp** | +0.41 to +1.62 pp | 0.00105 | **0.0063** | **significant** |
| Paid conversion | 3.40% (683) | 3.00% (598) | +0.40 pp | +0.05 to +0.74 pp | **0.024** | **0.096** | not significant after correction |
| Revenue per user | $4.46 | $4.62 | −$0.16 | −$0.93 to +$0.61 | 0.681 | 1.000 | no difference |
| Pages viewed | 8.119 | 8.025 | +0.094 pages | +0.017 to +0.171 | **0.017** | **0.086** | not significant after correction |
| Days to convert (payers) | 8.69 days (n = 683) | 9.37 days (n = 598) | −0.68 days | −1.71 to +0.36 | 0.201 | 0.604 | no difference |
| 30-day retention | 42.48% | 42.61% | −0.13 pp | −1.10 to +0.84 pp | 0.792 | 1.000 | no difference |

Three metrics clear p < 0.05 uncorrected. **Only trial start survives the correction.** Paid conversion
is the metric a growth team would most like to announce, and its uncorrected p of 0.024 becomes 0.096.
Holm ranks it third of six, so its p-value is multiplied by 4 (0.0241 × 4 = 0.096). Pages viewed loses
significance the same way. The days-to-convert test uses only the 1,281 payers, because the null rows
for non-payers drop out of the test.

### Step 5 — Revenue is mostly zeros with a long tail

Before testing revenue, look at its shape. [`req/05_revenue_shape.compose.json`](req/05_revenue_shape.compose.json)
is a two-slot Compose request: all users grouped by arm, and paying users only (`FILTER_INCLUDE
paid_converted = yes`) grouped by arm:

```bash
pulse api compose -r req/05_revenue_shape.compose.json --json
```

| Arm | Users | Mean | SD | Median | Skewness | Max |
|---|---|---|---|---|---|---|
| new_page | 20,087 | $4.46 | $37.10 | $0 | 18.5 | $1,813 |
| old_page | 19,913 | $4.62 | $41.12 | $0 | 22.1 | $2,250 |

| Arm (payers only) | Payers | Revenue per payer | Median | p95 |
|---|---|---|---|---|
| new_page | 683 | $131.04 | $88.56 | $373.41 |
| old_page | 598 | $153.73 | $108.29 | $386.91 |

The redesign brings in **85 more payers** who book **smaller first invoices**: $131 against $154 per
payer, and a median of $89 against $108.

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
| Welch t (difference in means) | t = −0.41 | **0.681** | Cohen's d = −0.004 | mean revenue per user is unchanged; the CI spans −$0.93 to +$0.61 |
| Mann-Whitney U (rank) | z = +2.19 | **0.029** | rank-biserial = +0.004 (new_page tends higher) | "new_page users tend to rank higher" |

Pulse attaches `PULSE_TEST_TIES_DOMINATE` to the Mann-Whitney result: "≥ 50% of values are tied; the
asymptotic p-value is unreliable." That is the key to reading the disagreement. About 97% of users
have revenue exactly 0, so the rank test is mostly asking whether more users moved from zero to
non-zero. That is the paid-conversion question again, and both give p ≈ 0.024–0.029. It says nothing
about dollars. The Welch test answers the dollar question, and the extra payers' smaller invoices
offset each other: no detectable change in revenue per user.

**Read revenue from the Welch test and the payer breakdown, not the rank test.** Do not report the
rank test's p = 0.029 as "revenue went up".

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
| `pages ~ is_variant` | +0.0938 | 0.0394 | +0.017 to +0.171 | 0.0172 | 0.0001 |
| `pages ~ is_variant + prior_sessions` | +0.0862 | **0.0249** | **+0.037 to +0.135** | **0.00054** | 0.600 |

Adding the covariate cuts the standard error of the treatment effect from 0.0394 to 0.0249 pages, about
37% smaller. The regression's `ci_lower` / `ci_upper` are Student-t intervals on the residual degrees
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
| Raw | +0.094 | +0.017 to +0.171 | 15.56 / 15.42 | 0.0171 |
| CUPED-adjusted | +0.086 | **+0.037 to +0.135** | 6.25 / 6.13 | **0.00054** |

The adjusted result carries its own working in `details`: `theta` = **0.7601**, `covariate_mean` =
10.0076, `variance_reduction` = **0.600**, and `diff_unadjusted` = 0.0938 beside the adjusted `diff`.
They match the Step 7 regression: the same +0.0862 estimate, the same interval, the same p.

**The covariate cuts the per-arm variance by 60% and narrows the 95% CI from 0.154 to 0.098 pages
wide.** The estimate barely moves (+0.094 → +0.086 pages; the planted truth is +0.07). Only the
uncertainty shrinks. This is the legitimate way to recover the power that the correction in Step 4 took
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
| device = desktop | 19,992 | 10.4% | 10.6% | −0.22 pp | −1.07 to +0.63 | 0.614 | 1.000 |
| **device = mobile** | 16,072 | 12.8% | 9.8% | **+2.97 pp** | +2.00 to +3.95 | 2.6 × 10⁻⁹ | **3.1 × 10⁻⁸** ✔ |
| device = tablet | 3,936 | 9.7% | 10.4% | −0.71 pp | −2.59 to +1.16 | 0.457 | 1.000 |
| plan = individual | 21,921 | 11.0% | 10.4% | +0.57 pp | −0.25 to +1.39 | 0.171 | 0.852 |
| plan = team | 13,272 | 11.5% | 10.0% | +1.49 pp | +0.44 to +2.55 | **0.0055** | 0.055 |
| plan = business | 4,807 | 12.0% | 10.3% | +1.71 pp | −0.06 to +3.49 | 0.059 | 0.388 |
| region = NA | 16,109 | 11.4% | 10.2% | +1.26 pp | +0.30 to +2.21 | **0.010** | 0.082 |
| **region = EMEA** | 11,813 | 11.7% | 10.0% | +1.65 pp | +0.53 to +2.77 | **0.0040** | **0.044** ✔ |
| region = APAC | 8,168 | 10.9% | 10.6% | +0.26 pp | −1.08 to +1.61 | 0.703 | 1.000 |
| region = LATAM | 3,910 | 10.3% | 10.6% | −0.30 pp | −2.22 to +1.62 | 0.758 | 1.000 |
| user = new | 23,933 | 11.4% | 10.3% | +1.07 pp | +0.28 to +1.86 | **0.0077** | 0.069 |
| user = returning | 16,067 | 11.2% | 10.2% | +0.93 pp | −0.02 to +1.89 | 0.055 | 0.388 |

Five of twelve segments "win" uncorrected. After Holm correction across the 12 tests, two remain:
mobile, overwhelmingly, and EMEA, just under the line at 0.044. A segment lift that survives correction
is still not evidence that the segment *differs*. EMEA's lift could simply be the overall lift. That
calls for a different test.

### Step 10 — Heterogeneity: is the effect really different in a segment?

To ask whether the lift *differs* in a segment, fit a linear probability model with a treatment ×
segment interaction. The 0/1 columns are built in-request with `ATTR_FORMULA`
([`req/10_heterogeneity.json`](req/10_heterogeneity.json)):

```json
"attributes": [
  {"type": "ATTR_FORMULA", "field": "trial_started", "label": "trial", "expression": "trial_started == \"yes\" ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "device", "label": "mobile", "expression": "device == \"mobile\" ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "device", "label": "new_page_x_mobile", "expression": "(device == \"mobile\" && arm == \"new_page\") ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "region", "label": "emea", "expression": "region == \"EMEA\" ? 1 : 0"},
  {"type": "ATTR_FORMULA", "field": "region", "label": "new_page_x_emea", "expression": "(region == \"EMEA\" && arm == \"new_page\") ? 1 : 0"}
],
"multiplicity": {"method": "holm", "family": "request"},
"regressions": [
  {"type": "REG_OLS", "name": "trial_by_mobile", "target": "trial", "predictors": ["is_variant", "mobile", "new_page_x_mobile"],
   "multiplicity": {"method": "holm", "coefficients": ["new_page_x_mobile"]}},
  {"type": "REG_OLS", "name": "trial_by_emea",   "target": "trial", "predictors": ["is_variant", "emea", "new_page_x_emea"],
   "multiplicity": {"method": "holm", "coefficients": ["new_page_x_emea"]}}
]
```

The request-level `multiplicity` block sets the family, and each regression's own `multiplicity` block
makes its named coefficient a member of it. The two interaction hypotheses form one Holm family
(`m = 2`); the other coefficients stay uncorrected and are not in the family.

| Model | Lift outside the segment (`is_variant`) | Extra lift inside the segment (interaction) | SE | 95% CI | Interaction p | Holm p (m = 2) |
|---|---|---|---|---|---|---|
| mobile vs. not mobile | −0.30 pp (p = 0.449) | **+3.28 pp** | 0.63 pp | +2.04 to +4.52 pp | **2.2 × 10⁻⁷** | **4.4 × 10⁻⁷** |
| EMEA vs. not EMEA | +0.75 pp (p = 0.042) | +0.89 pp | 0.68 pp | −0.44 to +2.23 pp | 0.188 | 0.188 |

**The redesign works on mobile and does nothing measurable elsewhere.** Outside mobile the lift is
−0.30 pp and indistinguishable from zero; on mobile it is about 3.3 pp higher. EMEA's lift is not
distinguishable from other regions' (p = 0.19). It survived Step 9 only because EMEA is large and
carries its share of mobile users. Plan tier, region and user type show no real heterogeneity, which
matches the planted truth. The mobile interaction survives the two-hypothesis Holm correction with
room to spare (4.4 × 10⁻⁷).

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
| Trial start | +1.02 pp | +0.41 to +1.62 pp | 0.00105 | **0.0052** | **yes** |
| Pages viewed (CUPED) | +0.086 pages | +0.037 to +0.135 | 0.00054 | **0.0032** | **yes**, but tiny |
| Paid conversion | +0.40 pp | +0.05 to +0.74 pp | 0.024 | 0.096 | no |
| Revenue per user | −$0.16 | −$0.93 to +$0.61 | 0.681 | 1.000 | no |
| Days to convert | −0.68 days | −1.71 to +0.36 | 0.201 | 0.604 | no |
| 30-day retention | −0.13 pp | −1.10 to +0.84 pp | 0.792 | 1.000 | no |

The `guardrails` slot repeats Steps 2 and 3: the SRM p of 0.384 stays out of the family, and the six balance Holm p-values are all 1.000. `revenue_sensitivity` repeats the
Mann-Whitney p = 0.029. `regression_adjustment` repeats the SE drop from 0.0394 to 0.0249. Serial and
`--parallel 0` runs return identical `data`.

## Findings

1. **The test is clean.** Assignment matches the 50/50 design (χ² = 0.76, p = 0.38), holds week by week
   (p = 0.38), and the arms are balanced on device, plan, region, user type and prior activity (every
   Holm p = 1.00).
2. **The redesign lifts trial starts by about 1 point**: 11.29% against 10.27%, +1.02 pp with a 95% CI
   of +0.41 to +1.62 pp. It survives Holm correction across the six metrics (p = 0.005).
3. **Do not claim a paid-conversion win.** +0.40 pp at p = 0.024 looks like one, but it does not survive
   correction for six metrics (Holm p = 0.096). It is consistent with the trial lift flowing through,
   but this test cannot confirm it. Extend the test or make paid conversion the sole primary metric of
   a follow-up.
4. **Revenue per user did not change** ($4.46 vs. $4.62, p = 0.68). The rank test's p = 0.029 reflects
   the 85 extra payers, not extra dollars: new-page payers book about $23 less on their first invoice
   ($131 vs. $154). Check whether the new page steers buyers toward cheaper plans before shipping.
5. **The lift is a mobile effect.** Mobile trial starts rise +2.97 pp (9.8% → 12.8%). The interaction
   with mobile is +3.28 pp (p = 2 × 10⁻⁷), and outside mobile the effect is about zero. Of five segment
   "wins" before correction, only mobile and, marginally, EMEA survive. EMEA shows no real difference
   (interaction p = 0.19).
6. **Use pre-period covariates by default.** Adjusting pages viewed for prior sessions cut its variance
   by 60% and narrowed the CI from 0.154 to 0.098 pages wide. That turned a result that failed
   correction (Holm p = 0.086) into one that passes (Holm p = 0.003). The effect itself is +0.09 pages
   per user, which is real but commercially irrelevant.

**Recommendation:** Ship the redesign on mobile, where it clearly works. Before shipping it more
broadly, investigate the smaller first invoices: on the current evidence the page does not increase
revenue. Pre-register the next test with paid conversion as the primary metric and prior-period
activity as a covariate.

## Pulse features used

| Feature | Where | What it did here |
|---|---|---|
| `pulse synth from-schema` (distributions, `correlations`, `rules` with `when` / `set_expr` / `set_null`, fixed `--seed`) | Step 0 | Deterministic 40,000-user cohort with planted effects |
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
