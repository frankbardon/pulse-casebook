/* Pulse Aggregators: film 6 of the Pulse Anatomy series. Follows SERIES-RULES.md.
 * Figures mirror internal/processing: nulls skipped (n vs n_null), variance / stddev population (÷n),
 * AGG_WELFORD sample (÷n−1), CI = mean ∓ z·√(s²/n) with null for n < 2, ratio = Σnum / Σden. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, ring, arrow, rng, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const f2 = v => v.toFixed(2);

/* ---------- a post-filter cohort ---------- */
const P = [
  { id: 1, region: 'North', spend: 42, cost: 20, pred: 45 },
  { id: 2, region: 'East', spend: 55, cost: 25, pred: 50 },
  { id: 3, region: 'North', spend: 38, cost: 19, pred: 41 },
  { id: 4, region: 'West', spend: 61, cost: 30, pred: 57 },
  { id: 5, region: 'South', spend: null, cost: 16, pred: 60 },
  { id: 6, region: 'North', spend: 47, cost: 20, pred: 49 },
  { id: 7, region: 'East', spend: 52, cost: 26, pred: 55 },
  { id: 8, region: 'West', spend: 240, cost: 80, pred: 180 },
  { id: 9, region: 'North', spend: 58, cost: 29, pred: 60 },
  { id: 10, region: 'East', spend: 44, cost: 22, pred: 47 },
];
const LIVE = P.filter(r => r.spend != null);
const VALS = LIVE.map(r => r.spend);
const sum = a => a.reduce((x, y) => x + y, 0);
const mean = a => sum(a) / a.length;
const m2 = a => { const m = mean(a); return sum(a.map(v => (v - m) ** 2)); };
const median = a => { const s = [...a].sort((x, y) => x - y), h = (s.length - 1) / 2; return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2; };
const N = VALS.length, MEAN = mean(VALS), MED = median(VALS), M2 = m2(VALS);
const VAR_P = M2 / N, VAR_S = M2 / (N - 1);
const ZQ = 1.959963984540054;
const ci = a => a.length < 2 ? null : [mean(a) - ZQ * Math.sqrt(m2(a) / (a.length - 1) / a.length), mean(a) + ZQ * Math.sqrt(m2(a) / (a.length - 1) / a.length)];

/* ---------- 0. title ---------- */
function sTitle(t) {
  for (let i = 0; i < 8; i++) {
    const u = eio(seg(t, 0.5 + i * 0.06, 1.3 + i * 0.06));
    A(seg(t, 0.05 + i * 0.05, 0.4 + i * 0.05), () => R(lerp(420 + i * 28, 618, u), lerp(330, 340, u), lerp(22, 44, u * 0), 22, { fill: C.tealS, stroke: C.teal, r: 3, lw: 1 }));
  }
  A(seg(t, 1.3, 1.7), () => { R(600, 322, 80, 40, { fill: C.violetS, stroke: C.violet, r: 4, lw: 2 }); T('Σ', 640, 350, { size: 24, weight: 700, align: 'center', color: C.violet }); });
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 290, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('AGGREGATORS', 640, 470, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 2.0, 2.8), () => T('Many rows in, one figure out', 640, 518, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where aggregators run ---------- */
const SPINE = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
function sWhere(t) {
  SPINE.forEach((n, i) => {
    const x = 64 + i * 164, on = i === 4;
    A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08) * (on ? 1 : 0.55), () => {
      R(x, 110, 150, 52, { fill: on ? C.violetS : C.panel, stroke: on ? C.violet : C.rule, lw: on ? 2 : 1.2 });
      T(n, x + 14, 142, { size: 15.5, weight: 600, color: on ? C.ink : C.muted });
      if (i < 6) arrow(x + 150, 136, x + 162, 136, { stroke: C.faint, head: 6 });
    });
  });
  A(seg(t, 0.9, 1.3), () => {
    M('folds each group\'s rows into one figure', 720, 186, { size: 12.5, color: C.violet });
    M('reads fields, features and attribute labels', 64, 186, { size: 12.5, color: C.teal });
  });
  A(seg(t, 2.4, 2.8), () => {
    card(64, 214, 560, 168, C.violet);
    CAP('THE SLOT', 86, 242);
    const L = [['"aggregations": [', C.muted], ['  { "type": "AGG_SUM", "field": "spend" },', C.ink], ['  { "type": "AGG_MEDIAN", "field": "spend",', C.ink], ['    "label": "typical_spend" }', C.amber], [']', C.muted]];
    L.forEach(([s, c], i) => A(seg(t, 2.6 + i * 0.12, 2.9 + i * 0.12), () => M(s, 86, 270 + i * 22, { size: 13.5, color: c })));
  });
  A(seg(t, 3.6, 4.0), () => {
    card(660, 214, 556, 168);
    CAP('THE OUTPUT', 682, 242);
    M('no label → TYPE_field', 682, 272, { size: 13, color: C.muted });
    M('{ "AGG_SUM_spend": 637, "typical_spend": 52 }', 682, 300, { size: 13.5, color: C.violet });
    M('no groups → one row for the whole cohort', 682, 336, { size: 13, color: C.ink });
    M('a grouper → one row per bucket', 682, 360, { size: 13, color: C.ink });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(64, 406, 1152, 176);
    CAP('SMART DEFAULTS · A FIELD WITH NO TYPE', 86, 436);
    [['numeric', 'AGG_SUM'], ['categorical, boolean', 'AGG_MODE_COUNT'], ['multi-select set', 'AGG_SET_FREQUENCY'], ['date, datetime', 'never defaulted: name a type']].forEach(([k, v], i) => A(seg(t, 5.8 + i * 0.2, 6.1 + i * 0.2), () => {
      M(k, 86, 470 + i * 26, { size: 13.5, color: C.ink }); M(v, 380, 470 + i * 26, { size: 13.5, color: i === 3 ? C.coral : C.violet });
    }));
    A(seg(t, 6.8, 7.2), () => { M('a default never overrides a type you set', 760, 470, { size: 13, color: C.muted }); M('predict lists what it filled in', 760, 496, { size: 13, color: C.amber }); M('turn off with --no-defaults', 760, 522, { size: 13, color: C.muted }); });
  });
}

/* cohort strip shared by several chapters */
function strip(t, y, o = {}) {
  P.forEach((r, i) => {
    const x = 64 + i * 115, a = seg(t, (o.at ?? 0) + i * 0.05, (o.at ?? 0) + 0.3 + i * 0.05);
    A(a * (o.dim && o.dim(r) ? 0.35 : 1), () => {
      R(x, y, 103, 62, { fill: r.spend == null ? C.coralS : C.tealS, stroke: r.spend == null ? C.coral : C.teal, r: 4 });
      M('#' + r.id + ' ' + r.region, x + 8, y + 22, { size: 11.5, color: C.muted });
      T(r.spend == null ? 'null' : String(r.spend), x + 8, y + 48, { size: 19, weight: 700, color: r.spend == null ? C.coral : C.ink });
    });
  });
}

/* ---------- 2. counting ---------- */
function sCount(t) {
  CAP('TEN SURVIVING MEMBERS · FIELD spend', 64, 124, { color: C.teal });
  strip(t, 138);
  const tiles = [
    [0.8, 'AGG_COUNT spend', '9', 'non-null values only', C.violet],
    [2.0, 'AGG_NULL_COUNT spend', '1', 'the nulls it skipped', C.coral],
    [3.4, 'AGG_DISTINCT_COUNT region', '4', 'distinct non-null values', C.violet],
    [4.6, 'AGG_FREQUENCY region = North', '4', 'share 0.4 of non-null rows', C.violet],
    [6.0, 'AGG_MODE_COUNT region', '4', 'the size of the commonest value', C.violet],
    [6.6, 'AGG_MODE region', 'North', 'returned as its dictionary index', C.violet]];
  tiles.forEach(([at, op, v, d, col], i) => A(seg(t, at, at + 0.4), () => {
    const x = 64 + (i % 3) * 388, y = 236 + Math.floor(i / 3) * 170;
    R(x, y, 372, 150, { fill: C.panel, stroke: col });
    M(op, x + 18, y + 30, { size: 13, color: col, weight: 600 });
    T(v, x + 18, y + 92, { size: 46, weight: 800 });
    M(d, x + 18, y + 128, { size: 12.5, color: C.muted });
  }));
  A(seg(t, 7.4, 7.8), () => M('ties go to the smallest value, not the first one seen', 1216, 590, { size: 12.5, color: C.amber, align: 'right' }));
}

/* ---------- 3. the centre ---------- */
function axis(x0, x1, y, lo, hi, ticks) {
  Ln([[x0, y], [x1, y]], { stroke: C.rule, lw: 1.5 });
  ticks.forEach(v => { const x = lerp(x0, x1, (v - lo) / (hi - lo)); Ln([[x, y - 4], [x, y + 4]], { stroke: C.faint }); M(String(v), x, y + 22, { size: 12, align: 'center' }); });
  return v => lerp(x0, x1, (v - lo) / (hi - lo));
}
function sCentre(t) {
  CAP('WHERE IS THE MIDDLE?', 64, 124, { color: C.violet });
  const u = eio(seg(t, 3.0, 5.4));
  const vals = VALS.map(v => v === 240 ? lerp(62, 240, u) : v);
  const X = axis(100, 1180, 330, 0, 260, [0, 50, 100, 150, 200, 250]);
  const mu = mean(vals), md = median(vals);
  A(seg(t, 0.3, 0.8), () => vals.forEach((v, i) => { dot(X(v), 300 - (i % 3) * 18, 8, v > 100 ? C.coral : C.teal); }));
  A(seg(t, 1.0, 1.4), () => {
    Ln([[X(mu), 200], [X(mu), 340]], { stroke: C.violet, lw: 2.5 }); M('mean ' + f2(mu), X(mu) + 8, 214, { size: 14, color: C.violet, weight: 600 });
  });
  A(seg(t, 1.8, 2.2), () => {
    Ln([[X(md), 220], [X(md), 340]], { stroke: C.amber, lw: 2.5, dash: [5, 4] }); M('median ' + f2(md), X(md) - 8, 234, { size: 14, color: C.amber, weight: 600, align: 'right' });
  });
  A(seg(t, 3.0, 3.4), () => M('one big spender', X(vals[6]), 260, { size: 12.5, color: C.coral, align: 'center' }));
  const tiles = [['AGG_SUM', String(Math.round(sum(vals))), 'Σ of the non-null values'], ['AGG_AVERAGE', f2(mu), 'sum ÷ 9, not ÷ 10'], ['AGG_MEDIAN', f2(md), 'middle of the sorted values'], ['AGG_WEIGHTED_MEAN', 'Σw·x ÷ Σw', 'when rows carry weights']];
  tiles.forEach(([op, v, d], i) => A(seg(t, 0.6 + i * 0.3, 1.0 + i * 0.3), () => {
    const x = 64 + i * 290;
    R(x, 400, 278, 130, { fill: C.panel, stroke: i === 2 ? C.amber : C.violet });
    M(op, x + 16, 428, { size: 12.5, color: i === 2 ? C.amber : C.violet, weight: 600 });
    T(v, x + 16, 478, { size: i === 3 ? 26 : 36, weight: 800 });
    M(d, x + 16, 510, { size: 12.5, color: C.muted });
  }));
  A(seg(t, 6.0, 6.4), () => M('the mean follows the outlier · the median barely moves', 64, 572, { size: 13, color: C.ink }));
}

/* ---------- 4. spread ---------- */
function sSpread(t) {
  CAP('HOW FAR APART?', 64, 124, { color: C.violet });
  const X = axis(100, 1180, 250, 0, 260, [0, 50, 100, 150, 200, 250]);
  const lo = Math.min(...VALS), hi = Math.max(...VALS);
  VALS.forEach((v, i) => A(seg(t, 0.1 + i * 0.04, 0.4 + i * 0.04), () => dot(X(v), 222, 7, C.teal)));
  A(seg(t, 0.6, 1.0), () => {
    Ln([[X(lo), 190], [X(hi), 190]], { stroke: C.violet, lw: 2 }); Ln([[X(lo), 184], [X(lo), 196]], { stroke: C.violet, lw: 2 }); Ln([[X(hi), 184], [X(hi), 196]], { stroke: C.violet, lw: 2 });
    M('AGG_MIN ' + lo, X(lo), 176, { size: 12.5, color: C.violet }); M('AGG_MAX ' + hi, X(hi), 176, { size: 12.5, color: C.violet, align: 'right' });
    M('AGG_RANGE ' + (hi - lo), (X(lo) + X(hi)) / 2, 176, { size: 12.5, color: C.violet, align: 'center' });
  });
  A(seg(t, 2.2, 2.6), () => {
    card(64, 300, 560, 220, C.violet);
    CAP('AGG_VARIANCE · AGG_STDDEV', 86, 330, { color: C.violet });
    M('population: Σ(x − mean)² ÷ n', 86, 366, { size: 14, color: C.ink });
    M('÷ 9', 86, 410, { size: 13, color: C.muted });
    T('variance ' + f2(VAR_P), 140, 412, { size: 22, weight: 700 });
    T('stddev ' + f2(Math.sqrt(VAR_P)), 140, 450, { size: 22, weight: 700 });
    M('the whole cohort, described as it is', 86, 496, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(656, 300, 560, 220, C.amber);
    CAP('AGG_WELFORD', 678, 330, { color: C.amber });
    M('sample: Σ(x − mean)² ÷ (n − 1)', 678, 366, { size: 14, color: C.ink });
    M('÷ 8', 678, 410, { size: 13, color: C.muted });
    T('variance ' + f2(VAR_S), 732, 412, { size: 22, weight: 700 });
    M('{ mean, variance, n } in one pass', 678, 450, { size: 14, color: C.amber });
    M('the triple tests and t-overlays read', 678, 496, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.4, 6.8), () => M('same rows, two different variances: pick the one your method expects', 64, 566, { size: 13, color: C.ink }));
}

/* ---------- 5. uncertainty ---------- */
function sCI(t) {
  CAP('AGG_CI_LOWER · AGG_CI_UPPER · mean ∓ z·√(s² ÷ n)', 64, 124, { color: C.violet });
  const X = axis(240, 1180, 520, 0, 140, [0, 20, 40, 60, 80, 100, 120, 140]);
  const rows = [['all 9 members', VALS], ['first 4', VALS.slice(0, 4)], ['first 2', VALS.slice(0, 2)], ['just 1', VALS.slice(0, 1)]];
  rows.forEach(([lab, a], i) => A(seg(t, 0.4 + i * 1.1, 0.8 + i * 1.1), () => {
    const y = 190 + i * 76, c = ci(a), mu = mean(a);
    M(lab, 64, y + 5, { size: 13.5, color: C.ink }); M('n = ' + a.length, 64, y + 25, { size: 12, color: C.muted });
    if (c) {
      const l = Math.max(c[0], 0), h = Math.min(c[1], 140);
      R(X(l), y - 8, X(h) - X(l), 16, { fill: C.violetS, stroke: C.violet, r: 8 });
      dot(X(mu), y, 5, C.ink);
      M(f2(c[0]) + ' … ' + f2(c[1]), X(h) + 12, y + 5, { size: 12.5, color: C.violet });
    } else {
      dot(X(mu), y, 5, C.ink);
      M('null: no variance from one value', X(mu) + 14, y + 5, { size: 12.5, color: C.coral });
    }
  }));
  A(seg(t, 5.2, 5.6), () => M('fewer rows → a wider interval · normal z, not Student\'s t, so small samples read narrower than a t-interval', 64, 580, { size: 12.5, color: C.amber }));
}

/* ---------- 6. ratios ---------- */
function sRatio(t) {
  CAP('AGG_RATIO · Σ numerator ÷ Σ denominator', 64, 124, { color: C.violet });
  const cols = [['member', 64], ['spend', 220], ['cost', 340], ['spend ÷ cost', 460]];
  cols.forEach(([h, x]) => T(h, x, 160, { size: 14, weight: 600 }));
  Ln([[64, 172], [600, 172]]);
  P.forEach((r, i) => A(seg(t, 0.3 + i * 0.07, 0.6 + i * 0.07), () => {
    const y = 196 + i * 30, nul = r.spend == null;
    M('#' + r.id, 64, y, { size: 13.5, color: C.teal });
    M(nul ? 'null' : String(r.spend), 220, y, { size: 13.5, color: nul ? C.coral : C.ink });
    M(String(r.cost), 340, y, { size: 13.5, color: nul ? C.faint : C.ink });
    M(nul ? 'skipped on both sides' : f2(r.spend / r.cost), 460, y, { size: 13.5, color: nul ? C.coral : C.muted });
    if (nul) Ln([[330, y - 5], [380, y - 5]], { stroke: C.coral });
  }));
  const sn = sum(LIVE.map(r => r.spend)), sd = sum(LIVE.map(r => r.cost));
  const mr = mean(LIVE.map(r => r.spend / r.cost));
  A(seg(t, 1.8, 2.2), () => {
    card(660, 150, 556, 150, C.violet);
    M('AGG_RATIO', 682, 180, { size: 13, color: C.violet, weight: 600 });
    T(sn + ' ÷ ' + sd + ' = ' + f2(sn / sd), 682, 238, { size: 30, weight: 800 });
    M('big rows count for more: a pooled rate', 682, 278, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.8, 4.2), () => {
    card(660, 318, 556, 120);
    M('the average of the row ratios', 682, 348, { size: 13, color: C.muted, weight: 600 });
    T(f2(mr), 682, 400, { size: 30, weight: 800, color: C.muted });
    M('a different question: every row counts the same', 780, 398, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(660, 456, 556, 110, C.coral);
    M('denominators summing to 0', 682, 486, { size: 13, color: C.coral, weight: 600 });
    M('→ null on the wire, never an error and never 0', 682, 516, { size: 13.5, color: C.ink });
    M('numerator and denominator may be attribute labels too', 682, 546, { size: 12.5, color: C.muted });
  });
}

/* ---------- 7. accuracy ---------- */
function sAccuracy(t) {
  CAP('AGG_MAE · AGG_RMSE · AGG_MAPE · actual against a prediction field', 64, 124, { color: C.violet });
  const rows = LIVE, X0 = 90, dx = 100;
  const Y = v => 470 - v * 1.25;
  Ln([[70, 470], [980, 470]], { stroke: C.rule });
  rows.forEach((r, i) => A(seg(t, 0.3 + i * 0.08, 0.6 + i * 0.08), () => {
    const x = X0 + i * dx;
    const g = seg(t, 1.6 + i * 0.06, 2.2 + i * 0.06);
    A(g, () => Ln([[x + 20, Y(r.spend)], [x + 20, Y(r.pred)]], { stroke: C.coral, lw: 3 }));
    dot(x + 20, Y(r.spend), 7, C.teal); ring(x + 20, Y(r.pred), 7, C.amber, 2);
    M('#' + r.id, x + 20, 492, { size: 11.5, align: 'center' });
  }));
  A(seg(t, 0.6, 1.0), () => { dot(80, 168, 6, C.teal); M('actual spend', 92, 172, { size: 12.5 }); ring(230, 168, 6, C.amber, 2); M('prediction', 242, 172, { size: 12.5 }); Ln([[350, 168], [372, 168]], { stroke: C.coral, lw: 3 }); M('error', 380, 172, { size: 12.5 }); });
  const e = rows.map(r => r.spend - r.pred);
  const mae = mean(e.map(Math.abs)), rmse = Math.sqrt(mean(e.map(v => v * v))), mape = mean(rows.map((r, i) => Math.abs(e[i]) / Math.abs(r.spend)));
  [['AGG_MAE', f2(mae), 'mean |error|, spend units'], ['AGG_RMSE', f2(rmse), 'big misses dominate'], ['AGG_MAPE', f2(mape), '0.05 means 5%']].forEach(([op, v, d], i) => A(seg(t, 2.6 + i * 1.0, 3.0 + i * 1.0), () => {
    const y = 160 + i * 130;
    R(1010, y, 206, 116, { fill: C.panel, stroke: C.violet });
    M(op, 1026, y + 26, { size: 12.5, color: C.violet, weight: 600 }); T(v, 1026, y + 68, { size: 30, weight: 800 }); M(d, 1026, y + 96, { size: 10.5, color: C.muted });
  }));
  A(seg(t, 6.0, 6.4), () => M('member 5 has no actual, so it is skipped · RMSE is never below MAE on the same rows', 64, 560, { size: 12.5, color: C.amber }));
}

/* ---------- 8. shape ---------- */
const SH = (() => { const r = rng(11), a = []; for (let i = 0; i < 400; i++) { const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); a.push(Math.exp(3.4 + 0.55 * g)); } return a; })();
const SHM = mean(SH), SHm2 = mean(SH.map(v => (v - SHM) ** 2)), SHm3 = mean(SH.map(v => (v - SHM) ** 3)), SHm4 = mean(SH.map(v => (v - SHM) ** 4));
const G1 = SHm3 / SHm2 ** 1.5, G2 = SHm4 / SHm2 ** 2 - 3;
const pctl = (a, p) => { const s = [...a].sort((x, y) => x - y), h = p / 100 * (s.length - 1); return s[Math.floor(h)] + (s[Math.ceil(h)] - s[Math.floor(h)]) * (h - Math.floor(h)); };
function sShape(t) {
  CAP('THE SHAPE OF A DISTRIBUTION · 400 ILLUSTRATIVE ROWS', 64, 124, { color: C.violet });
  const bins = new Array(30).fill(0), lo = 0, hi = 150, bw = (hi - lo) / 30;
  SH.forEach(v => { const b = Math.floor((v - lo) / bw); if (b >= 0 && b < 30) bins[b]++; });
  const mx = Math.max(...bins), X = v => 90 + (v - lo) / (hi - lo) * 760;
  bins.forEach((c, i) => { const u = eo(seg(t, 0.2 + i * 0.03, 0.8 + i * 0.03)); const h = c / mx * 300 * u; R(90 + i * (760 / 30) + 1, 480 - h, 760 / 30 - 2, h, { fill: C.tealS, stroke: C.teal, r: 1, lw: 1 }); });
  Ln([[86, 480], [856, 480]], { stroke: C.rule });
  [0, 50, 100, 150].forEach(v => M(String(v), X(v), 502, { size: 12, align: 'center' }));
  const p90 = pctl(SH, 90);
  A(seg(t, 4.6, 5.0), () => { Ln([[X(p90), 170], [X(p90), 480]], { stroke: C.amber, lw: 2, dash: [5, 4] }); M('AGG_PERCENTILE 90 → ' + p90.toFixed(1), X(p90) + 8, 186, { size: 13, color: C.amber }); });
  [['AGG_SKEWNESS', f2(G1), 'g1: a long right tail is positive'], ['AGG_KURTOSIS', f2(G2), 'excess: a normal curve reads 0']].forEach(([op, v, d], i) => A(seg(t, 1.4 + i * 1.6, 1.8 + i * 1.6), () => {
    const y = 160 + i * 150;
    R(900, y, 316, 130, { fill: C.panel, stroke: C.violet });
    M(op, 920, y + 28, { size: 13, color: C.violet, weight: 600 }); T(v, 920, y + 78, { size: 38, weight: 800 }); M(d, 920, y + 110, { size: 12.5, color: C.muted });
  }));
  A(seg(t, 6.0, 6.4), () => { card(900, 460, 316, 96, C.coral); M('fewer than 2 rows, or no spread', 920, 492, { size: 12.5, color: C.coral }); M('→ 0, not null: check n first', 920, 520, { size: 13, color: C.ink }); M('population formulas, divide by n', 920, 544, { size: 11.5, color: C.muted }); });
}

/* ---------- 9. multi-select ---------- */
const S = [['#1', ['travel', 'tech']], ['#2', ['food']], ['#3', ['travel', 'food']], ['#4', ['tech']], ['#5', null], ['#6', ['sport', 'tech']], ['#7', []], ['#8', ['tech', 'food', 'sport']]];
const LABS = ['travel', 'tech', 'food', 'sport'], LC = { travel: C.teal, tech: C.violet, food: C.amber, sport: C.coral };
function sSets(t) {
  CAP('A MULTI-SELECT FIELD: interests', 64, 124, { color: C.teal });
  S.forEach(([id, s], i) => A(seg(t, 0.2 + i * 0.06, 0.5 + i * 0.06), () => {
    const y = 156 + i * 44;
    M(id, 64, y + 18, { size: 13, color: C.teal });
    if (s == null) { M('null', 120, y + 18, { size: 13, color: C.coral }); return; }
    if (s.length === 0) { R(120, y, 170, 28, { stroke: C.faint, dash: [4, 4], r: 14 }); M('empty: no selection', 132, y + 18, { size: 11.5, color: C.muted }); return; }
    s.forEach((l, j) => { R(120 + j * 96, y, 88, 28, { fill: C.panel2, stroke: LC[l], r: 14 }); M(l, 132 + j * 96, y + 18, { size: 12, color: LC[l] }); });
  }));
  const non = S.filter(r => r[1] != null).map(r => r[1]);
  const freq = LABS.map(l => non.filter(s => s.includes(l)).length);
  A(seg(t, 1.6, 2.0), () => {
    card(460, 150, 380, 220, C.violet);
    M('AGG_SET_FREQUENCY', 480, 178, { size: 12.5, color: C.violet, weight: 600 });
    LABS.forEach((l, i) => { const w = eo(seg(t, 1.9 + i * 0.15, 2.4 + i * 0.15)) * freq[i] * 50; R(560, 198 + i * 38, w, 24, { fill: C.panel2, stroke: LC[l], r: 3 }); M(l, 480, 215 + i * 38, { size: 12.5, color: LC[l] }); M(String(freq[i]), 568 + w, 215 + i * 38, { size: 12.5, color: C.ink }); });
    M('counts add to ' + sum(freq) + ' from ' + non.length + ' rows: that is correct', 480, 360, { size: 11.5, color: C.amber });
  });
  const union = LABS.filter(l => non.some(s => s.includes(l)));
  const card2 = sum(non.map(s => s.length));
  [['AGG_SET_UNION', union.join(' · '), 'picked by anyone'], ['AGG_SET_INTERSECTION', '(none)', 'picked by everyone: one empty row empties it'], ['AGG_SET_CARDINALITY_AVG', f2(card2 / non.length), 'picks per row; empty rows count'], ['AGG_SET_DISTINCT_VALUES', String(new Set(non.map(s => [...s].sort().join('|'))).size), 'distinct exact combinations']].forEach(([op, v, d], i) => A(seg(t, 3.6 + i * 0.5, 4.0 + i * 0.5), () => {
    const x = 870, y = 150 + i * 92;
    R(x, y, 346, 82, { fill: C.panel, stroke: C.violet });
    M(op, x + 14, y + 22, { size: 11.5, color: C.violet, weight: 600 }); T(v, x + 14, y + 50, { size: 17, weight: 700 }); M(d, x + 14, y + 70, { size: 11, color: C.muted });
  }));
  A(seg(t, 6.0, 6.4), () => M('an empty selection is a real answer · only null is skipped', 460, 560, { size: 13, color: C.coral }));
}

/* ---------- 10. merging ---------- */
function sMerge(t) {
  CAP('SHARDS AND STREAMING CHUNKS ARE FOLDED, THEN MERGED', 64, 124, { color: C.teal });
  const lanes = [
    ['MERGEABLE · fixed-size running state', 'count · sum · average · min · max · variance · Welford · CI · ratio · errors · set union', C.teal, 'n=3 Σ=135', 'n=9 Σ=637', 0],
    ['PARTIAL · a map of values, merged at the end', 'distinct counts and sums · mode · mode count · set frequency', C.amber, '{North:2, East:1}', '{North:4, East:3, …}', 2.6],
    ['NONE · needs every value at once', 'median · percentile: buffered, cohort-sized memory', C.coral, '[42 55 38]', 'sort all 9 → 52', 5.2]];
  lanes.forEach(([h, ops, col, part, whole, at], k) => A(seg(t, at, at + 0.4), () => {
    const y = 160 + k * 150;
    CAP(h, 64, y, { color: col }); M(ops, 64, y + 22, { size: 12.5 });
    for (let j = 0; j < 3; j++) {
      const x = 64 + j * 200;
      R(x, y + 40, 180, 70, { fill: C.panel, stroke: C.rule });
      M('chunk ' + (j + 1), x + 12, y + 60, { size: 11.5, color: C.muted });
      const g = seg(t, at + 0.6 + j * 0.2, at + 1.0 + j * 0.2);
      A(g, () => M(j === 0 ? part : '…', x + 12, y + 90, { size: 13, color: col }));
      const m = eio(seg(t, at + 1.4, at + 2.2));
      A(m, () => arrow(x + 180, y + 75, lerp(x + 190, 760, m), y + 75, { stroke: col, head: 6 }));
    }
    A(seg(t, at + 1.8, at + 2.2), () => { R(780, y + 40, 436, 70, { fill: C.panel2, stroke: col, lw: 1.8 }); M('merged', 796, y + 60, { size: 11.5, color: C.muted }); M(whole, 796, y + 92, { size: 15, color: C.ink, weight: 600 }); });
  }));
  A(seg(t, 7.6, 8.0), () => M('the manifest lists each aggregator\'s class · predict flags the buffered ones before you run', 64, 600, { size: 12.5, color: C.amber }));
}

/* ---------- 11. weights ---------- */
function sWeights(t) {
  CAP('WEIGHTS · on the request, on a slot, or Options.DefaultWeight', 64, 124, { color: C.amber });
  const W8 = [1.2, 0.8, 1.0, 1.5, 1.0, 0.9, 1.1, 0.4, 1.3, 0.8];
  P.forEach((r, i) => A(seg(t, 0.2 + i * 0.05, 0.5 + i * 0.05), () => {
    const x = 64 + i * 115, h = W8[i] * 60;
    R(x + 20, 300 - h, 60, h, { fill: C.amberS, stroke: C.amber, r: 3 });
    M('w ' + W8[i].toFixed(1), x + 50, 318, { size: 12, color: C.amber, align: 'center' });
    M(r.spend == null ? 'null' : String(r.spend), x + 50, 340, { size: 13, color: r.spend == null ? C.coral : C.ink, align: 'center' });
  }));
  const L = P.map((r, i) => [r.spend, W8[i]]).filter(p => p[0] != null);
  const sw = sum(L.map(p => p[1])), wm = sum(L.map(p => p[0] * p[1])) / sw;
  [['AGG_COUNT', '9 → Σw ' + f2(sw), 'a count becomes a sum of weights'], ['AGG_AVERAGE', f2(MEAN) + ' → ' + f2(wm), 'Σw·x ÷ Σw'], ['"weight": null', 'opt this slot out', 'unweighted, even with a default']].forEach(([op, v, d], i) => A(seg(t, 1.4 + i * 1.3, 1.8 + i * 1.3), () => {
    const x = 64 + i * 388;
    R(x, 380, 372, 120, { fill: C.panel, stroke: i === 2 ? C.amber : C.violet });
    M(op, x + 18, 408, { size: 13, color: i === 2 ? C.amber : C.violet, weight: 600 }); T(v, x + 18, 448, { size: 22, weight: 700 }); M(d, x + 18, 482, { size: 12.5, color: C.muted });
  }));
  A(seg(t, 5.4, 5.8), () => M('null, negative or non-finite weights are left out and warned: PULSE_WEIGHT_INVALID_ROWS · n and n_null stay raw counts', 64, 548, { size: 12.5, color: C.coral }));
}

/* ---------- 12. components ---------- */
function sComponents(t) {
  CAP('Response.Components.Aggregations · one entry per slot', 64, 124, { color: C.amber });
  const E = [
    ['AGG_SUM_spend', [['n', '9'], ['n_null', '1'], ['sum', '637']]],
    ['AGG_WELFORD_spend', [['n', '9'], ['n_null', '1'], ['mean', f2(MEAN)], ['m2', f2(M2)], ['variance', f2(VAR_S)]]],
    ['AGG_MEDIAN_spend', [['n', '9'], ['n_null', '1'], ['median', '52'], ['position_low', '4'], ['position_high', '4']]]];
  E.forEach(([lab, kv], i) => A(seg(t, 0.3 + i * 0.8, 0.7 + i * 0.8), () => {
    const x = 64 + i * 388;
    R(x, 150, 372, 300, { fill: C.panel, stroke: C.amber });
    M(lab, x + 18, 180, { size: 13, color: C.violet, weight: 600 });
    kv.forEach(([k, v], j) => { const fl = j < 2; if (j === 2) Ln([[x + 18, 182 + j * 40], [x + 354, 182 + j * 40]], { stroke: C.rule }); M(k, x + 18, 210 + j * 40, { size: 13.5, color: fl ? C.teal : C.muted }); M(v, x + 354, 210 + j * 40, { size: 14, color: C.ink, align: 'right', weight: 600 }); });
  }));
  A(seg(t, 3.0, 3.4), () => { M('the floor: n non-null, n_null skipped, on every aggregator', 64, 486, { size: 13, color: C.teal }); M('above it, the pieces the figure was made from', 64, 512, { size: 13, color: C.amber }); });
  A(seg(t, 4.8, 5.2), () => M('opt out with --no-components · the figures themselves never change', 64, 560, { size: 12.5, color: C.muted }));
}

/* ---------- 13. recap ---------- */
const FAM = [
  ['COUNTING', ['AGG_COUNT', 'AGG_NULL_COUNT', 'AGG_DISTINCT_COUNT', 'AGG_FREQUENCY', 'AGG_MODE', 'AGG_MODE_COUNT']],
  ['CENTRE AND SPREAD', ['AGG_SUM', 'AGG_AVERAGE', 'AGG_WEIGHTED_MEAN', 'AGG_MEDIAN', 'AGG_MIN', 'AGG_MAX', 'AGG_RANGE', 'AGG_VARIANCE', 'AGG_STDDEV', 'AGG_WELFORD', 'AGG_DISTINCT_SUM']],
  ['UNCERTAINTY, SHAPE, ACCURACY', ['AGG_CI_LOWER', 'AGG_CI_UPPER', 'AGG_PERCENTILE', 'AGG_SKEWNESS', 'AGG_KURTOSIS', 'AGG_ZSCORE', 'AGG_RATIO', 'AGG_MAE', 'AGG_RMSE', 'AGG_MAPE']],
  ['MULTI-SELECT', ['AGG_SET_FREQUENCY', 'AGG_SET_UNION', 'AGG_SET_INTERSECTION', 'AGG_SET_CARDINALITY_AVG', 'AGG_SET_CARDINALITY_SUM', 'AGG_SET_DISTINCT_VALUES']]];
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('AGGREGATORS TODAY', 64, 124, { color: C.violet });
    let y = 144;
    FAM.forEach(([h, ops], k) => A(seg(t, 0.2 + k * 0.5, 0.6 + k * 0.5), () => {
      M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 });
      y = chips(ops.map(o => [o, C.violet]), 300, y, 916, { size: 12 }) + 12;
    }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 430, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 458, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 482, { size: 14.5 });
      R(650, 430, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 458, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 482, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('AGGREGATORS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('read n beside every figure', 640, 430, { size: 15, align: 'center' });
    M('next: windows', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[4.501, 8.533, 8.789, 5.397, 10.304, 3.627, 6.251, 6.848, 9.109, 6.507, 2.603, 5.333, 2.688, 5.973, 8.256, 9.749, 4.096, 6.699, 6.699, 6.635, 6.592, 4.565, 4.715, 5.675, 6.379, 8.64, 7.957, 2.837, 4.949, 6.229, 4.309, 6.997, 6.741, 7.189, 10.56, 3.691, 8.704, 5.867, 6.869, 5.589, 5.035, 5.845, 6.741, 5.269, 8.32, 3.755, 7.168, 7.765, 3.52, 1.259]/*END*/;
PulseFilm.mount({
  series: 'PULSE · AGGREGATORS',
  narr: NARR,
  scenes: [
    { name: 'Pulse Aggregators', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse aggregators. Many rows in, one figure out, taken apart in depth.', true]] },
    { name: 'Where aggregators run', dur: 8, draw: sWhere, caps: [
      [0, 'Aggregators run fifth, after groups. They fold each group\'s rows into one figure, and they can read fields, features and attribute labels.'],
      [2.4, 'Each aggregation names a type and a field, and optionally a label. Without a label, the output column is the type and the field joined together.'],
      [3.6, 'Without groups you get one row for the whole cohort. With a grouper, you get one row per bucket.'],
      [5.6, 'Leave out the type and Pulse picks one from the field: a sum for numbers, a modal count for categories, set frequency for multi-selects. Dates are never defaulted.', 'Leave out the type and Pulse picks one from the field: a sum for numbers, a modal count for categories, and set frequency for multi-selects. Dates are never defaulted.']] },
    { name: 'Counting', dur: 8, draw: sCount, caps: [
      [0, 'Ten members survived the filters. One of them has no spend.'],
      [0.8, 'Count counts non-null values only, so it says nine, not ten. Null count reports the one it skipped.'],
      [3.4, 'Distinct count counts different values. Frequency counts one value you name, here North, and also gives its share.'],
      [6.0, 'Mode count is the size of the commonest value, and mode is the value itself. On a tie, mode picks the smallest value, not the first one seen.']] },
    { name: 'The centre', dur: 6.8, draw: sCentre, caps: [
      [0, 'Sum and average skip nulls too. The average divides by nine, the values that exist, not by ten.'],
      [1.8, 'Median takes the middle of the sorted values.'],
      [3.0, 'Now watch one big spender. The mean chases the outlier, while the median barely moves.'],
      [5.6, 'Weighted mean averages with a weight on each row.']] },
    { name: 'Spread', dur: 7.2, draw: sSpread, caps: [
      [0, 'Min, max and range describe the edges. One extreme value can stretch the range on its own.'],
      [2.2, 'Variance and standard deviation use the population formula. They divide by n, describing these rows exactly as they are.'],
      [4.4, 'Welford divides by n minus one, the sample formula, and returns the mean, variance and count together. Tests and t-overlays read that triple.', 'Welford divides by n minus one, the sample formula, and returns the mean, the variance and the count together. Tests and t overlays read that triple.'],
      [6.4, 'Same rows, two different variances. Use the one your method expects.']] },
    { name: 'Uncertainty', dur: 6.2, draw: sCI, caps: [
      [0, 'The confidence-interval bounds put a range around the mean: the mean, plus or minus z times the standard error.'],
      [2.6, 'Fewer rows give a wider interval. With a single row there\'s no variance to estimate, so both bounds are null.'],
      [5.2, 'Pulse uses the normal z, not Student\'s t, so very small samples read narrower than a t-interval would.', 'Pulse uses the normal z, not Student\'s t, so very small samples read narrower than a t interval would.']] },
    { name: 'Ratios', dur: 7, draw: sRatio, caps: [
      [0, 'Ratio divides one field\'s sum by another\'s. A row with a null on either side is left out of both sums.'],
      [1.8, 'Because it pools the sums first, bigger rows count for more. That\'s a pooled rate.'],
      [3.8, 'Averaging each row\'s ratio answers a different question, and gives a different number.'],
      [5.6, 'If the denominators sum to zero, the ratio is null. It is never an error and never zero.']] },
    { name: 'Accuracy', dur: 7, draw: sAccuracy, caps: [
      [0, 'Accuracy aggregators compare an actual field with a prediction field, often a regression prediction attribute.'],
      [2.6, 'Mean absolute error is the average miss, in the field\'s own units. Root mean squared error squares the misses first, so big ones dominate.'],
      [4.6, 'Mean absolute percentage error is a fraction, so point zero five means five percent. Rows missing either side are skipped.']] },
    { name: 'Shape', dur: 7, draw: sShape, caps: [
      [0, 'Shape aggregators describe how values spread out.'],
      [1.4, 'Skewness is positive when a long tail stretches to the right, like most spending data.'],
      [3.0, 'Kurtosis is excess kurtosis, so a normal curve reads zero. Both use population moments.'],
      [4.6, 'Percentile cuts the sorted values at any point you choose, here the ninetieth.'],
      [6.0, 'With fewer than two rows, or no spread at all, skewness and kurtosis return zero, not null, so check n first.']] },
    { name: 'Multi-select', dur: 7, draw: sSets, caps: [
      [0, 'Multi-select fields have their own aggregators. One member skipped the question, and one answered but picked nothing.'],
      [1.6, 'Set frequency counts each option. A row can count toward several options, so the counts add up to more than the rows.'],
      [3.6, 'Union is what anyone picked. Intersection is what everyone picked, so one empty answer empties it. Cardinality and distinct values count picks and combinations.'],
      [6.0, 'An empty selection is a real answer. Only null is skipped.']] },
    { name: 'How they merge', dur: 8.4, draw: sMerge, caps: [
      [0, 'Shards and streaming chunks are folded separately, then merged. Most aggregators keep a small, fixed running state, so merging is instant.'],
      [2.6, 'Partial aggregators keep a map of values, such as distinct counts and modes, and merge it at the end.'],
      [5.2, 'Median and percentile need every value at once. They buffer the rows and sort, so memory grows with the cohort.'],
      [7.6, 'The manifest lists each aggregator\'s class, and predict flags the buffered ones before you run.']] },
    { name: 'Weights', dur: 6.4, draw: sWeights, caps: [
      [0, 'Rows can carry weights, set on the request, on one slot, or as an instance default.'],
      [1.4, 'A weighted count becomes a sum of weights, and a weighted average is the weighted sum over the sum of weights.'],
      [4.0, 'Setting weight to null opts one slot out. Invalid weights are left out with a warning, and n stays a raw count.']] },
    { name: 'Components', dur: 6, draw: sComponents, caps: [
      [0, 'Every aggregation also reports its components: the pieces its figure was made from.'],
      [3.0, 'Every one starts with the same floor: n, the values used, and n null, the values skipped. Above it are the operator\'s own parts.', 'Every one starts with the same floor: n, the values used, and n null, the values skipped. Above it are the aggregator\'s own parts.'],
      [4.8, 'You can switch components off. The figures themselves never change.']] },
    { name: 'The aggregator toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the aggregator toolkit today: counting, centre and spread, uncertainty, shape, accuracy and multi-select.'],
      [3.4, 'More aggregators are added over time, and embedders can register their own. The manifest always shows what your instance offers.'],
      [6.4, 'Remember: read n beside every figure. Next up, windows.'],
      [9.0, '', 'Pulse aggregators.', true]] },
  ],
});
})();
