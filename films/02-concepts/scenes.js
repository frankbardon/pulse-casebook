/* Pulse Concepts: film 2 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
   Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts, "by default" for the slot order.
   Every figure on a result card is copied from a recorded alpha.33 run in data/ (see data/README.md). */
(() => {
const { C, MONO } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, arrow, rng, chips } = PulseFilm.h;
const ctx = () => PulseFilm.ctx;

/* ---------- the shared cohort: twelve members ---------- */
const ROWS = [
  { id: 1, region: 'North', age: 34, income: 72.4, joined: '2023-03-14', interests: ['travel', 'tech'] },
  { id: 2, region: 'South', age: 17, income: 12.0, joined: '2024-01-09', interests: ['sport'] },
  { id: 3, region: 'East', age: 45, income: 64.1, joined: '2022-11-02', interests: ['food'] },
  { id: 4, region: 'West', age: 29, income: 81.3, joined: '2023-07-21', interests: ['travel', 'food'] },
  { id: 5, region: 'North', age: 71, income: 55.0, joined: '2021-05-30', interests: ['food'] },
  { id: 6, region: 'South', age: 38, income: 58.6, joined: '2023-09-05', interests: ['tech'] },
  { id: 7, region: 'East', age: 52, income: null, joined: '2022-02-17', interests: ['travel'] },
  { id: 8, region: 'West', age: 24, income: 77.9, joined: '2024-04-11', interests: ['sport', 'tech'] },
  { id: 9, region: 'North', age: 41, income: 69.8, joined: '2023-12-01', interests: ['travel'] },
  { id: 10, region: 'South', age: 63, income: 61.2, joined: '2022-06-24', interests: ['food', 'sport'] },
  { id: 11, region: 'East', age: 30, income: 66.5, joined: '2024-02-28', interests: ['tech'] },
  { id: 12, region: 'West', age: 16, income: 9.5, joined: '2024-05-19', interests: [] },
];
const keep = r => r.age >= 18 && r.age <= 65;           // FILTER_RANGE age 18–65, inclusive
const KEPT = ROWS.filter(keep);
const REG = ['East', 'North', 'South', 'West'];   // GROUP_CATEGORY keys, in the order the run returns them
const BUCKETS = REG.map(g => KEPT.filter(r => r.region === g));
/* ---------- recorded alpha.33 runs (data/<request>.out.json) ---------- */
// feat.out.json: FEAT_LOG income and FEAT_BUCKETIZE age, on all twelve members
const LOG_INCOME = { 1: '4.296', 2: '2.565', 3: '4.176', 4: '4.410', 5: '4.025', 6: '4.088', 7: 'null', 8: '4.368', 9: '4.260', 10: '4.130', 11: '4.212', 12: '2.351' };
const AGE_BAND = { 1: 1, 2: 0, 3: 2, 4: 1, 5: 4, 6: 2, 7: 3, 8: 1, 9: 2, 10: 3, 11: 1, 12: 0 };
// spine.out.json: FILTER_RANGE age 18-65 (n_in 12, n_out 9, n_null_input 0), then ATTR_FORMULA senior and ATTR_ZSCORE income
const FILTER_RUN = { n_in: 12, n_out: 9, n_null_input: 0 };
const Z_INCOME = { 1: '+0.46', 3: '-0.66', 4: '+1.66', 6: '-1.40', 7: 'null', 8: '+1.20', 9: '+0.11', 10: '-1.05', 11: '-0.33' };
// pass1.out.json: the z-score's first pass, as ungrouped AGG_COUNT / AGG_AVERAGE / AGG_STDDEV (population) on income
const PASS1 = { n: 8, mean: '68.98', sd: '7.43' };
// agg.out.json: GROUP_CATEGORY region, AGG_COUNT id (rows), AGG_AVERAGE income with its n / n_null, OVERLAY_SHARE_OF_TOTAL on rows
const AGG = [{ rows: 3, n: 2, nnull: 1, avg: 65.3, share: '0.333' }, { rows: 2, n: 2, nnull: 0, avg: 71.1, share: '0.222' },
  { rows: 2, n: 2, nnull: 0, avg: 59.9, share: '0.222' }, { rows: 2, n: 2, nnull: 0, avg: 79.6, share: '0.222' }];

/* ---------- table helper ---------- */
const COLS = { id: { l: '#', w: 40 }, region: { l: 'region', w: 96, t: 'categorical_u8' }, age: { l: 'age', w: 60, t: 'u8' },
  income: { l: 'income', w: 88, t: 'f64' }, joined: { l: 'joined', w: 116, t: 'date' }, interests: { l: 'interests', w: 170, t: 'set_u8' } };
function cellText(r, k) {
  if (k === 'income') return r.income == null ? 'null' : r.income.toFixed(1);
  if (k === 'interests') return r.interests.length ? r.interests.join(', ') : '{ }';
  return String(r[k]);
}
const col = (k, o = {}) => ({ k, ...COLS[k], ...o });
/* cols: [{k,l,w,t?,val?,color?,ha?,ca?(i)}]; rows: [{r,y,a?,dx?,tint?}] */
function table(x0, y0, cols, rows, o = {}) {
  let x = x0;
  cols.forEach(c => {
    A(c.ha ?? 1, () => { T(c.l, x + 8, y0, { size: 14, weight: 600, color: c.hc || C.ink }); if (c.t && o.types) A(o.types, () => M(c.t, x + 8, y0 + 18, { size: 10.5, color: C.amber })); });
    x += c.w;
  });
  const lineY = y0 + (o.types != null ? 30 : 14);
  Ln([[x0, lineY], [x, lineY]], { stroke: C.rule });
  rows.forEach((row, i) => A(row.a ?? 1, () => {
    const y = row.y, dx = row.dx || 0;
    if (row.tint) R(x0 - 6 + dx, y - 21, x - x0 + 12, 30, { fill: row.tint === 'coral' ? C.coralS : row.tint === 'teal' ? C.tealS : C.panel2, r: 3 });
    let cx = x0 + dx;
    cols.forEach(c => {
      const v = c.val ? c.val(row.r) : cellText(row.r, c.k);
      const a = c.ca ? c.ca(i) : 1;
      A(a, () => M(v, cx + 8, y, { size: 14, color: v === 'null' ? C.coral : c.color || C.ink }));
      cx += c.w;
    });
  }));
  return x;
}
const rowY = (y0, i, types) => y0 + (types ? 56 : 42) + i * 32;
function card(x, y, w, h, stroke) { R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule }); }

/* ---------- 0. title ---------- */
function sTitle(t) {
  // twelve record tiles assembling into a block, then the title
  for (let i = 0; i < 12; i++) {
    const u = eo(seg(t, 0.1 + i * 0.06, 0.9 + i * 0.06));
    const tx = 466 + (i % 6) * 58, ty = 360 + Math.floor(i / 6) * 30;
    const sx = 640 + Math.cos(i * 2.1) * 520, sy = 360 + Math.sin(i * 1.7) * 260;
    A(u, () => { R(lerp(sx, tx, u), lerp(sy, ty, u), 50, 22, { fill: C.tealS, stroke: C.teal, r: 3 }); });
  }
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 290, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('CONCEPTS', 640, 480, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
  });
  A(seg(t, 2.0, 2.8), () => T('The building blocks of a request, on one cohort of twelve', 640, 530, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. cohort ---------- */
const TYPES = [['u4', C.teal], ['u8', C.teal], ['u16', C.teal], ['u32', C.teal], ['u64', C.teal], ['f32', C.teal], ['f64', C.teal], ['decimal128', C.teal],
  ['date', C.amber], ['datetime', C.amber], ['packed_bool', C.ink], ['categorical_u8', C.violet], ['categorical_u16', C.violet], ['categorical_u32', C.violet],
  ['set_u8', C.coral], ['set_u16', C.coral], ['set_u32', C.coral], ['set_u64', C.coral], ['set_u128', C.coral], ['set_u256', C.coral],
  ['vec_f32', C.teal], ['vec_f64', C.teal]];   // the manifest's cohort_types at alpha.33; vectors since alpha.12
function sCohort(t) {
  const keys = ['id', 'region', 'age', 'income', 'joined', 'interests'];
  const cols = keys.map((k, i) => col(k, { ha: seg(t, 0.2 + i * 0.12, 0.6 + i * 0.12) }));
  const rows = ROWS.map((r, i) => ({ r, y: rowY(140, i, true), a: seg(t, 1.2 + i * 0.1, 1.6 + i * 0.1), dx: (1 - eo(seg(t, 1.2 + i * 0.1, 1.7 + i * 0.1))) * -16 }));
  table(70, 140, cols, rows, { types: seg(t, 0.9, 1.4) });
  A(seg(t, 2.8, 3.2), () => {
    CAP('FIELD TYPES TODAY', 720, 150);
    chips(TYPES, 720, 168, 496, { t, at: 3.0, step: 0.07, size: 12.5 });
    A(seg(t, 4.6, 5.0), () => {
      [['numbers, vectors', C.teal], ['time', C.amber], ['categories', C.violet], ['multi-select sets', C.coral]].forEach(([l, c], i) => { const x = 728 + [0, 148, 214, 332][i]; dot(x, 372, 5, c); M(l, x + 12, 377, { size: 12 }); });
    });
  });
  // null vs empty selection
  const hi = seg(t, 6.4, 6.8);
  A(hi, () => {
    const y7 = rowY(140, 6, true), y12 = rowY(140, 11, true);
    R(70 + 196 + 2, y7 - 20, 84, 28, { stroke: C.coral, lw: 2, r: 3 });
    R(70 + 400 + 2, y12 - 20, 166, 28, { stroke: C.teal, lw: 2, r: 3 });
    card(720, 410, 496, 128);
    M('null', 742, 446, { size: 15, color: C.coral, weight: 600 }); T('no value at all · one bit in the row\'s null bitmap', 800, 446, { size: 15 });
    M('{ }', 742, 500, { size: 15, color: C.teal, weight: 600 }); T('an answer: nothing was selected', 800, 500, { size: 15 });
    Ln([[354, y7 - 6], [720, 440]], { stroke: C.coral, dash: [3, 4], lw: 1.1 });
    Ln([[638, y12 - 6], [720, 494]], { stroke: C.teal, dash: [3, 4], lw: 1.1 });
  });
}

/* ---------- 2. recipe ---------- */
const SPINE = [['features', 'Features', 'add columns'], ['filterers', 'Filters', 'drop rows'], ['attributes', 'Attributes', 'derive values'], ['groups', 'Groups', 'make buckets'],
  ['aggregations', 'Aggregations', 'reduce buckets'], ['windows', 'Windows', 'look across rows'], ['sort', 'Sort', 'order the result']];
const SIDE = [['tests', 'Tests', 'is a difference real?'], ['regressions', 'Regressions', 'what drives an outcome?'], ['matrices', 'Matrices', 'many fields at once'],
  ['crosstab', 'Crosstab', 'rows × columns + margins'], ['overlays', 'Overlays', 'layers on the result']];
function spine(t, o = {}) {
  SPINE.forEach(([k, name, what], i) => {
    const x = 64 + i * 164, y = o.y ?? 200;
    const a = o.at != null ? seg(t, o.at + i * 0.3, o.at + 0.4 + i * 0.3) : 1;
    const lit = o.lit != null && t >= o.lit + i * 0.36;
    A(a, () => {
      R(x, y, 150, 92, { fill: lit ? C.tealS : C.panel, stroke: lit ? C.teal : C.rule, lw: lit ? 1.8 : 1.2 });
      CAP(String(i + 1), x + 14, y + 24, { color: lit ? C.teal : C.muted });
      T(name, x + 14, y + 52, { size: 17, weight: 600 });
      M(o.counts ? o.counts[i] : what, x + 14, y + 76, { size: 12, color: o.counts ? C.teal : C.muted });
      if (i < 6) arrow(x + 150, y + 46, x + 162, y + 46, { stroke: C.faint, head: 6 });
    });
  });
}
function side(t, o = {}) {
  SIDE.forEach(([k, name, what], j) => {
    const x = 64 + j * 232, y = o.y ?? 390;
    const a = o.at != null ? seg(t, o.at + j * 0.25, o.at + 0.4 + j * 0.25) : 1;
    A(a, () => {
      R(x, y, 218, 92, { fill: C.panel, stroke: C.violet });
      T(name, x + 16, y + 34, { size: 17, weight: 600, color: C.ink });
      M(o.counts ? o.counts[j] : what, x + 16, y + 62, { size: 12, color: o.counts ? C.violet : C.muted });
      M(k, x + 202, y + 34, { size: 11, color: C.faint, align: 'right' });
    });
  });
}
function sRecipe(t) {
  A(seg(t, 0.2, 0.6), () => CAP('THE REQUEST SPINE · THE DEFAULT ORDER', 64, 168));
  spine(t, { at: 0.4, lit: 3.0 });
  if (t >= 3.0 && t < 5.9) { const x = lerp(64, 64 + 6 * 164 + 150, seg(t, 3.0, 5.7)); dot(x, 312, 6, C.teal); }
  Ln([[64, 312], [lerp(64, 1198, seg(t, 3.0, 5.7)), 312]], { stroke: C.teal, lw: 2 });
  A(seg(t, 4.6, 5.0), () => M('a request that groups or aggregates a window label runs the windows first, over the records', 64, 340, { size: 12.5, color: C.amber }));
  A(seg(t, 5.6, 6.0), () => CAP('AROUND THE SPINE', 64, 372));
  side(t, { at: 5.8 });
}

/* ---------- 3. features ---------- */
function sFeatures(t) {
  const logCol = { k: 'log', l: 'log_income', w: 108, color: C.violet, hc: C.violet, ha: seg(t, 1.0, 1.4), ca: i => seg(t, 1.3 + i * 0.13, 1.6 + i * 0.13), val: r => LOG_INCOME[r.id] };
  const bCol = { k: 'band', l: 'age_band', w: 96, color: C.violet, hc: C.violet, ha: seg(t, 3.6, 4.0), ca: i => seg(t, 3.9 + i * 0.13, 4.2 + i * 0.13), val: r => String(AGE_BAND[r.id]) };
  const cols = [col('id'), col('region'), col('age'), col('income'), logCol, bCol];
  const rows = ROWS.map((r, i) => ({ r, y: rowY(140, i, false), tint: !keep(r) && t > 6.2 ? 'coral' : null }));
  table(70, 150, cols, rows);
  // rows a later filter will drop still get values
  A(seg(t, 6.2, 6.6), () => ROWS.forEach((r, i) => { if (!keep(r)) dot(56, rowY(140, i, false) - 5, 5, C.coral); }));
  A(seg(t, 0.5, 0.9), () => {
    card(640, 130, 576, 92, C.violet);
    M('FEAT_LOG', 662, 162, { size: 14, color: C.violet, weight: 600 }); T('income → log_income', 760, 162, { size: 15 });
    M('log1p(x): pulls in a long right tail', 662, 194, { size: 12.5 });
  });
  A(seg(t, 3.3, 3.7), () => {
    card(640, 236, 576, 92, C.violet);
    M('FEAT_BUCKETIZE', 662, 268, { size: 14, color: C.violet, weight: 600 }); T('age → age_band', 810, 268, { size: 15 });
    M('boundaries 18 · 35 · 50 · 65  →  bucket index 0 … 4', 662, 300, { size: 12.5 });
  });
  A(seg(t, 5.0, 5.4), () => {
    CAP('FEATURES · MORE ADDED OVER TIME', 640, 368);
    chips([['log', C.violet], ['sqrt'], ['bucketize', C.violet], ['one-hot'], ['frequency-encode'], ['target-encode'], ['date-features'], ['poly'], ['train-test-split']], 640, 384, 576, { t, at: 5.1 });
  });
  A(seg(t, 6.3, 6.7), () => {
    R(640, 478, 576, 60, { fill: C.coralS, stroke: C.coral });
    dot(662, 508, 5, C.coral); T('Rows 2, 5 and 12 fail the filter later, but features already ran on them.', 676, 513, { size: 14.5 });
  });
}

/* ---------- 4. filters ---------- */
function sFilters(t) {
  const cols = [col('id'), col('region'), col('age', { color: C.ink }), col('income'), col('joined')];
  const scanAt = i => 1.0 + i * 0.2;
  let seen = 0, admitted = 0;
  let k = 0;
  const rows = ROWS.map((r, i) => {
    const scanned = t >= scanAt(i) + 0.1; if (scanned) { seen++; if (keep(r)) admitted++; }
    const fail = !keep(r) && scanned;
    const out = fail ? eo(seg(t, 3.9, 4.8)) : 0;
    const ni = keep(r) ? k++ : i;
    const comp = keep(r) ? eio(seg(t, 4.8, 5.8)) : 0;
    return { r, y: lerp(rowY(140, i, false), rowY(140, ni, false), comp), tint: fail ? 'coral' : (t >= scanAt(i) && t < scanAt(i) + 0.35 ? 'teal' : null), a: 1 - out, dx: out * 260 };
  });
  table(70, 150, cols, rows);
  if (t >= 1.0 && t < scanAt(11) + 0.3) { const i = Math.min(11, Math.floor((t - 1.0) / 0.2)); R(70 + 136, rowY(140, i, false) - 21, 60, 30, { stroke: C.teal, lw: 2, r: 3 }); }
  A(seg(t, 0.4, 0.8), () => {
    card(620, 130, 596, 160, C.coral);
    M('FILTER_RANGE', 642, 162, { size: 14, color: C.coral, weight: 600 }); T('age between 18 and 65, inclusive', 772, 162, { size: 15 });
    [['n_in', seen, 'records it saw', C.ink], ['n_out', admitted, 'records it let through', C.teal], ['n_null_input', FILTER_RUN.n_null_input, 'with a null age on entry', C.muted]].forEach(([k2, v, d, c], j) => {
      const x = 642 + j * 190;
      M(k2, x, 202, { size: 12 }); T(String(v), x, 246, { size: 34, weight: 700, color: c, stretch: 'expanded' }); M(d, x, 272, { size: 11.5 });
    });
  });
  A(seg(t, 5.8, 6.2), () => {
    CAP('FILTERERS · MORE ADDED OVER TIME', 620, 330);
    chips([['range', C.coral], ['include'], ['exclude'], ['null'], ['true'], ['false'], ['expression'], ['date-ranges'], ['set-contains-any'], ['set-contains-all'], ['set-contains-none'], ['set-equals']], 620, 346, 596, { t, at: 5.9 });
  });
  A(seg(t, 6.8, 7.2), () => { card(620, 478, 596, 60); T('A filter reads source fields and features. By default, attributes run after it.', 642, 513, { size: 15 }); });
}

/* ---------- 5. attributes ---------- */
function sAttributes(t) {
  // two-pass statistics, accumulated as pass 1 scans
  const p1 = i => 3.2 + i * 0.2;
  let n = 0, mean = 0, m2 = 0;
  KEPT.forEach((r, i) => { if (t >= p1(i) + 0.1 && r.income != null) { n++; const d = r.income - mean; mean += d / n; m2 += d * (r.income - mean); } });
  const sd = n > 0 ? Math.sqrt(m2 / n) : 0;
  const sen = { k: 'senior', l: 'senior', w: 84, color: C.violet, hc: C.violet, ha: seg(t, 0.6, 1.0), ca: i => seg(t, 0.8 + i * 0.16, 1.1 + i * 0.16), val: r => r.age >= 50 ? '1' : '0' };
  const z = { k: 'z', l: 'z_income', w: 104, color: C.violet, hc: C.violet, ha: seg(t, 5.4, 5.8), ca: i => seg(t, 5.6 + i * 0.2, 5.9 + i * 0.2), val: r => Z_INCOME[r.id] };   // a null input scores null (alpha.18), shown in coral
  const cols = [col('id'), col('region'), col('age'), col('income'), sen, z];
  const rows = KEPT.map((r, i) => ({ r, y: rowY(140, i, false), tint: t >= p1(i) && t < p1(i) + 0.3 ? 'teal' : null }));
  table(70, 150, cols, rows);
  A(seg(t, 0.3, 0.7), () => {
    card(640, 130, 576, 96, C.violet);
    CAP('ROW-LOCAL · ONE PASS', 662, 158, { color: C.violet });
    M('ATTR_FORMULA', 662, 190, { size: 14, color: C.violet, weight: 600 }); M('senior = age >= 50 ? 1 : 0', 790, 190, { size: 14, color: C.ink });
    M('reads only this row', 662, 212, { size: 12 });
  });
  A(seg(t, 2.9, 3.3), () => {
    card(640, 240, 576, 150, C.violet);
    CAP('TWO-PASS · STATISTICS FIRST, THEN SCORES', 662, 268, { color: C.violet });
    M('ATTR_ZSCORE', 662, 300, { size: 14, color: C.violet, weight: 600 }); M('z_income = (income − mean) / sd', 790, 300, { size: 14, color: C.ink });
    M('pass 1', 662, 334, { size: 12.5, color: t < 5.4 ? C.teal : C.muted }); const done = n === PASS1.n;   // once the scan ends, the card shows the recorded run
    M(`n ${n}   mean ${done ? PASS1.mean : n ? mean.toFixed(2) : '—'}   sd ${done ? PASS1.sd : n > 0 ? sd.toFixed(2) : '—'}`, 730, 334, { size: 14, color: C.ink });
    M('pass 2', 662, 366, { size: 12.5, color: t >= 5.4 ? C.teal : C.faint }); M('score every row against those statistics', 730, 366, { size: 12.5 });
  });
  A(seg(t, 7.6, 8.0), () => {
    CAP('ATTRIBUTES · MORE ADDED OVER TIME', 640, 428);
    chips([['formula', C.violet], ['zscore', C.violet], ['tscore'], ['percentile'], ['normalized'], ['date-part'], ['code-in'], ['set-has'], ['set-popcount'], ['mahalanobis'], ['pc-score'], ['factor-score'], ['reg-fitted'], ['reg-residual'], ['reg-leverage'], ['reg-predict'], ['previous-state'], ['sem-score'], ['+ more']], 640, 444, 576, { t, at: 7.7, step: 0.04 });
  });
}

/* ---------- 6. groupers ---------- */
const TRAY = j => ({ x: 420, y: 140 + j * 108, w: 360, h: 92 });
function slotPos(r) { const j = REG.indexOf(r.region); const s = BUCKETS[j].indexOf(r); const tr = TRAY(j); return { x: tr.x + 92 + s * 88, y: tr.y + 30 }; }
function trays(alpha = 1, labels = true) {
  REG.forEach((g, j) => { const tr = TRAY(j); A(alpha, () => { R(tr.x, tr.y, tr.w, tr.h, { fill: C.panel, stroke: C.rule }); if (labels) T(g, tr.x + 14, tr.y + 52, { size: 16, weight: 600 }); }); });
}
function miniCard(r, x, y, w, o = {}) {
  R(x, y, w, 34, { fill: o.fill || C.tealS, stroke: o.stroke || C.teal, r: 4 });
  M('#' + r.id, x + 8, y + 22, { size: 12.5, color: C.teal });
  if (w > 70) M(r.income == null ? 'null' : r.income.toFixed(1), x + w - 8, y + 22, { size: 12.5, color: r.income == null ? C.coral : C.ink, align: 'right' });
}
function sGroupers(t) {
  A(seg(t, 0.2, 0.6), () => { CAP('GROUP_CATEGORY region', 420, 120, { color: C.teal }); });
  trays(seg(t, 0.3, 0.7));
  KEPT.forEach((r, i) => {
    const t0 = 0.9 + i * 0.3, u = eio(seg(t, t0, t0 + 0.7));
    const from = { x: 70, y: 134 + i * 44 }, to = slotPos(r);
    A(seg(t, 0.2 + i * 0.05, 0.5 + i * 0.05), () => {
      miniCard(r, lerp(from.x, to.x, u), lerp(from.y, to.y, u), lerp(240, 80, u));
      if (u < 0.05) M(r.region, 150, 134 + i * 44 + 22, { size: 12.5 });
    });
  });
  // fan-out
  A(seg(t, 4.9, 5.3), () => {
    CAP('GROUP_SET_PER_ELEMENT interests', 830, 120, { color: C.amber });
    ['travel', 'food', 'tech', 'sport'].forEach((g, k) => { R(960, 140 + k * 70, 256, 58, { fill: C.panel, stroke: C.rule }); T(g, 974, 175 + k * 70, { size: 15, weight: 600 }); });
  });
  const FAN = [[ROWS[0], 5.4], [ROWS[3], 6.4], [ROWS[7], 7.4]];
  const filled = { travel: 0, food: 0, tech: 0, sport: 0 };
  FAN.forEach(([r, t0]) => {
    A(seg(t, t0 - 0.2, t0), () => {
      const n = r.interests.length;
      r.interests.forEach((g, m) => {
        const k = ['travel', 'food', 'tech', 'sport'].indexOf(g);
        const u = eio(seg(t, t0 + 0.2, t0 + 0.8));
        const slot = filled[g]; if (t >= t0 + 0.8) filled[g]++;
        const tx = 1040 + slot * 58, ty = 152 + k * 70;
        const sx = 836, sy = 300 + m * 38;
        R(lerp(sx, tx, u), lerp(sy, ty, u), 50, 34, { fill: C.amberS, stroke: C.amber, r: 4 });
        M('#' + r.id, lerp(sx, tx, u) + 10, lerp(sy, ty, u) + 22, { size: 12.5, color: C.amber });
      });
      if (t < t0 + 0.8) M(n + ' choices → ' + n + ' buckets', 836, 290, { size: 12, color: C.amber });
    });
  });
  A(seg(t, 8.4, 8.8), () => {
    CAP('GROUPERS · MORE ADDED OVER TIME', 830, 440);
    chips([['category', C.teal], ['range'], ['numeric-ranges'], ['rounded'], ['quantile'], ['date'], ['date-ranges'], ['kmeans'], ['set-per-element', C.amber], ['set-value']], 830, 456, 386, { t, at: 8.5 });
  });
}

/* ---------- 7. aggregators ---------- */
function sAggregators(t) {
  A(seg(t, 0.1, 0.5), () => {
    card(70, 130, 300, 108);
    M('groups', 90, 162, { size: 12 }); M('GROUP_CATEGORY region', 90, 184, { size: 13.5, color: C.teal });
    M('aggregations', 90, 210, { size: 12 }); M('AGG_AVERAGE income', 90, 230, { size: 13.5, color: C.teal });
  });
  trays();
  const RX = 840;
  A(seg(t, 0.6, 1.0), () => { ['region', 'n', 'n_null', 'avg income'].forEach((h, k) => T(h, RX + [0, 100, 150, 236][k], 160, { size: 14, weight: 600, color: k === 1 || k === 2 ? C.violet : C.ink })); Ln([[RX, 174], [1216, 174]]); });
  REG.forEach((g, j) => {
    const t0 = 1.0 + j * 0.55; const u = eio(seg(t, t0, t0 + 0.6));
    BUCKETS[j].forEach(r => { const p = slotPos(r); A(1 - u, () => miniCard(r, lerp(p.x, 700, u), p.y, 80)); });
    const tr = TRAY(j);
    if (u > 0.5) A(seg(t, t0 + 0.3, t0 + 0.6), () => {
      R(690, tr.y + 26, 80, 40, { fill: C.tealS, stroke: C.teal, r: 4 }); M(AGG[j].avg.toFixed(1), 730, tr.y + 52, { size: 15, color: C.teal, align: 'center', weight: 600 });
      arrow(774, tr.y + 46, RX - 8, 204 + j * 40 - 6, { stroke: C.faint, head: 6 });
      const y = 204 + j * 40;
      T(g, RX, y, { size: 15 }); M(String(AGG[j].n), RX + 100, y, { size: 14, color: C.violet }); M(String(AGG[j].nnull), RX + 150, y, { size: 14, color: AGG[j].nnull ? C.coral : C.violet });
      M(AGG[j].avg.toFixed(2), RX + 236, y, { size: 14, color: C.ink });
    });
  });
  A(seg(t, 3.8, 4.2), () => {
    R(RX, 370, 376, 64, { fill: C.violetS, stroke: C.violet });
    M('n · n_null → components', RX + 18, 398, { size: 13.5, color: C.violet }); M('East: 3 rows, 1 null income → n 2', RX + 18, 420, { size: 12.5 });
  });
  A(seg(t, 5.4, 5.8), () => {
    CAP('AGGREGATORS · MORE ADDED OVER TIME', 70, 286);
    chips([['count'], ['sum'], ['average', C.teal], ['median'], ['percentile'], ['min'], ['max'], ['stddev'], ['variance'], ['mode'], ['distinct-count'], ['ratio'], ['weighted-mean'], ['ci-lower'], ['ci-upper'], ['auc'], ['set-union'], ['vec-mean'], ['+ more']], 70, 302, 320, { t, at: 5.5, step: 0.04 });
  });
  A(seg(t, 7.0, 7.4), () => { R(RX, 456, 376, 64, { fill: C.panel, stroke: C.rule }); M('no groups → one bucket:', RX + 18, 484, { size: 13.5, color: C.ink }); M('the whole filtered cohort', RX + 18, 506, { size: 12.5 }); });
}

/* ---------- 8. windows ---------- */
// win.out.json: AGG_SUM revenue by month of r.csv. Its WIN_LAG, WIN_PCT_CHANGE and WIN_RUNNING_SUM columns, and the
// OVERLAY_DELTA_VS_PRIOR series, equal the values computed from REV below (checked against the run).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], REV = [120, 135, 128, 150, 162, 171];
function sWindows(t) {
  A(seg(t, 0.1, 0.5), () => { CAP('GROUP_DATE order_date (month) · AGG_SUM revenue', 70, 140, { color: C.teal }); });
  const base = 520;
  MONTHS.forEach((m, i) => {
    const x = 90 + i * 80, h = REV[i] * 1.8 * eo(seg(t, 0.6 + i * 0.12, 1.2 + i * 0.12));
    R(x, base - h, 56, h, { fill: C.tealS, stroke: C.teal, r: 3 });
    M(m, x + 28, base + 22, { size: 12.5, align: 'center' });
    A(seg(t, 1.2 + i * 0.12, 1.5 + i * 0.12), () => M(String(REV[i]), x + 28, base - h - 10, { size: 12.5, align: 'center', color: C.ink }));
  });
  Ln([[80, base], [570, base]], { stroke: C.rule });
  // window table
  const X = 640, cw = [70, 96, 70, 120, 130], hd = ['month', 'revenue', 'lag', 'pct_change', 'running_sum'];
  const start = [0, 1.4, 3.0, 4.6, 6.2];
  hd.forEach((h, k) => A(seg(t, start[k], start[k] + 0.3), () => T(h, X + cw.slice(0, k).reduce((a, b) => a + b, 0), 150, { size: 14, weight: 600, color: k >= 2 ? C.amber : C.ink })));
  Ln([[X, 164], [X + 486, 164]]);
  let run = 0;
  MONTHS.forEach((m, i) => {
    run += REV[i];
    const y = 196 + i * 38, xs = k => X + cw.slice(0, k).reduce((a, b) => a + b, 0);
    const vals = [m, String(REV[i]), i ? String(REV[i - 1]) : 'null', i ? ((REV[i] - REV[i - 1]) / REV[i - 1] >= 0 ? '+' : '') + ((REV[i] - REV[i - 1]) / REV[i - 1]).toFixed(3) : 'null', String(run)];
    vals.forEach((v, k) => {
      const a = k === 0 ? seg(t, 0.4, 0.8) : seg(t, start[k] + i * 0.2, start[k] + 0.3 + i * 0.2);
      A(a, () => M(v, xs(k), y, { size: 14, color: v === 'null' ? C.coral : k >= 2 ? C.amber : C.ink }));
    });
    if (i > 0) { const a = seg(t, 3.0 + i * 0.2, 3.3 + i * 0.2) * (1 - seg(t, 4.5, 4.9)); A(a, () => arrow(xs(1) + 30, y - 38 - 4, xs(2) - 4, y - 5, { stroke: C.amber, head: 6, lw: 1.2 })); }
  });
  A(seg(t, 7.4, 7.8), () => {
    M('order_by month · partition_by optional · by default after aggregation', X, 444, { size: 12.5 });
    CAP('WINDOWS · MORE ADDED OVER TIME', X, 482);
    chips([['lag', C.amber], ['lead'], ['delta'], ['pct-change', C.amber], ['running-sum', C.amber], ['running-avg'], ['moving-avg'], ['ewma'], ['rank'], ['dense-rank'], ['row-number'], ['share'], ['lift'], ['distributed-lag']], X, 496, 576, { t, at: 7.5 });
  });
}

/* ---------- 9. tests and regressions ---------- */
// s.csv (data/generate.js, seed 21): incomes of the 20 North and 20 West members, and age/income for all 80.
const GA = [45.4, 62, 55.3, 56.8, 69.9, 50.5, 49.4, 62.6, 83.5, 63.5, 82.3, 60.1, 55.3, 58.5, 60.1, 78.7, 41.6, 57, 65.9, 53];
const GB = [69.1, 65, 78.3, 68.4, 71.1, 70.3, 78.9, 63, 70.1, 74.7, 54.5, 66.5, 51.6, 49.2, 89.3, 63.1, 83.7, 61.4, 79.8, 64.5];
const SC = [[27,45.4],[55,62],[20,55.3],[30,56.8],[59,69.9],[25,50.5],[25,49.4],[41,62.6],[54,83.5],[54,63.5],[56,82.3],[36,60.1],[21,55.3],[42,58.5],[44,60.1],[61,78.7],[23,41.6],[50,57],[62,65.9],[31,53],
  [54,72.9],[33,61.9],[60,74],[62,74.5],[57,61.5],[46,63.1],[54,72.3],[46,58.1],[38,59.6],[24,56.2],[49,74.3],[30,61.8],[44,68.9],[55,72.6],[28,53],[22,57.4],[42,60.6],[42,49.5],[43,64.8],[36,79.1],
  [23,46.3],[21,49.4],[38,65.8],[51,62.3],[37,64.1],[41,66],[48,60.5],[50,83.9],[56,69.7],[34,63.8],[33,57.7],[62,73.2],[50,85.2],[57,81.8],[32,70.4],[47,72.5],[28,58],[51,71.9],[51,71.8],[34,65.3],
  [55,69.1],[38,65],[61,78.3],[60,68.4],[56,71.1],[35,70.3],[59,78.9],[28,63],[50,70.1],[44,74.7],[23,54.5],[43,66.5],[27,51.6],[30,49.2],[63,89.3],[20,63.1],[48,83.7],[29,61.4],[59,79.8],[44,64.5]];
// tr.out.json: FILTER_INCLUDE region North, West, then TEST_WELCH income split_by region
const WELCH = { t: '-2.35', p: '0.024', mean: [60.57, 68.625] };
// sm.out.json: REG_OLS income ~ age over all 80
const OLS = { a: 40.541931548295295, b: 0.5817619888538051, r2: '0.53' };
function sTests(t) {
  CAP('TESTS', 70, 140, { color: C.teal });
  const px = v => 90 + (v - 40) / 60 * 470;
  [['North', GA, 230], ['West', GB, 330]].forEach(([g, arr, y], gi) => {
    T(g, 70, y - 34, { size: 15, weight: 600 });
    Ln([[90, y], [560, y]], { stroke: C.rule });
    arr.forEach((v, i) => A(seg(t, 0.5 + i * 0.03 + gi * 0.4, 0.8 + i * 0.03 + gi * 0.4), () => dot(px(v), y - 8 + ((i * 7) % 5) * 4 - 8, 4.5, gi ? C.amber : C.teal)));
    const m = WELCH.mean[gi];
    A(seg(t, 2.4, 2.8), () => { Ln([[px(m), y - 34], [px(m), y + 10]], { stroke: C.ink, lw: 2 }); M('mean ' + m.toFixed(1), px(m) + 6, y + 24, { size: 12.5, color: C.ink }); });
  });
  [40, 60, 80, 100].forEach(v => M(String(v), px(v), 390, { size: 11.5, align: 'center' }));
  A(seg(t, 3.2, 3.6), () => {
    R(90, 424, 470, 120, { fill: C.panel, stroke: C.teal });
    M('FILTER_INCLUDE region: North, West', 110, 450, { size: 12.5, color: C.coral });
    M('TEST_WELCH income split_by region', 110, 474, { size: 13.5, color: C.teal });
    M(`t = ${WELCH.t.replace('-', '−')}`, 110, 506, { size: 16, color: C.ink }); M(`p = ${WELCH.p}`, 260, 506, { size: 16, color: C.ink });
    M('exactly two groups · post_tests run on result rows', 110, 530, { size: 11.5 });
  });
  // regression
  CAP('REGRESSIONS', 680, 140, { color: C.violet });
  const sx = a => 680 + (a - 18) / 48 * 500, sy = v => 404 - (v - 40) / 70 * 216;
  Ln([[680, 404], [1190, 404]], { stroke: C.rule }); Ln([[680, 404], [680, 180]], { stroke: C.rule });
  M('age', 1190, 422, { size: 12, align: 'right' }); M('income', 688, 200, { size: 12 });
  SC.forEach((p, i) => A(seg(t, 4.4 + i * 0.025, 4.7 + i * 0.025), () => dot(sx(p[0]), sy(p[1]), 4, C.violet)));
  const u = eo(seg(t, 6.0, 7.0));
  if (u > 0) { const x1 = 18, x2 = lerp(18, 66, u); Ln([[sx(x1), sy(OLS.a + OLS.b * x1)], [sx(x2), sy(OLS.a + OLS.b * x2)]], { stroke: C.ink, lw: 2.5 }); }
  A(seg(t, 7.0, 7.4), () => {
    R(680, 424, 510, 120, { fill: C.panel, stroke: C.violet });
    M('REG_OLS income ~ age', 700, 454, { size: 13.5, color: C.violet });
    M(`income = ${OLS.a.toFixed(1)} + ${OLS.b.toFixed(2)} · age    R² = ${OLS.r2}`, 700, 484, { size: 15, color: C.ink });
    M('models today: OLS · GLM · Bayesian linear · MMM Hill · MMM Bayes', 700, 510, { size: 11.5 });
    M('more added over time · your own through Options.Extensions', 700, 530, { size: 11.5 });
  });
}

/* ---------- 10. matrices ---------- */
const FIELDS = ['age', 'income', 'tenure', 'spend', 'visits'];
// sm.out.json: MAT_CORRELATION over the vector profile = [age, income, tenure, spend, visits], listwise, n 80
const CORR = [[1, .73, .80, .50, .36], [.73, 1, .54, .78, .45], [.80, .54, 1, .34, .26], [.50, .78, .34, 1, .52], [.36, .45, .26, .52, 1]];
function sMatrices(t) {
  FIELDS.forEach((f, i) => A(seg(t, 0.2 + i * 0.12, 0.5 + i * 0.12), () => { R(70 + i * 112, 140, 100, 34, { fill: C.panel2, stroke: C.teal, r: 17 }); M(f, 120 + i * 112, 162, { size: 13, color: C.teal, align: 'center' }); }));
  A(seg(t, 0.9, 1.3), () => { M('vectors: profile = [age, income, tenure, spend, visits]  ·  or a native vec_f64 field', 70, 206, { size: 13, color: C.ink }); });
  const X = 190, Y = 236, S = 60;
  FIELDS.forEach((f, i) => A(seg(t, 1.2, 1.6), () => { M(f, X - 12, Y + i * S + 35, { size: 12.5, align: 'right' }); M(f, X + i * S + 30, Y - 10, { size: 12, align: 'center' }); }));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const a = seg(t, 1.6 + (i + j) * 0.3, 2.0 + (i + j) * 0.3); if (a <= 0) continue;
    const r = CORR[i][j], c = r >= 0 ? '69,193,179' : '240,128,107';
    A(a, () => {
      ctx().fillStyle = `rgba(${c},${0.12 + 0.75 * Math.abs(r)})`; ctx().fillRect(X + j * S + 2, Y + i * S + 2, S - 4, S - 4);
      M(r === 1 ? '1' : r.toFixed(2), X + j * S + S / 2, Y + i * S + S / 2 + 5, { size: 12.5, color: Math.abs(r) > 0.5 ? C.bg : C.ink, align: 'center', weight: 600 });
    });
  }
  A(seg(t, 4.6, 5.0), () => {
    card(560, 236, 656, 104, C.teal);
    M('MAT_CORRELATION', 582, 268, { size: 14, color: C.teal, weight: 600 }); T('one vector of fields in, one matrix out', 730, 268, { size: 15 });
    M('symmetric · listwise or pairwise handling of missing values', 582, 296, { size: 12.5 });
    M('tenure ↔ age 0.80 · spend ↔ income 0.78 · n 80', 582, 320, { size: 12.5, color: C.ink });
  });
  A(seg(t, 5.8, 6.2), () => {
    CAP('MATRIX OPERATORS · MORE ADDED OVER TIME', 560, 378);
    chips([['covariance'], ['correlation', C.teal], ['partial-correlation'], ['distance'], ['pca'], ['factor'], ['reliability'], ['collinearity'], ['sem']], 560, 394, 656, { t, at: 5.9 });
  });
}

/* ---------- 11. overlays ---------- */
function sOverlays(t) {
  A(seg(t, 0.1, 0.5), () => CAP('BASE RESULT · data', 70, 140));
  ['region', 'rows', 'avg income'].forEach((h, k) => T(h, 70 + [0, 120, 190][k], 176, { size: 14, weight: 600 }));
  Ln([[70, 190], [380, 190]]);
  REG.forEach((g, j) => { const y = 222 + j * 38; T(g, 70, y, { size: 15 }); M(String(AGG[j].rows), 190, y, { size: 14, color: C.ink }); M(AGG[j].avg.toFixed(2), 260, y, { size: 14, color: C.ink }); });
  // overlay sheet slides in, keyed to the same rows
  const u = eo(seg(t, 1.2, 2.2));
  if (u > 0) A(0.25 + 0.75 * u, () => {
    const x = lerp(900, 420, u);
    R(x, 150, 230, 222, { fill: 'rgba(38,31,68,0.85)', stroke: C.violet, lw: 1.5 });
    M('OVERLAY_SHARE_OF_TOTAL', x + 14, 176, { size: 12, color: C.violet, weight: 600 });
    REG.forEach((g, j) => { const y = 222 + j * 38; M(AGG[j].share, x + 14, y, { size: 14, color: C.violet }); });
    M('sums to 1.000', x + 14, 362, { size: 11.5 });
    if (u > 0.95) REG.forEach((g, j) => Ln([[384, 216 + j * 38], [x - 4, 216 + j * 38]], { stroke: C.violet, dash: [2, 4], lw: 1 }));
  });
  A(seg(t, 2.6, 3.0), () => { dot(80, 396, 6, C.teal); T('base data unchanged', 94, 401, { size: 14.5, color: C.teal }); });
  // second host: a series
  A(seg(t, 4.2, 4.6), () => {
    CAP('A SERIES HOST · monthly revenue', 70, 430);
    MONTHS.forEach((m, i) => { const x = 70 + i * 92; R(x, 446, 84, 46, { fill: C.panel, stroke: C.rule }); M(m, x + 10, 466, { size: 11.5 }); M(String(REV[i]), x + 10, 484, { size: 14, color: C.ink }); });
    M('OVERLAY_DELTA_VS_PRIOR', 640, 466, { size: 12, color: C.violet, weight: 600 });
  });
  MONTHS.forEach((m, i) => { if (!i) return; A(seg(t, 4.8 + i * 0.15, 5.1 + i * 0.15), () => { const d = REV[i] - REV[i - 1]; M((d >= 0 ? '+' : '') + d, 70 + i * 92 + 42, 516, { size: 13.5, color: C.violet, align: 'center' }); }); });
  A(seg(t, 6.0, 6.4), () => {
    CAP('OVERLAY FAMILIES · MORE ADDED OVER TIME', 760, 140);
    chips([['share', C.violet], ['index'], ['delta', C.violet], ['z-score'], ['t'], ['proportion z'], ['chi-square'], ['pairwise'], ['Fisher exact'], ['KS'], ['rank'], ['formula'], ['year over year'],
      ['vs prior'], ['std residual'], ['correspondence'], ['Markov'], ['rake'], ['symmetry'], ['retention'], ['matrix group summary'], ['+ more']], 760, 156, 456, { t, at: 6.1, step: 0.04 });
    M('hosts: crosstab · series · matrix result', 760, 346, { size: 12.5 }); M('facet · chain · compose', 760, 366, { size: 12.5 });
  });
}

/* ---------- 12. recap ---------- */
function sRecap(t) {
  const end = seg(t, 7.6, 8.4);
  A(1 - end, () => {
    A(seg(t, 0.1, 0.5), () => CAP('THE WHOLE TOOLKIT', 64, 168));
    spine(t, { at: 0.2 });
    side(t, { at: 1.6, y: 336 });
    A(seg(t, 2.6, 3.0), () => {
      M('the spine runs in this order by default · every category grows over time · the manifest lists what your instance offers', 64, 464, { size: 13, color: C.teal });
      M('Options.Extensions · embedders register their own features, filters, attributes, groupers, aggregators, windows, tests, regressions and matrix operators', 64, 486, { size: 12, color: C.amber });
    });
    A(seg(t, 3.6, 4.0), () => {
      R(64, 510, 1152, 56, { fill: C.violetS, stroke: C.violet });
      M('components', 86, 544, { size: 14, color: C.violet, weight: 600 }); T('every figure comes back with the counts it stands on:  n · n_null · n_in · n_out · total_n', 196, 544, { size: 15 });
    });
  });
  A(seg(t, 8.2, 9.0), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('CONCEPTS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
    M('by default: features → filters → attributes → groups → aggregations → windows → sort', 640, 430, { size: 15, align: 'center' });
    M('next: each concept in depth', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[6.08, 5.931, 11.52, 9.6, 6.4, 10.859, 6.037, 5.888, 5.227, 8.491, 5.397, 6.805, 11.072, 8.725, 6.635, 6.421, 4.096, 4.885, 5.504, 10.091, 7.424, 7.104, 6.912, 7.36, 7.147, 7.744, 8.448, 7.061, 6.635, 11.904, 7.424, 11.392, 6.784, 4.864, 4.971, 7.701, 14.229, 5.696, 5.397, 3.328]/*END*/;
PulseFilm.mount({
  series: 'PULSE · CONCEPTS',
  title: 'Pulse Concepts',
  narr: NARR,
  scenes: [
    { name: 'Pulse Concepts', dur: 3.5, draw: sTitle, caps: [
      [0, '', 'Pulse concepts. The building blocks of a request, explained on one small cohort of twelve members.', true]] },
    { name: 'The cohort', dur: 9, draw: sCohort, caps: [
      [0, 'Everything in Pulse starts with a cohort: a table of records, where every field has a declared type.'],
      [2.8, 'Field types today cover whole numbers, decimals, dates, true-or-false flags, categories, multi-select sets and native vectors. More are added over time, and the manifest lists them.'],
      [6.2, 'A field can be null if its schema allows it, meaning no value at all. For a multi-select, an empty selection is a real answer, which is different from null.']] },
    { name: 'A request is a recipe', dur: 8.5, draw: sRecipe, caps: [
      [0, 'A request is a recipe. You fill in the slots you need, and by default Pulse runs them in the same order.'],
      [3.0, 'Features first, then filters, attributes, groups, aggregations, windows, and finally sort. A request that groups or aggregates a window\'s output runs the windows first.'],
      [5.6, 'Around that spine sit tests, regressions, matrices, crosstabs and overlays. Let\'s meet each one.']] },
    { name: 'Features', dur: 8, draw: sFeatures, caps: [
      [0, 'Features come first, before any filter. Each one adds a new column to every record in the cohort.'],
      [3.3, 'A log transform pulls in a long tail. Bucketize turns age into numbered bands.'],
      [5.0, 'More feature operators are added over time. Because features run first, they see all twelve rows, even the ones a filter will drop later.',
             'More feature operators are added over time. Because features run first, they see all twelve rows, even the ones a filter is about to drop.']] },
    { name: 'Filters', dur: 8, draw: sFilters, caps: [
      [0, 'Filters decide which records stay. This one keeps members aged eighteen to sixty-five.'],
      [3.8, 'Three records fall away. The filter counts what it saw and what it let through, and those counts come back with the answer.'],
      [5.8, 'Filters range from simple ranges to set membership to full expressions, and more are added over time. A filter can read features, and by default it runs before the attributes.']] },
    { name: 'Attributes', dur: 9, draw: sAttributes, caps: [
      [0, 'Attributes add a derived value to each record, by default after the filters. A formula reads only its own row, so it needs one pass.'],
      [2.9, 'A z-score is different. It needs the mean and spread of the whole column first, so Pulse makes a pass to learn them.'],
      [5.4, 'Then a second pass scores every row. Member seven has no income, so its z-score is null, not zero.'],
      [7.6, 'Pulse handles both passes for you, and the set of attributes keeps growing.']] },
    { name: 'Groupers', dur: 9.5, draw: sGroupers, caps: [
      [0, 'Groupers sort records into buckets. The category grouper makes one bucket per region.'],
      [4.8, 'Multi-select fields can fan out. A member who chose travel and tech lands in both buckets.'],
      [8.3, 'Groupers cover categories, number ranges, quantiles, calendar periods, clusters and sets, with more added over time. Two groupers together make a combined key.']] },
    { name: 'Aggregators', dur: 8, draw: sAggregators, caps: [
      [0, 'Aggregators collapse each bucket into one number. Here, the average income per region becomes one row of the result.'],
      [3.6, 'Each figure comes with its counts. In the East, one income was null, so that average stands on two records, not three.'],
      [5.4, 'Pulse ships a growing set of aggregators. And with no groupers at all, the whole filtered cohort is a single bucket.']] },
    { name: 'Windows', dur: 8.5, draw: sWindows, caps: [
      [0, 'By default, windows run after aggregation. They give each row a value that depends on its neighbours, in a set order.'],
      [3.0, 'Lag pulls in last month\'s revenue. Percent change compares against it. A running sum keeps a cumulative total.'],
      [7.2, 'Windows also include ranks, moving averages, smoothing, shares, lift and carry-over lags, and more are added over time.']] },
    { name: 'Tests and regressions', dur: 8.5, draw: sTests, caps: [
      [0, 'Tests ask whether a difference is real or just noise. Here, a filter keeps two regions, and a Welch t-test compares their incomes.'],
      [3.2, 'Pulse offers a growing set of tests. Some run during the scan, and post-tests run on the finished result rows.'],
      [4.4, 'Regressions explain an outcome from its predictors. A least-squares fit finds how income rises with age.'],
      [7.0, 'Regressions today include least squares, GLMs, Bayesian linear and media-mix models. More are added over time, and embedders can register their own through Options.Extensions.',
            'Regressions today include least squares, G L Ms, Bayesian linear and media-mix models. More are added over time, and embedders can register their own through options dot extensions.']] },
    { name: 'Matrices', dur: 7.5, draw: sMatrices, caps: [
      [0, 'Matrices look at many fields at once. You name a vector of fields, or a native vector field, and get a whole matrix back.'],
      [4.6, 'Correlation shows which fields move together. Other matrix operators include covariance, principal components, reliability and structural equation models, with more added over time.']] },
    { name: 'Overlays', dur: 8, draw: sOverlays, caps: [
      [0, 'Overlays are layers placed on top of a finished result. A share-of-total layer lines up with the regional rows.'],
      [2.6, 'The base data underneath never changes. An overlay only adds a sibling layer.'],
      [4.2, 'Overlays work on series too. Delta versus prior shows the month-on-month change.'],
      [6.0, 'A crosstab, a matrix result, a facet or a chain can host overlays as well, and new overlay kinds are added over time.']] },
    { name: 'The whole toolkit', dur: 9.5, draw: sRecap, caps: [
      [0, 'That is the whole toolkit: a spine of seven slots in a default order, with tests, regressions, matrices, crosstabs and overlays around it. Every category grows over time, and the manifest lists what your instance offers.'],
      [2.6, 'In most categories, embedders can register their own operators through Options.Extensions.', 'In most categories, embedders can register their own operators through options dot extensions.'],
      [3.6, 'And every figure comes back with the counts it stands on, so you can always ask: out of how many?'],
      [7.6, '', 'Next, we\'ll take each of these concepts apart, in depth.', true]] },
  ],
});
})();
