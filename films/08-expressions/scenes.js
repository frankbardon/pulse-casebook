/* Pulse Expressions: film 8 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts; narration says built-ins are added
 * over time, embedders add their own through Options.Extensions, and the manifest lists what an instance
 * registered. Every figure and code on screen is copied from a recorded alpha.33 run in data/ (see
 * data/README.md); each scene names the run it quotes. The embedder code card is illustrative and shows no
 * figures. Films 06 (filters) and 07 (attributes) own the two host operators; this film is the language. */
(() => {
const { C, MONO } = PulseFilm;
const { clamp, seg, eo, lerp, R, T, M, CAP, Ln, A, dot, arrow, chips, measure } = PulseFilm.h;
const card = (x, y, w, h, stroke, o = {}) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule, ...o });
const isNull = s => s === 'null';

/* ---------- the six members (data/e.csv) ---------- */
const MEM = [
  { id: 1, region: 'North', tags: 'tech, travel', score: '4', q: '5, 4, 5', price: '12.50', cost: '10.00', spend: '120.5', week: 1 },
  { id: 2, region: 'South', tags: 'sport', score: '2', q: '2, 3, 1', price: '8.40', cost: '7.00', spend: '80', week: 2 },
  { id: 3, region: 'East', tags: 'food, travel', score: 'null', q: '3, null, 4', price: '0.10', cost: '0.20', spend: '45.25', week: 3 },
  { id: 4, region: 'West', tags: 'tech', score: '5', q: '4, 5, 4', price: '19.99', cost: '15.00', spend: '210', week: 4 },
  { id: 5, region: 'North', tags: 'null', score: '3', q: '1, 2, 2', price: '5.00', cost: '4.00', spend: '15', week: 5 },
  { id: 6, region: 'East', tags: 'food, tech, travel', score: '1', q: '5, 5, 5', price: '2.50', cost: '2.00', spend: '0', week: 6 },
];

/* A table: cols [[header, width, color?]], rows of strings. Rows fade in from `at`. 'null' is coral. */
function table(t, at, x, y, cols, rows, o = {}) {
  const rh = o.rh ?? 30, size = o.size ?? 13.5, step = o.step ?? 0.12;
  A(seg(t, at - 0.2, at + 0.2), () => {
    let cx = x;
    cols.forEach(([h, w, col]) => { M(h, cx + 8, y, { size: 12.5, color: col || C.muted, weight: 500 }); cx += w; });
    Ln([[x, y + 10], [cx, y + 10]]);
  });
  rows.forEach((r, i) => A(seg(t, at + i * step, at + i * step + 0.3), () => {
    let cx = x; const ry = y + 34 + i * rh;
    if (o.hi && o.hi.includes(i)) R(x - 4, ry - 20, cols.reduce((a, c) => a + c[1], 0) + 8, rh - 3, { fill: C.panel2, r: 3 });
    r.forEach((s, j) => {
      const col = isNull(s) ? C.coral : (cols[j][2] && j > 0 ? cols[j][2] : (j === 0 ? C.muted : C.ink));
      M(s, cx + 8, ry, { size, color: col }); cx += cols[j][1];
    });
  }));
}
/* Code lines in a card: [text, color, size?]. */
function code(t, at, x, y, w, title, color, lines, o = {}) {
  const lh = o.lh ?? 26, h = o.h ?? 52 + lines.length * lh;
  A(seg(t, at - 0.2, at + 0.2), () => { card(x, y, w, h, color, o.dash ? { dash: [6, 5] } : {}); if (title) CAP(title, x + 18, y + 28, { color }); });
  lines.forEach(([s, c, sz], i) => A(seg(t, at + 0.1 + i * (o.step ?? 0.1), at + 0.4 + i * (o.step ?? 0.1)), () => M(s, x + 18, y + (title ? 58 : 32) + i * lh, { size: sz ?? 13.5, color: c ?? C.ink })));
}
/* Six member boxes showing a filter's verdict; keep: list of kept ids; nul: id with a null input. */
function strip(t, at, x, y, keep, nul) {
  for (let i = 0; i < 6; i++) {
    const id = i + 1, k = keep.includes(id), a = seg(t, at + i * 0.08, at + i * 0.08 + 0.3);
    A(a, () => {
      R(x + i * 52, y, 44, 30, { fill: k ? C.tealS : C.panel, stroke: k ? C.teal : (id === nul ? C.coral : C.rule), r: 4, lw: id === nul ? 2 : 1.2 });
      M('#' + id, x + i * 52 + 22, y + 20, { size: 12.5, align: 'center', color: k ? C.teal : (id === nul ? C.coral : C.faint) });
    });
  }
}
const refusal = (x, y, w, code1, msg, at, t, o = {}) => A(seg(t, at, at + 0.4), () => {
  R(x, y, w, o.h ?? 62, { fill: C.coralS, stroke: C.coral });
  M(code1, x + 16, y + 26, { size: 13, color: C.coral, weight: 600 });
  M(msg, x + 16, y + 48, { size: 12, color: C.ink });
});

/* ---------- 0. title ---------- */
function sTitle(t) {
  const toks = ['price', '/', 'cost', '>', '1.2', '??', 'has_any', '(', 'tags', ')', 'weekday', 'params.min'];
  toks.forEach((s, i) => {
    const u = eo(seg(t, 0.1 + i * 0.06, 0.7 + i * 0.06));
    A(u * 0.8, () => M(s, 250 + (i % 6) * 140, 360 + Math.floor(i / 6) * 34 + (1 - u) * 14, { size: 15, color: [C.ink, C.amber, C.violet, C.teal][i % 4], align: 'center' }));
  });
  A(seg(t, 1.0, 1.8), () => {
    T('PULSE', 640, 270, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('EXPRESSIONS', 640, 500, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 1.8, 2.6), () => T('One per-row language for formulas and filters', 640, 548, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. one language, two hosts ---------- */
function sHosts(t) {
  // two hosts
  A(seg(t, 0.2, 0.6), () => {
    card(64, 110, 340, 150, C.violet);
    M('ATTR_FORMULA', 86, 144, { size: 15, color: C.violet, weight: 600 });
    T('writes a new column', 86, 178, { size: 16 }); M('the answer is a number', 86, 206, { size: 13 }); M('true → 1 · false → 0', 86, 230, { size: 13 });
  });
  A(seg(t, 0.8, 1.2), () => {
    card(876, 110, 340, 150, C.teal);
    M('FILTER_EXPRESSION', 898, 144, { size: 15, color: C.teal, weight: 600 });
    T('keeps a row when true', 898, 178, { size: 16 }); M('the answer is true or false', 898, 206, { size: 13 }); M('false or unknown → dropped', 898, 230, { size: 13 });
  });
  A(seg(t, 1.4, 1.8), () => {
    card(444, 96, 392, 178, C.amber);
    CAP('ONE ENVIRONMENT', 466, 124, { color: C.amber });
    ['fields bound by type', 'operators and built-ins', 'set and vector helpers', 'params.<name>', 'embedder functions'].forEach((s, i) => M(s, 466, 156 + i * 24, { size: 13.5, color: C.ink }));
    arrow(444, 185, 410, 185, { stroke: C.violet }); arrow(836, 185, 870, 185, { stroke: C.teal });
  });
  A(seg(t, 3.0, 3.4), () => {
    chips([['film 6 · filters: FILTER_EXPRESSION, params, calendar helpers', C.teal], ['film 7 · attributes: ATTR_FORMULA, total(), hill after windows', C.violet]], 64, 300, 1152, { size: 13, h: 30 });
  });
  // compile once (data/nonbool.out.json and .predict.json)
  code(t, 5.4, 64, 360, 560, 'COMPILED ONCE, BEFORE ROW 1', C.amber, [
    ['parsed and type-checked against the cohort schema', C.ink], ['at predict and at the run alike', C.ink], ['', 0],
    ['FILTER_EXPRESSION  "week + 1"', C.ink]]);
  refusal(656, 360, 560, 'PULSE_FORMULA_COMPILE_ERROR', 'details.compile_error: expected bool, but got float64', 6.6, t);
  A(seg(t, 7.2, 7.6), () => { M('predict: valid false · the same code', 672, 452, { size: 12.5, color: C.amber }); M('a filter must answer a bool; a formula, a number', 672, 476, { size: 12.5 }); });
}

/* ---------- 2. binding by type ---------- */
function sBind(t) {
  const TY = [
    ['numeric  u*, f*', 'a number', 'weight_kg / (height_m ** 2)', C.ink],
    ['categorical_*', 'its label, never the index', 'region == "North"', C.ink],
    ['set_*', 'a sorted list of labels', '"tech" in tags', C.ink],
    ['decimal128', 'an exact decimal', 'price / cost', C.ink],
    ['date · datetime', 'epoch days · epoch seconds', 'month_index(order_day)', C.ink]];
  A(seg(t, 0.1, 0.4), () => { M('field type', 64, 112, { size: 12.5, weight: 500 }); M('binds as', 320, 112, { size: 12.5, weight: 500 }); M('write', 640, 112, { size: 12.5, weight: 500 }); Ln([[64, 122], [1216, 122]]); });
  TY.forEach(([a, b, c], i) => A(seg(t, (i < 2 ? 0.3 : 2.6) + i * 0.25, (i < 2 ? 0.6 : 2.9) + i * 0.25), () => {
    const y = 150 + i * 32;
    M(a, 72, y, { size: 13.5, color: C.amber }); M(b, 328, y, { size: 13.5, color: C.ink }); M(c, 648, y, { size: 13.5, color: C.violet });
  }));
  // data/bind.out.json, one ATTR_FORMULA per type, grouped by id with AGG_MAX
  A(seg(t, 5.4, 5.8), () => CAP('ONE FORMULA PER TYPE · data/bind', 64, 330, { color: C.violet }));
  table(t, 5.6, 64, 360, [['#', 40], ['region == "North"', 190, C.violet], ['"tech" in tags', 160, C.violet], ['price / cost', 140, C.violet], ['order_day', 150, C.violet]], [
    ['1', '1', '1', '1.25', '19756'], ['2', '0', '0', '1.2', '19783'], ['3', '0', '0', '0.5', '19730'],
    ['4', '0', '1', '1.3327', '19764'], ['5', '1', '0', '1.25', '19782'], ['6', '0', '1', '1.25', '19827']], { rh: 30, hi: [3] });
  A(seg(t, 7.6, 8.0), () => { M('19.99 / 15.00 → 1.3327', 772, 380, { size: 13.5, color: C.violet }); M('decimal division: four places,', 772, 404, { size: 12.5 }); M('half to even', 772, 424, { size: 12.5 }); M('19756 = 2024-02-03, in days', 772, 456, { size: 12.5 }); });
  // data/bind_bad.out.json and .predict.json
  refusal(772, 490, 444, 'PULSE_FORMULA_COMPILE_ERROR', '"region + 1": mismatched types string and int', 10.0, t);
  A(seg(t, 10.4, 10.8), () => M('refused at predict and at the run', 788, 576, { size: 12.5, color: C.amber }));
}

/* ---------- 3. operators and built-ins ---------- */
function sOps(t) {
  A(seg(t, 0.1, 0.4), () => CAP('OPERATORS TODAY', 64, 120, { color: C.amber }));
  chips([['+ - * / % **', C.ink], ['== != < > <= >=', C.ink], ['and or not', C.ink], ['in', C.ink], ['contains startsWith endsWith matches', C.ink], ['..', C.ink], ['?? nil-coalesce', C.coral], ['cond ? a : b', C.ink]], 64, 136, 1152, { at: 0.3, t, step: 0.12, size: 13, h: 30 });
  A(seg(t, 3.0, 3.3), () => CAP('BUILT-INS TODAY · + MORE OVER TIME', 64, 214, { color: C.amber }));
  chips([['numeric  abs ceil floor round min max sum mean median', 0], ['cast  int float string', 0], ['collection  len keys values concat sort uniq filter map reduce all any', 0], ['string  join split replace trim lower upper hasPrefix hasSuffix indexOf', 0], ['JSON · time  toJSON fromJSON now date duration', 0]], 64, 230, 1152, { at: 3.2, t, step: 0.15, size: 12.5, h: 28 });
  // data/ops.out.json
  A(seg(t, 4.8, 5.2), () => CAP('data/ops', 64, 384, { color: C.violet }));
  table(t, 5.0, 64, 412, [['#', 40], ['region in ["North", "East"] ? 1 : 0', 330, C.violet], ['week % 4', 120, C.violet], ['-7.5 % 2', 120, C.violet], ['spend / 0', 120, C.violet]], [
    ['1', '1', '1', '-1.5', 'null'], ['2', '0', '2', '-1.5', 'null'], ['3', '1', '3', '-1.5', 'null'], ['4', '0', '0', '-1.5', 'null'], ['5', '1', '1', '-1.5', 'null'], ['6', '1', '2', '-1.5', 'null']], { rh: 27, size: 13 });
  A(seg(t, 6.0, 6.4), () => { M('float % keeps the dividend\'s sign', 860, 448, { size: 13 }); });
  A(seg(t, 8.0, 8.4), () => {
    R(860, 480, 356, 92, { fill: C.coralS, stroke: C.coral });
    M('/ 0 → ±Inf · 0 / 0 → NaN', 878, 510, { size: 13, color: C.coral }); M('non-finite → null on the wire', 878, 536, { size: 13, color: C.ink }); M('#6 spend is 0: 0 / 0, also null', 878, 560, { size: 12, color: C.muted });
  });
}

/* ---------- 4. nulls in each host ---------- */
function sNull(t) {
  code(t, 0.2, 64, 104, 520, 'IN A FORMULA', C.violet, [
    ['a null field binds nil', C.coral], ['arithmetic on nil → PROCESSING_RUNTIME', C.coral], ['  the whole request fails (film 7)', C.muted], ['a nil result → a null value', C.ink], ['', 0],
    ['score == nil ? -1 : score', C.ink], ['  #3 → -1 · the others keep their score', C.violet]], { lh: 25 });   // data/nul_tern.out.json
  A(seg(t, 3.4, 3.8), () => CAP('IN A FILTER · #3 HAS A NULL SCORE', 620, 130, { color: C.teal }));
  const F = [  // data/nul_eq, nul_ne, nul_gt, nul_guard (.out.json: kept ids and n_out)
    [3.6, 'score == 3', [5], 'nil == 3 is false → dropped'],
    [5.2, 'score != 3', [1, 2, 3, 4, 6], 'nil != 3 is true → kept'],
    [7.6, 'score > 2', [1, 4, 5], 'nil > 2 is unknown → dropped'],
    [9.4, 'score == nil || score > 2', [1, 3, 4, 5], 'say it: the null is kept']];
  F.forEach(([at, e, keep, why], i) => {
    const y = 152 + i * 104;
    A(seg(t, at, at + 0.3), () => { M(e, 620, y + 20, { size: 14.5, color: C.ink }); M('n_out ' + keep.length, 1216, y + 20, { size: 13, align: 'right', color: C.teal }); });
    strip(t, at + 0.3, 620, y + 34, keep, 3);
    A(seg(t, at + 0.8, at + 1.1), () => M(why, 948, y + 54, { size: 12.5, color: i === 1 || i === 3 ? C.teal : C.coral }));
  });
  A(seg(t, 9.8, 10.2), () => M('or guard a default: (score ?? 0)', 64, 372, { size: 13.5, color: C.amber }));
}

/* ---------- 5. set helpers ---------- */
function sSets(t) {
  A(seg(t, 0.1, 0.4), () => CAP('SET HELPERS TODAY', 64, 120, { color: C.amber }));
  chips([['has_any', C.teal], ['has_all', C.teal], ['has_none', C.teal], ['popcount', C.teal], ['set_union', C.violet], ['set_intersect', C.violet], ['set_diff', C.violet], ['set_xor', C.violet]], 64, 136, 1152, { at: 0.3, t, step: 0.1, size: 13, h: 30 });
  A(seg(t, 2.6, 3.0), () => CAP('SIMILARITY OF TWO SETS', 64, 206, { color: C.amber }));
  chips([['jaccard', C.violet], ['dice', C.violet], ['overlap', C.violet], ['hamming', C.violet]], 64, 222, 1152, { at: 2.8, t, step: 0.1, size: 13, h: 30 });
  // data/sets.out.json
  table(t, 3.6, 64, 300, [['#', 40], ['tags', 200], ['popcount(tags)', 160, C.violet], ['has_all(tags, "travel", "tech")', 300, C.violet], ['jaccard(tags, ["travel", "tech"])', 300, C.violet]],
    MEM.map((m, i) => [String(m.id), m.tags, ['2', '1', '2', '1', '0', '3'][i], ['1', '0', '0', '0', '0', '1'][i], ['1', '0', '0.333', '0.5', 'null', '0.667'][i]]), { rh: 30, hi: [4] });
  A(seg(t, 7.2, 7.6), () => {
    R(64, 508, 1152, 70, { fill: C.coralS, stroke: C.coral });
    M('#5 has a null set: the helpers read it as empty · popcount 0 · has_none(tags, "sport") 1 · len(set_intersect(…)) 0', 82, 536, { size: 13, color: C.ink });
    M('a similarity of a null set is NaN, so it arrives as null', 82, 560, { size: 13, color: C.coral });
  });
}

/* ---------- 6. vectors ---------- */
function sVec(t) {
  code(t, 0.2, 64, 104, 520, 'A VECTOR IS A LIST', C.amber, [['[q1, q2, q3]   a nil element is NaN', C.ink], ['reductions skip NaN', C.ink], ['vsum vmean vmin vmax norm vcount vsd', C.violet, 12.5], ['dot dist cosine argmax argmin', C.violet, 12.5]], { lh: 25 });
  code(t, 3.6, 620, 104, 596, 'SHAPE FUNCTIONS', C.amber, [['vcenter vzscore vnormalize return a vector,', C.ink], ['so they sit inside a call:', C.ink], ['vmax(vzscore([q1, q2, q3]))', C.violet], ['top-level → PROCESSING_CONFIG', C.coral]], { lh: 25 });
  // data/vec.out.json
  table(t, 1.4, 64, 300, [['#', 40], ['q1, q2, q3', 130], ['vmean', 110, C.violet], ['vcount', 90, C.violet], ['vsd', 100, C.violet], ['argmax', 90, C.violet], ['vmax(vzscore(…))', 170, C.violet], ['dist(…, [5, 5, 5])', 180, C.violet]], [
    ['1', '5, 4, 5', '4.667', '3', '0.577', '0', '0.577', '1'],
    ['2', '2, 3, 1', '2', '3', '1', '1', '1', '5.385'],
    ['3', '3, null, 4', '3.5', '2', '0.707', '2', '0.707', '2.739'],
    ['4', '4, 5, 4', '4.333', '3', '0.577', '1', '1.155', '1.414'],
    ['5', '1, 2, 2', '1.667', '3', '0.577', '1', '0.577', '5.831'],
    ['6', '5, 5, 5', '5', '3', '0', '0', 'null', '0']], { rh: 30, hi: [2, 5] });
  A(seg(t, 5.6, 6.0), () => M('#6 has no spread: z-scores are NaN → null', 64, 532, { size: 13, color: C.coral }));
  A(seg(t, 8.2, 8.6), () => { M('#3: pairwise-complete, rescaled by p / p_observed', 64, 560, { size: 13, color: C.violet }); M('argmax is a 0-based index', 640, 532, { size: 13 }); });
}

/* ---------- 7. portable maths ---------- */
function sMaths(t) {
  A(seg(t, 0.1, 0.4), () => CAP('MATHS TODAY', 64, 120, { color: C.amber }));
  chips([['sqrt', 0], ['log', 0], ['log1p', 0], ['exp', 0], ['pow · **', 0], ['sin cos tan atan2', 0], ['pi() e()', 0], ['hill(x, k, s)', C.violet]], 64, 136, 1152, { at: 0.3, t, step: 0.1, size: 13, h: 30 });
  A(seg(t, 1.8, 2.2), () => {
    R(64, 186, 1152, 44, { fill: C.panel, stroke: C.teal });
    M('portable maths: the same bits on every machine and CPU · ** gives the same bits as pow()', 82, 214, { size: 13.5, color: C.teal });
  });
  // data/maths.out.json
  table(t, 3.8, 64, 270, [['#', 40], ['week', 70], ['sin(2 * pi() * week / 52)', 250, C.violet], ['sqrt(-1)', 110, C.violet]], [
    ['1', '1', '0.1205', 'null'], ['2', '2', '0.2393', 'null'], ['3', '3', '0.3546', 'null'], ['4', '4', '0.4647', 'null'], ['5', '5', '0.5681', 'null'], ['6', '6', '0.6631', 'null']], { rh: 30 });
  // hill(spend, 100, 2): x^2 / (x^2 + 100^2); curve is the formula, dots are the recorded values
  const px = 600, py = 540, pw = 560, ph = 240, xm = 250, X = v => px + v / xm * pw, Y = v => py - v * ph;
  A(seg(t, 6.6, 7.0), () => {
    CAP('hill(spend, 100, 2)', px, 280, { color: C.violet });
    Ln([[px, py], [px + pw, py]]); Ln([[px, py], [px, py - ph]]);
    M('spend', px + pw, py + 22, { size: 12, align: 'right' }); M('1', px - 10, py - ph + 4, { size: 12, align: 'right' }); M('0', px - 10, py + 4, { size: 12, align: 'right' });
    Ln([[X(100), py], [X(100), Y(0.5)]], { stroke: C.faint, dash: [3, 4] }); M('k = 100 → 0.5', X(100) + 6, py - 8, { size: 11.5 });
  });
  const u = seg(t, 6.8, 7.8), pts = [];
  for (let i = 0; i <= 60 * u; i++) { const x = i / 60 * xm; pts.push([X(x), Y(x * x / (x * x + 1e4))]); }
  if (pts.length > 1) Ln(pts, { stroke: C.violet, lw: 2 });
  [[120.5, 0.5922, 1], [80, 0.3902, 2], [45.25, 0.1700, 3], [210, 0.8152, 4], [15, 0.0220, 5], [0, 0, 6]].forEach(([x, v, id], i) => A(seg(t, 7.6 + i * 0.1, 7.9 + i * 0.1), () => {
    dot(X(x), Y(v), 5, C.violet); const lo = id === 5 || id === 6; M('#' + id + ' ' + v.toFixed(3), X(x) + (id === 6 ? -8 : 8), Y(v) + (lo ? (id === 6 ? 20 : -10) : -8), { size: 11.5, color: C.ink, align: id === 6 ? 'right' : 'left' });
  }));
  A(seg(t, 9.0, 9.4), () => M('after a window: see film 7', px + 120, py + 22, { size: 12.5, color: C.muted }));
}

/* ---------- 8. exact decimals ---------- */
function sDec(t) {
  // data/dec_eq.out.json, data/dec_feq.out.json (price and cost are decimal128(18, 2))
  A(seg(t, 0.2, 0.5), () => CAP('price, cost: decimal128(18, 2) · #3 is 0.10 and 0.20', 64, 116, { color: C.amber }));
  A(seg(t, 0.6, 0.9), () => { M('price + cost == 0.30', 64, 156, { size: 15 }); M('n_out 1', 600, 156, { size: 13, color: C.teal, align: 'right' }); });
  strip(t, 0.9, 64, 170, [3], 0);
  A(seg(t, 2.4, 2.7), () => { M('float(price) + float(cost) == 0.30', 64, 236, { size: 15 }); M('n_out 0', 600, 236, { size: 13, color: C.coral, align: 'right' }); });
  strip(t, 2.7, 64, 250, [], 0);
  A(seg(t, 3.2, 3.5), () => M('float(…) is the explicit escape to f64', 64, 306, { size: 12.5 }));
  A(seg(t, 4.0, 4.4), () => {
    card(660, 100, 556, 210, C.amber); CAP('RESULT SCALE', 680, 128, { color: C.amber });
    [['+  -', 'max(s1, s2)'], ['*', 's1 + s2, held to 38'], ['/', 'max(s1, s2, 4)'], ['rounding', 'half to even, round() too'], ['%', 'refused at compile']].forEach(([a, b], i) => { M(a, 680, 162 + i * 28, { size: 13.5, color: C.ink }); M(b, 820, 162 + i * 28, { size: 13.5, color: i === 4 ? C.coral : C.ink }); });
  });
  // data/dec_round.out.json
  table(t, 5.2, 64, 352, [['#', 40], ['price', 80], ['price / cost', 120, C.violet], ['round(price / 5)', 160, C.violet], ['round(float(price) / 5)', 220, C.violet]], [
    ['1', '12.50', '1.25', '2', '3'], ['4', '19.99', '1.3327', '4', '4'], ['6', '2.50', '1.25', '0', '1']], { rh: 30, hi: [0, 2] });
  A(seg(t, 6.6, 7.0), () => M('2.5 rounds to 2 as a decimal, 3 as a float', 64, 488, { size: 13, color: C.violet }));
  // data/dec_mod, dec_str (compile), dec_zero (run)
  refusal(660, 340, 556, 'PULSE_FORMULA_COMPILE_ERROR', '"price % 2": % over a decimal · use float(price) % 2', 8.6, t);
  refusal(660, 412, 556, 'PULSE_FORMULA_COMPILE_ERROR', '"price + region": mismatched types Decimal and string', 9.0, t);
  refusal(660, 484, 556, 'PULSE_DECIMAL_DIVIDE_BY_ZERO', '"price / (cost - cost)": a run error, never a null', 9.6, t);
  A(seg(t, 11.4, 11.8), () => { R(64, 512, 560, 64, { fill: C.panel, stroke: C.violet }); M('a formula column is f64: the exact result lands', 82, 538, { size: 13 }); M('as its nearest float · a filter reads the exact verdict', 82, 560, { size: 13 }); });
}

/* ---------- 9. calendar helpers ---------- */
function sCal(t) {
  // data/cal_utc.out.json
  code(t, 0.2, 64, 100, 560, 'month_index(order_day) - month_index(signup_day)', C.violet, [], { h: 40 });
  table(t, 0.6, 64, 172, [['#', 40], ['signup_day', 140], ['order_day', 140], ['months', 100, C.violet]], [
    ['1', '2024-01-15', '2024-02-03', '1'], ['2', '2024-01-31', '2024-03-01', '2'], ['4', '2024-02-10', '2024-02-11', '0'], ['5', '2023-11-05', '2024-02-29', '3']], { rh: 30, hi: [1] });
  A(seg(t, 2.0, 2.4), () => M('calendar months, across year ends', 64, 330, { size: 12.5 }));
  code(t, 4.0, 660, 100, 556, 'date_trunc("week", order_day)', C.violet, [], { h: 40 });
  table(t, 4.3, 660, 172, [['#', 40], ['order_day', 190], ['week starts', 190, C.violet]], [
    ['1', '2024-02-03 Sat', '2024-01-29 Mon'], ['4', '2024-02-11 Sun', '2024-02-05 Mon'], ['6', '2024-04-14 Sun', '2024-04-08 Mon']], { rh: 30 });
  A(seg(t, 5.0, 5.4), () => M('"week" (Monday start) · "month" · "quarter" · "year"', 660, 300, { size: 12.5 }));
  // data/cal_utc vs data/cal_ny (request time_zone America/New_York)
  code(t, 6.4, 64, 370, 1152, 'weekday(to_day(created_at)) · ISO, Monday = 1', C.teal, [], { h: 40 });
  table(t, 6.7, 64, 442, [['#', 40], ['created_at', 230], ['no time_zone (UTC)', 240, C.teal], ['time_zone America/New_York', 300, C.teal]], [
    ['1', '2024-03-10T03:30Z', '7  Sun 03-10', '6  Sat 03-09'], ['5', '2024-03-10T04:59Z', '7  Sun 03-10', '6  Sat 03-09'], ['4', '2024-03-08T12:00Z', '5  Fri 03-08', '5  Fri 03-08']], { rh: 30, hi: [0, 1] });
  A(seg(t, 9.0, 9.4), () => { M('a bare datetime is refused:', 900, 476, { size: 12.5 }); M('weekday(created_at)', 900, 500, { size: 13 }); M('PULSE_FORMULA_COMPILE_ERROR', 900, 524, { size: 12.5, color: C.coral }); M('(film 6)', 900, 548, { size: 12, color: C.faint }); });
}

/* ---------- 10. params and total() ---------- */
function sParams(t) {
  code(t, 0.2, 64, 100, 600, 'data/par', C.amber, [
    ['"params": { "budget": 1000, "min_score": 3 },', C.amber], ['FILTER_EXPRESSION', C.teal, 12.5], ['  (score ?? 0) >= params.min_score', C.ink], ['ATTR_FORMULA  alloc', C.violet, 12.5], ['  spend * params.budget / total(spend)', C.ink]], { lh: 28 });
  A(seg(t, 1.4, 1.8), () => { M('read-only constants, folded per run', 700, 140, { size: 13 }); M('they bind in formulas, expression filters,', 700, 166, { size: 13 }); M('total() and OVERLAY_FORMULA', 700, 192, { size: 13 }); M('change the value, never the text', 700, 226, { size: 13, color: C.amber }); });
  // data/par.out.json (n_in 6, n_out 3) and data/par_sum.out.json
  A(seg(t, 3.6, 4.0), () => M('n_in 6 · n_out 3 · total(spend) over the 3 survivors', 64, 316, { size: 13, color: C.teal }));
  table(t, 3.9, 64, 350, [['#', 40], ['score', 80], ['spend', 100], ['alloc', 180, C.violet]], [
    ['1', '4', '120.5', '348.770'], ['4', '5', '210', '607.815'], ['5', '3', '15', '43.415']], { rh: 30 });
  A(seg(t, 5.6, 6.0), () => { Ln([[64, 456], [464, 456]]); M('Σ alloc', 72, 480, { size: 13.5 }); M('1000.0000000000001 (f64)', 292, 480, { size: 13.5, color: C.violet }); });
  // data/par_undecl, data/total_site (.out and .predict)
  refusal(660, 330, 556, 'PULSE_PARAMS_UNDECLARED', 'params.min_scor · declared: min_score', 7.4, t);
  refusal(660, 402, 556, 'PULSE_FORMULA_TOTAL_SITE', 'FILTER_EXPRESSION cannot call total() · ATTR_FORMULA only', 8.0, t);
  A(seg(t, 8.6, 9.0), () => M('both refused at predict, before any row', 676, 492, { size: 12.5, color: C.amber }));
}

/* ---------- 11. embedder functions and lookup tables ---------- */
function sExt(t) {
  code(t, 0.2, 64, 100, 700, 'ILLUSTRATIVE EMBEDDER CODE', C.amber, [
    ['pulse.New(pulse.Options{ Extensions: pulse.Extensions{', C.muted],
    ['  ExprFunctions:    []pulse.ExprFunction{ { Name: "fx_rate", Fn: … } },', C.ink, 12.5],
    ['  LookupTables:     map[string]pulse.LookupTable{ "fx": { Rows: … } },', C.ink, 12.5],
    ['  ReferenceVectors: map[string]types.ReferenceVectorTable{ … },', C.ink, 12.5],
    ['}})', C.muted]], { dash: true });
  A(seg(t, 1.4, 1.8), () => {
    card(796, 100, 420, 182, C.violet); CAP('IN AN EXPRESSION', 816, 128, { color: C.violet });
    M('fx_rate(…)', 816, 160, { size: 13.5 }); M('lookup("fx", region)', 816, 190, { size: 13.5 }); M('ref("ideal", key)', 816, 220, { size: 13.5 });
    M('formulas and expression filters', 816, 256, { size: 12.5 });
  });
  refusal(64, 320, 560, 'PULSE_EXTENSION_NAME_RESERVED', 'an ExprFunction named total, ref, sin, … at pulse.New', 2.6, t);
  A(seg(t, 4.4, 4.8), () => { card(656, 320, 560, 62, C.coral); M('PULSE_LOOKUP_TABLE_UNKNOWN · PULSE_LOOKUP_MISS', 672, 346, { size: 13, color: C.coral, weight: 600 }); M('an unregistered table · a missing key, at evaluation', 672, 368, { size: 12 }); });
  // data/lookup.out.json and .predict.json; data/manifest.extensions.json
  A(seg(t, 7.0, 7.4), () => { M('the stock CLI registers no table, so lookup is not declared:', 64, 430, { size: 13 }); M('lookup("fx", region)', 64, 456, { size: 13.5 }); });
  refusal(64, 470, 560, 'PULSE_FORMULA_COMPILE_ERROR', 'unknown name lookup · at predict and at the run', 7.4, t);
  code(t, 9.0, 656, 410, 560, 'pulse manifest --json · extensions', C.amber, [['"expr_functions": [ ],', C.ink], ['"lookup_tables": [ ],', C.ink], ['"reference_vectors": [ ]', C.ink], ['what this instance registered', C.muted, 12.5]], { lh: 25 });
}

/* ---------- 12. recap ---------- */
const PARTS = [['binding', 'fields bound by type'], ['operators', 'arithmetic to ??'], ['nulls', 'each host differs'], ['sets', 'helpers and similarity'],
  ['vectors', 'lists and reductions'], ['maths', 'same bits everywhere'], ['decimals', 'exact, half to even'], ['calendar', 'days, weeks, zones'],
  ['params', 'constants by name'], ['total()', 'formula only'], ['extensions', 'functions and tables'], ['compile', 'once, at predict too']];
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('THE EXPRESSION LANGUAGE TODAY', 64, 130, { color: C.violet });
    PARTS.forEach(([op, d], i) => A(seg(t, 0.2 + i * 0.08, 0.5 + i * 0.08), () => { const x = 64 + (i % 4) * 290, y = 148 + Math.floor(i / 4) * 76; R(x, y, 278, 64, { fill: C.panel, stroke: C.violet }); M(op, x + 14, y + 27, { size: 12.5, color: C.violet, weight: 600 }); T(d, x + 14, y + 50, { size: 14.5 }); }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 386, 566, 72, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more built-ins over time', 82, 416, { size: 14, color: C.teal, weight: 600 }); T('the skill pack documents the language', 82, 440, { size: 14.5 });
      R(650, 386, 566, 72, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 416, { size: 14, color: C.amber, weight: 600 }); T('Options.Extensions · the manifest lists them', 668, 440, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('EXPRESSIONS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('know what a null becomes in each host', 640, 430, { size: 15, align: 'center' });
    M('next: groupers', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[4.992, 8.256, 5.696, 10.069, 7.573, 8.384, 7.616, 5.035, 9.237, 4.288, 6.016, 4.779, 7.189, 5.483, 3.648, 5.589, 3.712, 6.613, 6.805, 5.632, 3.264, 7.168, 5.504, 4.203, 4.693, 5.141, 5.248, 8.597, 3.157, 7.851, 7.125, 4.139, 6.101, 5.163, 9.579, 4.395, 5.845, 7.531, 4.608, 5.845, 4.501, 6.997, 6.187, 3.691, 8.832, 3.925, 1.216]/*END*/;
PulseFilm.mount({
  series: 'PULSE · EXPRESSIONS',
  title: 'Pulse Expressions',
  narr: NARR,
  scenes: [
    { name: 'Pulse Expressions', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse expressions. One small language for formulas and filters, taken apart.', true]] },
    { name: 'One language, two hosts', dur: 9, draw: sHosts, caps: [
      [0, 'ATTR_FORMULA writes a new column. FILTER_EXPRESSION keeps a row when the answer is true. Both read one per-row language.',
        'The formula attribute writes a new column. The expression filter keeps a row when the answer is true. Both read one per-row language.'],
      [3.0, 'The filters and attributes films cover the two operators. This film is the language they share.'],
      [5.4, 'Each expression compiles once, before the first row, and predict runs the same compile. A filter must answer true or false, so week plus one is refused.']] },
    { name: 'Binding by type', dur: 11, draw: sBind, caps: [
      [0, 'A field is named bare, and binds by its type. A number is a number. A category binds as its label, never its index.'],
      [2.6, 'A set binds as a sorted list of labels. A decimal stays exact. A date is a count of days, and a datetime a count of seconds.'],
      [5.4, 'One formula per type, on six members. Member four\'s price over cost is exact: decimal division keeps four places.'],
      [10.0, 'Arithmetic on a category is refused at compile, by predict and the run alike.']] },
    { name: 'Operators and built-ins', dur: 9.4, draw: sOps, caps: [
      [0, 'Today\'s operators cover arithmetic, comparison, logic, membership, string tests, ranges, a ternary, and the null guard: two question marks.'],
      [3.0, 'Built-ins cover numbers, casts, collections, strings, JSON and time.'],
      [4.8, 'Float modulo keeps the dividend\'s sign: minus seven and a half mod two is minus one and a half.'],
      [8.0, 'Divide by zero gives infinity, and a non-finite result arrives as null.']] },
    { name: 'Nulls in each host', dur: 11, draw: sNull, caps: [
      [0, 'A null field binds as nil. In a formula, arithmetic on nil stops the request, as the attributes film showed.'],
      [3.4, 'In a filter, member three has no score. Score equals three is false, so the row is dropped.'],
      [5.2, 'But score not-equal-to three is true, so the null row is kept.'],
      [7.6, 'Greater-than on nil is unknown, so the row is dropped. To keep it, say so, or give a default.']] },
    { name: 'Set helpers', dur: 9, draw: sSets, caps: [
      [0, 'Set helpers test a multi-select answer, or build a new set.'],
      [2.6, 'Jaccard, Dice, overlap and Hamming compare two sets by label. Member six scores two thirds on Jaccard.'],
      [7.2, 'A null set reads as empty: popcount zero, has none true. A similarity of a null set arrives as null.']] },
    { name: 'Vectors', dur: 9.4, draw: sVec, caps: [
      [0, 'A vector is a list, like q one, q two, q three. The reductions skip a null element.'],
      [1.4, 'Member three skipped q two, so its mean is three and a half.'],
      [3.6, 'Shape functions, like the vector z-score, sit inside a reduction. Member six has no spread, so its z-score is null.'],
      [8.2, 'Distance and cosine compare two vectors, pairwise-complete, rescaled for a missing item.']] },
    { name: 'Portable maths', dur: 9.8, draw: sMaths, caps: [
      [0, 'The maths covers roots, logs, powers, trigonometry and the hill curve.'],
      [1.8, 'It runs on Pulse\'s own portable maths, so every machine gets the same bits.'],
      [3.8, 'A seasonal Fourier term is one line. The square root of minus one arrives as null.'],
      [6.6, 'Hill bends spend into a saturation curve. The attributes film runs it after the windows.']] },
    { name: 'Exact decimals', dur: 12.4, draw: sDec, caps: [
      [0, 'A decimal binds exactly, and a number joins as written. Ten cents plus twenty cents equals thirty cents, so the filter keeps member three.'],
      [2.4, 'Cast to float first, and the same test keeps nobody.'],
      [4.0, 'Division keeps at least four places, and rounding is half to even: two and a half rounds to two as a decimal, and three as a float.'],
      [8.6, 'Modulo on a decimal is refused at compile. Dividing by a zero decimal is a run error, never a null.'],
      [11.4, 'A formula column is a float. A filter reads the exact verdict.']] },
    { name: 'Calendar helpers', dur: 10.4, draw: sCal, caps: [
      [0, 'Month index differences count calendar months: January the thirty-first to March the first is two.'],
      [4.0, 'Date trunc finds the day a week, month, quarter or year starts. Weeks start on Monday.'],
      [6.4, 'To-day reads an instant\'s local day in the request time zone. Three-thirty UTC on March the tenth is Sunday in UTC, but Saturday in New York.'],
      [9.0, 'A bare datetime in a day helper is refused, as the filters film showed.']] },
    { name: 'Params and total', dur: 9.6, draw: sParams, caps: [
      [0, 'Params are read-only constants, read as params dot name, in formulas, filters and total.'],
      [3.6, 'A filter keeps scores of at least the minimum. A formula splits the budget by share of total spend, over the three survivors.'],
      [7.4, 'A misspelt param, or total in a filter, is refused. Predict catches both.']] },
    { name: 'Embedder functions', dur: 10.6, draw: sExt, caps: [
      [0, 'Embedders add their own functions through Options.Extensions, in formulas and filters alike.',
        'Embedders add their own functions through Options dot Extensions, in formulas and filters alike.'],
      [2.6, 'A function that claims a reserved name, like total, is refused at startup.'],
      [4.4, 'Lookup tables are read with lookup, and reference vectors with ref. A missing table or key has its own error code.'],
      [7.0, 'With no table registered, lookup is an unknown name. The manifest lists what your instance registered.']] },
    { name: 'The expression toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the expression language today, from binding to extensions.'],
      [3.4, 'Pulse adds built-ins over time, and embedders register their own through Options.Extensions. The manifest lists what your instance adds.',
        'Pulse adds built-ins over time, and embedders register their own through Options dot Extensions. The manifest lists what your instance adds.'],
      [6.4, 'Remember: know what a null becomes in each host. Next up, groupers.'],
      [9.0, '', 'Pulse expressions.', true]] },
  ],
});
})();
