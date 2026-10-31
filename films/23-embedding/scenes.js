/* Embedding Pulse: film 23 of the 23-film Pulse Anatomy series, and its finale. Follows SERIES-RULES.md.
 * The cohort is illustrative: orders.csv (24 orders over four regions, with a channel, an amount and an item count)
 * and more.csv (the same plus four, for the watcher). Every figure on screen comes from a recorded Pulse
 * v1.0.0-alpha.33 run in data/ (see data/README.md). Most runs come from the Go harness in data/harness/, which
 * drives the published github.com/frankbardon/pulse module at that tag as a library: ext_manifest, ext_process,
 * ext_formula, probe, panic, stream, watch, hash, filter_to_file, reads, observe_hooks, observe_prom and
 * observe_otel. manifest_ext comes from the stock binary, and mcp_observe from `pulse mcp` driven by mcp.js.
 * The Go code on screen is the harness's own code, trimmed. */
(() => {
const { C } = PulseFilm;
const { seg, eo, lerp, R, T, M, CAP, Ln, A, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke, o = {}) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule, ...o });

/* ext_process.out.json: AGG_ACME_MIDRANGE beside the built-in min and max, by region [region, mid, lo, hi] */
const MID = [['East', '63.29', '48.30', '78.28'], ['North', '55.41', '35.59', '75.23'], ['South', '47.455', '30.35', '64.56'], ['West', '45.47', '32.81', '58.13']];
/* ext_formula.out.json: Σ amount and Σ with_tax(amount, lookup("tax_rate", region)) [region, rate, net, gross] */
const TAX = [['East', '0.15', '364.95', '419.69'], ['North', '0.20', '361.40', '433.68'], ['South', '0.10', '282.03', '310.24'], ['West', '0.05', '263.69', '276.89']];
/* probe.out.json: pulse.New's error for each broken registration [case, code, detail] */
const PROBE = [
  ['Streamable: true, factory returns no OnlineAggregator', 'PULSE_EXTENSION_STREAMABLE_MISMATCH', 'declares Streamable=true but factory does not return extend.OnlineAggregator'],
  ['the factory reads schema.Fields[0]', 'PULSE_EXTENSION_FACTORY_PANIC', 'panicked during probe-validation: index out of range [0] with length 0'],
  ['Name: "AGG_SUM"', 'PULSE_EXTENSION_NAME_COLLISION', 'collides with a built-in name'],
  ['Name: "midrange"', 'PULSE_EXTENSION_NAME_INVALID', 'does not match required pattern <CATEGORY>_<NAMESPACE>_<NAME>']];
/* stream.out.json (stream_grouped): the header, four chunks [seq, region, avg, mid], the terminator */
const SHDR = { hash: '0097acd49639b3a4dd1d9d7a351c01d5', est: 24 };
const CHUNKS = [[0, 'East', '60.825', '63.29'], [1, 'North', '60.233', '55.41'], [2, 'South', '47.005', '47.455'], [3, 'West', '43.948', '45.47']];
/* watch.out.json: [kind, hash] and the record count after the rewrite */
const WATCH = [['created', '6aabf6867c9729e0…', 'live.pulse is already there: the first tick reports it'], ['modified', '27aaec8cb1f4e0a3…', 'more.pulse copied over it: 24 → 28 records'], ['removed', '', 'the file is deleted']];
/* hash.out.json */
const HASH = { a: 'a19baa73d704199c0bacad113520a9c4', c: 'b08186f55bbfe3babe42ec7641730518' };
/* filter_to_file.out.json [expression, output name, rows, reused] */
const FTF = [['amount > 50', '6aabf6867c9729e0_0345937ff897b099.pulse', 15, false], ['amount > 50', '6aabf6867c9729e0_0345937ff897b099.pulse', 15, true],
  ['with_tax(amount, 0.1) > 55', '6aabf6867c9729e0_9b6c20d54cb54126.pulse', 15, false], ['with_tax(amount, 0.1) > 55', '6aabf6867c9729e0_9b6c20d54cb54126.pulse', 15, false]];
/* reads.out.json: RequestReads over reads.json [path, key, columns, params, funcs] */
const RREADS = [['aggregations[0]', 'field', 'gross', '', ''], ['aggregations[1]', 'field', 'order_id', '', ''],
  ['attributes[0]', 'expression', 'amount, region', 'fee', 'lookup, with_tax'], ['filterers[0]', 'expression', 'channel', '', ''], ['groups[0]', 'field', 'region', '', '']];
/* observe_hooks.out.json */
const HOOKS = { hash: 'b62cc0c275318ea6a537f6a5a80a6fac', badHash: '294ae756423957362df8eab4ed1242de' };
/* observe_prom.out.json (non-timing values) and mcp_observe.out.json */
const PROM = [['pulse_operations_total{code="ok",op="process",scope="top"}', '1'], ['pulse_operations_total{code="SERVICE_VALIDATION",op="process",scope="top"}', '1'],
  ['pulse_rows_scanned_total{op="process"}', '24'], ['pulse_bytes_read_total{op="process"}', '466'], ['pulse_operation_duration_seconds', 'histogram · 2 samples'], ['pulse_phase_duration_seconds{phase=…}', 'histogram']];

/* a code card: lines [text, colour?] */
function code(x, y, w, lines, o = {}) {
  const lh = o.lh ?? 24, h = o.h ?? (lines.length * lh + (o.cap ? 46 : 22));
  card(x, y, w, h, o.stroke);
  if (o.cap) CAP(o.cap, x + 20, y + 26, { color: o.stroke || C.muted });
  lines.forEach(([s, c, sz], i) => A(o.at != null ? seg(o.t, o.at + i * (o.step ?? 0.05), o.at + i * (o.step ?? 0.05) + 0.3) : 1,
    () => M(s, x + 20, y + (o.cap ? 54 : 30) + i * lh, { size: sz ?? o.size ?? 13.5, color: c || C.ink })));
}
/* an error card: code, then message lines */
function refusal(x, y, w, codeName, lines, a, o = {}) {
  A(a, () => {
    card(x, y, w, 30 + 24 + lines.length * 21, C.coral);
    M(codeName, x + 18, y + 30, { size: o.size ?? 13.5, color: C.coral, weight: 600 });
    lines.forEach((s, i) => M(s, x + 18, y + 54 + i * 21, { size: 12, color: C.muted }));
  });
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  const boxes = [['your program', C.ink, 360], ['pulse.New', C.teal, 640], ['Process', C.violet, 920]];
  boxes.forEach(([s, c, x], i) => A(seg(t, 0.1 + i * 0.3, 0.5 + i * 0.3), () => {
    R(x - 110, 340, 220, 70, { fill: C.panel, stroke: c }); M(s, x, 382, { size: 17, color: c, align: 'center', weight: 600 });
    if (i < 2) arrow(x + 114, 375, x + 166, 375, { stroke: C.faint });
  }));
  A(seg(t, 1.2, 1.8), () => T('Pulse as a library', 640, 500, { size: 22, align: 'center', color: C.muted }));
}

/* ---------- 1. one library, three faces ---------- */
function sFaces(t) {
  CAP('ONE LIBRARY, THREE FACES', 64, 124, { color: C.teal });
  const faces = [['pulse api process -r req.json', 'the CLI', 'a shell, a script, a pipeline'], ['pulse mcp', 'the MCP server', 'an agent, over stdio'], ['import "github.com/frankbardon/pulse"', 'the Go library', 'your own program']];
  faces.forEach(([cmd, h, s], i) => A(seg(t, 0.2 + i * 0.35, 0.6 + i * 0.35), () => {
    const x = 64 + i * 392, c = i === 2 ? C.teal : C.muted;
    card(x, 146, 368, 104, i === 2 ? C.teal : C.rule);
    T(h, x + 20, 180, { size: 18, weight: 700, color: i === 2 ? C.teal : C.ink }); M(cmd, x + 20, 208, { size: i === 2 ? 11.5 : 13, color: c }); M(s, x + 20, 232, { size: 12, color: C.faint });
  }));
  A(seg(t, 1.6, 2.0), () => M('"The library facade is unchanged; the MCP server only translates between the protocol and library entrypoints."  — pulse mcp --help', 64, 282, { size: 12.5, color: C.amber }));
  code(64, 306, 640, [
    ['p, err := pulse.New(pulse.Options{', C.ink],
    ['    DataDir:    "data",', C.ink],
    ['    Extensions: pulse.Extensions{ … },', C.violet],
    ['    Hooks:      hooks,   Metrics: metrics,', C.amber],
    ['})', C.ink],
    ['resp, err := p.Process(ctx, req)     // a *Request in, a *Response out', C.teal]], { cap: 'GO · ONE INSTANCE, MANY REQUESTS', stroke: C.teal, t, at: 2.6, step: 0.12 });
  A(seg(t, 4.6, 5.0), () => {
    card(724, 306, 492, 190);
    CAP('pulse.Options · a few of its fields', 744, 332);
    chips([['DataDir · FS'], ['Strict'], ['Limits'], ['DefaultTimeZone'], ['DefaultWeight'], ['DefaultReturn'], ['ShardWorkers'], ['Logger'], ['Hooks', C.amber], ['Metrics', C.amber], ['Extensions', C.violet], ['DisablePanicRecovery', C.coral]], 744, 350, 452, { size: 12, t, at: 4.8 });
  });
  A(seg(t, 6.8, 7.2), () => M('New validates everything once, at startup. A bad option or registration returns an error and no instance.', 64, 540, { size: 14, color: C.ink }));
}

/* ---------- 2. Options.Extensions ---------- */
function sExtensions(t) {
  CAP('OPTIONS.EXTENSIONS · WHAT AN EMBEDDER CAN REGISTER TODAY', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 118, C.violet);
    CAP('OPERATORS · run exactly like built-ins', 86, 172, { color: C.violet });
    chips([['Aggregators', C.violet], ['Attributes', C.violet], ['Filterers', C.violet], ['Groupers', C.violet], ['Windows', C.violet], ['Features', C.violet], ['Tests', C.violet], ['MatrixOps', C.violet], ['Regressions', C.violet]], 86, 188, 1100, { size: 13, t, at: 0.4 });
    M('overlay kinds are not registered; your expression functions reach OVERLAY_FORMULA', 86, 248, { size: 12, color: C.faint });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 280, 1152, 108, C.amber);
    CAP('FOR EXPRESSIONS, OUTPUT AND AGENTS', 86, 306, { color: C.amber });
    chips([['ExprFunctions', C.amber], ['LookupTables', C.amber], ['ReferenceVectors', C.amber], ['LabelTables', C.amber], ['RangeTables', C.amber], ['Populations', C.amber], ['Skills (fs.FS)', C.amber], ['Examples (fs.FS)', C.amber]], 86, 322, 1100, { size: 13, t, at: 2.8 });
    M('+ more over time', 86, 374, { size: 12, color: C.faint });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 404, 560, 168, C.coral);
    CAP('THE NAME RULE', 86, 430, { color: C.coral });
    M('<CATEGORY>_<NAMESPACE>_<NAME>', 86, 466, { size: 17, color: C.ink, weight: 600 });
    M('AGG_ACME_MIDRANGE', 86, 500, { size: 15, color: C.violet });
    M('category AGG · namespace ACME · name MIDRANGE', 86, 526, { size: 12.5, color: C.muted });
    M('your namespace keeps you clear of the built-ins', 86, 552, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.6, 7.0), () => {
    code(644, 404, 572, [['"extensions": {', C.ink], ['  "aggregators": [], "attributes": [], …', C.muted], ['  "expr_functions": [], "lookup_tables": [], …', C.muted], ['}', C.ink],
      ['the stock binary registers nothing', C.faint, 12]], { cap: 'pulse manifest --json · manifest_ext.out.json', stroke: C.amber, lh: 22 });
  });
}

/* ---------- 3. registering an aggregator ---------- */
function sRegister(t) {
  CAP('REGISTER AN AGGREGATOR', 64, 124, { color: C.violet });
  code(64, 146, 620, [
    ['pulse.AggregatorRegistration{', C.ink],
    ['    Name:        "AGG_ACME_MIDRANGE",', C.violet],
    ['    Description: "Midpoint of the smallest and largest value…",', C.muted],
    ['    Factory:     func(*types.Aggregation, *encoding.Schema)', C.ink],
    ['                     (extend.Aggregator, error) { return newMid(), nil },', C.ink],
    ['    Streamable:  true,   // returns an extend.OnlineAggregator', C.teal],
    ['    Mergeable:   true,   // and a MergeableAggregator', C.teal],
    ['    Accepts:     numeric,', C.ink],
    ['}', C.ink]], { cap: 'harness/main.go · midReg()', stroke: C.violet, size: 12.5, lh: 21, t, at: 0.3, step: 0.1 });
  A(seg(t, 2.8, 3.2), () => {
    code(704, 146, 512, [['UpdateRow(rec, field)   fold one row', C.ink], ['Finalize()              (min + max) / 2', C.ink], ['Merge(other)            fold a worker\'s state', C.ink]], { cap: 'THE METHODS IT IMPLEMENTS · package extend', stroke: C.teal, lh: 24 });
  });
  A(seg(t, 4.6, 5.0), () => {
    code(704, 278, 512, [['"name": "AGG_ACME_MIDRANGE",  "namespace": "ACME",', C.violet], ['"streamable": true,  "mergeable": true,', C.ink], ['"accepts": ["f32","f64","u8","u16","u32","u64"]', C.muted]],
      { cap: 'p.Manifest(ctx) · extensions.aggregators', stroke: C.amber, lh: 21, size: 12.5 });
  });
  A(seg(t, 6.6, 7.0), () => {
    card(64, 400, 1152, 172, C.teal);
    CAP('p.Process · ext_process.json · by region', 86, 426, { color: C.teal });
    const X = [86, 330, 470, 610]; ['region', 'AGG_ACME_MIDRANGE', 'AGG_MIN', 'AGG_MAX'].forEach((h, j) => M(h, X[j] + (j ? 110 : 0), 452, { size: 12, color: C.muted, align: j ? 'right' : 'left' }));
    MID.forEach((r, i) => A(seg(t, 6.8 + i * 0.12, 7.1 + i * 0.12), () => r.forEach((v, j) => M(v, X[j] + (j ? 110 : 0), 478 + i * 24, { size: 14, align: j ? 'right' : 'left', color: j === 1 ? C.violet : C.ink, weight: j === 1 ? 600 : 400 }))));
    A(seg(t, 8.4, 8.8), () => {
      M('(48.30 + 78.28) / 2 = 63.29', 780, 478, { size: 13.5, color: C.violet });
      M('components: the floor n 6, n_null 0 per group', 780, 508, { size: 12.5, color: C.muted });
      M('no operator keys: it declared no ComponentSchema', 780, 530, { size: 12.5, color: C.muted });
    });
  });
}

/* ---------- 4. functions and tables ---------- */
function sExpr(t) {
  CAP('EXPRESSION FUNCTIONS AND LOOKUP TABLES', 64, 124, { color: C.amber });
  code(64, 146, 620, [
    ['ExprFunctions: []pulse.ExprFunction{{', C.ink],
    ['    Name: "with_tax", Pure: true,', C.amber],
    ['    Signature: "with_tax(amount float64, rate float64) float64",', C.muted],
    ['    Fn: func(amount, rate float64) float64 { … },', C.ink],
    ['}},', C.ink],
    ['LookupTables: map[string]pulse.LookupTable{"tax_rate": {', C.ink],
    ['    Rows: {"North": 0.20, "South": 0.10, "East": 0.15, "West": 0.05},', C.amber],
    ['}},', C.ink]], { cap: 'harness/main.go · exprExt()', stroke: C.amber, size: 12.5, lh: 21, t, at: 0.3, step: 0.1 });
  A(seg(t, 2.6, 3.0), () => {
    code(704, 146, 512, [['{"type": "ATTR_FORMULA", "label": "gross",', C.ink], [' "expression":', C.ink], ['  "with_tax(amount, lookup(\\"tax_rate\\", region))"}', C.violet]],
      { cap: 'ext_formula.json · a row-local formula', stroke: C.violet, lh: 24 });
    M('the same environment serves FILTER_EXPRESSION', 724, 290, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(64, 376, 700, 196, C.teal);
    CAP('ext_formula.out.json · by region', 86, 402, { color: C.teal });
    const X = [86, 250, 430, 600]; ['region', 'tax_rate', 'Σ amount', 'Σ gross'].forEach((h, j) => M(h, X[j] + (j ? 100 : 0), 428, { size: 12, color: C.muted, align: j ? 'right' : 'left' }));
    TAX.forEach((r, i) => A(seg(t, 4.6 + i * 0.12, 4.9 + i * 0.12), () => r.forEach((v, j) => M(v, X[j] + (j ? 100 : 0), 456 + i * 28, { size: 14, align: j ? 'right' : 'left', color: j === 3 ? C.violet : j === 1 ? C.amber : C.ink, weight: j === 3 ? 600 : 400 }))));
  });
  A(seg(t, 6.4, 6.8), () => {
    code(784, 376, 432, [['"expr_functions": [{ "name": "with_tax",', C.ink], ['   "signature": "…", "pure": true }],', C.muted], ['"lookup_tables": [{ "name": "tax_rate",', C.ink], ['   "has_rows_data": true }]', C.muted]],
      { cap: 'the manifest lists both', stroke: C.amber, lh: 23, size: 12.5 });
  });
}

/* ---------- 5. the registration probe ---------- */
function sProbe(t) {
  CAP('VALIDATION AND THE PROBE · AT pulse.New', 64, 124, { color: C.coral });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 76);
    T('pulse.New checks every registration: each factory is built from a spec that carries only the', 86, 176, { size: 15 });
    T('operator\'s name, over an empty schema, and the instance is checked against what the registration declares.', 86, 202, { size: 15 });
  });
  PROBE.forEach(([k, c, msg], i) => A(seg(t, 2.4 + i * 1.4, 2.8 + i * 1.4), () => {
    const y = 238 + i * 80;
    card(64, y, 420, 70); M('registration', 82, y + 26, { size: 11.5, color: C.faint }); M(k, 82, y + 50, { size: 12, color: C.ink });
    arrow(488, y + 35, 520, y + 35, { stroke: C.coral });
    refusal(524, y, 692, c, [msg], 1, { size: 13.5 });
  }));
  A(seg(t, 8.4, 8.8), () => M('No instance comes back, so a broken extension fails at startup, not in the middle of a request.', 64, 574, { size: 14, color: C.coral }));
}

/* ---------- 6. panic recovery ---------- */
function sPanic(t) {
  CAP('PANIC RECOVERY', 64, 124, { color: C.coral });
  code(64, 146, 560, [
    ['func (b brittle) UpdateRow(rec extend.Record, f string) error {', C.ink],
    ['    if v, _ := rec.NumericValue(f); v > 75 {', C.ink],
    ['        var m map[string]float64', C.ink],
    ['        m["over"] = v     // a nil-map write: a bug', C.coral],
    ['    }', C.ink], ['    …', C.muted]], { cap: 'AGG_ACME_BRITTLE · passes the probe, which feeds it no rows', stroke: C.coral, size: 12.5, lh: 23 });
  A(seg(t, 2.2, 2.6), () => {
    refusal(644, 146, 572, 'PROCESSING_PANIC', ['"operation process panicked (runtime.plainError) and was recovered;', ' details.stack names the frames"',
      'details.op          process', 'details.panic_type  runtime.plainError', 'details.stack[0]    main.brittle.UpdateRow …'], 1, { size: 15 });
  });
  A(seg(t, 4.4, 4.8), () => { M('the panic value is never kept, since it can carry row data:', 644, 330, { size: 12.5, color: C.muted }); M('only its Go type name and the frames survive', 644, 350, { size: 12.5, color: C.muted }); });
  A(seg(t, 5.8, 6.2), () => {
    card(64, 374, 1152, 110, C.teal);
    CAP('THE SAME INSTANCE · THE NEXT REQUEST · panic.out.json', 86, 400, { color: C.teal });
    M('p.Process(ctx, ext_process)  →  4 rows', 86, 434, { size: 15, color: C.teal, weight: 600 });
    M('East 63.29 · North 55.41 · South 47.455 · West 45.47', 86, 462, { size: 13.5, color: C.ink });
  });
  A(seg(t, 7.6, 8.0), () => {
    card(64, 500, 1152, 72, C.rule, { dash: [6, 5] });
    M('Options.DisablePanicRecovery', 86, 532, { size: 14, color: C.coral, weight: 600 }); M('re-panics with the original value instead: for a host that would rather crash', 86, 556, { size: 12.5, color: C.muted });
  });
}

/* ---------- 7. streaming ---------- */
function sStream(t) {
  CAP('ProcessStreamResult · stream_grouped.json', 64, 124, { color: C.teal });
  code(64, 146, 560, [
    ['res, err := p.ProcessStreamResult(ctx, req)', C.ink],
    ['for chunk := range res.Chunks { … chunk.Data … }', C.teal],
    ['term := <-res.Done', C.ink]], { cap: 'GO', stroke: C.teal, lh: 24 });
  M('ProcessStream returns the same rows as a pull iterator', 64, 286, { size: 12.5, color: C.muted });
  A(seg(t, 1.8, 2.2), () => {
    code(644, 146, 572, [['RequestHash     ' + SHDR.hash, C.amber], ['EstimatedTotal  ' + SHDR.est, C.ink], ['                = req.Hash()', C.faint, 12]], { cap: 'res.Header · before any row', stroke: C.amber, lh: 23 });
  });
  CHUNKS.forEach(([s, g, avg, mid], i) => A(seg(t, 3.6 + i * 0.4, 4.0 + i * 0.4), () => {
    const x = 64 + i * 292, last = i === 3;
    card(x, 300, 276, 150, last ? C.violet : C.teal);
    CAP('chunk ' + s, x + 18, 326, { color: last ? C.violet : C.teal });
    M(g + '  avg ' + avg + '  mid ' + mid, x + 18, 356, { size: 12.5, color: C.ink });
    M('aggregation components:', x + 18, 386, { size: 12, color: C.muted });
    M(last ? 'per-group figures' : 'the floor: n 24, n_null 0', x + 18, 408, { size: 12, color: last ? C.violet : C.muted, weight: last ? 600 : 400 });
    if (last) M('the terminal chunk', x + 18, 430, { size: 12, color: C.violet });
  }));
  A(seg(t, 6.4, 6.8), () => M('a group exists only once every record is read, so grouped rows arrive at the final flush', 64, 476, { size: 13, color: C.muted }));
  A(seg(t, 7.8, 8.2), () => {
    code(64, 494, 560, [['Status  completed   TotalRows  4', C.teal]], { cap: '<-res.Done · the terminator', stroke: C.teal, lh: 24 });
    card(644, 494, 572, 78, C.violet); M('terminal Components = p.Process(req).Components', 664, 526, { size: 14, color: C.violet, weight: 600 }); M('recorded: true', 664, 552, { size: 12.5, color: C.muted });
  });
}

/* ---------- 8. watch ---------- */
function sWatch(t) {
  CAP('WATCH A COHORT', 64, 124, { color: C.amber });
  code(64, 146, 640, [['events := p.Watch(ctx, "live.pulse")', C.ink], ['for ev := range events { … ev.Kind, ev.Hash … }', C.teal], ['p.WatchDir(ctx, "data", true)   // every .pulse below a folder', C.muted]], { cap: 'GO', stroke: C.amber, lh: 24 });
  A(seg(t, 1.6, 2.0), () => {
    card(724, 146, 492, 98);
    M('it polls: stat, then a content hash', 744, 180, { size: 13.5 }); M('every 250 ms by default · WatchOptions tunes it', 744, 206, { size: 12.5, color: C.muted });
    M('closing ctx closes the channel', 744, 228, { size: 12.5, color: C.muted });
  });
  WATCH.forEach(([k, h, s], i) => A(seg(t, 3.0 + i * 1.3, 3.4 + i * 1.3), () => {
    const y = 290 + i * 80, c = k === 'removed' ? C.coral : k === 'modified' ? C.amber : C.teal;
    card(64, y, 1152, 66, c);
    M(k, 86, y + 40, { size: 17, color: c, weight: 600 });
    M(h ? 'Hash ' + h : 'Hash ""', 260, y + 40, { size: 13.5, color: C.amber });
    M(s, 560, y + 40, { size: 13.5, color: C.ink });
  }));
  A(seg(t, 7.4, 7.8), () => M('watch.out.json · re-run on modified: the cohort now counts 28 records', 64, 560, { size: 13, color: C.muted }));
}

/* ---------- 9. cache keys ---------- */
function sHash(t) {
  CAP('Request.Hash() · A CACHE KEY', 64, 124, { color: C.amber });
  const rows = [['hash_a.json', '{"cohort":…,"groups":[… "region"],"aggregations":[{"type":"AGG_AVERAGE",…}]}', HASH.a, C.amber],
    ['hash_b.json', 'the same request, keys in another order, other whitespace', HASH.a, C.amber],
    ['hash_c.json', 'grouped by channel instead', HASH.c, C.coral]];
  rows.forEach(([f, s, h, c], i) => A(seg(t, 0.2 + i * 0.9, 0.6 + i * 0.9), () => {
    const y = 146 + i * 62; card(64, y, 1152, 52, i === 2 ? C.coral : C.rule);
    M(f, 84, y + 32, { size: 13, color: C.muted }); M(s, 220, y + 32, { size: 12, color: C.ink }); M(h, 1196, y + 32, { size: 14, color: c, weight: 600, align: 'right' });
  }));
  A(seg(t, 3.2, 3.6), () => M('32 hex characters of canonical JSON · stable across processes · the return block is part of it', 64, 350, { size: 13, color: C.muted }));
  A(seg(t, 4.6, 5.0), () => {
    card(64, 370, 1152, 202, C.violet);
    CAP('FilterToFileWithRequest · a derived cohort named by its inputs · filter_to_file.out.json', 86, 396, { color: C.violet });
    M('{source-hash}_{predicate-hash}.pulse', 86, 426, { size: 13.5, color: C.amber });
    FTF.forEach(([e, n, rows, re], i) => A(seg(t, 5.2 + i * 0.5, 5.6 + i * 0.5), () => {
      const y = 458 + i * 26, emb = i >= 2;
      M(e, 86, y, { size: 13, color: emb ? C.amber : C.ink }); M(n, 360, y, { size: 12.5, color: C.violet }); M(rows + ' rows', 830, y, { size: 13, align: 'right' });
      M(re ? 'reused' : 'written', 930, y, { size: 13, color: re ? C.teal : C.muted, weight: re ? 600 : 400 });
      if (i === 3) M('embedder code: never reused', 1196, y, { size: 12, color: C.coral, align: 'right' });
    }));
  });
}

/* ---------- 10. what a request reads ---------- */
function sReads(t) {
  CAP('WHAT A REQUEST READS · NO EXECUTE', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 146, C.amber);
    CAP('pulse.ExpressionReads(src) · a parse alone: no instance, cohort or request', 86, 172, { color: C.amber });
    M('with_tax(amount, lookup("tax_rate", region)) - params.fee', 86, 204, { size: 14, color: C.ink });
    M('vars amount, region · params fee · funcs lookup, with_tax', 700, 204, { size: 13, color: C.amber });
  });
  A(seg(t, 2.4, 2.8), () => {
    M('let gross = amount * items; gross > params.cut and channel == "web"', 86, 236, { size: 14, color: C.ink });
    M('vars amount, items, channel · params cut', 700, 236, { size: 13, color: C.amber }); M('the let-bound gross is not a column', 700, 256, { size: 11.5, color: C.faint });
  });
  A(seg(t, 3.8, 4.2), () => { M('amount * (', 86, 278, { size: 14, color: C.ink }); M('PULSE_FORMULA_COMPILE_ERROR · an empty read set', 700, 278, { size: 13, color: C.coral }); });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 312, 1152, 260, C.amber);
    CAP('p.RequestReads(reads.json, "") · every slot that reads data', 86, 338, { color: C.amber });
    const X = [86, 290, 440, 680, 820]; ['path', 'key', 'columns', 'params', 'funcs'].forEach((h, j) => M(h, X[j], 368, { size: 12, color: C.muted }));
    RREADS.forEach((r, i) => A(seg(t, 5.2 + i * 0.15, 5.5 + i * 0.15), () => r.forEach((v, j) => M(v || '—', X[j], 398 + i * 28, { size: 13.5, color: !v ? C.faint : j === 2 ? C.teal : j >= 3 ? C.amber : C.ink }))));
    A(seg(t, 7.4, 7.8), () => M('an editor draws the wires, a linter checks a draft, an agent plans the columns it needs', 86, 552, { size: 12.5, color: C.muted }));
  });
}

/* ---------- 11. hooks ---------- */
function sHooks(t) {
  CAP('Options.Hooks · AROUND EVERY OPERATION', 64, 124, { color: C.amber });
  const col = (x, title, rows, at, c) => A(seg(t, at, at + 0.4), () => {
    card(x, 146, 368, 330, c);
    CAP(title, x + 18, 172, { color: c });
    rows.forEach(([k, v, cc], i) => A(seg(t, at + 0.2 + i * 0.08, at + 0.5 + i * 0.08), () => { M(k, x + 18, 204 + i * 26, { size: 12.5, color: C.muted }); M(v, x + 350, 204 + i * 26, { size: 12.5, color: cc || C.ink, align: 'right' }); }));
  });
  col(64, 'OnOperationStart · OperationInfo', [['Kind', 'process'], ['Scope', 'top'], ['Cohort', 'orders.pulse'], ['RequestHash', HOOKS.hash.slice(0, 16) + '…', C.amber],
    ['', ''], ['return a ctx to start a span', '', C.faint]], 0.3, C.amber);
  col(456, 'OnPhase · PhaseTiming', [['plan', 'Duration'], ['open', 'Duration'], ['scan', 'Duration'], ['', ''], ['only the phases that ran,', '', C.faint], ['in execution order', '', C.faint]], 2.2, C.amber);
  col(848, 'OnOperationEnd · OperationResult', [['Code', 'ok', C.teal], ['Arm', 'streaming'], ['RowsScanned', '24'], ['RowsMatched', '24'], ['RowsOut', '4'], ['Workers', '1'], ['Duration', '(wall time)', C.faint]], 4.0, C.teal);
  A(seg(t, 6.0, 6.4), () => {
    card(64, 492, 1152, 80, C.coral);
    M('a refused request · observe_bad.json', 86, 522, { size: 12.5, color: C.muted });
    M('phases plan, open · then OnOperationEnd with Code SERVICE_VALIDATION, never a message', 86, 548, { size: 14, color: C.coral });
  });
  A(seg(t, 8.0, 8.4), () => M('hooks run on the operation\'s goroutine and must be fast; a panic in one is recovered', 64, 600, { size: 12.5, color: C.muted }));
}

/* ---------- 12. adapters ---------- */
function sAdapters(t) {
  CAP('ADAPTERS · observe/prom · observe/otel · pulse mcp', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 680, 222, C.amber);
    CAP('Metrics: prompulse.Metrics(reg) · one good run, one refused', 86, 172, { color: C.amber });
    PROM.forEach(([k, v], i) => A(seg(t, 0.4 + i * 0.12, 0.7 + i * 0.12), () => { M(k, 86, 204 + i * 26, { size: 12, color: C.ink }); M(v, 724, 204 + i * 26, { size: 12.5, color: C.teal, align: 'right', weight: 600 }); }));
  });
  A(seg(t, 2.4, 2.8), () => {
    card(764, 146, 452, 222, C.amber);
    CAP('Hooks: otelpulse.Hooks(tp) · spans', 784, 172, { color: C.amber });
    M('pulse.process', 784, 204, { size: 15, color: C.ink, weight: 600 });
    M('events plan · open · scan', 784, 230, { size: 12.5, color: C.muted });
    M('pulse.arm streaming · pulse.rows_scanned 24', 784, 254, { size: 12.5, color: C.muted });
    M('pulse.process', 784, 300, { size: 15, color: C.ink, weight: 600 });
    M('status Error · SERVICE_VALIDATION', 784, 326, { size: 12.5, color: C.coral });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(64, 388, 1152, 184, C.teal);
    CAP('NO GO NEEDED · pulse mcp · mcp_observe.out.json', 86, 414, { color: C.teal });
    M('OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:PORT  pulse mcp --metrics-addr 127.0.0.1:0', 86, 444, { size: 13, color: C.ink });
    M('pulse mcp: serving over stdio (… metrics: 127.0.0.1:PORT, otlp: traces+metrics)', 86, 472, { size: 13, color: C.amber });
    A(seg(t, 6.0, 6.4), () => {
      M('after one pulse_process call:', 86, 504, { size: 12.5, color: C.muted });
      M('GET /metrics   pulse_operations_total{op="process",code="ok",scope="top"} 1', 86, 530, { size: 13, color: C.teal });
      M('POST /v1/traces · /v1/metrics   application/x-protobuf, with the pulse.process span', 86, 556, { size: 13, color: C.teal });
    });
  });
}

/* ---------- 13. finale ---------- */
function sRecap(t) {
  const end = seg(t, 10.4, 11.2);
  A(1 - end, () => {
    CAP('EMBEDDING PULSE TODAY', 64, 124, { color: C.teal });
    [['START', 'pulse.New · Options · validated once', C.teal], ['EXTEND', 'Options.Extensions · operators · functions · tables · skills', C.violet], ['GUARD', 'the probe · PROCESSING_PANIC · DisablePanicRecovery', C.coral],
     ['REACT', 'ProcessStreamResult · Watch · WatchDir · Request.Hash · FilterToFileWithRequest', C.teal], ['PLAN', 'ExpressionReads · RequestReads · the manifest', C.amber], ['OBSERVE', 'Hooks · Metrics · observe/prom · observe/otel · pulse mcp OTLP', C.amber]]
      .forEach(([h, ops, c], k) => A(seg(t, 0.2 + k * 0.35, 0.6 + k * 0.35), () => {
        const y = 146 + k * 46; M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, c]), 200, y, 1016, { size: 12 });
      }));
    A(seg(t, 3.6, 4.0), () => {
      R(64, 430, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 458, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 482, { size: 14.5 });
      R(650, 430, 566, 66, { fill: C.panel, stroke: C.violet, dash: [6, 5] }); M('+ your own', 668, 458, { size: 14, color: C.violet, weight: 600 }); T('registered once, listed beside the built-ins', 668, 482, { size: 14.5 });
    });
  });
  A(seg(t, 11.0, 11.8), () => {
    T('PULSE', 640, 290, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('ANATOMY', 640, 362, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
    M('twenty-three films · from one request to your own program', 640, 420, { size: 15, align: 'center' });
    M('the end of the series', 640, 460, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[3.072, 7.509, 7.04, 5.995, 5.248, 9.195, 8.107, 4.203, 4.971, 7.147, 6.699, 3.627, 7.467, 4.053, 7.787, 5.141, 3.733, 3.605, 6.251, 5.632, 4.757, 3.989, 5.376, 7.445, 6.656, 3.861, 3.989, 3.648, 6.421, 5.013, 6.336, 5.611, 5.803, 7.104, 5.589, 3.584, 4.011, 5.781, 6.059, 2.816, 5.504, 7.381, 5.205, 7.68, 4.096, 4.309, 8.192, 7.851, 3.776, 6.016, 5.483, 3.648, 6.677, 7.445, 7.936, 5.355, 6.613, 6.464, 6.763, 1.067]/*END*/;
PulseFilm.mount({
  series: 'PULSE · EMBEDDING',
  title: 'Embedding Pulse',
  narr: NARR,
  scenes: [
    { name: 'Embedding Pulse', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Embedding Pulse: the engine inside your own program.', true]] },
    { name: 'One library, three faces', dur: 8.4, draw: sFaces, caps: [
      [0, 'Most films so far have used the CLI or the MCP server. Both are thin faces over one Go library.',
        'Most films so far have used the C L I or the M C P server. Both are thin faces over one Go library.'],
      [2.4, 'In your own program, pulse.New builds an instance, and Process runs a request on it, as many times as you like.',
        'In your own program, pulse dot New builds an instance, and Process runs a request on it, as many times as you like.'],
      [4.6, 'Its options set the data directory, limits and defaults, your extensions, and the observability hooks.'],
      [6.8, 'New checks all of it once, at startup. If anything is wrong, you get an error and no instance.']] },
    { name: 'Options.Extensions', dur: 8.6, draw: sExtensions, caps: [
      [0, 'Options.Extensions takes your own operators, of most kinds today: from aggregators and filters to tests, matrix operators and regressions.',
        'Options dot Extensions takes your own operators, of most kinds today: from aggregators and filters to tests, matrix operators and regressions.'],
      [2.6, 'It also takes expression functions, tables, populations, and skills and examples for agents. More are added over time.'],
      [4.8, 'Every name follows one pattern: category, your namespace, then the name.'],
      [6.6, 'The stock binary registers nothing, so its manifest lists empty extension slots.']] },
    { name: 'Register an aggregator', dur: 10.0, draw: sRegister, caps: [
      [0, 'Here\'s a real one: AGG_ACME_MIDRANGE, halfway between the smallest and largest value.',
        'Here\'s a real one: a midrange aggregator in the ACME namespace, halfway between the smallest and largest value.'],
      [2.8, 'It declares that it streams and merges, so it implements the online and mergeable interfaces from package extend.'],
      [4.6, 'The manifest now lists it, with its namespace and what it accepts.'],
      [6.6, 'And a request uses it like a built-in. By region, it sits beside min and max: East is sixty-three point two nine.'],
      [8.4, 'It declared no component schema, so its components carry the floor alone.']] },
    { name: 'Functions and tables', dur: 8.4, draw: sExpr, caps: [
      [0, 'Expression functions and lookup tables extend formulas. Here, a with_tax function, and a tax rate table by region.',
        'Expression functions and lookup tables extend formulas. Here, a with tax function, and a tax rate table by region.'],
      [2.6, 'A formula calls both, row by row. Filter expressions see the same environment.'],
      [4.4, 'By region, each gross sum is the net plus that region\'s tax.'],
      [6.4, 'The manifest lists the function, with its signature, and the table.']] },
    { name: 'Validation and the probe', dur: 9.6, draw: sProbe, caps: [
      [0, 'Before New returns, it builds each factory from a bare spec over an empty schema, and checks what comes back.'],
      [2.4, 'A factory that claims to stream but returns no streaming interface is a streamable mismatch.'],
      [3.8, 'A factory that assumes a schema panics, and the probe reports that panic as an error.'],
      [5.2, 'A built-in\'s name collides, and a name outside the pattern is invalid.'],
      [8.4, 'Either way, there is no instance. A broken extension fails at startup, not mid-request.']] },
    { name: 'Panic recovery', dur: 9.0, draw: sPanic, caps: [
      [0, 'Some bugs only show up on real rows. This aggregator writes to a nil map whenever an amount is over seventy-five.'],
      [2.2, 'Process doesn\'t crash. It returns PROCESSING_PANIC, with the operation, the panic\'s type and the stack.',
        'Process doesn\'t crash. It returns a processing panic error, with the operation, the panic\'s type and the stack.'],
      [4.4, 'The panic value itself is dropped, because it could carry row data.'],
      [5.8, 'The same instance answers the next request, four rows, as before.'],
      [7.6, 'If your host would rather crash, set DisablePanicRecovery.', 'If your host would rather crash, set disable panic recovery.']] },
    { name: 'Streaming results', dur: 9.4, draw: sStream, caps: [
      [0, 'ProcessStreamResult hands you the result as it is produced: a header, a channel of chunks, and a terminator.',
        'Process stream result hands you the result as it is produced: a header, a channel of chunks, and a terminator.'],
      [1.8, 'The header comes before any row, with the request\'s hash and a best-effort size estimate.'],
      [3.6, 'This grouped request sends four chunks, one per region. Only the last carries the per-group components.'],
      [6.4, 'A group exists only once every record is read, so grouped rows arrive at the final flush.'],
      [7.8, 'The terminator says completed, four rows, and the terminal components equal a buffered Process run.']] },
    { name: 'Watching a cohort', dur: 8.4, draw: sWatch, caps: [
      [0, 'Watch reports changes to a cohort file on a channel. WatchDir does the same for every cohort under a folder.'],
      [1.6, 'It polls: a stat, then a content hash, every two hundred and fifty milliseconds by default.'],
      [3.0, 'On the first tick, a file that\'s already there shows up as created.'],
      [4.3, 'Copy a bigger cohort over it, and you get modified, with a new hash.'],
      [5.6, 'Delete it, and you get removed. A host can re-run its requests whenever a file is modified.']] },
    { name: 'Cache keys', dur: 8.8, draw: sHash, caps: [
      [0, 'Request.Hash gives a cache key. The same request with its keys in another order hashes the same.',
        'Request dot hash gives a cache key. The same request with its keys in another order hashes the same.'],
      [1.8, 'Group by channel instead, and the hash changes.'],
      [3.2, 'It\'s canonical JSON, so it\'s stable across processes, and the return block is part of it.'],
      [4.6, 'FilterToFileWithRequest names its output by the source\'s hash and the predicate\'s, so the same filter again is reused.',
        'Filter to file with request names its output by the source\'s hash and the predicate\'s, so the same filter again is reused.'],
      [6.2, 'A predicate that calls your own function is never reused. It re-runs on every call.']] },
    { name: 'What a request reads', dur: 8.4, draw: sReads, caps: [
      [0, 'ExpressionReads parses one expression and lists the columns, params and functions it names. No instance, no cohort.',
        'Expression reads parses one expression and lists the columns, params and functions it names. No instance, no cohort.'],
      [2.4, 'It scopes the way the engine does, so a let-bound name is not a column.'],
      [3.8, 'An expression that doesn\'t parse is a compile error, with an empty read set.'],
      [5.0, 'RequestReads does it for a whole request: every slot that reads data, with its path, its key, and the columns and params it reads.',
        'Request reads does it for a whole request: every slot that reads data, with its path, its key, and the columns and params it reads.']] },
    { name: 'Hooks', dur: 8.8, draw: sHooks, caps: [
      [0, 'Options.Hooks fire around every operation. The start hook gets the kind, the scope, the cohort and the request hash.',
        'Options dot hooks fire around every operation. The start hook gets the kind, the scope, the cohort and the request hash.'],
      [2.2, 'The phase hook reports each phase that ran, in order, with its time.'],
      [4.0, 'The end hook gets the code, the arm the engine chose, and the row counts: twenty-four scanned, four out.'],
      [6.0, 'A refused request ends after planning and opening, with its error code, never its message.'],
      [8.0, 'Hooks must be fast. A panic inside one is recovered too.']] },
    { name: 'Metrics and traces', dur: 8.0, draw: sAdapters, caps: [
      [0, 'Pulse ships adapters for both. Observe prom turns its metrics into Prometheus counters and histograms.'],
      [2.4, 'Observe otel turns its hooks into OpenTelemetry spans, with one event per phase, and an error status on a refusal.',
        'Observe otel turns its hooks into Open Telemetry spans, with one event per phase, and an error status on a refusal.'],
      [4.6, 'You don\'t need Go for either: pulse mcp serves Prometheus metrics, and exports OTLP to the standard endpoint.',
        'You don\'t need Go for either: Pulse M C P serves Prometheus metrics, and exports O T L P to the standard endpoint.'],
      [6.0, 'After one tool call, the scrape counts it, and the collector receives its traces and metrics.']] },
    { name: 'The end of the series', dur: 12.0, draw: sRecap, caps: [
      [0, 'That\'s embedding Pulse today: build an instance, extend it, guard it, react to it, plan against it, and watch it run.'],
      [3.6, 'More is added over time, and the manifest lists what your instance offers, your own extensions included.'],
      [7.2, 'And that\'s the end of Pulse Anatomy: twenty-three films, from one request to your own program. Thanks for watching.'],
      [11.4, '', 'Pulse Anatomy.', true]] },
  ],
});
})();
