# Pulse Anatomy series rules

Every page, plate, film, narration line and subtitle in this series follows these rules. Check a new film against this file before rendering it, and add a rule here whenever a new one is agreed.

## 1. Never state how many of anything Pulse ships

Pulse grows over time, so a count that is true today becomes wrong later. This rule applies to every catalog:

- feature operators
- filters
- attributes
- groupers
- aggregators
- windows
- statistical tests and post-tests
- regression models
- matrix operators
- overlay kinds
- synth distributions
- field types
- error codes
- extension categories
- question intents and guides
- overlay families
- MCP tools and prompts
- skills and examples

It covers:

- **Narration:** no "there are twelve filters". Say "Pulse ships a growing set of filters".
- **On-screen labels and headings:** no `12 FILTERERS`, no `TESTS · 26`. Use `FILTERERS · MORE ADDED OVER TIME` or just `FILTERERS`.
- **Chips and lists:** no `+ 17 more` and no per-family tallies like `share ×3`. Write `+ more`.
- **Recaps and summaries:** describe what each category does, not how many it has.

Listing the operators that exist today is allowed. Label the list "today" or "currently", never as a complete set.

These are not catalog counts, so they may be stated:

- Format constants: the 9-byte header, epoch days versus seconds, the 4,096-record merge block, the 100,000-record parallel-decode threshold.
- Parameter ranges: polynomial degree 2 to 10, ratios summing to 1.0.
- Figures computed from a film's own illustrative data.

## 2. Always say that more are added over time

Every film that covers a category says in its narration that Pulse adds more of them over time. It also says that the instance's manifest lists what that instance offers. For an extensible category, add that embedders can register their own operators through `Options.Extensions`.

## 3. Accuracy comes from the code, not from memory

Every operator name, parameter, default label, null rule, error code and stage order is checked against the source or the skill pack (`internal/skills/`) at the target release before it goes on screen. The target is Pulse `v1.0.0-alpha.33`. Where a fact changed after alpha.10, the release that changed it is given in brackets.

### 3.1 Pulse refuses what it does not understand

- An unknown key at any depth of a request or a `params` block is refused with `PULSE_REQUEST_UNKNOWN_FIELD`. Nothing is silently ignored [alpha.14].
- A source whose type is outside an operator's `accepts_types` is refused with `PULSE_FIELD_TYPE_UNSUPPORTED`.
- A film never shows an unknown key being accepted, and never says a misspelt option is "ignored".
- Matrix `vectors` members of an unsupported type are refused (`PULSE_VECTOR_MEMBER_TYPE`).

### 3.2 A failed slot fails alone

- A failed test, regression or matrix slot, or a failed Compose fit, does not fail the request. The slot carries an `error`, the envelope gets a `PULSE_SLOT_FAILED` warning, and the rest of the response survives [alpha.17].
- `Strict` restores fail-fast: the run fails.
- Example: a perfectly separated GLM is refused as `PROCESSING_REGRESSION_SEPARATION`. `PROCESSING_REGRESSION_NO_CONVERGE` is only for true non-convergence.
- Envelope `warnings` carry every runtime warning, including regression and matrix warnings lifted from their slots [alpha.14, alpha.28, alpha.30].

### 3.3 Renames

These names are gone, with no alias. Grep every film for them:

- `WIN_ADSTOCK` is now `WIN_DISTRIBUTED_LAG` [alpha.27]. `WIN_EWMA` is not adstock.
- The distance metric `sqeuclidean` is now `sq_euclidean` and the old spelling is refused [alpha.10].

### 3.4 Confirmed facts

- **Slot order is a default, not a law.** The default is `features → filterers → attributes → groups → aggregations → windows → sort`. Three exceptions apply, and a film says "by default" wherever it states the order:
  - `ATTR_PREVIOUS_STATE` runs over every record before the filters [alpha.19]. So a filter expression can read a previous-state label, and "attributes only see survivors" and "filters never read attributes" are both false.
  - Windows first: when an aggregation, grouper or crosstab reads a window label, the windows run over the filtered records before the groups [alpha.29].
  - Post-window attributes: a formula or `ATTR_REG_PREDICT` that reads a window label runs after the windows [alpha.25, alpha.29]. Reading a window label from the wrong place gives `PULSE_ATTRIBUTE_WINDOW_ORDER`.
- **Filter components.** `n_in` is the records the filter saw. `n_out` is the records it admitted. `n_null_input` is the records whose input field (or per-row zone cell) was null on entry, whether the filter then kept or dropped them. For exclude, false-truthy and is-null it counts kept rows (`internal/processing/filter_pass.go`). It was never "records dropped because null".
- **Dates and weekdays.** `FILTER_DATE_RANGES` buckets by the local day [issue #403, fixed at alpha.33]. Weekday is Monday first: `dow` and `_dow` are ISO 1 to 7 with Monday = 1, grouper keys sort Monday first, and only plain text columns sort alphabetically [alpha.18]. `iso_weekday` is a date part.
- `FEAT_BUCKETIZE` emits a bucket index, not a label. A quantile bucketize buffers.
- **Target encoding.** `FEAT_TARGET_ENCODE` takes `fit_on`, `folds` and `rng_seed`. Setting `fit_on` silences `PULSE_FEAT_TARGET_LEAKAGE_RISK`, so teach the non-leaky pipeline [alpha.17].
- **Limits.** The limits preflight refuses only certain findings (`MaxEstimatedMemory`, `MaxMatrixDim`). `MaxGroups` is only a possible finding.
- **Attributes.**
  - Null input: `ATTR_ZSCORE`, `ATTR_TSCORE`, normalized, percentile, date-part and popcount return **null** on a null input. z-score, t-score and normalized also return null on a constant field [alpha.18]. Only code-in and set-has still map null to 0. Regression and multivariate attributes return null.
  - z and t use the population mean and SD (√(M2/Σw)).
  - Attributes run in declared order and can read earlier attribute labels (`attribute_two_pass_order_test.go`). The `attribute-composition` skill is fixed, so the old "no in-slot chaining" rule no longer applies. Code-in and the multivariate scores read source columns only.
  - An unguarded null in `ATTR_FORMULA` arithmetic raises `PROCESSING_RUNTIME`, which fails the request.
  - `total()` is weighted (Σw·x) under a frequency weight and refused under a probability weight.
- **Aggregators.**
  - Undefined figures are `null`, not 0. Aggregators over zero rows return null, while counts and sums stay 0 [alpha.13].
  - Skewness and kurtosis return **null** at n ≤ 1 or zero spread [alpha.13].
  - Aggregators skip nulls: `n` is the non-null values used and `n_null` the values skipped. `AGG_VARIANCE` and `AGG_STDDEV` divide by n; `AGG_WELFORD` divides by n − 1. The CI bounds use the normal z and are null for n < 2. `AGG_RATIO` is Σnum ÷ Σden and is null when the denominators sum to 0.
  - Mergeability: median, percentile and `AGG_AUC` are `none`; distinct counts and sums, mode, mode count and set frequency are `partial`; the rest are `mergeable`.
  - Float sums are bit-identical across workers and shards, and shard archives merge incrementally [alpha.22].
- **Windows.**
  - Nulls sort last in both directions and still get a rank; rows come back in input order.
  - `WIN_DELTA` keeps a zero prior while `WIN_PCT_CHANGE` returns null.
  - Running and moving aggregates skip nulls; `WIN_EWMA` emits null on a null row but keeps its state.
  - An open-ended `WIN_MOVING_AVG` frame is refused by both `predict` and `process` (`PULSE_WINDOW_INVALID`) [alpha.17].
  - ProcessChain refuses windows (`PULSE_CHAIN_NOT_MERGEABLE`), so a later step that filters on a window column uses `materialize` first.
- **Groups.** A second plain `groups` entry is a composite key on every path [alpha.10].
- **Crosstabs.** Margins and the grand total count only the records that reached a cell, so a record that is null on a row axis reaches no margin [alpha.16]. A crosstab and `groups` are exclusive.
- **Tests and regressions.**
  - `tests` (tier 1) and `regressions` read the raw records that pass the filters; `post_tests` (tier 2) read the result rows after windows. Results land in `Response.Tests`, `Response.PostTests` and `Response.Regressions`, with no `Response.Components`.
  - Every test returns `statistic`, `df`, a two-sided `p_value`, `alpha` (default 0.05) and `reject_null`, and the rest goes in `details` (for `TEST_T`: `diff`, `ci_low`, `ci_high`, `effect_size.cohens_d`).
  - `TEST_T` with `split_by` is Welch's two-sample form and needs exactly two groups. `TEST_CHISQ` axes must be categorical (yes/no counts), and labels sort alphabetically. An expected count under 5 warns `PULSE_TEST_EXPECTED_COUNT_TOO_LOW`.
  - `TEST_TUKEY_HSD` is a post-test, is never weighted and never joins a multiplicity family.
  - A `multiplicity` block adds `p_adjusted` and `significant_adjusted` beside the raw p, which never moves. The methods match R `p.adjust`. Families include `matrix` and regression coefficients. Predict raises `PULSE_ADVISORY_MANY_TESTS` at ten or more uncorrected p-values.
  - `REG_OLS` and `REG_BAYES_LINEAR` stream; `REG_GLM`, resampling and selection buffer. The MMM models (`REG_MMM_HILL`, `REG_MMM_BAYES`) are built in [alpha.29].
  - OLS p-values are Student t. GLM uses Wald z, except gamma, which uses t. Lasso and elastic net return null SEs. The Bayesian fit has credible intervals and no p-values.
  - A null, NaN or ±Inf drops the row from `n_obs`. Selected-out predictors are absent, not zero. A penalty with selection is a predict warning (`PROCESSING_REGRESSION_REGULARIZED_SELECTION`), not a refusal.
- **Matrices.**
  - A `vectors` entry names numeric members by `fields` (literals keep their order, globs expand in schema order) or an unanchored `pattern`. `packed_bool` joins only under `coerce: "binary"`; categorical, set, date, datetime and decimal128 are refused (`PULSE_VECTOR_MEMBER_TYPE`). Native vector fields (`vec_f32`, `vec_f64`) are accepted [alpha.12].
  - Matrices fold the filter-passing records and arrive at the final flush, never row by row.
  - `listwise` is the default; `pairwise` adds `auxiliary.n` and can be non-PSD, which is a warning on covariance and correlation and fatal on the decompositions (partial correlation, reliability's omega, PCA, factor analysis, collinearity) unless `repair: "nearest"`.
  - Rank methods are buffered, serial and frequency-weight only.
  - **Matrices can carry p-values.** `params.inference` on correlation and partial correlation adds them, with a `matrix` multiplicity family [alpha.11], and `MAT_SEM` reports p-values for its parameters.
  - With `groups`, each bucket gets its own matrix, equal to the ungrouped matrix over exactly its rows.
  - Matrices are refused with joins (`PULSE_MATRIX_UNSUPPORTED_SOURCE`) and with a crosstab (`PULSE_MATRIX_HOST_CONFLICT`).
- **Overlays.**
  - Each spec adds one read-only layer to `Response.Overlays` in spec order, and the base crosstab and components are byte-identical with or without overlays (checked).
  - The request decides the host: a crosstab (matrix), a grouped process (series), a matrix result, `FacetRequest.Overlays`, `ChainRequest.Overlays`, Compose, and formula over any of them.
  - A series kind on a crosstab is refused as `PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE`, by predict and by the runtime alike.
  - A rolling z-score without `window` is `PULSE_OVERLAY_PARAM_MISSING` at predict.
  - `OVERLAY_CHISQ_VS_REF`'s scalar is the p-value, while `OVERLAY_CHISQ_MATRIX`'s and `OVERLAY_CHISQ_VS_POP`'s is χ².
  - An unknown sibling gives null entries and `PULSE_OVERLAY_REF_UNKNOWN`, and the request still succeeds. YoY's first year is null with no warning.
  - `OVERLAY_INDEX_VS_TOTAL` divides each group value by the sum of the group values, so four regions index at about 25 each, not 100.
  - `OVERLAY_SHARE_OF_ROW` with a column-axis ref is refused with `PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE`, and its `summary.baseline` is 1 [issue #405, fixed at alpha.33]. Do not show a recorded run of the refused case.
  - Index vs prior streams; rolling, baseline, YoY and sibling kinds buffer.
  - **Weighted hosts.** Inferential kinds run on each cell's N\* (Σw under frequency weights, Kish `n_eff` under probability weights), echoed in `summary.parameters` as `sum_weights` and `n_eff`. Only a few refuse a weight with `PULSE_WEIGHT_UNSUPPORTED`: the probit t and the unweighted two-means z (any weight), Fisher's exact cell test (probability weight only), and every facet overlay (any set weight). `"weight": null` opts the slot out.
- **Extensions (`Options.Extensions`).**
  - Tests, regressions [alpha.21] and matrix operators [alpha.13] can all be registered. Overlay kinds cannot; embedder expression functions reach `OVERLAY_FORMULA`. `MAT_DISTANCE`'s `between` accepts an extension grouper.
  - The synthetic-distribution extension category was removed [alpha.20].

### 3.5 Behaviour the films still avoid

- A series-host overlay warning lands in `Response.warnings`, not on its layer. It is not settled whether that is intended, so a film does not show or describe where the warning lands.

### 3.6 Illustrative data

Cohorts, samples, p-values and correlations are illustrative. Each page says so in its note. Every figure on a result card comes from a real Pulse alpha.33 run on the film's own cohort, recorded in that film's `data/` folder as `<request>.json` and `<request>.out.json`.

### 3.7 Upstream issues, not fixed here

- The manifest description of `FILTER_DATE_RANGES` still says "UTC day", while the code and skill say local day.
- The `grouper-design.md` line "weekday names lex-sort" looks stale against Monday-first ordering.

A film does not repeat either wording.

## 4. Series order

Twenty-three films in five parts. The folder number is the viewing order. `render.sh` resolves a film by topic, which does not change when a folder is renumbered.

1. **Foundations**
   1. Lifecycle of a request (`lifecycle`)
   2. Concepts overview (`concepts`)
   3. Cohort file and scale
   4. Asking before running
2. **The request spine**, in pipeline order
   5. Features
   6. Filters
   7. Attributes
   8. The expression language
   9. Groupers
   10. Aggregators
   11. Windows
3. **Analysis**
   12. Tests and regressions
   13. Matrices
   14. SEM
   15. Crosstabs
   16. Overlays
4. **Beyond one request**
   17. Compose: batch and sweep
   18. Compose: fit, bind and optimize
   19. Derived cohorts
   20. Weights and raking
   21. Time zones and panels
5. **Around Pulse**
   22. Synthetic data
   23. Embedding Pulse

## 5. Production conventions

- **Subtitles:** the subtitles are the narration. Code names stay in subtitles and are written out for speech in the spoken text (for example, "a range filter" for `FILTER_RANGE`).
- **Rendering:** films use `kit/film-kit.js`. `draw(t)` must be a pure function of `t`. The narration lengths in `NARR` stretch each cue.
- **Voice:** Kokoro `af_heart` at speed 1.0, unless the voice is changed for the whole series at once.
- **Visual identity:** the film stage is always dark. Colours carry the same role in every film:

  | Colour | Role |
  |---|---|
  | teal | records and execution |
  | amber | metadata and no-execute reads |
  | violet | derived output |
  | coral | checks, refusals and nulls |

- **Length:** an existing film stays within about 7 minutes. A new film runs 4 to 7 minutes. Cross-topic material goes in the film that owns the topic.
- **Ring intro and outro:** every film opens on the animated 3D Pulse ring, driven by the film's time `t` so that MP4 renders include it, and (about 4 seconds), and closes on the static ring (about 2 seconds). The static ring is also the loading state. There is no corner logo on film frames.
- **Vendored assets:** `kit/` holds a pinned three.js (0.184.0), the mark scripts and the time-driven ring renderer, with the SVGs stripped of metadata. Never reference `pulse-studio` or any path outside the repo at runtime.
- **Delivery:** check the stills before narrating, then commit the sources. Do not publish a film or plate as an artifact. Do not render or send MP4s; the user renders them with `build/render.sh` (see `RENDERING.md`).
- **Parallel renders:** each film renders in its own `build/work/<film>/` folder, so several films can render at once.
- **Archive:** commit every film's sources to the Pulse Casebook repo under `films/`, one folder per film. That means the page, scene script, narration MP3, subtitles and any build changes. MP4s are not committed.
