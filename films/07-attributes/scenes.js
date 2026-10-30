/* Pulse Attributes: film 5 of the Pulse Anatomy series. Follows SERIES-RULES.md.
 * Score formulas mirror internal/processing/attribute.go: population mean / sd, null input → neutral value. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, arrow, rng } = PulseFilm.h;
const ctx = () => PulseFilm.ctx;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const gaussOf = r => () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(2);

/* ---------- a post-filter cohort ---------- */
const P = [
  { id: 1, region: 'North', age: 34, income: 52, rating: 5, joined: '2023-03-14', set: ['travel', 'tech'] },
  { id: 3, region: 'East', age: 45, income: 58, rating: 4, joined: '2022-11-02', set: ['food'] },
  { id: 4, region: 'West', age: 29, income: 61, rating: 2, joined: '2023-07-21', set: ['travel', 'food'] },
  { id: 6, region: 'South', age: 38, income: 64, rating: null, joined: '2023-09-05', set: ['tech'] },
  { id: 7, region: 'East', age: 52, income: 66, rating: 5, joined: '2022-02-17', set: null },
  { id: 8, region: 'West', age: 24, income: 70, rating: 3, joined: '2024-04-11', set: ['sport', 'tech'] },
  { id: 9, region: 'North', age: 41, income: 72, rating: 4, joined: '2023-12-01', set: ['travel'] },
  { id: 10, region: 'South', age: 63, income: null, rating: 1, joined: '2022-06-24', set: [] },
  { id: 11, region: 'East', age: 30, income: 75, rating: 5, joined: '2024-02-28', set: ['tech', 'food', 'sport'] },
  { id: 12, region: 'North', age: 58, income: 140, rating: 3, joined: '2021-08-09', set: ['food'] },
];
const INC = P.map(r => r.income).filter(v => v != null);
const N = INC.length, MEAN = INC.reduce((a, b) => a + b, 0) / N;
const PSD = Math.sqrt(INC.reduce((a, b) => a + (b - MEAN) ** 2, 0) / N);              // population sd
const MIN = Math.min(...INC), MAX = Math.max(...INC);
const SORTED = [...INC].sort((a, b) => a - b);
const Z = v => v == null || PSD === 0 ? 0 : (v - MEAN) / PSD;                          // null → 0
const TS = v => v == null ? 50 : 50 + 10 * Z(v);                                       // null → 50
const NORM = v => v == null || MAX === MIN ? 0 : (v - MIN) / (MAX - MIN);              // null → 0
const PCT = v => v == null ? 0 : (SORTED.indexOf(v) + 1) / N * 100;                   // rank / n × 100, null → 0

function table(x0, y0, cols, rows, o = {}) {
  let x = x0;
  cols.forEach(c => { A(c.ha ?? 1, () => T(c.l, x + 8, y0, { size: 14, weight: 600, color: c.hc || C.ink })); x += c.w; });
  Ln([[x0, y0 + 14], [x, y0 + 14]]);
  rows.forEach((r, i) => {
    const y = y0 + 42 + i * (o.rh ?? 32);
    if (o.tint && o.tint(r, i)) R(x0 - 6, y - 21, x - x0 + 12, 30, { fill: o.tint(r, i), r: 3 });
    let cx = x0;
    cols.forEach(c => {
      const v = c.val ? c.val(r) : (r[c.k] == null ? 'null' : String(r[c.k]));
      A(c.ca ? c.ca(i) : 1, () => M(v, cx + 8, y, { size: 13.5, color: v === 'null' ? C.coral : (c.color ? (typeof c.color === 'function' ? c.color(r) : c.color) : C.ink) }));
      cx += c.w;
    });
  });
  return x;
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  for (let i = 0; i < 6; i++) {
    A(seg(t, 0.1 + i * 0.05, 0.5 + i * 0.05), () => R(470, 330 + i * 20, 160, 14, { fill: C.tealS, stroke: C.teal, r: 2, lw: 1 }));
    const u = eo(seg(t, 0.6 + i * 0.08, 1.2 + i * 0.08));
    A(u, () => R(lerp(470, 640, u), 330 + i * 20, 160, 14, { fill: C.violetS, stroke: C.violet, r: 2, lw: 1 }));
  }
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 290, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('ATTRIBUTES', 640, 500, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 2.0, 2.8), () => T('One derived value for every record that survives the filters', 640, 548, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where attributes run ---------- */
const SPINE = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
function sWhere(t) {
  SPINE.forEach((n, i) => {
    const x = 64 + i * 164, on = i === 2;
    A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08) * (on ? 1 : 0.55), () => {
      R(x, 110, 150, 52, { fill: on ? C.violetS : C.panel, stroke: on ? C.violet : C.rule, lw: on ? 2 : 1.2 });
      T(n, x + 14, 142, { size: 15.5, weight: 600, color: on ? C.ink : C.muted });
      if (i < 6) arrow(x + 150, 136, x + 162, 136, { stroke: C.faint, head: 6 });
    });
  });
  A(seg(t, 1.0, 1.4), () => {
    M('sees only the rows the filters kept', 392, 186, { size: 12.5, color: C.violet });
    M('filters cannot read the new column: they already ran', 64, 212, { size: 12.5, color: C.coral });
    M('groups, aggregations and windows can', 1216, 212, { size: 12.5, color: C.teal, align: 'right' });
  });
  A(seg(t, 2.4, 2.8), () => {
    card(64, 240, 560, 150, C.violet);
    const L = [['"attributes": [', C.muted], ['  { "type": "ATTR_FORMULA", "label": "income_k",', C.ink], ['    "expression": "income / 1000" },', C.amber], ['  { "type": "ATTR_ZSCORE", "field": "income_k", "label": "z" }', C.ink], [']', C.muted]];
    L.forEach(([s, c], i) => A(seg(t, 2.6 + i * 0.12, 2.9 + i * 0.12), () => M(s, 86, 274 + i * 26, { size: 13.5, color: c })));
  });
  A(seg(t, 4.6, 5.0), () => {
    card(660, 240, 556, 150);
    CAP('THE LABEL IS THE NEW COLUMN', 682, 270);
    M('must be new: not a schema field, a feature column', 682, 302, { size: 13, color: C.ink }); M('or an earlier attribute label', 682, 324, { size: 13, color: C.ink });
    M('a clash is refused: SERVICE_VALIDATION, at predict too', 682, 356, { size: 12.5, color: C.coral });
  });
  A(seg(t, 6.2, 6.6), () => {
    card(64, 414, 1152, 120);
    CAP('ATTRIBUTE OR FEATURE?', 86, 444);
    [['', 'runs', 'sees', 'readable by filters'], ['FEAT_*', 'before filters', 'every record', 'yes'], ['ATTR_*', 'after filters', 'surviving records', 'no']].forEach((r, i) => r.forEach((v, j) => M(v, 86 + [0, 160, 420, 700][j], 474 + i * 24, { size: 13, color: i === 0 ? C.muted : j === 0 ? (i === 1 ? C.violet : C.teal) : C.ink })));
  });
}

/* ---------- 2. one pass or two ---------- */
function sPasses(t) {
  const lanes = [
    ['ROW-LOCAL · ONE PASS · STREAMS', 'formula · date part · set has · set popcount · code in · reg predict', C.teal, 170],
    ['TWO-PASS · LEARN, THEN SCORE', 'z-score · t-score · normalized · regression diagnostics · Mahalanobis · PC and factor scores · formulas using total()', C.violet, 330],
    ['SORTS FIRST · NOT STREAMABLE', 'percentile rank', C.coral, 490]];
  lanes.forEach(([h, ops, col, y], k) => A(seg(t, 0.3 + k * 2.2, 0.7 + k * 2.2), () => {
    CAP(h, 64, y - 30, { color: col }); M(ops, 64, y - 10, { size: 12.5 });
    Ln([[64, y + 30], [1216, y + 30]], { stroke: C.rule });
    const lt = t - (0.6 + k * 2.2);
    for (let i = 0; i < 10; i++) {
      if (k === 0) { const x = 80 + (lt - i * 0.18) * 520; if (x > 64 && x < 1200) { R(x, y + 18, 26, 24, { fill: C.tealS, stroke: C.teal, r: 3 }); if (x > 640) R(x + 28, y + 18, 10, 24, { fill: C.violet, r: 2 }); } }
      if (k === 1) {
        const x1 = 80 + (lt - i * 0.1) * 700; if (x1 > 64 && x1 < 640) R(x1, y + 18, 26, 24, { fill: C.tealS, stroke: C.teal, r: 3 });
        const x2 = 80 + (lt - 1.0 - i * 0.1) * 700; if (x2 > 64 && x2 < 1200 && lt > 1.0) { R(x2, y + 18, 26, 24, { fill: C.tealS, stroke: C.teal, r: 3 }); if (x2 > 640) R(x2 + 28, y + 18, 10, 24, { fill: C.violet, r: 2 }); }
      }
      if (k === 2) { const u = eio(seg(lt, 0.2 + i * 0.05, 0.9 + i * 0.05)); const order = [3, 7, 0, 9, 5, 1, 8, 2, 6, 4][i]; R(lerp(80 + i * 34, 300 + order * 34, u), y + 18, 28, 24, { fill: C.coralS, stroke: C.coral, r: 3 }); }
    }
    R(640 - 70, y + 8, 140, 44, { fill: C.panel, stroke: col, lw: 1.6 });
    T(k === 0 ? 'score now' : k === 1 ? (lt < 1.0 ? 'learn stats' : 'score') : 'sort', 640, y + 36, { size: 13.5, weight: 600, align: 'center' });
  }));
  A(seg(t, 6.6, 7.0), () => M('statistics come from the filter-passing rows only · cohort-sized memory for percentile', 64, 572, { size: 12.5, color: C.ink }));
}

/* ---------- 3. formulas ---------- */
function sFormula(t) {
  CAP('ATTR_FORMULA · an expr-lang expression per row', 64, 130, { color: C.violet });
  const ex = [
    ['income / age', r => r.income == null ? 'error' : (r.income / r.age).toFixed(2)],
    ['(income ?? 0) / age', r => ((r.income ?? 0) / r.age).toFixed(2)],
    ['region == "North"', r => r.region === 'North' ? '1' : '0'],
    ['has_any(interests, "food", "sport")', r => r.set == null ? '0' : (r.set.some(s => s === 'food' || s === 'sport') ? '1' : '0')]];
  const rows = P.slice(5, 10);
  ex.forEach(([e, f], k) => {
    const x = 64 + (k % 2) * 584, y = 150 + Math.floor(k / 2) * 190;
    A(seg(t, 0.4 + k * 1.3, 0.8 + k * 1.3), () => {
      R(x, y, 568, 176, { fill: C.panel, stroke: k === 0 ? C.coral : C.violet });
      M(e, x + 18, y + 30, { size: 14, color: C.ink, weight: 600 });
      rows.forEach((r, i) => {
        const v = f(r), err = v === 'error';
        A(seg(t, 0.7 + k * 1.3 + i * 0.1, 1.0 + k * 1.3 + i * 0.1), () => {
          M('#' + r.id, x + 18, y + 60 + i * 22, { size: 12.5, color: C.teal });
          M(k >= 2 ? (k === 2 ? r.region : (r.set == null ? 'null' : '[' + r.set.join(', ') + ']')) : `income ${r.income ?? 'null'} · age ${r.age}`, x + 70, y + 60 + i * 22, { size: 12.5, color: (k < 2 ? r.income : k === 2 ? r.region : r.set) == null ? C.coral : C.muted });
          M(err ? 'PROCESSING_RUNTIME · request fails' : v, x + 550, y + 60 + i * 22, { size: 13, align: 'right', color: err ? C.coral : C.violet });
        });
      });
    });
  });
  A(seg(t, 5.8, 6.2), () => M('true → 1, false → 0 · a nil result → null · categories read as labels, sets as lists', 64, 552, { size: 13, color: C.ink }));
}

/* ---------- 4. total() ---------- */
function sTotal(t) {
  CAP('ATTR_FORMULA with total(): a cohort-wide sum on every row', 64, 130, { color: C.violet });
  A(seg(t, 0.3, 0.7), () => { R(64, 150, 560, 56, { fill: C.panel, stroke: C.violet }); M('share = income / total(income)', 86, 184, { size: 15, color: C.ink }); });
  const tot = INC.reduce((a, b) => a + b, 0);
  const rows = P.slice(0, 10);
  const passA = seg(t, 1.0, 3.0), passB = seg(t, 3.6, 5.6);
  let run = 0;
  rows.forEach((r, i) => {
    const y = 250 + i * 30, seen = passA * 10 > i;
    if (seen && r.income != null) run += r.income;
    M('#' + r.id, 64, y, { size: 13, color: C.teal }); M(r.income == null ? 'null' : String(r.income), 120, y, { size: 13.5, color: r.income == null ? C.coral : C.ink });
    if (passB * 10 > i) M(r.income == null ? 'null' : (r.income / tot).toFixed(3), 230, y, { size: 13.5, color: r.income == null ? C.coral : C.violet });
  });
  T('income', 120, 236, { size: 13.5, weight: 600 }); A(seg(t, 3.6, 3.9), () => T('share', 230, 236, { size: 13.5, weight: 600, color: C.violet }));
  A(seg(t, 1.0, 1.3), () => {
    card(680, 230, 536, 120, C.violet);
    M('pass 1 · total(income)', 702, 262, { size: 13, color: C.violet }); T(String(Math.round(run)), 702, 318, { size: 40, weight: 700, stretch: 'expanded' });
    M('null rows skipped · unweighted', 900, 318, { size: 12.5 });
  });
  A(seg(t, 5.8, 6.2), () => {
    card(680, 370, 536, 150);
    M('the same total on every row, even when grouped', 702, 402, { size: 13, color: C.ink });
    M('two-pass: streams alone, buffers beside groups', 702, 428, { size: 12.5 });
    M('allowed in ATTR_FORMULA only:', 702, 462, { size: 12.5 });
    M('in a filter or overlay → PULSE_FORMULA_TOTAL_SITE', 702, 486, { size: 12.5, color: C.coral });
  });
}

/* ---------- 5. chaining in declared order ---------- */
function sChain(t) {
  CAP('ATTRIBUTES RUN IN DECLARED ORDER · A LATER ONE CAN READ AN EARLIER LABEL', 64, 130, { color: C.violet });
  const steps = [['ATTR_FORMULA', 'u = x * x + y', 'row-local', 0], ['ATTR_ZSCORE', 'z1 from u', 'two-pass · layer 0', 1], ['ATTR_FORMULA', 'w = z1 * z1 + x', 'row-local', 1], ['ATTR_NORMALIZED', 'out from w', 'two-pass · layer 1', 2]];
  steps.forEach(([op, d, cls, layer], i) => A(seg(t, 0.4 + i * 0.7, 0.8 + i * 0.7), () => {
    const x = 64 + i * 290, y = 160;
    R(x, y, 270, 92, { fill: C.panel, stroke: cls.startsWith('two') ? C.violet : C.teal });
    M(op, x + 16, y + 30, { size: 13, color: cls.startsWith('two') ? C.violet : C.teal, weight: 600 }); M(d, x + 16, y + 56, { size: 14, color: C.ink }); M(cls, x + 16, y + 78, { size: 12 });
    if (i < 3) arrow(x + 270, y + 46, x + 288, y + 46, { stroke: C.amber, head: 6 });
  }));
  A(seg(t, 3.6, 4.0), () => {
    CAP('THE PASS PLAN', 64, 300);
    [['scan 0', 'learn z1 from u'], ['scan 1', 'learn out\'s min and max from w'], ['scan 2', 'emit every attribute in declared order']].forEach(([s, d], i) => A(seg(t, 3.8 + i * 0.5, 4.1 + i * 0.5), () => {
      R(64, 316 + i * 54, 560, 44, { fill: C.panel2, stroke: C.rule }); M(s, 84, 344 + i * 54, { size: 13, color: C.amber }); T(d, 170, 344 + i * 54, { size: 14.5 });
    }));
    M('one extra scan per layer of dependent two-pass attributes', 64, 500, { size: 12.5 });
  });
  A(seg(t, 6.2, 6.6), () => {
    card(680, 316, 536, 152, C.coral);
    CAP('READ SOURCE COLUMNS ONLY', 702, 346, { color: C.coral });
    M('ATTR_CODE_IN: an earlier label is an unknown field', 702, 378, { size: 13, color: C.ink });
    M('Mahalanobis, PC score, factor score members', 702, 404, { size: 13, color: C.ink });
    M('across requests: stage with Compose or ProcessChain', 702, 444, { size: 12.5 });
  });
}

/* ---------- 6. standard scores ---------- */
function sScores(t) {
  const cols = [{ k: 'id', l: '#', w: 44 }, { k: 'income', l: 'income', w: 84 },
    { l: 'z-score', w: 110, hc: C.violet, color: r => r.income == null ? C.amber : C.violet, ha: seg(t, 0.8, 1.1), ca: i => seg(t, 1.0 + i * 0.08, 1.3 + i * 0.08), val: r => sgn(Z(r.income)) },
    { l: 't-score', w: 100, hc: C.violet, color: r => r.income == null ? C.amber : C.violet, ha: seg(t, 2.6, 2.9), ca: i => seg(t, 2.8 + i * 0.08, 3.1 + i * 0.08), val: r => TS(r.income).toFixed(1) },
    { l: 'normalized', w: 120, hc: C.violet, color: r => r.income == null ? C.amber : C.violet, ha: seg(t, 4.4, 4.7), ca: i => seg(t, 4.6 + i * 0.08, 4.9 + i * 0.08), val: r => NORM(r.income).toFixed(3) },
    { l: 'percentile', w: 110, hc: C.violet, color: r => r.income == null ? C.amber : C.violet, ha: seg(t, 6.4, 6.7), ca: i => seg(t, 6.6 + i * 0.08, 6.9 + i * 0.08), val: r => PCT(r.income).toFixed(1) }];
  table(64, 140, cols, P, { tint: r => r.income == null ? C.amberS : r.income === 140 ? C.coralS : null });
  const notes = [
    [0.6, 'ATTR_ZSCORE', `(x − mean) / sd · population mean ${MEAN.toFixed(1)}, sd ${PSD.toFixed(1)}`],
    [2.4, 'ATTR_TSCORE', '50 + 10 × z · mean 50, sd 10'],
    [4.2, 'ATTR_NORMALIZED', 'min–max into [0, 1] · one outlier squeezes the rest'],
    [6.2, 'ATTR_PERCENTILE', 'rank ÷ n × 100 · ties never share a rank']];
  notes.forEach(([at, op, d], i) => A(seg(t, at, at + 0.4), () => { const y = 150 + i * 82; R(680, y, 536, 70, { fill: C.panel, stroke: C.violet }); M(op, 700, y + 28, { size: 13, color: C.violet, weight: 600 }); M(d, 700, y + 52, { size: 12.5, color: C.ink }); }));
  A(seg(t, 8.0, 8.4), () => { R(680, 482, 536, 60, { fill: C.amberS, stroke: C.amber }); M('#10 has no income, yet scores 0 · 50 · 0 · 0', 700, 508, { size: 13.5, color: C.ink }); M('a neutral number, not null', 700, 528, { size: 12.5, color: C.amber }); });
}

/* ---------- 7. recodes ---------- */
function sRecodes(t) {
  CAP('ATTR_CODE_IN rating · codes [4, 5] → top_box', 64, 130, { color: C.violet });
  P.forEach((r, i) => {
    const y = 166 + i * 30, tb = r.rating === 4 || r.rating === 5 ? 1 : 0;
    A(seg(t, 0.3 + i * 0.05, 0.6 + i * 0.05), () => { M('#' + r.id, 64, y, { size: 13, color: C.teal }); M(r.rating == null ? 'null' : String(r.rating), 120, y, { size: 13.5, color: r.rating == null ? C.coral : C.ink }); });
    A(seg(t, 1.0 + i * 0.1, 1.3 + i * 0.1), () => M(String(tb), 200, y, { size: 13.5, color: r.rating == null ? C.amber : C.violet }));
  });
  T('rating', 120, 150, { size: 13.5, weight: 600 }); T('top_box', 200, 150, { size: 13.5, weight: 600, color: C.violet });
  A(seg(t, 2.4, 2.8), () => {
    card(300, 150, 340, 140, C.violet);
    M('mean(top_box) = 5 / 10 = 50%', 320, 182, { size: 14, color: C.ink }); M('the top-box share of the whole base', 320, 206, { size: 12.5 });
    M('null counts as "no" → 0', 320, 240, { size: 13, color: C.amber }); M('filter is_not_null first to drop it', 320, 264, { size: 12.5 });
  });
  A(seg(t, 3.6, 4.0), () => { R(300, 304, 340, 70, { fill: C.coralS, stroke: C.coral }); M('FILTER_INCLUDE rating ∈ {4, 5} first?', 320, 332, { size: 13, color: C.ink }); M('the base shrinks: every cell reads 100%', 320, 356, { size: 12.5, color: C.coral }); });
  // date part and sets
  A(seg(t, 5.0, 5.4), () => {
    card(680, 130, 536, 196, C.violet);
    M('ATTR_DATE_PART joined', 700, 160, { size: 13, color: C.violet, weight: 600 });
    [['year', '2023'], ['month', '3'], ['day', '14'], ['year_month', '202303'], ['year_month_day', '20230314'], ['month_day', '314']].forEach(([p, v], i) => { M('part ' + p, 700 + (i % 2) * 260, 196 + Math.floor(i / 2) * 30, { size: 12.5 }); M(v, 880 + (i % 2) * 260, 196 + Math.floor(i / 2) * 30, { size: 13.5, color: C.ink, align: 'right' }); });
    M('hour needs a datetime · null → 0', 700, 300, { size: 12.5, color: C.amber });
  });
  A(seg(t, 6.6, 7.0), () => {
    card(680, 340, 536, 196, C.violet);
    M('ATTR_SET_HAS interests · label "tech"', 700, 370, { size: 13, color: C.violet, weight: 600 });
    M('ATTR_SET_POPCOUNT interests', 700, 396, { size: 13, color: C.violet, weight: 600 });
    P.slice(4, 9).forEach((r, i) => { const y = 426 + i * 22; M('#' + r.id + ' ' + (r.set == null ? 'null' : r.set.length ? r.set.join(', ') : '{ }'), 700, y, { size: 12.5, color: r.set == null ? C.coral : C.muted }); M(r.set && r.set.includes('tech') ? '1' : '0', 1070, y, { size: 13, color: C.violet }); M(String(r.set ? r.set.length : 0), 1150, y, { size: 13, color: C.violet }); });
  });
}

/* ---------- 8. regression diagnostics ---------- */
const RG = (() => { const r = rng(17), g = gaussOf(r); const pts = Array.from({ length: 28 }, () => { const x = 2 + r() * 10; return [x, 20 + 3.2 * x + 4 * g()]; }); pts.push([22, 72 + 0]); pts.push([7, 62]);
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const b = sxy / sxx, a = my - b * mx;
  return { pts, a, b, n, lev: pts.map(p => 1 / n + (p[0] - mx) ** 2 / sxx), fit: pts.map(p => a + b * p[0]) }; })();
function sReg(t) {
  CAP('REGRESSION DIAGNOSTICS · target sales, predictor spend', 64, 130, { color: C.violet });
  const X = 90, Y = 520, sx = x => X + x / 24 * 640, sy = y => Y - (y - 10) / 90 * 340;
  Ln([[X, Y], [X + 650, Y]]); Ln([[X, Y], [X, Y - 350]]); M('spend', X + 650, Y + 20, { size: 12, align: 'right' }); M('sales', X + 8, Y - 340, { size: 12 });
  const thr = 2 * 2 / RG.n;
  RG.pts.forEach((p, i) => A(seg(t, 0.3 + i * 0.02, 0.6 + i * 0.02), () => {
    const hl = t > 5.4 && RG.lev[i] > thr;
    if (t > 2.6 && t < 5.4) Ln([[sx(p[0]), sy(p[1])], [sx(p[0]), sy(RG.fit[i])]], { stroke: Math.abs(p[1] - RG.fit[i]) > 10 ? C.coral : C.faint, lw: 1.5 });
    dot(sx(p[0]), sy(p[1]), hl ? 8 : 4.5, hl ? C.amber : C.teal);
  }));
  const u = eo(seg(t, 1.0, 1.8));
  if (u > 0) Ln([[sx(0), sy(RG.a)], [sx(24 * u), sy(RG.a + RG.b * 24 * u)]], { stroke: C.violet, lw: 2.5 });
  const cards = [[1.0, 'ATTR_REG_FITTED', 'ŷ: the prediction for each row'], [2.6, 'ATTR_REG_RESIDUAL', 'y − ŷ: big ones flag odd responses'], [5.4, 'ATTR_REG_LEVERAGE', `hᵢᵢ: unusual predictors · flag > 2(p+1)/n = ${thr.toFixed(2)}`]];
  cards.forEach(([at, op, d], i) => A(seg(t, at, at + 0.4), () => { const y = 140 + i * 84; R(780, y, 436, 72, { fill: C.panel, stroke: C.violet }); M(op, 800, y + 28, { size: 13, color: C.violet, weight: 600 }); M(d, 800, y + 52, { size: 12.5, color: C.ink }); }));
  A(seg(t, 7.0, 7.4), () => { card(780, 400, 436, 136); M('each slot refits its own OLS', 800, 430, { size: 13, color: C.ink }); M('Σ residuals ≈ 0 · Σ leverage = p + 1', 800, 456, { size: 13, color: C.ink }); M('a null predictor → null, never 0', 800, 490, { size: 13, color: C.coral }); M('ATTR_REG_PREDICT scores a bound or saved model', 800, 516, { size: 12.5 }); });
}

/* ---------- 9. multivariate scores ---------- */
const MV = (() => { const r = rng(5), g = gaussOf(r); const pts = Array.from({ length: 70 }, () => { const a = g(), b = g(); return [170 + 9 * a, 70 + 9 * (0.85 * a + 0.53 * b)]; });
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0; pts.forEach(p => { sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; sxy += (p[0] - mx) * (p[1] - my); });
  sxx /= n - 1; syy /= n - 1; sxy /= n - 1; const det = sxx * syy - sxy * sxy;
  const d2 = (x, y) => { const dx = x - mx, dy = y - my; return (syy * dx * dx - 2 * sxy * dx * dy + sxx * dy * dy) / det; };
  const tr = (sxx + syy) / 2, q = Math.sqrt(tr * tr - det), l1 = tr + q, l2 = tr - q, ang = Math.atan2(l1 - sxx, sxy);
  return { pts, mx, my, sxx, syy, d2, l1, l2, ang, odd: [mx + 11, my - 10] }; })();
function sMulti(t) {
  CAP('ATTR_MAHALANOBIS fields [height, weight]', 64, 130, { color: C.violet });
  const X = 100, Y = 540, sx = v => X + (v - 140) / 60 * 600, sy = v => Y - (v - 40) / 60 * 380;
  Ln([[X, Y], [X + 610, Y]]); Ln([[X, Y], [X, Y - 390]]); M('height', X + 610, Y + 20, { size: 12, align: 'right' }); M('weight', X + 8, Y - 380, { size: 12 });
  MV.pts.forEach((p, i) => A(seg(t, 0.3 + i * 0.012, 0.6 + i * 0.012), () => dot(sx(p[0]), sy(p[1]), 4, C.teal)));
  [1, 2, 3].forEach((k, j) => A(seg(t, 1.6 + j * 0.3, 2.0 + j * 0.3), () => {
    const c = ctx(); c.save(); c.translate(sx(MV.mx), sy(MV.my)); c.scale(600 / 60, -380 / 60); c.rotate(MV.ang);
    c.beginPath(); c.ellipse(0, 0, k * Math.sqrt(MV.l1), k * Math.sqrt(MV.l2), 0, 0, Math.PI * 2); c.restore();
    c.setLineDash([5, 5]); c.lineWidth = 1.4; c.strokeStyle = C.violet; c.stroke(); c.setLineDash([]);
    M('D² = ' + k * k, sx(MV.mx) + k * 62, sy(MV.my) - k * 62, { size: 11.5, color: C.violet });
  }));
  A(seg(t, 3.4, 3.8), () => {
    const [ox, oy] = MV.odd; dot(sx(ox), sy(oy), 8, C.amber);
    const zx = (ox - MV.mx) / Math.sqrt(MV.sxx), zy = (oy - MV.my) / Math.sqrt(MV.syy);
    card(780, 150, 436, 150, C.amber);
    M('tall but light', 800, 180, { size: 14, color: C.amber, weight: 600 });
    M(`height z ${sgn(zx)} · weight z ${sgn(zy)}`, 800, 210, { size: 13, color: C.ink }); M('each value looks ordinary on its own', 800, 234, { size: 12.5 });
    M(`D² = ${MV.d2(ox, oy).toFixed(1)} · far outside the cloud`, 800, 270, { size: 14, color: C.violet });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(780, 316, 436, 224);
    M('output d2 (default) or p · a null member → null', 800, 346, { size: 12.5, color: C.ink });
    M('ATTR_PC_SCORE: position on a principal component', 800, 382, { size: 12.5, color: C.violet }); M('ATTR_FACTOR_SCORE: an estimated factor score', 800, 406, { size: 12.5, color: C.violet });
    M('fit_on: fit on a subset, score every row', 800, 442, { size: 12.5, color: C.ink }); M('fit cohort-wide, never per group', 800, 466, { size: 12.5, color: C.ink });
    M('singular or too few rows → all null + a warning', 800, 500, { size: 12.5, color: C.coral }); M('PULSE_MATRIX_SINGULAR · _INSUFFICIENT_N', 800, 522, { size: 11.5, color: C.coral });
  });
}

/* ---------- 10. null scorecard ---------- */
const NS = [['ATTR_ZSCORE', '0'], ['ATTR_TSCORE', '50'], ['ATTR_NORMALIZED', '0'], ['ATTR_PERCENTILE', '0'], ['ATTR_DATE_PART', '0'], ['ATTR_CODE_IN', '0 ("no")'],
  ['ATTR_SET_HAS · SET_POPCOUNT', '0'], ['ATTR_FORMULA', 'nil → null · arithmetic on nil → error'], ['ATTR_REG_FITTED · _LEVERAGE', 'null if a predictor is null'], ['ATTR_REG_RESIDUAL', 'null if target or predictor is null'],
  ['ATTR_REG_PREDICT', 'null if a scored column is null'], ['MAHALANOBIS · PC · FACTOR', 'null if a member is null']];
function sNulls(t) {
  CAP('WHAT A NULL INPUT BECOMES', 64, 130, { color: C.amber });
  NS.forEach(([n, v], i) => {
    const col = i % 2, row = Math.floor(i / 2), x = 64 + col * 584, y = 150 + row * 62, neutral = !v.includes('null') && !v.includes('error');
    A(seg(t, 0.3 + i * 0.2, 0.6 + i * 0.2), () => {
      R(x, y, 568, 52, { fill: C.panel, stroke: C.rule });
      M(n, x + 18, y + 32, { size: 13, color: C.ink });
      M(v, x + 550, y + 32, { size: 13, align: 'right', color: neutral ? C.amber : C.teal });
    });
  });
  A(seg(t, 3.8, 4.2), () => M('amber: a number stands in for the missing value, so an average quietly includes it', 64, 540, { size: 13, color: C.amber }));
}

/* ---------- 11. recap ---------- */
const OPS = [['ATTR_FORMULA', 'any rule over a row'], ['ATTR_ZSCORE', 'standard deviations'], ['ATTR_TSCORE', 'mean 50, sd 10'], ['ATTR_NORMALIZED', 'into [0, 1]'],
  ['ATTR_PERCENTILE', 'rank as a percentage'], ['ATTR_CODE_IN', 'is it one of these codes'], ['ATTR_DATE_PART', 'a calendar part'], ['ATTR_SET_HAS', 'picked this option'],
  ['ATTR_SET_POPCOUNT', 'how many picked'], ['ATTR_REG_FITTED', 'model prediction'], ['ATTR_REG_RESIDUAL', 'prediction error'], ['ATTR_REG_LEVERAGE', 'unusual predictors'],
  ['ATTR_REG_PREDICT', 'score a saved model'], ['ATTR_MAHALANOBIS', 'multivariate distance'], ['ATTR_PC_SCORE', 'component score'], ['ATTR_FACTOR_SCORE', 'factor score']];
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('ATTRIBUTES TODAY', 64, 124, { color: C.violet });
    OPS.forEach(([op, d], i) => A(seg(t, 0.2 + i * 0.06, 0.5 + i * 0.06), () => { const x = 64 + (i % 4) * 290, y = 138 + Math.floor(i / 4) * 64; R(x, y, 278, 54, { fill: C.panel, stroke: C.violet }); M(op, x + 14, y + 23, { size: 12, color: C.violet, weight: 600 }); T(d, x + 14, y + 44, { size: 14 }); }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 412, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 440, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 464, { size: 14.5 });
      R(650, 412, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 440, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 464, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('ATTRIBUTES', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('check what a null becomes before you average it', 640, 430, { size: 15, align: 'center' });
    M('next: groupers', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[6.592, 8.875, 5.141, 8.683, 6.635, 5.525, 9.259, 8.875, 9.024, 5.952, 7.275, 3.435, 7.616, 8.619, 6.592, 9.088, 8.917, 5.589, 9.003, 4.693, 6.421, 8.149, 6.976, 7.424, 7.168, 7.125, 9.643, 7.467, 6.827, 7.765, 7.936, 5.867, 7.68, 7.616, 4.352, 1.216]/*END*/;
PulseFilm.mount({
  series: 'PULSE · ATTRIBUTES',
  narr: NARR,
  scenes: [
    { name: 'Pulse Attributes', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse attributes. One derived value for every record that survives the filters, taken apart in depth.', true]] },
    { name: 'Where attributes run', dur: 8, draw: sWhere, caps: [
      [0, 'Attributes run third, after the filters, so they only see the records that survived. Groups, aggregations and windows can all read the new column.'],
      [2.4, 'Each attribute names a type, a source and a label. The label becomes the new column.'],
      [4.6, 'The label must be new. Reusing a field name, a feature column or an earlier label is refused, and predict catches it before anything runs.'],
      [6.2, 'Features add columns before filters, for every record. Attributes add them after, for the survivors only.']] },
    { name: 'One pass or two', dur: 7.4, draw: sPasses, caps: [
      [0, 'Row-local attributes read only the record in front of them, so they finish in one pass and stream.'],
      [2.2, 'Two-pass attributes score a row against the whole column or a model. Pulse makes one pass to learn the statistics, then a second to score every row.'],
      [4.4, 'Percentile rank is the exception. It has to sort the values first, so it can\'t stream. All of these statistics come from the filtered rows only.']] },
    { name: 'Formulas', dur: 6.6, draw: sFormula, caps: [
      [0, 'A formula evaluates an expression for each row. Arithmetic on a null raises an error that stops the whole request, so guard it with a default.'],
      [2.6, 'Categories read as their labels and sets read as lists. True becomes one and false becomes zero.']] },
    { name: 'Totals', dur: 6.6, draw: sTotal, caps: [
      [0, 'A formula can also call total, which sums an expression over every filtered row and hands the same figure to each one.'],
      [3.6, 'That makes shares easy: each income divided by the total.'],
      [5.8, 'A formula with total is two-pass, and total is only allowed in formula attributes, never in a filter or an overlay.']] },
    { name: 'Chaining', dur: 7, draw: sChain, caps: [
      [0, 'Attributes run in the order you list them, and a later one can read an earlier one\'s label: a formula, a z-score of it, then a formula of that.'],
      [3.6, 'Pulse plans the passes for you. Each layer of two-pass attributes that depend on each other adds one more scan.'],
      [6.2, 'A few attributes read source columns only, like code-in and the multivariate scores. To chain across requests, use Compose or ProcessChain.']] },
    { name: 'Standard scores', dur: 9, draw: sScores, caps: [
      [0, 'Z-score measures how many standard deviations a value sits from the mean, using the population mean and standard deviation of the filtered rows.'],
      [2.4, 'T-score is the same idea on a friendlier scale: mean fifty, standard deviation ten.'],
      [4.2, 'Normalized squeezes values into zero to one. Watch the outlier: one income of one hundred and forty pushes everyone else toward the bottom.'],
      [6.2, 'Percentile gives each value its rank as a percentage. Ties never share a rank.'],
      [8.0, 'And notice member ten, who has no income. These scores don\'t return null. They return zero, or fifty.']] },
    { name: 'Recodes', dur: 8, draw: sRecodes, caps: [
      [0, 'Code-in flags whether a value is one of a set of codes, like the top two boxes of a rating scale. Its mean is the top-box share.'],
      [2.4, 'A null counts as no. And if you filter to the codes first, the base shrinks, and every share reads one hundred percent.'],
      [5.0, 'Date part pulls out one calendar part, such as the year and month. Set-has and popcount read multi-select answers.']] },
    { name: 'Regression diagnostics', dur: 8, draw: sReg, caps: [
      [0, 'Regression attributes fit a least-squares model and give every row a diagnostic. Fitted is the model\'s prediction.'],
      [2.6, 'Residual is the gap between the actual value and the prediction. Large residuals flag unusual responses.'],
      [5.4, 'Leverage flags unusual predictor values, which pull hardest on the fit. Each slot fits its own model, and a null predictor gives null, never zero.']] },
    { name: 'Multivariate scores', dur: 7.4, draw: sMulti, caps: [
      [0, 'Mahalanobis distance measures how far a row sits from the centre of several fields at once, allowing for how they move together.'],
      [3.4, 'This member is tall but light. Each value looks ordinary on its own, but together they sit far outside the cloud.'],
      [5.4, 'Principal-component and factor scores place each row on a fitted dimension. All three fit across the whole cohort, never per group.']] },
    { name: 'The null scorecard', dur: 5.4, draw: sNulls, caps: [
      [0, 'Here\'s what a null input becomes. Many attributes return a neutral number, while regression and multivariate scores return null.'],
      [3.8, 'A neutral number gets averaged like any other value, so check this before you aggregate an attribute.']] },
    { name: 'The attribute toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the attribute toolkit today: formulas, standard scores, recodes, regression diagnostics and multivariate scores.'],
      [3.4, 'More attributes are added over time, and embedders can register their own. The manifest always shows what your instance offers.'],
      [6.4, 'Remember: check what a null becomes before you average it. Next up, groupers.'],
      [9.0, '', 'Pulse attributes.', true]] },
  ],
});
})();
