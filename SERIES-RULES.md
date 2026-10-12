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

- Every operator name, parameter, default label, null rule, error code and stage order is checked against the source or the skill pack (`internal/skills/`) before it goes on screen.
- Facts already confirmed by checking:
  - Filter components: `n_in` is the records the filter saw. `n_out` is the records it admitted. `n_null_input` is the records dropped because the field was null.
  - `FEAT_BUCKETIZE` emits a bucket index, not a label.
  - The limits preflight refuses only certain findings (`MaxEstimatedMemory`, `MaxMatrixDim`). `MaxGroups` is only a possible finding.
  - Slot order: `features → filterers → attributes → groups → aggregations → windows → sort`.
  - `ATTR_ZSCORE` and `ATTR_TSCORE` use the population mean and SD (√(M2/Σw)). A null input scores 0 for z-score and 50 for t-score, not null. Normalized, percentile, date-part, code-in, set-has and popcount also map null to 0. Regression and multivariate attributes return null.
  - Attributes run in declared order and can read earlier attribute labels (`attribute_two_pass_order_test.go`). The `attribute-composition` skill's "no in-slot chaining" rule is stale. Code-in and the multivariate scores read source columns only.
  - An unguarded null in `ATTR_FORMULA` arithmetic raises `PROCESSING_RUNTIME`, which fails the request.
  - Aggregators skip nulls: `n` is the non-null values used and `n_null` the values skipped. `AGG_VARIANCE` and `AGG_STDDEV` divide by n; `AGG_WELFORD` divides by n − 1. The CI bounds use the normal z and are null for n < 2. `AGG_RATIO` is Σnum ÷ Σden and is null when the denominators sum to 0. Skewness and kurtosis return 0 for n ≤ 1. Mergeability: median and percentile are `none`; distinct counts and sums, mode, mode count and set frequency are `partial`; the rest are `mergeable`.
  - Windows: nulls sort last in both directions and still get a rank; rows come back in input order; `WIN_DELTA` keeps a zero prior while `WIN_PCT_CHANGE` returns null; running and moving aggregates skip nulls; `WIN_EWMA` emits null on a null row but keeps its state. ProcessChain refuses windows (`PULSE_CHAIN_NOT_MERGEABLE`), so a later step that filters on a window column uses `materialize` first.
  - Tests and regressions: `tests` (tier 1) and `regressions` read the raw records that pass the filters; `post_tests` (tier 2) read the result rows after windows. Results land in `Response.Tests`, `Response.PostTests` and `Response.Regressions`, with no `Response.Components`. Every test returns `statistic`, `df`, a two-sided `p_value`, `alpha` (default 0.05) and `reject_null`, and the rest goes in `details` (for `TEST_T`: `diff`, `ci_low`, `ci_high`, `effect_size.cohens_d`). `TEST_T` with `split_by` is Welch's two-sample form. `TEST_CHISQ` axes must be categorical. An expected count under 5 warns `PULSE_TEST_EXPECTED_COUNT_TOO_LOW`. `TEST_TUKEY_HSD` is a post-test, is never weighted and never joins a multiplicity family. A `multiplicity` block adds `p_adjusted` and `significant_adjusted` beside the raw p, which never moves; the methods match R `p.adjust`; predict raises `PULSE_ADVISORY_MANY_TESTS` at ten or more uncorrected p-values. `REG_OLS` and `REG_BAYES_LINEAR` stream; `REG_GLM`, resampling and selection buffer. OLS p-values are Student t, GLM uses Wald z, and the Bayesian fit has credible intervals and no p-values. A null drops the row from `n_obs`. Selected-out predictors are absent, not zero. A penalty with selection is a predict warning (`PROCESSING_REGRESSION_REGULARIZED_SELECTION`), not a refusal. Tests can be registered through `Options.Extensions`; regressions cannot.
  - Matrices: a `vectors` entry names numeric members by `fields` (literals keep their order, globs expand in schema order) or an unanchored `pattern`; `packed_bool` joins only under `coerce: "binary"`; categorical, set, date, datetime and decimal128 are refused (`PULSE_VECTOR_MEMBER_TYPE`). Matrices fold the filter-passing records and arrive at the final flush, never row by row. `listwise` is the default; `pairwise` adds `auxiliary.n` and can be non-PSD, which is a warning on covariance and correlation and fatal on the decompositions (partial correlation, reliability's omega, PCA, factor analysis, collinearity) unless `repair: "nearest"`. Rank methods are buffered, serial and frequency-weight only. Matrices carry no p-values. With `groups`, each bucket gets its own matrix, equal to the ungrouped matrix over exactly its rows. Matrices are refused with joins (`PULSE_MATRIX_UNSUPPORTED_SOURCE`) and with a crosstab (`PULSE_MATRIX_HOST_CONFLICT`). Matrix operators cannot be registered through `Options.Extensions`, but `MAT_DISTANCE`'s `between` accepts an extension grouper.
  - Overlays: each spec adds one read-only layer to `Response.Overlays` in spec order, and the base crosstab and components are byte-identical with or without overlays (checked). The request decides the host: a crosstab (matrix), a grouped process (series), `FacetRequest.Overlays`, `ChainRequest.Overlays`, Compose, and formula over any of them. A series kind on a crosstab is refused `PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE` by predict and runtime alike; a rolling z-score without `window` is `PULSE_OVERLAY_PARAM_MISSING` at predict. `OVERLAY_CHISQ_VS_REF`'s scalar is the p-value, while `OVERLAY_CHISQ_MATRIX`'s and `OVERLAY_CHISQ_VS_POP`'s is χ². An unknown sibling gives null entries and `PULSE_OVERLAY_REF_UNKNOWN`, and the request still succeeds. YoY's first year is null with no warning. Index vs prior streams; rolling, baseline, YoY and sibling kinds buffer. Inferential kinds refuse a weight (`PULSE_WEIGHT_UNSUPPORTED`), except the weighted pairwise two-means z. Overlay kinds cannot be registered through `Options.Extensions`; embedder expression functions reach `OVERLAY_FORMULA`.
  - Behaviour the films avoid until it is settled in code: a second plain `groups` entry is ignored without a warning; a crosstab row that is null on a row axis still reaches the column margin and grand total; aggregators over zero rows return 0 where some skills say NaN; `process` runs an open-ended `WIN_MOVING_AVG` frame that `predict` refuses; `OVERLAY_SHARE_OF_ROW` with a column-axis ref runs as a row share instead of being refused; the share-of-row layer reports `summary.baseline` 0 where its skill says 1; a series-host overlay warning lands in `Response.warnings`, not on its layer.
- Cohorts, samples, p-values and correlations are illustrative. Each page says so in its note. The tests and regressions, matrices and overlays films use generated cohorts, but every figure on their result cards comes from a real Pulse run on those cohorts.

## 4. Series order

1. Lifecycle of a request.
2. Concepts overview.
3. Then one deep dive per category in pipeline order:
   1. features
   2. filters
   3. attributes
   4. groupers (deferred until the grouper behaviour above is settled)
   5. aggregators
   6. windows
   7. tests and regressions
   8. matrices
   9. overlays

## 5. Production conventions

- **Subtitles:** the subtitles are the narration. Code names stay in subtitles and are written out for speech in the spoken text (for example, "a range filter" for `FILTER_RANGE`).
- **Rendering:** films use `films/film-kit.js`. `draw(t)` must be a pure function of `t`. The narration lengths in `NARR` stretch each cue.
- **Voice:** Kokoro `af_heart` at speed 1.0, unless the voice is changed for the whole series at once.
- **Visual identity:** the film stage is always dark. Colours carry the same role in every film:

  | Colour | Role |
  |---|---|
  | teal | records and execution |
  | amber | metadata and no-execute reads |
  | violet | derived output |
  | coral | checks, refusals and nulls |

- **Delivery:** check the stills before narrating. Publish the page as an artifact and commit the sources. Do not render or send MP4s; the user renders them with `films/build/render.sh` (see `RENDERING.md`).
- **Parallel renders:** each film renders in its own `films/build/work/<name>/` folder, so several films can render at once.
- **Archive:** commit every film's sources to the `pulse-anatomy-films` branch under `pulse-anatomy/`. That means the page, scene script, narration MP3, subtitles and any build changes. The branch is an archive and is never merged. MP4s are not committed.
