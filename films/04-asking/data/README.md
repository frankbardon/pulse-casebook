# Asking before running: result cards

- **Cohort:** `generate.js` → `s.csv` (seed 4): 800 shoppers in an A/B test, with `region`, `plan`, `arm`, `spend` (a few left null), `visits` and `signup`. It is imported with `s.schema.json`, so every field carries a real description and inspect raises no low-quality-description warnings.
- **Requests:** below. Process and predict outputs are `<request>.out.json` and `<request>.predict.json`. The no-execute reads are recorded under their own names.
- **Steps:** `build.sh` regenerates the CSV, imports it and records every output. It also runs `mcp.js`, which drives `pulse mcp` over stdio under `profile.json`.

The film's result cards come from these runs. The exit statuses quoted in the film (1 for `split` process, 0 for `regions` process) were observed when these were recorded; `build/data.sh` does not keep them.

## No-execute reads

| Output | Command | What it shows |
|---|---|---|
| `manifest.compare_groups.json` | `pulse --json --slim --intent compare_groups` | the manifest scoped to one intent: `scope.intent` (how it sounds, its field shape), the tests, groupers and aggregators that serve it today, the `elided` sections, the two digests |
| `s.inspect.json` | `pulse cohort inspect -i s.pulse --json` | the schema: names, types, nullability, descriptions, dictionaries, `record_count` 800 |
| `rec0.out.json` | `pulse recommend --intent compare_groups --top 3` | unbound skeletons; the first is `TEST_PROP_Z` with placeholders `cohort`, `field`, `split_by`, `success` |
| `rec.out.json` | `… --cohort s.pulse --field spend --field arm --top 3` | bound drafts, each predict-checked: `TEST_ANOVA_F`, `TEST_ANOVA_WELCH`, `TEST_KRUSKAL_WALLIS`; the ANOVA's `alternatives` include "there are only two groups" → `TEST_WELCH` |
| `ab.explain.json` | `pulse explain -r ab.json` | request mode: summary and steps, `aggregations[0]` defaulted to `AGG_SUM` |
| `ab.found.json` | `pulse explain -r ab.json --response ab.out.json --detail full` | response mode: `no_evidence_of_difference`, strength band "very small" (Cohen 1988), and the `TEST_T` caveats |
| `unknown.errors.json`, `split.errors.json` | `pulse errors lookup CODE` | canonical message and `fixups[]` for `PULSE_REQUEST_UNKNOWN_FIELD` and `PULSE_TEST_SPLIT_GROUPS_LT_2` |
| `profile.check.json` | `pulse features check profile.json` | the film's feature profile is valid against this build |
| `mcp.tools.json`, `mcp.par.json` | `node mcp.js "$PULSE"` | under `profile.json`, `tools/list` offers no recommend, explain, facet or compose tool, and `pulse_predict` on `par.json` refuses `params` as `PULSE_REQUEST_UNKNOWN_FIELD` (it is absent from `valid_keys`) |

## Requests

| Request | Command | What it shows |
|---|---|---|
| `ab` | predict, process | total and average spend with a Welch `TEST_T` of spend by arm. Predict: `valid` true, `streamable` true, the untyped aggregation defaulted to `AGG_SUM`. Process: variant 70.91 against control 66.28, diff 4.63, 95% CI −0.33 to 9.59, t 1.83, df 777.0, p 0.0673, d 0.131; average spend 68.6 over 779 values, 21 null |
| `med` | predict | `AGG_MEDIAN` by region: `streamable` false, with its reason |
| `split` | predict, process | `TEST_T` split by arm on a request grouped by arm: both refuse it with `PULSE_TEST_SPLIT_GROUPS_LT_2` (`reason` `split_is_grouper`) |
| `regions` | predict, process | `TEST_T` split by region: predict is valid with `PULSE_ADVISORY_TWO_GROUP_TEST_MANY_GROUPS` (4 groups, suggests `TEST_ANOVA_WELCH`); process runs it as written, the test slot fails alone (`PULSE_TEST_SPLIT_GROUPS_LT_2`, warning `PULSE_SLOT_FAILED`) and average spend 68.6 survives |
| `typo` | predict, process | a misspelt `lable` key: both refuse it with `PULSE_REQUEST_UNKNOWN_FIELD`, path `aggregations[0].lable`, suggestion `label` |
| `par`, `par2` | process | one `FILTER_EXPRESSION` reading `params.plan` and `params.min_visits`, with Pro then Basic: 122 and 143 shoppers pass; shoppers and average spend by arm |
| `undecl` | predict, process | the same expression with `min_visits` undeclared: both refuse it with `PULSE_PARAMS_UNDECLARED` |
| `fs` | facet | a `FacetSchema` request over North's shoppers: spend summary, a 6-bin histogram over [0, 180], and additive counts for region (the region filter lifted) |

## Template

`templates/plan_spend.json` is a stored request template (`target`, typed `variables`, `body`) whose body is `par.json` with its two params as `$var` markers. The film shows it as a file only: at alpha.33 templates are rendered by an embedder (`RenderTemplate`, `PULSE_TEMPLATES_DIR`), and the CLI has no template command, so no rendered output is recorded here.
