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
- Cohorts, samples, p-values and correlations are illustrative. Each page says so in its note.

## 4. Series order

1. Lifecycle of a request.
2. Concepts overview.
3. Then one deep dive per category in pipeline order:
   1. features
   2. filters
   3. attributes
   4. groupers
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
