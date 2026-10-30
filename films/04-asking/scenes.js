/* Pulse: Asking Before Running — film 4 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts, lists labelled "today" or "this instance".
 * Amber (metadata and no-execute reads) leads; teal marks the calls that read records; coral marks refusals.
 * The cohort is an illustrative 800-shopper A/B test (data/s.csv). Every figure, code, key and draft on a result card
 * is copied from a recorded alpha.33 run in data/ (see data/README.md); the comment beside each constant names it. */
(() => {
const { C } = PulseFilm;
const { seg, eo, R, T, M, CAP, Ln, A, dot, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke, fill) => R(x, y, w, h, { fill: fill || C.panel, stroke: stroke || C.rule });
const fade = (t, a, d = 0.35) => seg(t, a, a + d);
/* lines of mono text: [text, colour?, size?] */
const lines = (L, x, y, lh, o = {}) => L.forEach(([s, c, sz], i) => A(o.t == null ? 1 : fade(o.t, o.at + i * (o.step ?? 0.12)), () => M(s, x, y + i * lh, { size: sz || o.size || 13, color: c || o.color || C.ink })));

/* ---------- recorded figures ---------- */
const FIELDS = [   // s.inspect.json (descriptions from s.schema.json at import)
  ['id', 'u16', false, 'Shopper ID, one row per shopper', ''],
  ['region', 'categorical_u8', false, 'Sales region the shopper belongs to', 'North · West · South · East'],
  ['plan', 'categorical_u8', false, 'Subscription plan: Basic, Plus or Pro', 'Basic · Pro · Plus'],
  ['arm', 'categorical_u8', false, 'A/B test arm: control or variant', 'control · variant'],
  ['spend', 'f64', true, 'Spend over the test period, in dollars', ''],
  ['visits', 'u8', false, 'Store visits over the test period', ''],
  ['signup', 'date', false, 'Date the shopper signed up', '']];
const RECORDS = 800;                                                                      // s.inspect.json record_count
const SCOPE_TESTS = ['TEST_ANOVA_F', 'TEST_ANOVA_RM', 'TEST_ANOVA_WELCH', 'TEST_BOX_M', 'TEST_BROWN_FORSYTHE', 'TEST_CHISQ', 'TEST_FISHER_EXACT',
  'TEST_HOTELLING_T2', 'TEST_KRUSKAL_WALLIS', 'TEST_KS', 'TEST_MANN_WHITNEY_U', 'TEST_MANOVA', 'TEST_PAIRED_T', 'TEST_PROP_Z', 'TEST_T', 'TEST_WELCH',
  'TEST_WILCOXON_SR', 'TEST_Z_TWO_SAMPLE'];                                              // manifest.compare_groups.json tests[]
const SCOPE_GROUPERS = ['GROUP_CATEGORY', 'GROUP_DATE_RANGES', 'GROUP_NUMERIC_RANGES', 'GROUP_SET_PER_ELEMENT'];   // ... components.groupers
const SCOPE_AGGS = ['AGG_CI_LOWER', 'AGG_CI_UPPER', 'AGG_VEC_MEAN', 'AGG_WELFORD'];       // ... components.aggregators
const ELIDED = ['cohort_types', 'commands', 'components_schemas', 'error_codes', 'error_domains', 'export', 'extensions', 'facet', 'import', 'join',
  'limits', 'mcp_tools', 'operations', 'process_chain', 'synth_distributions'];          // ... elided (count field left out)
const FS_DIGEST = 'fs1:0db8e6f718ad…', LIM_DIGEST = 'lim1:ace12be491d5…', VERSION = 'v1.0.0-alpha.33';   // ... digests
const PROFILE_TOOLS = ['pulse_errors_lookup', 'pulse_examples_get', 'pulse_examples_search', 'pulse_inspect', 'pulse_manifest', 'pulse_predict',
  'pulse_process', 'pulse_skills_get', 'pulse_skills_list'];                              // mcp.tools.json
const VALID_ROOT = 'aggregations · attributes · cohort · disable_components · features · filterers · groups · label · labels · outputs · post_tests · regressions · return · sort · tests · time_zone · time_zone_field · windows';   // mcp.par.json
const REC0 = { op: 'TEST_PROP_Z', level: 'basic', ph: ['cohort', 'field', 'split_by', 'success'] };   // rec0.out.json recommendations[0]
const REC = [['TEST_ANOVA_F', 'intermediate'], ['TEST_ANOVA_WELCH', 'intermediate'], ['TEST_KRUSKAL_WALLIS', 'intermediate']];   // rec.out.json
const AB = { t: 1.83, df: 777.0, p: 0.0673, diff: 4.63, lo: -0.33, hi: 9.59, mv: 70.91, mc: 66.28, nv: 398, nc: 381, d: 0.131 };  // ab.out.json, ab.found.json
const AVG = 68.6, N = 779, NNULL = 21;                                                  // ab.found.json aggregations[1]
const PAR = [[64, 118.32], [58, 125.10]], PAR2 = [[76, 39.84], [67, 45.49]], PAR_N = 122, PAR2_N = 143;   // par.out.json, par2.out.json
const NORTH = { n: 226, count: 221, nul: 5, mean: 67.60, sd: 36.90, min: 5, max: 161.8, bins: [37, 69, 57, 28, 28, 2] };   // fs.out.json fields.spend
const ADD = [['North', 226], ['East', 212], ['South', 196], ['West', 166]];               // fs.out.json additive.region

/* ---------- 1. title ---------- */
function sTitle(t) {
  A(fade(t, 0, 0.5), () => { card(450, 210, 380, 150, C.amber); M('pulse_predict', 640, 262, { size: 20, color: C.amber, align: 'center', weight: 600 }); });
  A(fade(t, 0.4, 0.5), () => { M('valid · errors · warnings · advisories', 640, 300, { size: 14, align: 'center' }); M('no record read', 640, 330, { size: 13, align: 'center', color: C.muted }); });
  A(fade(t, 1.0, 0.6), () => T('Ask first, then run', 640, 430, { size: 24, align: 'center', color: C.muted }));
}

/* ---------- 2. two kinds of call ---------- */
function sKinds(t) {
  A(fade(t, 0.2), () => {
    card(64, 120, 470, 430, C.amber);
    CAP('NO-EXECUTE READS · AMBER', 86, 150, { color: C.amber });
    [['manifest', 'the catalog'], ['inspect', 'header + schema'], ['examples · recommend', 'runnable drafts'], ['skills', 'the skill pack'],
     ['predict', 'header + schema'], ['explain', 'request, or a result'], ['errors lookup', 'the code table']]
      .forEach(([a, b], i) => A(fade(t, 0.4 + i * 0.15), () => { M(a, 86, 192 + i * 48, { size: 15, color: C.amber, weight: 600 }); M(b, 512, 192 + i * 48, { size: 13, align: 'right' }); }));
  });
  /* the cohort file: header + schema, then records */
  A(fade(t, 1.6), () => {
    R(566, 160, 148, 70, { fill: C.amberS, stroke: C.amber }); M('header', 640, 188, { size: 12.5, color: C.amber, align: 'center' }); M('+ schema', 640, 210, { size: 12.5, color: C.amber, align: 'center' });
    for (let k = 0; k < 9; k++) R(566, 240 + k * 34, 148, 26, { fill: C.tealS, stroke: C.teal, lw: 1 });
    M('records', 640, 572, { size: 12.5, color: C.teal, align: 'center' });
    arrow(536, 195, 560, 195, { stroke: C.amber });
  });
  A(fade(t, 3.6), () => {
    card(746, 120, 470, 430, C.teal);
    CAP('EXECUTION · TEAL', 768, 150, { color: C.teal });
    ['process', 'compose', 'process chain', 'facet', 'sample', 'materialize'].forEach((a, i) => M(a, 768, 192 + i * 48, { size: 15, color: C.teal, weight: 600 }));
    M('these read the records', 768, 500, { size: 13 });
    arrow(744, 380, 720, 380, { stroke: C.teal });
  });
}

/* ---------- 3. the session order ---------- */
function sOrder(t) {
  CAP('SESSION-BOOTSTRAP · THE ORDER AN AGENT FOLLOWS', 64, 124, { color: C.amber });
  const S = [['pulse_manifest', 'once per session', C.amber], ['pulse_inspect', 'once per cohort', C.amber], ['examples · recommend', 'per question: a draft', C.amber],
    ['pulse_skills_get', 'on demand: gotchas', C.amber], ['pulse_predict', 'until clean', C.amber], ['pulse_process', 'execute', C.teal], ['pulse_errors_lookup', 'per unique code', C.amber]];
  const x0 = 64, w = 152, g = 14;
  S.forEach(([n, c, col], i) => {
    const at = i < 2 ? 0.3 + i * 0.4 : i < 5 ? 2.4 + (i - 2) * 0.4 : 4.6 + (i - 5) * 0.5;
    A(fade(t, at), () => {
      const x = x0 + i * (w + g);
      R(x, 170, w, 92, { fill: C.panel, stroke: col, lw: i === 4 ? 2 : 1.3 });
      M(String(i + 1), x + 12, 192, { size: 12, color: C.faint });
      M(n, x + w / 2, 222, { size: n.length > 17 ? 11 : 12, color: col, align: 'center', weight: 600 });
      M(c, x + w / 2, 246, { size: 11, align: 'center', color: C.muted });
      if (i < S.length - 1) arrow(x + w, 216, x + w + g, 216, { stroke: C.faint, head: 5 });
    });
  });
  A(fade(t, 0.8), () => { Ln([[64, 290], [382, 290]], { stroke: C.amber, dash: [4, 4] }); M('steps 1–2: cached', 64, 312, { size: 12.5, color: C.amber }); });
  A(fade(t, 3.6), () => { Ln([[396, 290], [880, 290]], { stroke: C.amber, dash: [4, 4] }); M('steps 3–5: every question re-enters here', 396, 312, { size: 12.5, color: C.amber }); });
  A(fade(t, 5.4), () => {
    M('read the result with pulse_explain', 906, 290, { size: 12, color: C.amber });
    Ln([[1140, 264], [1140, 350], [802, 350], [802, 266]], { stroke: C.coral, dash: [5, 4] }); arrow(802, 280, 802, 266, { stroke: C.coral, head: 6 });
    M('apply fixups[] → predict again', 970, 372, { size: 12.5, color: C.coral, align: 'center' });
  });
  A(fade(t, 5.6), () => {
    card(64, 410, 1152, 150);
    CAP('WHICH LAYER ANSWERS WHAT', 86, 438);
    [['manifest', 'the contract: what this instance offers'], ['inspect', 'field names and values'], ['examples', 'runnable JSON'], ['skills', 'gotchas, slot names, rationale'], ['errors lookup', 'prose and fixups per code']]
      .forEach(([a, b], i) => { const x = 86 + (i % 2) * 570, y = 470 + Math.floor(i / 2) * 32; M(a, x, y, { size: 13.5, color: C.amber, weight: 600 }); M(b, x + 150, y, { size: 13 }); });
  });
}

/* ---------- 4. the manifest ---------- */
function sManifest(t) {
  A(fade(t, 0.2), () => {
    card(64, 110, 560, 300, C.amber);
    CAP('pulse --json · THE CONTRACT', 86, 138, { color: C.amber });
    lines([['commands · operations', C.ink], ['components: aggregators · attributes · filterers', C.ink], ['            groupers · windows · features', C.ink], ['tests · post_tests · regressions · matrices', C.ink],
      ['each operator with its component_schema', C.muted], ['cohort_types · error_codes · error_domains', C.ink], ['mcp_tools · skills · intents · return_presets', C.ink],
      ['facet · join · crosstab · overlays · import · export …', C.ink], ['extensions: what embedders registered', C.violet], ['limits · feature_set_digest · limits_digest', C.amber]], 86, 168, 24, { t, at: 0.4, size: 12.5 });
  });
  A(fade(t, 3.4), () => {
    card(656, 110, 560, 300, C.amber);
    CAP('--intent compare_groups · SCOPED', 678, 138, { color: C.amber });
    M('scope.intent: Compare groups', 678, 170, { size: 13, color: C.ink });
    M('"Do A and B differ?"  "Is this segment different from the rest?"', 678, 194, { size: 12, color: C.muted });
    M('tests today', 678, 224, { size: 11.5, color: C.faint });
    chips(SCOPE_TESTS.map(s => [s, C.amber]), 678, 232, 520, { size: 10, h: 19, gap: 4 });
    M('groupers · aggregators today', 678, 344, { size: 11.5, color: C.faint });
    chips([...SCOPE_GROUPERS, ...SCOPE_AGGS].map(s => [s, C.amber]), 678, 352, 520, { size: 10, h: 19, gap: 4 });
  });
  A(fade(t, 4.6), () => {
    card(656, 424, 560, 72, C.rule);
    M('elided:', 678, 448, { size: 11.5, color: C.faint });
    M(ELIDED.slice(0, 5).join(' · '), 736, 446, { size: 10.5, color: C.muted });
    M(ELIDED.slice(5, 10).join(' · '), 736, 464, { size: 10.5, color: C.muted }); M(ELIDED.slice(10).join(' · '), 736, 482, { size: 10.5, color: C.muted });
  });
  A(fade(t, 7.4), () => {
    card(64, 424, 560, 72, C.amber);
    M('cache key', 86, 448, { size: 12, color: C.amber, weight: 600 });
    M(VERSION + ' · ' + FS_DIGEST + ' · ' + LIM_DIGEST, 86, 472, { size: 12, color: C.ink });
  });
  A(fade(t, 9.4), () => {
    R(64, 508, 1152, 58, { fill: C.panel, stroke: C.violet, dash: [6, 5] });
    M('+ more over time', 86, 532, { size: 14, color: C.violet, weight: 600 }); T('embedders register their own operators through Options.Extensions; the manifest lists both', 86, 556, { size: 15 });
  });
}

/* ---------- 5. feature profiles ---------- */
function sProfile(t) {
  A(fade(t, 0.2), () => {
    card(64, 110, 420, 250, C.amber);
    CAP('profile.json', 86, 138, { color: C.amber });
    lines([['{ "profile": "film-4-analyst",'], ['  "features": ['], ['    "capability:process",', C.amber], ['    "AGG_COUNT", "AGG_AVERAGE",'], ['    "FILTER_EXPRESSION",'], ['    "GROUP_CATEGORY" ] }']], 86, 172, 26, { t, at: 0.3 });
    A(fade(t, 1.6), () => { M('pulse features check → valid: true', 86, 338, { size: 13, color: C.teal }); });
  });
  A(fade(t, 3.2), () => {
    card(516, 110, 700, 250, C.amber);
    CAP('pulse mcp --feature-profile profile.json · tools/list', 538, 138, { color: C.amber });
    chips(PROFILE_TOOLS.map(s => [s, s === 'pulse_process' ? C.teal : C.amber]), 538, 156, 660, { size: 12, h: 24, gap: 6 });
    M('not offered under this profile:', 538, 280, { size: 12, color: C.faint });
    ['pulse_recommend', 'pulse_explain', 'pulse_facet', 'pulse_compose'].forEach((s, i) => { const x = 538 + i * 166; M(s, x, 310, { size: 12.5, color: C.faint }); Ln([[x, 306], [x + 7.8 * s.length, 306]], { stroke: C.faint, lw: 1 }); });
  });
  A(fade(t, 6.4), () => {
    card(64, 384, 1152, 176, C.coral);
    CAP('pulse_predict ← par.json, which declares "params"', 86, 412, { color: C.coral });
    M('PULSE_REQUEST_UNKNOWN_FIELD · unknown_keys: ["params"]', 86, 446, { size: 15, color: C.coral, weight: 600 });
    M('valid_keys:', 86, 478, { size: 12, color: C.faint });
    { const v = VALID_ROOT.split(' · '); M(v.slice(0, 10).join(' · '), 86, 500, { size: 12.5, color: C.ink }); M(v.slice(10).join(' · '), 86, 520, { size: 12.5, color: C.ink }); }
    M('a slot the profile hides is refused like a misspelt one, and never listed as valid', 86, 548, { size: 12.5, color: C.muted });
  });
}

/* ---------- 6. inspect ---------- */
function sInspect(t) {
  CAP('pulse_inspect · s.pulse · HEADER + SCHEMA', 64, 124, { color: C.amber });
  A(fade(t, 0.2), () => {
    card(64, 140, 1152, 340, C.amber);
    ['name', 'type', 'nullable', 'description', 'dictionary'].forEach((h, j) => M(h, [86, 230, 400, 500, 900][j], 170, { size: 11.5, color: C.faint }));
  });
  FIELDS.forEach(([n, ty, nl, d, dict], i) => A(fade(t, 0.4 + i * 0.12), () => {
    const y = 206 + i * 38;
    M(n, 86, y, { size: 14, color: C.amber, weight: 600 }); M(ty, 230, y, { size: 13 }); M(nl ? 'true' : 'false', 400, y, { size: 13, color: nl ? C.coral : C.muted });
    M(d, 500, y, { size: 12.5, color: C.muted }); M(dict, 900, y, { size: 12.5, color: C.ink });
  }));
  A(fade(t, 2.6), () => { M('record_count ' + RECORDS, 1194, 170, { size: 12.5, color: C.amber, align: 'right' }); });
  A(fade(t, 1.0), () => { R(64, 500, 560, 60, { fill: C.amberS, stroke: C.amber }); M('never a record: header, schema, sidecar', 86, 536, { size: 14, color: C.amber }); });
  A(fade(t, 4.4), () => {
    R(656, 500, 560, 60, { fill: C.panel, stroke: C.amber, dash: [6, 4] });
    M('over MCP: binds these names into the field', 678, 524, { size: 12.5 }); M('arguments of predict, process, compose, sample, facet', 678, 546, { size: 12.5 });
  });
}

/* ---------- 7. a question, an intent ---------- */
function sIntent(t) {
  A(fade(t, 0.2), () => {
    R(64, 130, 520, 70, { fill: C.panel2, stroke: C.rule, r: 18 });
    T('"Did the variant arm spend more than control?"', 86, 172, { size: 18 });
  });
  A(fade(t, 1.8), () => {
    arrow(584, 165, 640, 165, { stroke: C.amber });
    card(650, 120, 566, 196, C.amber);
    CAP('INTENT · compare_groups', 672, 148, { color: C.amber });
    M('sounds like', 672, 178, { size: 11.5, color: C.faint });
    M('"Do A and B differ?"', 672, 202, { size: 13 }); M('"Is this segment different from the rest?"', 672, 224, { size: 13 });
    M('shape', 672, 254, { size: 11.5, color: C.faint });
    M('outcome: numeric | categorical | bool, exactly 1', 672, 278, { size: 12.5, color: C.ink });
    M('group: categorical | bool, exactly 1', 672, 300, { size: 12.5, color: C.ink });
  });
  A(fade(t, 2.6), () => {
    M('spend → outcome', 86, 244, { size: 14, color: C.amber }); M('arm → group', 86, 272, { size: 14, color: C.amber });
    M('f64 · categorical_u8', 300, 258, { size: 12.5, color: C.muted });
  });
  A(fade(t, 5.4), () => {
    card(64, 340, 1152, 220);
    CAP('THE DOCS: ONE QUESTION GUIDE PER INTENT', 86, 368);
    [['The question', 'what it means in plain words'], ['Pick your analysis', 'operators by kind and level'], ['A worked example', 'a real request with its result'],
     ['How to read the result', 'what each figure says'], ['Pitfalls', 'the traps'], ['Next steps', 'where the question goes next']]
      .forEach(([a, b], i) => { const x = 86 + (i % 2) * 570, y = 408 + Math.floor(i / 2) * 44; A(fade(t, 5.6 + i * 0.12), () => { T(a, x, y, { size: 16, weight: 600 }); M(b, x + 220, y, { size: 12.5 }); }); });
  });
}

/* ---------- 8. recommend ---------- */
function sRecommend(t) {
  CAP('pulse recommend --intent compare_groups', 64, 124, { color: C.amber });
  A(fade(t, 1.2), () => {
    card(64, 140, 520, 240, C.rule);
    CAP('NO COHORT · AN UNBOUND SKELETON', 86, 168);
    M(REC0.op + ' · ' + REC0.level + ' · bound: false', 86, 200, { size: 13.5, color: C.amber, weight: 600 });
    lines([['{"cohort": {"filename": "<cohort>"},'], [' "tests": [{"type": "TEST_PROP_Z",'], ['   "field": "<field>", "split_by": "<split_by>",'], ['   "params": {"success": "<success>"}}]}']], 86, 236, 24, { size: 12.5 });
    M('placeholders: ' + REC0.ph.join(' · '), 86, 350, { size: 12.5, color: C.coral });
  });
  A(fade(t, 3.6), () => {
    card(616, 140, 600, 240, C.amber);
    CAP('--cohort s.pulse --field spend --field arm · BOUND', 638, 168, { color: C.amber });
    REC.forEach(([op, lv], i) => { M(op, 638, 204 + i * 32, { size: 14, color: C.amber, weight: 600 }); M(lv + ' · bound: true', 1194, 204 + i * 32, { size: 12.5, align: 'right', color: C.teal }); });
    M('{"tests": [{"type": "TEST_ANOVA_F", "field": "spend", "split_by": "arm"}]}', 638, 316, { size: 12, color: C.ink });
    M('each bound draft has passed predict', 638, 350, { size: 12.5, color: C.teal });
  });
  A(fade(t, 6.0), () => {
    card(64, 400, 1152, 160, C.amber);
    CAP('EVERY DRAFT CARRIES', 86, 428, { color: C.amber });
    M('why: "… It uses spend (f64) and arm (categorical_u8, 2 groups)."', 86, 462, { size: 13 });
    M('alternatives: when "there are only two groups" → TEST_WELCH', 86, 492, { size: 13, color: C.ink });
    M('follow_ups · needs · advisories · steps  · ranked by hints, fully bound, level, fewest advisories', 86, 522, { size: 12.5, color: C.muted });
    M('the right test comes from reading the draft, not from its rank', 86, 546, { size: 12.5, color: C.amber });
  });
}

/* ---------- 9. predict ---------- */
function sPredict(t) {
  CAP('pulse api predict -r ab.json', 64, 124, { color: C.amber });
  A(fade(t, 0.2), () => {
    card(64, 140, 520, 196, C.rule);
    CAP('ab.json', 86, 168);
    lines([['"aggregations": ['], ['  {"field": "spend", "label": "total_spend"},', C.amber], ['  {"type": "AGG_AVERAGE", "field": "spend", ...}],'], ['"tests": [{"type": "TEST_T", "field": "spend",'], ['           "split_by": "arm", ...}]']], 86, 200, 25, { size: 12.5 });
  });
  A(fade(t, 1.6), () => {
    card(616, 140, 600, 196, C.amber);
    CAP('THE ANSWER', 638, 168, { color: C.amber });
    M('valid: true · errors: [] · warnings: []', 638, 202, { size: 14, color: C.teal, weight: 600 });
    A(fade(t, 3.0), () => {
      M('defaults_applied:', 638, 236, { size: 12.5, color: C.faint });
      M('aggregations[0] "f64 → AGG_SUM (rule: numeric default)"', 638, 260, { size: 12.5, color: C.amber });
    });
    A(fade(t, 5.2), () => { M('streamable: true', 638, 296, { size: 13, color: C.ink }); M('p_values: total 1 · uncorrected 1', 638, 320, { size: 12.5, color: C.muted }); });
  });
  A(fade(t, 6.4), () => {
    card(64, 356, 1152, 84, C.amber);
    M('med.json · AGG_MEDIAN by region', 86, 386, { size: 13 });
    M('streamable: false · streamable_reasons: ["aggregation AGG_MEDIAN is not streamable"]', 86, 414, { size: 13, color: C.amber });
  });
  A(fade(t, 8.6), () => {
    card(64, 456, 1152, 104);
    CAP('ALSO IN EVERY ANSWER, WHEN THEY APPLY', 86, 484);
    M('limit_findings: a resource limit a figure would exceed · certain refuses, possible only warns', 86, 514, { size: 12.5 });
    M('post_window: windows first, and the attributes that run after the windows · advisories', 86, 540, { size: 12.5 });
  });
}

/* ---------- 10. the same refusal on both sides ---------- */
function sParity(t) {
  CAP('split.json · TEST_T split by arm, on a request grouped by arm', 64, 124, { color: C.amber });
  A(fade(t, 0.2), () => {
    card(64, 140, 1152, 70);
    M('"groups": [{"field": "arm"}],  "tests": [{"type": "TEST_T", "field": "spend", "split_by": "arm"}]', 86, 182, { size: 14 });
  });
  A(fade(t, 2.6), () => {
    ['control', 'variant'].forEach((g, i) => { const x = 160 + i * 220; R(x, 236, 180, 70, { fill: C.panel, stroke: C.rule }); M('group: ' + g, x + 90, 266, { size: 13, align: 'center' }); M('arm: ' + g + ' only', x + 90, 290, { size: 12, align: 'center', color: C.coral }); });
    M('nothing to compare inside a group', 860, 276, { size: 13, color: C.coral, align: 'center' });
  });
  [['pulse api predict', 'valid: false · no record read', 64], ['pulse api process', 'refused · exit status 1', 656]].forEach(([h, s, x], i) => A(fade(t, 4.4 + i * 1.0), () => {
    card(x, 330, 560, 230, C.coral);
    CAP(h, x + 22, 358, { color: i ? C.teal : C.amber });
    M('PULSE_TEST_SPLIT_GROUPS_LT_2', x + 22, 396, { size: 15, color: C.coral, weight: 600 });
    M('details.reason: split_is_grouper', x + 22, 426, { size: 13 });
    M('slot: split_by · field: arm', x + 22, 452, { size: 13, color: C.muted });
    M(s, x + 22, 530, { size: 12.5, color: C.muted });
  }));
}

/* ---------- 11. strict input ---------- */
function sStrict(t) {
  CAP('typo.json · PULSE REFUSES WHAT IT DOES NOT UNDERSTAND', 64, 124, { color: C.coral });
  A(fade(t, 0.2), () => {
    card(64, 140, 1152, 70);
    M('"aggregations": [{"type": "AGG_AVERAGE", "field": "spend", ', 86, 182, { size: 14 });
    M('"lable": "avg_spend"}]', 594, 182, { size: 14, color: C.coral, weight: 600 });
  });
  A(fade(t, 2.0), () => {
    card(64, 230, 1152, 236, C.coral);
    M('PULSE_REQUEST_UNKNOWN_FIELD', 86, 270, { size: 17, color: C.coral, weight: 700 });
    [['details.path', 'aggregations[0].lable'], ['suggestions', '{"lable": "label"}   did you mean "label"?'], ['valid_keys', 'field · fields · label · params · type · vector · weight']]
      .forEach(([a, b], i) => A(fade(t, 2.6 + i * 0.5), () => { M(a, 86, 316 + i * 36, { size: 13, color: C.faint }); M(b, 260, 316 + i * 36, { size: 14, color: i === 1 ? C.amber : C.ink }); }));
    A(fade(t, 4.4), () => M('"An unknown key is refused, never ignored, so a misspelled or misplaced key cannot silently drop the intended operation."', 86, 440, { size: 12.5, color: C.muted }));
  });
  A(fade(t, 5.6), () => {
    card(64, 486, 1152, 74);
    M('predict: refused · process: refused, same code and path', 86, 516, { size: 14, color: C.ink });
    M('at any depth: a sort entry, a crosstab cell, a Compose slot, a chain stage, a params block', 86, 542, { size: 12.5, color: C.muted });
  });
}

/* ---------- 12. errors lookup and fixups ---------- */
function sErrors(t) {
  CAP('pulse errors lookup PULSE_REQUEST_UNKNOWN_FIELD', 64, 124, { color: C.amber });
  A(fade(t, 0.2), () => {
    card(64, 140, 1152, 250, C.amber);
    M('code · domain', 86, 172, { size: 12, color: C.faint }); M('PULSE_REQUEST_UNKNOWN_FIELD · PULSE', 260, 172, { size: 13.5, color: C.ink });
    M('message', 86, 202, { size: 12, color: C.faint }); M('"The request JSON contains a key that is not a recognised slot of the object it sits in …"', 260, 202, { size: 12.5, color: C.muted });
  });
  A(fade(t, 1.8), () => {
    M('fixups[0]', 86, 242, { size: 12, color: C.faint });
    M('action: REPLACE_FIELD', 260, 242, { size: 14, color: C.amber, weight: 600 });
    M('"Rename the offending key to its canonical request slot: the error details carry the nearest', 260, 270, { size: 12.5 });
    M('valid key under suggestions and every slot this instance accepts under valid_keys."', 260, 290, { size: 12.5 });
    M('examples: groupers -> groups · aggregators -> aggregations', 260, 322, { size: 13, color: C.amber });
    M('the manifest names operators "groupers"; the request slot is "groups"', 260, 350, { size: 12.5, color: C.muted });
  });
  A(fade(t, 4.0), () => {
    const st = [['read errors[]', C.coral], ['look up each code', C.amber], ['apply fixups[]', C.amber], ['predict again', C.amber], ['run when clean', C.teal]];
    st.forEach(([s, c], i) => { const x = 64 + i * 236; R(x, 414, 210, 50, { fill: C.panel, stroke: c }); M(s, x + 105, 444, { size: 13, color: c, align: 'center' }); if (i < 4) arrow(x + 210, 439, x + 234, 439, { stroke: C.faint, head: 5 }); });
  });
  A(fade(t, 6.6), () => {
    card(64, 486, 1152, 74);
    M('a script reads the CLI exit status:', 86, 516, { size: 13, color: C.muted });
    M('0 ok, warnings allowed · 1 fatal: errors in the envelope · 2 usage error, no envelope', 86, 542, { size: 14, color: C.ink });
  });
}

/* ---------- 13. advisories ---------- */
function sAdvisory(t) {
  CAP('regions.json · TEST_T split by region', 64, 124, { color: C.amber });
  A(fade(t, 0.2), () => {
    card(64, 140, 1152, 60);
    M('will this run? → errors, warnings      does this analysis fit the data? → advisories', 86, 177, { size: 14, color: C.ink });
  });
  A(fade(t, 2.0), () => {
    card(64, 216, 1152, 150, C.amber);
    CAP('pulse api predict · valid: true · data.advisories[0]', 86, 244, { color: C.amber });
    M('PULSE_ADVISORY_TWO_GROUP_TEST_MANY_GROUPS', 86, 278, { size: 15, color: C.amber, weight: 600 });
    M('split_by: region · groups: 4 (read from the dictionary) · operator: TEST_T', 86, 306, { size: 13 });
    M('suggested: TEST_ANOVA_WELCH', 86, 336, { size: 14, color: C.ink, weight: 600 });
  });
  A(fade(t, 4.6), () => {
    M('never a warning · --strict never escalates it · valid never changes · the request runs as written', 64, 392, { size: 13, color: C.amber });
  });
  A(fade(t, 6.4), () => {
    card(64, 410, 560, 150, C.coral);
    CAP('pulse api process · tests[0]', 86, 438, { color: C.teal });
    M('error: PULSE_TEST_SPLIT_GROUPS_LT_2', 86, 470, { size: 13.5, color: C.coral, weight: 600 });
    M('"TEST_T two-sample sees 4 groups"', 86, 496, { size: 12.5 });
    M('warnings: PULSE_SLOT_FAILED · exit status 0', 86, 530, { size: 13, color: C.coral });
    card(656, 410, 560, 150, C.teal);
    CAP('data · the rest survives', 678, 438, { color: C.teal });
    T('avg_spend  ' + AVG.toFixed(1), 678, 492, { size: 26, weight: 700 });
    M('the failed slot fails alone; Strict fails the run', 678, 530, { size: 12.5, color: C.muted });
  });
}

/* ---------- 14. explain ---------- */
function sExplain(t) {
  CAP('pulse explain', 64, 124, { color: C.amber });
  A(fade(t, 0.2), () => {
    card(64, 140, 560, 250, C.amber);
    CAP('-r ab.json · REQUEST MODE · NEVER RUN', 86, 168, { color: C.amber });
    M('"This request reads `s.pulse` and runs', 86, 202, { size: 12.5 }); M(' 2 aggregations and 1 test."', 86, 222, { size: 12.5 });
    lines([['aggregations[0] AGG_SUM · defaulted: true', C.amber], ['aggregations[1] AGG_AVERAGE on spend'], ['tests[0] TEST_T on spend split by arm']], 86, 262, 28, { t, at: 0.8, size: 12.5 });
    M('valid: true · predict-checked', 86, 360, { size: 12.5, color: C.teal });
  });
  A(fade(t, 2.6), () => {
    card(656, 140, 560, 250, C.amber);
    CAP('--response ab.out.json · RESPONSE MODE', 678, 168, { color: C.amber });
    M('TEST_T · spend split by arm', 678, 200, { size: 13, color: C.muted });
    T('variant ' + AB.mv.toFixed(2) + '  vs  control ' + AB.mc.toFixed(2), 678, 238, { size: 20, weight: 700 });
    M('diff ' + AB.diff.toFixed(2) + ' · 95% CI ' + AB.lo.toFixed(2) + ' to ' + AB.hi.toFixed(2) + ' · n ' + AB.nv + ' / ' + AB.nc, 678, 268, { size: 12.5 });
    M('t ' + AB.t.toFixed(2) + ' · df ' + AB.df.toFixed(1) + ' · p ' + AB.p, 678, 292, { size: 12.5 });
    A(fade(t, 4.4), () => {
      M('verdict: no_evidence_of_difference', 678, 332, { size: 14, color: C.amber, weight: 600 });
      M('strength_band: very small · Cohen (1988) · d ' + AB.d, 678, 360, { size: 12.5 });
    });
  });
  A(fade(t, 4.4), () => M('no evidence of a difference is not evidence of none', 640, 418, { size: 13.5, color: C.amber, align: 'center' }));
  A(fade(t, 6.6), () => {
    card(64, 436, 1152, 124);
    CAP('CAVEATS · RELAY THEM, NEVER DROP THEM', 86, 464);
    ['Rows are independent of each other, within and across groups.', 'The average is roughly normally distributed: safe for large groups, risky for small skewed ones.',
     'The p-value is two-sided: it looks for a difference in either direction.'].forEach((s, i) => M('TEST_T: ' + s, 86, 494 + i * 24, { size: 12.5, color: C.ink }));
  });
}

/* ---------- 15. params and templates ---------- */
function sParams(t) {
  CAP('Request.Params · NAMED CONSTANTS', 64, 124, { color: C.amber });
  A(fade(t, 0.2), () => {
    card(64, 140, 1152, 92);
    M('"params": {"plan": "Pro", "min_visits": 5},', 86, 174, { size: 14, color: C.amber });
    M('"filterers": [{"type": "FILTER_EXPRESSION", "expression": "plan == params.plan && visits >= params.min_visits"}]', 86, 206, { size: 13 });
  });
  const tbl = (x, title, rows, n) => {
    card(x, 250, 360, 150, C.teal);
    CAP(title, x + 20, 276, { color: C.teal });
    M('arm', x + 20, 304, { size: 11.5, color: C.faint }); M('shoppers', x + 200, 304, { size: 11.5, color: C.faint, align: 'right' }); M('avg_spend', x + 336, 304, { size: 11.5, color: C.faint, align: 'right' });
    ['control', 'variant'].forEach((a, i) => { M(a, x + 20, 332 + i * 26, { size: 13.5 }); M(String(rows[i][0]), x + 200, 332 + i * 26, { size: 13.5, align: 'right' }); M(rows[i][1].toFixed(2), x + 336, 332 + i * 26, { size: 13.5, align: 'right' }); });
    M(n + ' of ' + RECORDS + ' passed the filter', x + 20, 388, { size: 11.5, color: C.muted });
  };
  A(fade(t, 2.2), () => tbl(64, 'plan "Pro" · min_visits 5', PAR, PAR_N));
  A(fade(t, 3.4), () => tbl(444, 'plan "Basic" · min_visits 5', PAR2, PAR2_N));
  A(fade(t, 3.4), () => M('same expression text', 1000, 330, { size: 13, color: C.amber, align: 'center' }));
  A(fade(t, 5.0), () => {
    card(824, 360, 392, 40, C.coral);
    M('undeclared params.min_visits → PULSE_PARAMS_UNDECLARED', 840, 385, { size: 10.5, color: C.coral });
  });
  A(fade(t, 6.8), () => {
    card(64, 418, 1152, 142, C.amber);
    CAP('A STORED TEMPLATE · templates/plan_spend.json · RENDERED BY THE EMBEDDER, THEN PREDICTED', 86, 444, { color: C.amber });
    M('{"target": "request",', 86, 476, { size: 13 });
    M(' "variables": [{"name": "plan", "type": "enum", "values": ["Basic", "Plus", "Pro"]}, {"name": "min_visits", "type": "integer", "default": 5}],', 86, 500, { size: 12 });
    M(' "body": { ... "params": {"plan": {"$var": "plan"}, "min_visits": {"$var": "min_visits"}} ... }}', 86, 524, { size: 13 });
    M('$var keeps the type: 5 stays a number · {{name}} inside an expression is refused, PULSE_TEMPLATE_EXPR_SPLICE', 86, 550, { size: 12, color: C.muted });
  });
}

/* ---------- 16. a facet ---------- */
function sFacet(t) {
  CAP('pulse api facet · fs.json · A CHEAP FIRST LOOK THAT DOES READ RECORDS', 64, 124, { color: C.teal });
  A(fade(t, 0.2), () => {
    card(64, 140, 1152, 52);
    M('fields ["spend"] · filter region = North · additive_fields ["region"] · histogram 6 bins over [0, 180]', 86, 172, { size: 13 });
  });
  A(fade(t, 1.6), () => {
    card(64, 210, 680, 350, C.teal);
    CAP('fields.spend · North · ' + NORTH.n + ' of ' + RECORDS + ' records', 86, 238, { color: C.teal });
    M('count ' + NORTH.count + ' · null_count ' + NORTH.nul + ' · mean ' + NORTH.mean.toFixed(2) + ' · stddev ' + NORTH.sd.toFixed(2), 86, 268, { size: 13 });
    M('min ' + NORTH.min + ' · max ' + NORTH.max, 86, 292, { size: 13, color: C.muted });
    const bx = 110, by = 520, bw = 90, mx = 69;
    NORTH.bins.forEach((v, i) => A(fade(t, 2.4 + i * 0.12), () => {
      const h = 180 * v / mx; R(bx + i * bw, by - h, bw - 10, h, { fill: C.tealS, stroke: C.teal, r: 3 });
      M(String(v), bx + i * bw + (bw - 10) / 2, by - h - 8, { size: 12, align: 'center', color: C.ink });
      M(String(i * 30), bx + i * bw - 4, by + 18, { size: 11, color: C.faint, align: 'center' });
    }));
    A(fade(t, 2.4), () => M('180', bx + 6 * bw - 4, by + 18, { size: 11, color: C.faint, align: 'center' }));
  });
  A(fade(t, 4.6), () => {
    card(776, 210, 440, 250, C.teal);
    CAP('additive.region', 798, 238, { color: C.teal });
    M('the region filter lifted for this count', 798, 264, { size: 12, color: C.muted });
    ADD.forEach(([r, n], i) => { M(r, 798, 304 + i * 34, { size: 14, color: i ? C.ink : C.teal }); R(890, 290 + i * 34, 240 * n / 226, 18, { fill: i ? C.panel2 : C.tealS, stroke: i ? C.rule : C.teal, r: 3 }); M(String(n), 1196, 304 + i * 34, { size: 13.5, align: 'right' }); });
  });
  A(fade(t, 6.6), () => {
    card(776, 476, 440, 84, C.violet);
    M('facets host population overlays too:', 798, 506, { size: 12.5, color: C.violet });
    M('today: index, χ², KS and z vs a population · film 16', 798, 532, { size: 12.5 });
  });
}

/* ---------- 17. recap ---------- */
function sRecap(t) {
  const end = seg(t, 8.0, 8.8);
  A(1 - end, () => {
    CAP('ASK FIRST, THEN RUN', 64, 124, { color: C.amber });
    const S = [['manifest', 'what this instance offers'], ['inspect', 'what this cohort holds'], ['recommend', 'a draft for the question'], ['predict', 'until clean, advisories read'],
      ['process', 'the one call that runs'], ['explain', 'the result, with its caveats'], ['errors lookup', 'fixups for any code']];
    S.forEach(([a, b], i) => A(fade(t, 0.2 + i * 0.3), () => {
      const y = 150 + i * 46, col = a === 'process' ? C.teal : C.amber;
      R(64, y, 1152, 38, { fill: C.panel, stroke: col }); M(a, 86, y + 25, { size: 15, color: col, weight: 600 }); M(b, 300, y + 25, { size: 14, color: C.ink });
    }));
    A(fade(t, 3.4), () => {
      R(64, 484, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ more over time', 82, 510, { size: 14, color: C.amber, weight: 600 }); T('operators, skills and examples · the manifest lists them', 82, 536, { size: 14.5 });
      R(650, 484, 566, 66, { fill: C.panel, stroke: C.violet, dash: [6, 5] }); M('Options.Extensions', 668, 510, { size: 14, color: C.violet, weight: 600 }); T('your own operators, listed in the manifest beside the built-ins', 668, 536, { size: 14.5 });
    });
  });
  A(seg(t, 8.6, 9.4), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('ASKING FIRST', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.amber });
    M('nothing runs until predict is clean', 640, 430, { size: 15, align: 'center' });
    M('next: features', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[1.323, 5.973, 4.821, 2.667, 6.357, 7.381, 6.229, 7.36, 6.549, 6.528, 7.915, 6.123, 5.205, 5.504, 7.253, 4.053, 7.189, 4.373, 5.077, 5.12, 3.392, 5.888, 6.592, 7.616, 3.243, 3.392, 5.696, 5.184, 4.864, 6.613, 3.52, 5.12, 5.035, 4.373, 3.84, 4.971, 3.925, 4.821, 6.101, 4.523, 7.979, 3.648, 6.976, 3.989, 8.469, 6.336, 6.123, 7.339, 5.867, 5.163, 6.699, 6.485, 7.936, 5.568, 5.653, 6.016, 4.608, 7.872, 1.813]/*END*/;
PulseFilm.mount({
  series: 'PULSE · ASKING BEFORE RUNNING',
  title: 'Pulse: Asking Before Running',
  narr: NARR,
  scenes: [
    { name: 'Asking before running', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Asking before running.', true]] },
    { name: 'Two kinds of call', dur: 6, draw: sKinds, caps: [
      [0, 'Most calls to Pulse never read a record. They read the catalog, the schema, or the request itself.'],
      [1.6, 'In this series they are amber: cheap, no-execute reads that an agent makes first.'],
      [3.6, 'Only process and its siblings read the records.']] },
    { name: 'The session order', dur: 8, draw: sOrder, caps: [
      [0, 'The session-bootstrap skill gives the order. The manifest once per session, then inspect once per cohort.', 'The session bootstrap skill gives the order. The manifest once per session, then inspect once per cohort.'],
      [2.4, 'Then, for every question: examples or recommend for a draft, skills for the gotchas, and predict until it is clean.'],
      [4.6, 'Only then process. Explain reads the result, and errors lookup explains any code that comes back.']] },
    { name: 'The manifest', dur: 10.6, draw: sManifest, caps: [
      [0, 'The manifest is the contract: every operator, field type, error code, tool, skill and limit this instance offers.'],
      [3.4, 'Pass an intent, and it shrinks to the operators that answer one kind of question, naming the sections it left out.'],
      [7.4, 'The build version and two digests make a cache key, so an agent fetches it again only when the instance changes.'],
      [9.4, 'Pulse adds operators over time, and embedders register their own through Options.Extensions. The manifest lists both.', 'Pulse adds operators over time, and embedders register their own through options dot extensions. The manifest lists both.']] },
    { name: 'Feature profiles', dur: 7.6, draw: sProfile, caps: [
      [0, 'A feature profile is an instance\'s allowlist of operators and capabilities, checked against the build.'],
      [3.2, 'Served over MCP, this one offers no recommend, explain or facet tools.', 'Served over M C P, this one offers no recommend, explain or facet tools.'],
      [6.4, 'A hidden slot is not there at all: a request with params is refused as an unknown key.']] },
    { name: 'Inspect', dur: 6.6, draw: sInspect, caps: [
      [0, 'Inspect reads the header and schema, never a record: each field\'s name, type, nullability, description and dictionary.'],
      [2.6, 'Our cohort: 800 shoppers in an A/B test. Spend can be null.', 'Our cohort: eight hundred shoppers in an A B test. Spend can be null.'],
      [4.4, 'Over MCP, inspect also binds these names into the tools, so a call can only name a field that exists.', 'Over M C P, inspect also binds these names into the tools, so a call can only name a field that exists.']] },
    { name: 'A question, an intent', dur: 7.2, draw: sIntent, caps: [
      [0, 'Most questions start in words. Did the variant arm spend more than control?'],
      [1.8, 'That is a compare-groups question. It needs one outcome, spend, and one group, arm.', 'That is a compare groups question. It needs one outcome, spend, and one group, arm.'],
      [5.4, 'The docs carry a question guide for each intent, from the question itself to its pitfalls.']] },
    { name: 'Recommend', dur: 8, draw: sRecommend, caps: [
      [0, 'Recommend turns an intent into ranked draft requests.'],
      [1.2, 'With no cohort, the drafts are skeletons. Every placeholder must be filled before anything runs.'],
      [3.6, 'Bind it to our cohort, with spend and arm as hints, and each draft is filled in and has already passed predict.'],
      [6.0, 'Every draft says why it fits and what to use instead. With only two groups, the ANOVA\'s alternatives point to a Welch t-test.', 'Every draft says why it fits and what to use instead. With only two groups, the ANOVA\'s alternatives point to a Welch t test.']] },
    { name: 'Predict', dur: 10.4, draw: sPredict, caps: [
      [0, 'Predict checks a request against the schema without running it.'],
      [1.6, 'It answers valid or not, with coded errors and warnings.'],
      [3.0, 'It lists the defaults it applied. Our aggregation with no type, on a float field, became a sum.'],
      [5.2, 'It says whether the run streams, and if not, why: a median has to buffer its values.'],
      [8.6, 'When they apply, it adds limit findings, post-window attributes and advisories.']] },
    { name: 'The same refusal', dur: 6.4, draw: sParity, caps: [
      [0, 'Predict raises the codes the runtime would. Here a t-test splits by arm, on a request grouped by arm.', 'Predict raises the codes the runtime would. Here a t test splits by arm, on a request grouped by arm.'],
      [2.6, 'Every group then holds one arm, so there is nothing to compare.'],
      [4.4, 'Predict refuses it before reading a record, and process refuses it with the same code.']] },
    { name: 'Strict input', dur: 6.8, draw: sStrict, caps: [
      [0, 'Pulse refuses what it does not understand. A misspelt label key is not ignored.'],
      [2.0, 'The error gives the path, a did-you-mean, and every valid key at that spot.', 'The error gives the path, a did you mean, and every valid key at that spot.'],
      [5.6, 'Predict and process refuse it alike, at any depth of the request.']] },
    { name: 'Errors and fixups', dur: 8, draw: sErrors, caps: [
      [0, 'For any code, errors lookup returns the canonical message and structured fixups.'],
      [1.8, 'This one says to rename the key to its request slot, with examples.'],
      [4.0, 'An agent applies the fixup, predicts again, and runs only when predict is clean.'],
      [6.6, 'From a script, the exit status says the same: zero is fine, one is fatal, and two is a usage error.']] },
    { name: 'Advisories', dur: 8, draw: sAdvisory, caps: [
      [0, 'An advisory answers a different question: does this analysis fit the data?'],
      [2.0, 'A t-test split by region reads a dictionary of four regions. Predict stays valid, and suggests a Welch ANOVA instead.', 'A t test split by region reads a dictionary of four regions. Predict stays valid, and suggests a Welch ANOVA instead.'],
      [4.6, 'An advisory is never a warning, and never changes what runs.'],
      [6.4, 'Run as written, the test slot fails alone, with its error and a slot-failed warning. The average still comes back.', 'Run as written, the test slot fails alone, with its error and a slot failed warning. The average still comes back.']] },
    { name: 'Explain', dur: 8.4, draw: sExplain, caps: [
      [0, 'Explain says in plain words what a request will do, without running it.'],
      [2.6, 'Hand it the result too, and it reads the findings. The variant arm spent 4.63 dollars more on average, at p 0.067.', 'Hand it the result too, and it reads the findings. The variant arm spent four dollars sixty-three more on average, at p point oh six seven.'],
      [4.4, 'Explain calls that no evidence of a difference, which is not evidence of none. The effect is very small.'],
      [6.6, 'Relay its caveats too: independent rows, a roughly normal average, and a two-sided p-value.']] },
    { name: 'Params and templates', dur: 8.6, draw: sParams, caps: [
      [0, 'Request params are named constants. An expression reads params.plan instead of a value spliced into its text.', 'Request params are named constants. An expression reads params dot plan instead of a value spliced into its text.'],
      [2.2, 'Change the values, never the expression: Pro shoppers with five or more visits, then Basic ones.', 'Change the values, never the expression: pro shoppers with five or more visits, then basic ones.'],
      [5.0, 'Read a param the request does not declare, and predict refuses it, as process does.'],
      [6.8, 'A stored template goes one step earlier: typed variables and a body, rendered into a request, then predicted.']] },
    { name: 'A first look', dur: 8, draw: sFacet, caps: [
      [0, 'A facet is a cheap first run for profiling a cohort. Unlike the calls before it, it reads records.'],
      [1.6, 'In North, spend has 221 values, 5 nulls, a mean of 67.60, and a histogram over bounds you set.', 'In North, spend has two hundred twenty-one values, five nulls, a mean of sixty-seven sixty, and a histogram over bounds you set.'],
      [4.6, 'Additive counts lift the field\'s own filter, so every region shows how many shoppers it would bring.'],
      [6.6, 'Facets also host overlays against a population cohort. Film 16 covers those.', 'Facets also host overlays against a population cohort. Film sixteen covers those.']] },
    { name: 'Ask first', dur: 9.6, draw: sRecap, caps: [
      [0, 'So: read the manifest, inspect the cohort, draft with recommend, and predict until it is clean.'],
      [2.2, 'Then run, read the result with explain, and look up any code that comes back.'],
      [3.4, 'Pulse adds operators, skills and examples over time. The manifest shows what your instance offers, extensions included.'],
      [8.6, '', 'Pulse. Ask first, then run.', true]] },
  ],
});
})();
