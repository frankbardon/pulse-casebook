/* Pulse Attributes: film 7 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
   Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts, "by default" for the slot order,
   null in → null out for every score [alpha.18]. Every figure on a result card is copied from a recorded
   alpha.33 run in data/ (see data/README.md); the comment beside each figure names the run. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, arrow, rng } = PulseFilm.h;
const ctx = () => PulseFilm.ctx;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const gaussOf = r => () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
const sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
const nf = (v, d) => v == null ? 'null' : v.toFixed(d);

/* ---------- the ten members left after FILTER_RANGE age 18–65 (data/m.csv) ---------- */
const P = [
  { id: 1, region: 'North', age: 34, income: 52, rating: 5, set: ['travel', 'tech'] },
  { id: 3, region: 'East', age: 45, income: 58, rating: 4, set: ['food'] },
  { id: 4, region: 'West', age: 29, income: 61, rating: 2, set: ['travel', 'food'] },
  { id: 6, region: 'South', age: 38, income: 64, rating: null, set: ['tech'] },
  { id: 7, region: 'East', age: 52, income: 66, rating: 5, set: null },
  { id: 8, region: 'West', age: 24, income: 70, rating: 3, set: ['sport', 'tech'] },
  { id: 9, region: 'North', age: 41, income: 72, rating: 4, set: ['travel'] },
  { id: 10, region: 'South', age: 63, income: null, rating: 1, set: [] },
  { id: 11, region: 'East', age: 30, income: 75, rating: 5, set: ['tech', 'food', 'sport'] },
  { id: 12, region: 'North', age: 58, income: 140, rating: 3, set: ['food'] },
];
/* data/stats.out.json: mean and population sd of the nine incomes */
const MEAN = 73.1, PSD = 24.6;
/* data/scores.out.json: [z, t, normalized, percentile] per member; member 10 is null on all four */
const SC = { 1: [-0.858, 41.42, 0, 11.1], 3: [-0.614, 43.86, 0.068, 22.2], 4: [-0.492, 45.08, 0.102, 33.3], 6: [-0.370, 46.30, 0.136, 44.4],
  7: [-0.289, 47.11, 0.159, 55.6], 8: [-0.127, 48.73, 0.205, 66.7], 9: [-0.045, 49.55, 0.227, 77.8], 10: [null, null, null, null],
  11: [0.077, 50.77, 0.261, 88.9], 12: [2.720, 77.20, 1, 100] };
/* data/formula.out.json: (income ?? 0) / age, region == "North", has_any(interests, "food", "sport") */
const FX = { 8: [2.92, 0, 1], 9: [1.76, 1, 0], 10: [0, 0, 0], 11: [2.50, 0, 1], 12: [2.41, 1, 1] };
/* data/total.out.json: total(income) = 658 and each share; data/total_fw.out.json: Σw·income = 898 */
const TOT = 658, TOT_FW = 898;
const SHARE = { 1: 0.079, 3: 0.088, 4: 0.093, 6: 0.097, 7: 0.100, 8: 0.106, 9: 0.109, 10: null, 11: 0.114, 12: 0.213 };
/* data/recodes.out.json: top_box (code-in 4, 5), set-has "tech", popcount; member 6's null rating reads 0, member 7's null set counts null */
const RC = { 1: [1, 1, 2], 3: [1, 0, 1], 4: [0, 0, 2], 6: [0, 1, 1], 7: [1, 0, null], 8: [0, 1, 2], 9: [1, 0, 1], 10: [0, 0, 0], 11: [1, 1, 3], 12: [0, 0, 1] };
/* data/recodes.out.json: member 1 joined 2023-03-14 (a Tuesday); member 10's join date is null */
const DP = [['year', '2023'], ['month', '3'], ['day', '14'], ['year_month', '202303'], ['month_day', '314'], ['iso_weekday', '2']];
/* data/topbox.out.json 0.5 · data/topbox_inc.out.json 1 */
const TOPBOX = 0.5, TOPBOX_INC = 1;
/* data/p.csv + data/prev.out.json: a long panel; prev is ATTR_PREVIOUS_STATE of plan by customer, ordered by wave */
const PANEL = [['C1', 'Jan', 'basic', null], ['C1', 'Feb', 'plus', 'basic'], ['C1', 'Mar', 'plus', 'plus'],
  ['C2', 'Jan', 'plus', null], ['C2', 'Feb', 'plus', 'plus'], ['C2', 'Mar', 'pro', 'plus'],
  ['C3', 'Jan', 'basic', null], ['C3', 'Feb', 'basic', 'basic'], ['C3', 'Mar', 'plus', 'basic'],
  ['C4', 'Jan', 'basic', null], ['C4', 'Feb', null, 'basic'], ['C4', 'Mar', 'plus', null]];
/* data/post.out.json: six weeks of TV spend, a geometric adstock (decay 0.5) and hill(tv_ad, 100, 1.5) */
const WK = [[100, 100, 0.50], [0, 50, 0.26], [0, 25, 0.11], [200, 212.5, 0.76], [0, 106.25, 0.52], [50, 100, 0.50]];

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
    A(seg(t, 0.1 + i * 0.04, 0.4 + i * 0.04), () => R(470, 330 + i * 20, 160, 14, { fill: C.tealS, stroke: C.teal, r: 2, lw: 1 }));
    const u = eo(seg(t, 0.5 + i * 0.06, 1.0 + i * 0.06));
    A(u, () => R(lerp(470, 640, u), 330 + i * 20, 160, 14, { fill: C.violetS, stroke: C.violet, r: 2, lw: 1 }));
  }
  A(seg(t, 0.9, 1.5), () => {
    T('PULSE', 640, 290, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('ATTRIBUTES', 640, 500, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 1.5, 2.1), () => T('One derived value for every record, scored after the filters by default', 640, 548, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where attributes run ---------- */
const SPINE = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
function sWhere(t) {
  CAP('THE DEFAULT ORDER', 64, 96, { color: C.muted });
  SPINE.forEach((n, i) => {
    const x = 64 + i * 164, on = i === 2;
    A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08) * (on ? 1 : 0.55), () => {
      R(x, 110, 150, 52, { fill: on ? C.violetS : C.panel, stroke: on ? C.violet : C.rule, lw: on ? 2 : 1.2 });
      T(n, x + 14, 142, { size: 15.5, weight: 600, color: on ? C.ink : C.muted });
      if (i < 6) arrow(x + 150, 136, x + 162, 136, { stroke: C.faint, head: 6 });
    });
  });
  A(seg(t, 1.0, 1.4), () => {
    M('by default sees only the rows the filters kept', 392, 186, { size: 12.5, color: C.violet });
    M('groups, aggregations and windows can read the new column', 1216, 212, { size: 12.5, color: C.teal, align: 'right' });
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
    card(64, 414, 1152, 160);
    CAP('ATTRIBUTE OR FEATURE?', 86, 444);
    [['', 'runs', 'sees', 'readable by filters'], ['FEAT_*', 'before filters', 'every record', 'yes'], ['ATTR_*', 'after filters, by default', 'surviving records', 'no']].forEach((r, i) => r.forEach((v, j) => M(v, 86 + [0, 160, 420, 700][j], 474 + i * 24, { size: 13, color: i === 0 ? C.muted : j === 0 ? (i === 1 ? C.teal : C.violet) : C.ink })));
  });
  A(seg(t, 7.2, 7.6), () => {
    M('two exceptions, later in this film:', 86, 552, { size: 12.5, color: C.violet });
    M('ATTR_PREVIOUS_STATE runs before the filters · a formula reading a window label runs after the windows', 380, 552, { size: 12.5, color: C.ink });
  });
}

/* ---------- 2. one pass or two ---------- */
function sPasses(t) {
  const lanes = [
    ['ROW-LOCAL · ONE PASS · STREAMS', ['formula · date part · set has · set popcount · code in · reg predict · scale score', 'vector distance and profile similarity (row-local metrics) · any score of a bound fit (params.fit)'], C.teal, 170],
    ['TWO-PASS · LEARN, THEN SCORE', ['z-score · t-score · normalized · regression refits · Mahalanobis', 'PC, factor and SEM scores · formulas using total()'], C.violet, 340],
    ['BUFFERED · NOT STREAMABLE', ['percentile rank: sorts the values first', 'previous state: orders each subject\'s records'], C.coral, 510]];
  lanes.forEach(([h, ops, col, y], k) => A(seg(t, 0.3 + k * 2.2, 0.7 + k * 2.2), () => {
    CAP(h, 64, y - 50, { color: col }); ops.forEach((o, j) => M(o, 64, y - 30 + j * 18, { size: 12.5 }));
    Ln([[64, y + 34], [1216, y + 34]], { stroke: C.rule });
    const lt = t - (0.6 + k * 2.2), yy = y + 4;
    for (let i = 0; i < 10; i++) {
      if (k === 0) { const x = 80 + (lt - i * 0.18) * 520; if (x > 64 && x < 1200) { R(x, yy + 18, 26, 24, { fill: C.tealS, stroke: C.teal, r: 3 }); if (x > 640) R(x + 28, yy + 18, 10, 24, { fill: C.violet, r: 2 }); } }
      if (k === 1) {
        const x1 = 80 + (lt - i * 0.1) * 700; if (x1 > 64 && x1 < 640) R(x1, yy + 18, 26, 24, { fill: C.tealS, stroke: C.teal, r: 3 });
        const x2 = 80 + (lt - 1.0 - i * 0.1) * 700; if (x2 > 64 && x2 < 1200 && lt > 1.0) { R(x2, yy + 18, 26, 24, { fill: C.tealS, stroke: C.teal, r: 3 }); if (x2 > 640) R(x2 + 28, yy + 18, 10, 24, { fill: C.violet, r: 2 }); }
      }
      if (k === 2) { const u = eio(seg(lt, 0.2 + i * 0.05, 0.9 + i * 0.05)); const order = [3, 7, 0, 9, 5, 1, 8, 2, 6, 4][i]; R(lerp(80 + i * 34, 760 + order * 34, u), yy + 18, 28, 24, { fill: C.coralS, stroke: C.coral, r: 3 }); }
    }
    R(640 - 70, yy + 8, 140, 44, { fill: C.panel, stroke: col, lw: 1.6 });
    T(k === 0 ? 'score now' : k === 1 ? (lt < 1.0 ? 'learn stats' : 'score') : 'sort, then score', 640, yy + 36, { size: 13.5, weight: 600, align: 'center' });
  }));
  A(seg(t, 6.6, 7.0), () => M('statistics come from the filter-passing rows · previous state reads every record', 64, 584, { size: 12.5, color: C.ink }));
}

/* ---------- 3. formulas ---------- */
function sFormula(t) {
  CAP('ATTR_FORMULA · an expr-lang expression per row', 64, 130, { color: C.violet });
  const ex = [
    ['income / age', r => r.income == null ? 'error' : '—'],
    ['(income ?? 0) / age', r => FX[r.id][0].toFixed(2)],
    ['region == "North"', r => String(FX[r.id][1])],
    ['has_any(interests, "food", "sport")', r => String(FX[r.id][2])]];
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
          M(err ? 'PROCESSING_RUNTIME · request fails' : v, x + 550, y + 60 + i * 22, { size: 13, align: 'right', color: err ? C.coral : v === '—' ? C.faint : C.violet });
        });
      });
    });
  });
  A(seg(t, 5.8, 6.2), () => {
    M('true → 1, false → 0 · a nil result → null · categories read as labels, sets as lists', 64, 552, { size: 13, color: C.ink });
    M('bad syntax, names or types → PULSE_FORMULA_COMPILE_ERROR, at predict too', 64, 576, { size: 12.5, color: C.coral });
  });
}

/* ---------- 4. total() ---------- */
function sTotal(t) {
  CAP('ATTR_FORMULA with total(): a cohort-wide sum on every row', 64, 130, { color: C.violet });
  A(seg(t, 0.3, 0.7), () => { R(64, 150, 580, 56, { fill: C.panel, stroke: C.violet }); M('share = income == nil ? nil : income / total(income)', 82, 184, { size: 14, color: C.ink }); });
  const passA = seg(t, 1.0, 3.0), passB = seg(t, 3.6, 5.6);
  let run = 0;
  P.forEach((r, i) => {
    const y = 262 + i * 30, seen = passA * 10 > i;
    if (seen && r.income != null) run += r.income;
    M('#' + r.id, 64, y, { size: 13, color: C.teal }); M(r.income == null ? 'null' : String(r.income), 120, y, { size: 13.5, color: r.income == null ? C.coral : C.ink });
    if (passB * 10 > i) M(nf(SHARE[r.id], 3), 230, y, { size: 13.5, color: SHARE[r.id] == null ? C.coral : C.violet });
  });
  T('income', 120, 236, { size: 13.5, weight: 600 }); A(seg(t, 3.6, 3.9), () => T('share', 230, 236, { size: 13.5, weight: 600, color: C.violet }));
  A(seg(t, 1.0, 1.3), () => {
    card(680, 150, 536, 110, C.violet);
    M('pass 1 · total(income)', 702, 180, { size: 13, color: C.violet }); T(String(passA >= 1 ? TOT : Math.round(run)), 702, 236, { size: 40, weight: 700, stretch: 'expanded' });
    M('null rows skipped · no weight', 880, 236, { size: 12.5 });
  });
  A(seg(t, 5.8, 6.2), () => {
    card(680, 276, 536, 138);
    M('the same total on every row, even when grouped', 702, 306, { size: 13, color: C.ink });
    M('two-pass: streams alone, buffers beside groups or features', 702, 332, { size: 12.5 });
    M('allowed in ATTR_FORMULA only:', 702, 364, { size: 12.5 });
    M('in a filter or overlay → PULSE_FORMULA_TOTAL_SITE', 702, 388, { size: 12.5, color: C.coral });
  });
  A(seg(t, 7.0, 7.4), () => {
    card(680, 430, 536, 134, C.teal);
    CAP('UNDER A WEIGHT', 702, 458, { color: C.teal });
    M('frequency weight wt → Σ w · income', 702, 488, { size: 13, color: C.ink }); T(String(TOT_FW), 1194, 492, { size: 26, weight: 700, align: 'right' });
    M('probability weight → PULSE_WEIGHT_UNSUPPORTED, at predict too', 702, 518, { size: 12.5, color: C.coral });
    M('"weight": null opts the slot out', 702, 544, { size: 12.5 });
  });
}

/* ---------- 5. chaining in declared order ---------- */
function sChain(t) {
  CAP('ATTRIBUTES RUN IN DECLARED ORDER · A LATER ONE CAN READ AN EARLIER LABEL', 64, 130, { color: C.violet });
  const steps = [['ATTR_FORMULA', 'u = x * x + y', 'row-local', 0], ['ATTR_ZSCORE', 'z1 from u', 'two-pass · layer 0', 1], ['ATTR_FORMULA', 'w = z1 * z1 + x', 'row-local', 1], ['ATTR_NORMALIZED', 'out from w', 'two-pass · layer 1', 2]];
  steps.forEach(([op, d, cls], i) => A(seg(t, 0.4 + i * 0.7, 0.8 + i * 0.7), () => {
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
  const sc = () => r => r.income == null ? C.coral : C.violet;
  const cols = [{ k: 'id', l: '#', w: 44 }, { k: 'income', l: 'income', w: 84 },
    { l: 'z-score', w: 110, hc: C.violet, color: sc(0), ha: seg(t, 0.8, 1.1), ca: i => seg(t, 1.0 + i * 0.08, 1.3 + i * 0.08), val: r => SC[r.id][0] == null ? 'null' : sgn(SC[r.id][0]) },
    { l: 't-score', w: 100, hc: C.violet, color: sc(1), ha: seg(t, 2.6, 2.9), ca: i => seg(t, 2.8 + i * 0.08, 3.1 + i * 0.08), val: r => nf(SC[r.id][1], 1) },
    { l: 'normalized', w: 120, hc: C.violet, color: sc(2), ha: seg(t, 4.4, 4.7), ca: i => seg(t, 4.6 + i * 0.08, 4.9 + i * 0.08), val: r => nf(SC[r.id][2], 3) },
    { l: 'percentile', w: 110, hc: C.violet, color: sc(3), ha: seg(t, 6.4, 6.7), ca: i => seg(t, 6.6 + i * 0.08, 6.9 + i * 0.08), val: r => nf(SC[r.id][3], 1) }];
  table(64, 140, cols, P, { tint: r => r.income == null ? C.coralS : r.income === 140 ? C.amberS : null });
  const notes = [
    [0.6, 'ATTR_ZSCORE', `(x − mean) / sd · population mean ${MEAN.toFixed(1)}, sd ${PSD.toFixed(1)}`],
    [2.4, 'ATTR_TSCORE', '50 + 10 × z · mean 50, sd 10'],
    [4.2, 'ATTR_NORMALIZED', 'min–max into [0, 1] · one outlier squeezes the rest'],
    [6.2, 'ATTR_PERCENTILE', 'rank ÷ n × 100 · ties never share a rank']];
  notes.forEach(([at, op, d], i) => A(seg(t, at, at + 0.4), () => { const y = 150 + i * 82; R(680, y, 536, 70, { fill: C.panel, stroke: C.violet }); M(op, 700, y + 28, { size: 13, color: C.violet, weight: 600 }); M(d, 700, y + 52, { size: 12.5, color: C.ink }); }));
  A(seg(t, 8.0, 8.4), () => { R(680, 482, 536, 84, { fill: C.coralS, stroke: C.coral }); M('#10 has no income, so all four scores are null', 700, 508, { size: 13.5, color: C.ink }); M('a constant field scores null too: z of flat → null', 700, 532, { size: 12.5, color: C.coral }); M('both count in the aggregation\'s n_null', 700, 554, { size: 12.5 }); });
}

/* ---------- 7. recodes ---------- */
function sRecodes(t) {
  CAP('ATTR_CODE_IN rating · codes [4, 5] → top_box', 64, 130, { color: C.violet });
  P.forEach((r, i) => {
    const y = 178 + i * 30, tb = RC[r.id][0];
    A(seg(t, 0.3 + i * 0.05, 0.6 + i * 0.05), () => { M('#' + r.id, 64, y, { size: 13, color: C.teal }); M(r.rating == null ? 'null' : String(r.rating), 120, y, { size: 13.5, color: r.rating == null ? C.coral : C.ink }); });
    A(seg(t, 1.0 + i * 0.1, 1.3 + i * 0.1), () => M(String(tb), 200, y, { size: 13.5, color: r.rating == null ? C.amber : C.violet }));
  });
  T('rating', 120, 150, { size: 13.5, weight: 600 }); T('top_box', 200, 150, { size: 13.5, weight: 600, color: C.violet });
  A(seg(t, 2.4, 2.8), () => {
    card(300, 150, 340, 140, C.violet);
    M(`mean(top_box) = ${TOPBOX * 100}%`, 320, 182, { size: 14, color: C.ink }); M('the top-box share of the whole base', 320, 206, { size: 12.5 });
    M('a null counts as "no" → 0', 320, 240, { size: 13, color: C.amber }); M('filter is_not_null first to drop it', 320, 264, { size: 12.5 });
  });
  A(seg(t, 3.6, 4.0), () => { R(300, 304, 340, 70, { fill: C.coralS, stroke: C.coral }); M('FILTER_INCLUDE rating ∈ {4, 5} first?', 320, 332, { size: 13, color: C.ink }); M(`the base shrinks: the mean reads ${TOPBOX_INC * 100}%`, 320, 356, { size: 12.5, color: C.coral }); });
  A(seg(t, 5.0, 5.4), () => {
    card(680, 130, 536, 196, C.violet);
    M('ATTR_DATE_PART joined · member 1, 2023-03-14', 700, 160, { size: 13, color: C.violet, weight: 600 });
    DP.forEach(([p, v], i) => { M('part ' + p, 700 + (i % 2) * 260, 196 + Math.floor(i / 2) * 30, { size: 12.5 }); M(v, 900 + (i % 2) * 260, 196 + Math.floor(i / 2) * 30, { size: 13.5, color: C.ink, align: 'right' }); });
    M('iso_weekday: 1 = Monday … 7 = Sunday', 700, 288, { size: 12.5, color: C.ink });
    M('#10 has no join date → null, never 0', 700, 310, { size: 12.5, color: C.coral });
  });
  A(seg(t, 6.6, 7.0), () => {
    card(680, 340, 536, 226, C.violet);
    M('ATTR_SET_HAS interests · label "tech"', 700, 370, { size: 13, color: C.violet, weight: 600 });
    M('ATTR_SET_POPCOUNT interests', 700, 394, { size: 13, color: C.violet, weight: 600 });
    M('has', 1070, 418, { size: 12, color: C.muted }); M('count', 1150, 418, { size: 12, color: C.muted });
    P.slice(4, 9).forEach((r, i) => {
      const y = 442 + i * 22, [, has, pc] = RC[r.id];
      M('#' + r.id + ' ' + (r.set == null ? 'null' : r.set.length ? r.set.join(', ') : '{ } empty'), 700, y, { size: 12.5, color: r.set == null ? C.coral : C.muted });
      M(String(has), 1070, y, { size: 13, color: r.set == null ? C.amber : C.violet }); M(pc == null ? 'null' : String(pc), 1150, y, { size: 13, color: pc == null ? C.coral : C.violet });
    });
  });
}

/* ---------- 8. previous state ---------- */
function sPrev(t) {
  CAP('ATTR_PREVIOUS_STATE plan · subject customer · order wave', 64, 130, { color: C.violet });
  [['customer', 64], ['wave', 170], ['plan', 260], ['prev_plan', 360]].forEach(([h, x], j) => T(h, x, 160, { size: 13.5, weight: 600, color: j === 3 ? C.violet : C.ink }));
  Ln([[60, 172], [470, 172]]);
  PANEL.forEach(([c, w, p, pv], i) => {
    const y = 198 + i * 28;
    A(seg(t, 0.3 + i * 0.05, 0.6 + i * 0.05), () => {
      if (i % 3 === 0 && i) Ln([[60, y - 19], [470, y - 19]], { stroke: C.rule });
      M(c, 64, y, { size: 13, color: C.teal }); M(w, 170, y, { size: 13, color: C.muted }); M(p ?? 'null', 260, y, { size: 13.5, color: p == null ? C.coral : C.ink });
    });
    A(seg(t, 1.2 + i * 0.12, 1.5 + i * 0.12), () => {
      if (pv != null && t < 2.6) arrow(330, y - 22, 352, y - 5, { stroke: C.faint, head: 5 });
      M(pv ?? 'null', 360, y, { size: 13.5, color: pv == null ? C.coral : C.violet });
    });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(520, 146, 696, 112, C.coral);
    M('null, never 0 or a carried value:', 540, 176, { size: 13, color: C.coral });
    M('· a subject\'s first time point (every Jan row)', 540, 200, { size: 12.5, color: C.ink });
    M('· a null subject or order · a null previous state (C4 in March)', 540, 222, { size: 12.5, color: C.ink });
    M('ties warn PULSE_PREVIOUS_STATE_AMBIGUOUS_TIE · typed as plan, same dictionary', 540, 244, { size: 12, color: C.muted });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(520, 274, 696, 134, C.violet);
    CAP('RUNS OVER EVERY RECORD, BEFORE THE FILTERS', 540, 302, { color: C.violet });
    M('FILTER_DATE_RANGES wave · March only: each March row', 540, 330, { size: 12.5, color: C.ink });
    M('keeps its true February plan in prev_plan × plan', 540, 350, { size: 12.5, color: C.ink });
    M('components count every record: n_subjects 4 · n_first 4 · n_gap 1 · n_ambiguous 0', 540, 380, { size: 12, color: C.amber });
  });
  A(seg(t, 6.2, 6.6), () => {
    card(520, 424, 696, 140, C.teal);
    CAP('SO A FILTER CAN READ IT', 540, 452, { color: C.teal });
    M('FILTER_EXPRESSION', 540, 480, { size: 12.5, color: C.teal });
    M('prev_plan != nil && plan != nil && prev_plan != plan', 540, 502, { size: 13, color: C.ink });
    M('keeps 3 plan changes: C1, C2 and C3 · buffered, so it never streams', 540, 534, { size: 12.5 });
  });
}

/* ---------- 9. after the windows ---------- */
function sPost(t) {
  CAP('A FORMULA THAT READS A WINDOW LABEL RUNS AFTER THE WINDOWS', 64, 130, { color: C.violet });
  const box = (x, l, d, col, at) => A(seg(t, at, at + 0.4), () => { R(x, 150, 340, 72, { fill: C.panel, stroke: col }); M(l, x + 16, 178, { size: 13, color: col, weight: 600 }); M(d, x + 16, 204, { size: 12.5, color: C.ink }); });
  box(64, 'WIN_DISTRIBUTED_LAG tv → tv_ad', 'geometric adstock · decay 0.5', C.teal, 0.3);
  box(470, 'ATTR_FORMULA → tv_sat', 'hill(tv_ad, 100, 1.5)', C.violet, 1.0);
  box(876, 'AGG_SUM tv_sat by week', 'reads a post-window label', C.teal, 1.6);
  A(seg(t, 0.7, 1.0), () => arrow(406, 186, 466, 186, { stroke: C.amber, head: 6 }));
  A(seg(t, 1.4, 1.7), () => arrow(812, 186, 872, 186, { stroke: C.amber, head: 6 }));
  [['week', 64], ['tv', 150], ['tv_ad', 240], ['tv_sat', 350]].forEach(([h, x], j) => A(seg(t, 2.0, 2.3), () => T(h, x, 262, { size: 13.5, weight: 600, color: j === 3 ? C.violet : j === 2 ? C.teal : C.ink })));
  WK.forEach(([tv, ad, sat], i) => {
    const y = 296 + i * 30;
    A(seg(t, 2.2 + i * 0.12, 2.5 + i * 0.12), () => { M(String(i + 1), 64, y, { size: 13, color: C.muted }); M(String(tv), 150, y, { size: 13.5 }); M(String(ad), 240, y, { size: 13.5, color: C.teal }); });
    A(seg(t, 3.0 + i * 0.12, 3.3 + i * 0.12), () => { M(sat.toFixed(2), 350, y, { size: 13.5, color: C.violet }); R(430, y - 12, 160 * sat, 14, { fill: C.violetS, stroke: C.violet, r: 2, lw: 1 }); });
  });
  A(seg(t, 3.8, 4.2), () => {
    card(680, 250, 536, 128, C.amber);
    CAP('PREDICT REPORTS THE PLAN', 702, 278, { color: C.amber });
    M('post_window · windows_first: true', 702, 308, { size: 13, color: C.ink });
    M('tv_sat depends_on tv_ad', 702, 332, { size: 13, color: C.ink });
    M('ATTR_REG_PREDICT can sit here too, scoring a bound fit', 702, 358, { size: 12.5 });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(680, 394, 536, 128, C.coral);
    CAP('ANY OTHER WINDOW READER IS REFUSED', 702, 422, { color: C.coral });
    M('ATTR_ZSCORE field tv_ad', 702, 452, { size: 13, color: C.ink });
    M('→ PULSE_ATTRIBUTE_WINDOW_ORDER', 702, 476, { size: 13, color: C.coral });
    M('at predict and at runtime · total() too', 702, 502, { size: 12.5 });
  });
}

/* ---------- 10. regression diagnostics ---------- */
/* points: data/generate.js → data/reg.csv (same rng and seed). n = 30, Σ leverage = 2: data/reg_sums.out.json */
const RG = (() => { const r = rng(17), g = gaussOf(r); const pts = Array.from({ length: 28 }, () => { const x = 2 + r() * 10; return [x, 20 + 3.2 * x + 4 * g()]; }); pts.push([22, 72]); pts.push([7, 62]);
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const b = sxy / sxx, a = my - b * mx;
  return { pts, a, b, n, lev: pts.map(p => 1 / n + (p[0] - mx) ** 2 / sxx), fit: pts.map(p => a + b * p[0]) }; })();
const REG_N = 30, REG_SUM_LEV = 2, REG_HI_LEV = 0.53, REG_BIG_RES = 20.1;   // data/reg.out.json: point 29 leverage 0.531, point 30 residual 20.14
function sReg(t) {
  CAP('REGRESSION DIAGNOSTICS · target sales, predictor spend', 64, 130, { color: C.violet });
  const X = 90, Y = 520, sx = x => X + x / 24 * 640, sy = y => Y - (y - 10) / 90 * 340;
  Ln([[X, Y], [X + 650, Y]]); Ln([[X, Y], [X, Y - 350]]); M('spend', X + 650, Y + 20, { size: 12, align: 'right' }); M('sales', X + 8, Y - 340, { size: 12 });
  const thr = 2 * 2 / REG_N;
  RG.pts.forEach((p, i) => A(seg(t, 0.3 + i * 0.02, 0.6 + i * 0.02), () => {
    const hl = t > 5.4 && RG.lev[i] > thr;
    if (t > 2.6 && t < 5.4) Ln([[sx(p[0]), sy(p[1])], [sx(p[0]), sy(RG.fit[i])]], { stroke: Math.abs(p[1] - RG.fit[i]) > 10 ? C.coral : C.faint, lw: 1.5 });
    dot(sx(p[0]), sy(p[1]), hl ? 8 : 4.5, hl ? C.amber : C.teal);
  }));
  const u = eo(seg(t, 1.0, 1.8));
  if (u > 0) Ln([[sx(0), sy(RG.a)], [sx(24 * u), sy(RG.a + RG.b * 24 * u)]], { stroke: C.violet, lw: 2.5 });
  const cards = [[1.0, 'ATTR_REG_FITTED', 'ŷ: the prediction for each row'], [2.6, 'ATTR_REG_RESIDUAL', `y − ŷ: the largest here is +${REG_BIG_RES}`], [5.4, 'ATTR_REG_LEVERAGE', `hᵢᵢ: flag > 2(p+1)/n = ${thr.toFixed(2)} · one point: ${REG_HI_LEV}`]];
  cards.forEach(([at, op, d], i) => A(seg(t, at, at + 0.4), () => { const y = 140 + i * 84; R(780, y, 436, 72, { fill: C.panel, stroke: C.violet }); M(op, 800, y + 28, { size: 13, color: C.violet, weight: 600 }); M(d, 800, y + 52, { size: 12.5, color: C.ink }); }));
  A(seg(t, 7.0, 7.4), () => {
    card(780, 396, 436, 176);
    M('refit: each slot fits its own OLS', 800, 422, { size: 12.5, color: C.ink });
    M(`Σ leverage = p + 1 = ${REG_SUM_LEV}`, 800, 444, { size: 12.5, color: C.ink });
    M('params.fit: score a bound fit, no refit', 800, 470, { size: 12.5, color: C.teal });
    M('failed fit → all null + PULSE_FIT_UNAVAILABLE', 800, 494, { size: 12, color: C.coral });
    M('a null predictor → null, never 0', 800, 518, { size: 12.5, color: C.coral });
    M('ATTR_REG_PREDICT scores a bound or saved model', 800, 548, { size: 12.5 });
  });
}

/* ---------- 11. multivariate scores ---------- */
/* points: data/generate.js → data/mv.csv (same rng and seed); member 71 is the odd one */
const MV = (() => { const r = rng(5), g = gaussOf(r); const pts = Array.from({ length: 70 }, () => { const a = g(), b = g(); return [170 + 9 * a, 70 + 9 * (0.85 * a + 0.53 * b)]; });
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0; pts.forEach(p => { sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; sxy += (p[0] - mx) * (p[1] - my); });
  sxx /= n - 1; syy /= n - 1; sxy /= n - 1; const det = sxx * syy - sxy * sxy;
  const tr = (sxx + syy) / 2, q = Math.sqrt(tr * tr - det), l1 = tr + q, l2 = tr - q, ang = Math.atan2(l1 - sxx, sxy);
  return { pts, mx, my, l1, l2, ang, odd: [mx + 11, my - 10] }; })();
const MV_ODD = { zh: 1.29, zw: -1.15, d2: 24.7 };   // data/mv.out.json, member 71 (fit_on rows 1–70)
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
    card(780, 150, 436, 150, C.amber);
    M('tall but light', 800, 180, { size: 14, color: C.amber, weight: 600 });
    M(`height z ${sgn(MV_ODD.zh)} · weight z ${sgn(MV_ODD.zw)}`, 800, 210, { size: 13, color: C.ink }); M('each value looks ordinary on its own', 800, 234, { size: 12.5 });
    M(`D² = ${MV_ODD.d2} · far outside the cloud`, 800, 270, { size: 14, color: C.violet });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(780, 316, 436, 250);
    M('output d2 (default) or p · a null member → null', 800, 344, { size: 12.5, color: C.ink });
    M('ATTR_PC_SCORE: position on a principal component', 800, 374, { size: 12.5, color: C.violet }); M('ATTR_FACTOR_SCORE: an estimated factor score', 800, 396, { size: 12.5, color: C.violet });
    M('fit_on: fit on a subset, score every row', 800, 428, { size: 12.5, color: C.ink }); M('(here rows 1–70; member 71 is only scored)', 800, 448, { size: 12, color: C.muted });
    M('or fit: score a bound vector fit, row-local', 800, 474, { size: 12.5, color: C.teal });
    M('fit cohort-wide, never per request group', 800, 500, { size: 12.5, color: C.ink });
    M('singular or too few rows → all null + a warning', 800, 528, { size: 12.5, color: C.coral }); M('PULSE_MATRIX_SINGULAR · _INSUFFICIENT_N', 800, 550, { size: 11.5, color: C.coral });
  });
}

/* ---------- 12. more row scores ---------- */
function sMore(t) {
  CAP('MORE ROW SCORES OVER A VECTOR OF FIELDS', 64, 130, { color: C.violet });
  const C4 = [
    [0.3, 'ATTR_SEM_SCORE', ['one latent of a structural equation model,', 'fitted inline on the fit rows or bound by params.fit', 'regression (default) or Bartlett scores', 'params.group: each group with its own parameters']],
    [2.4, 'ATTR_SCALE_SCORE', ['a rating battery: the mean of the valid items,', 'or the prorated sum · reverse-keyed items', 'fewer than min_valid items → null, never 0']],
    [4.2, 'ATTR_VEC_DISTANCE', ['distance to a reference across the members', 'row-local metrics in one pass; standardized', 'and Mahalanobis metrics fit first']],
    [4.6, 'ATTR_PROFILE_SIMILARITY', ['correlation, cosine or a set similarity', 'to a reference profile', 'a null member drops its pair']]];
  C4.forEach(([at, op, lines], i) => A(seg(t, at, at + 0.4), () => {
    const x = 64 + (i % 2) * 584, y = 150 + Math.floor(i / 2) * 208;
    R(x, y, 568, 190, { fill: C.panel, stroke: C.violet });
    M(op, x + 20, y + 34, { size: 14, color: C.violet, weight: 600 });
    lines.forEach((l, j) => M(l, x + 20, y + 68 + j * 26, { size: 13, color: l.includes('null') ? C.coral : C.ink }));
  }));
}

/* ---------- 13. null scorecard ---------- */
const NS = [['ATTR_ZSCORE · TSCORE · NORMALIZED', 'null · a constant field → null'], ['ATTR_PERCENTILE', 'null'],
  ['ATTR_DATE_PART', 'null'], ['ATTR_SET_POPCOUNT', 'null · an empty set → 0'],
  ['ATTR_CODE_IN', '0 ("no")'], ['ATTR_SET_HAS', '0 ("no")'],
  ['ATTR_FORMULA', 'nil → null · arithmetic on nil → error'], ['ATTR_PREVIOUS_STATE', 'null · no carry-forward'],
  ['ATTR_REG_FITTED · _LEVERAGE · _PREDICT', 'null if a predictor is null'], ['ATTR_REG_RESIDUAL', 'null if target or predictor is null'],
  ['MAHALANOBIS · PC · FACTOR · SEM', 'null if a member is null'], ['ATTR_SCALE_SCORE', 'null below min_valid']];
function sNulls(t) {
  CAP('WHAT A NULL INPUT BECOMES', 64, 130, { color: C.coral });
  NS.forEach(([n, v], i) => {
    const col = i % 2, row = Math.floor(i / 2), x = 64 + col * 584, y = 150 + row * 62, neutral = v.startsWith('0');
    A(seg(t, 0.3 + i * 0.2, 0.6 + i * 0.2), () => {
      R(x, y, 568, 52, { fill: neutral ? C.amberS : C.panel, stroke: neutral ? C.amber : C.rule });
      M(n, x + 18, y + 32, { size: 13, color: C.ink });
      M(v, x + 550, y + 32, { size: 13, align: 'right', color: neutral ? C.amber : C.coral });
    });
  });
  A(seg(t, 3.8, 4.2), () => M('amber: only the 0/1 membership flags read 0, so their mean counts a missing answer as "no"', 64, 548, { size: 13, color: C.amber }));
}

/* ---------- 14. recap ---------- */
const OPS = [['ATTR_FORMULA', 'any rule over a row'], ['ATTR_ZSCORE', 'standard deviations'], ['ATTR_TSCORE', 'mean 50, sd 10'], ['ATTR_NORMALIZED', 'into [0, 1]'],
  ['ATTR_PERCENTILE', 'rank as a percentage'], ['ATTR_CODE_IN', 'one of these codes?'], ['ATTR_DATE_PART', 'a calendar part'], ['ATTR_SET_HAS', 'picked this option'],
  ['ATTR_SET_POPCOUNT', 'how many picked'], ['ATTR_PREVIOUS_STATE', 'the state before'], ['ATTR_REG_FITTED', 'model prediction'], ['ATTR_REG_RESIDUAL', 'prediction error'],
  ['ATTR_REG_LEVERAGE', 'unusual predictors'], ['ATTR_REG_PREDICT', 'score a bound model'], ['ATTR_MAHALANOBIS', 'multivariate distance'], ['ATTR_PC_SCORE', 'component score'],
  ['ATTR_FACTOR_SCORE', 'factor score'], ['ATTR_SEM_SCORE', 'latent score'], ['ATTR_SCALE_SCORE', 'battery score'], ['ATTR_VEC_DISTANCE', 'distance to a reference'],
  ['ATTR_PROFILE_SIMILARITY', 'similar profile?']];
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('ATTRIBUTES TODAY', 64, 112, { color: C.violet });
    OPS.forEach(([op, d], i) => A(seg(t, 0.2 + i * 0.05, 0.5 + i * 0.05), () => { const x = 64 + (i % 4) * 290, y = 124 + Math.floor(i / 4) * 52; R(x, y, 278, 44, { fill: C.panel, stroke: C.violet }); M(op, x + 14, y + 19, { size: 11.5, color: C.violet, weight: 600 }); T(d, x + 14, y + 37, { size: 13 }); }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 452, 566, 62, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 478, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 500, { size: 14 });
      R(650, 452, 566, 62, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 478, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 500, { size: 14 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('ATTRIBUTES', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('check what a null becomes before you average it', 640, 430, { size: 15, align: 'center' });
    M('next: the expression language', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[5.099, 9.984, 5.099, 8.725, 13.269, 7.936, 9.237, 9.259, 9.024, 10.325, 7.275, 3.435, 7.616, 9.728, 8.64, 6.571, 8.981, 8.917, 5.589, 9.088, 4.715, 8.853, 8.149, 6.656, 6.656, 7.04, 6.891, 6.635, 8.491, 5.739, 8.107, 9.109, 5.184, 7.168, 7.125, 4.565, 8.149, 7.488, 6.827, 9.408, 9.088, 5.397, 4.864, 6.891, 6.784, 9.515, 9.664, 5.461, 1.216]/*END*/;
PulseFilm.mount({
  series: 'PULSE · ATTRIBUTES',
  title: 'Pulse Attributes',
  narr: NARR,
  scenes: [
    { name: 'Pulse Attributes', dur: 2.6, draw: sTitle, caps: [
      [0, '', 'Pulse attributes. One derived value for every record, taken apart in depth.', true]] },
    { name: 'Where attributes run', dur: 8, draw: sWhere, caps: [
      [0, 'By default, attributes run third, after the filters, so they see only the records that survived. Groups, aggregations and windows can all read the new column.'],
      [2.4, 'Each attribute names a type, a source and a label. The label becomes the new column.'],
      [4.6, 'The label must be new. Reusing a field name, a feature column or an earlier label is refused, and predict catches it before anything runs.'],
      [6.2, 'Features add columns before the filters, for every record. Attributes add them after, for the survivors. Two exceptions come later: previous state runs before the filters, and some formulas run after the windows.']] },
    { name: 'One pass or two', dur: 7.4, draw: sPasses, caps: [
      [0, 'Row-local attributes read only the record in front of them, so they finish in one pass and stream. So does any score of a bound fit.'],
      [2.2, 'Two-pass attributes score a row against the whole column or a model. Pulse makes one pass to learn the statistics, then a second to score every row.'],
      [4.4, 'Percentile rank and previous state are buffered. Percentile sorts the values first, and previous state orders each subject\'s records, so neither can stream.']] },
    { name: 'Formulas', dur: 6.6, draw: sFormula, caps: [
      [0, 'A formula evaluates an expression for each row. Arithmetic on a null raises an error that stops the whole request, so guard it with a default.'],
      [2.6, 'Categories read as their labels and sets read as lists. True becomes one and false becomes zero. An expression that does not compile is refused, at predict too.']] },
    { name: 'Totals', dur: 7.6, draw: sTotal, caps: [
      [0, 'A formula can also call total, which sums an expression over every filtered row and hands the same figure to each one.'],
      [3.6, 'That makes shares easy: each income divided by the total.'],
      [5.8, 'A formula with total is two-pass, and total is only allowed in formula attributes, never in a filter or an overlay.'],
      [7.0, 'Total is weight-aware. Under a frequency weight it sums the weight times the value. A probability weight is refused, because the total would scale with the weights.']] },
    { name: 'Chaining', dur: 7, draw: sChain, caps: [
      [0, 'Attributes run in the order you list them, and a later one can read an earlier one\'s label: a formula, a z-score of it, then a formula of that.'],
      [3.6, 'Pulse plans the passes for you. Each layer of two-pass attributes that depend on each other adds one more scan.'],
      [6.2, 'A few attributes read source columns only, like code-in and the multivariate scores. To chain across requests, use Compose or ProcessChain.']] },
    { name: 'Standard scores', dur: 9, draw: sScores, caps: [
      [0, 'Z-score measures how many standard deviations a value sits from the mean, using the population mean and standard deviation of the filtered rows.'],
      [2.4, 'T-score is the same idea on a friendlier scale: mean fifty, standard deviation ten.'],
      [4.2, 'Normalized squeezes values into zero to one. Watch the outlier: one income of one hundred and forty pushes everyone else toward the bottom.'],
      [6.2, 'Percentile gives each value its rank as a percentage. Ties never share a rank.'],
      [8.0, 'Member ten has no income, so all four scores are null, and an aggregation counts them as missing. A field that never varies scores null too.']] },
    { name: 'Recodes', dur: 8, draw: sRecodes, caps: [
      [0, 'Code-in flags whether a value is one of a set of codes, like the top two boxes of a rating scale. Its mean is the top-box share.'],
      [2.4, 'A null counts as no. And if you filter to the codes first, the base shrinks, and the share reads one hundred percent.'],
      [5.0, 'Date part pulls out one calendar part. ISO weekday counts from Monday as one. A missing date gives null.', 'Date part pulls out one calendar part. I S O weekday counts from Monday as one. A missing date gives null.'],
      [6.6, 'Set-has and popcount read multi-select answers. A null set has no count, but an empty set counts zero.']] },
    { name: 'Previous state', dur: 8, draw: sPrev, caps: [
      [0, 'Previous state reads a long panel. For each record it finds the same subject\'s state at the previous time point.'],
      [2.6, 'It is null on a subject\'s first time point and after a missing state. It never carries an older value forward.'],
      [4.4, 'Unlike every other attribute, it runs over all the records before the filters. So a date window still sees each subject\'s true previous plan.'],
      [6.2, 'That also means an expression filter can read it, here to keep only the customers who changed plan.']] },
    { name: 'After the windows', dur: 7, draw: sPost, caps: [
      [0, 'A row-local formula that reads a window label runs after the windows. Here an adstock window feeds a hill saturation curve.'],
      [3.8, 'Predict shows the plan: the formula moves to a post-window phase, and the windows run over the records first. A regression predict can sit there too.'],
      [5.4, 'Any other attribute that reads a window label is refused, at predict and at runtime.']] },
    { name: 'Regression diagnostics', dur: 8, draw: sReg, caps: [
      [0, 'Regression attributes fit a least-squares model and give every row a diagnostic. Fitted is the model\'s prediction.'],
      [2.6, 'Residual is the gap between the actual value and the prediction. Large residuals flag unusual responses.'],
      [5.4, 'Leverage flags unusual predictor values, which pull hardest on the fit.'],
      [7.0, 'Each slot refits its own model, or it can score a bound fit instead, without refitting. A null predictor gives null, never zero.']] },
    { name: 'Multivariate scores', dur: 7.4, draw: sMulti, caps: [
      [0, 'Mahalanobis distance measures how far a row sits from the centre of several fields at once, allowing for how they move together.'],
      [3.4, 'This member is tall but light. Each value looks ordinary on its own, but together they sit far outside the cloud.'],
      [5.4, 'Principal-component and factor scores place each row on a fitted dimension. All three fit across the whole cohort, never per group, or score a bound fit.']] },
    { name: 'More row scores', dur: 6.4, draw: sMore, caps: [
      [0, 'SEM score places each row on a latent variable of a structural equation model. With a group, each group scores with its own parameters.', 'S E M score places each row on a latent variable of a structural equation model. With a group, each group scores with its own parameters.'],
      [2.4, 'Scale score averages a rating battery, and returns null when too few items were answered.'],
      [4.2, 'Vector distance and profile similarity compare each row with a reference profile.']] },
    { name: 'The null scorecard', dur: 5.4, draw: sNulls, caps: [
      [0, 'Here\'s what a null input becomes. Almost every attribute returns null, so an aggregation counts it as missing.'],
      [3.8, 'Only the two membership flags, code-in and set-has, read zero, so their average counts a missing answer as no.']] },
    { name: 'The attribute toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the attribute toolkit today: formulas, standard scores, recodes, previous state, regression diagnostics, and multivariate and battery scores.'],
      [3.4, 'More attributes are added over time, and embedders can register their own through Options.Extensions. The manifest always shows what your instance offers.', 'More attributes are added over time, and embedders can register their own through Options dot Extensions. The manifest always shows what your instance offers.'],
      [6.4, 'Remember: check what a null becomes before you average it. Next up, the expression language.'],
      [9.0, '', 'Pulse attributes.', true]] },
  ],
});
})();
