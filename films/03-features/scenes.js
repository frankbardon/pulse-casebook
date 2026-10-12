/* Pulse Features: film 3 of the Pulse Anatomy series. No operator count is stated anywhere:
 * Pulse adds feature operators over time, and the instance manifest is the authority. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, arrow, rng, chips, measure } = PulseFilm.h;
const ctx = () => PulseFilm.ctx;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const gaussOf = r => () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

/* ---------- 0. title ---------- */
function sTitle(t) {
  // a column of values, then new columns sprouting to its right
  for (let c = 0; c < 4; c++) for (let i = 0; i < 6; i++) {
    const u = eo(seg(t, 0.2 + c * 0.25 + i * 0.04, 0.7 + c * 0.25 + i * 0.04));
    A(u, () => R(lerp(500, 500 + c * 66, u), 336 + i * 18, 58, 13, { fill: c ? C.violetS : C.tealS, stroke: c ? C.violet : C.teal, r: 2, lw: 1 }));
  }
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 290, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('FEATURES', 640, 500, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 2.0, 2.8), () => T('The first stage of every request, in depth', 640, 548, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where features run ---------- */
const SPINE = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
function sWhere(t) {
  SPINE.forEach((n, i) => {
    const x = 64 + i * 164, on = i === 0;
    A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08) * (on ? 1 : 0.55), () => {
      R(x, 110, 150, 52, { fill: on ? C.violetS : C.panel, stroke: on ? C.violet : C.rule, lw: on ? 2 : 1.2 });
      T(n, x + 14, 142, { size: 15.5, weight: 600, color: on ? C.ink : C.muted });
      if (i < 6) arrow(x + 150, 136, x + 162, 136, { stroke: C.faint, head: 6 });
    });
  });
  A(seg(t, 0.8, 1.2), () => M('runs first · sees every record, before any filter', 64, 186, { size: 12.5, color: C.violet }));
  // request snippet
  A(seg(t, 1.6, 2.0), () => {
    card(64, 216, 560, 236, C.violet);
    const L = [['"features": [', C.muted], ['  { "type": "FEAT_LOG", "field": "income" },', C.ink], ['  { "type": "FEAT_BUCKETIZE",', C.ink], ['    "field": "LOG_income",', C.amber], ['    "label": "income_band",', C.ink], ['    "params": { "quantiles": 4 } }', C.ink], [']', C.muted]];
    L.forEach(([s, c], i) => A(seg(t, 1.8 + i * 0.12, 2.1 + i * 0.12), () => M(s, 86, 252 + i * 28, { size: 14, color: c })));
  });
  // chaining arrow + outputs
  A(seg(t, 3.2, 3.6), () => {
    arrow(420, 254, 330, 330, { stroke: C.amber, lw: 1.4, head: 7 });
    M('default label LOG_<field>', 604, 440, { size: 12, color: C.amber, align: 'right' });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(680, 216, 536, 236);
    CAP('NEW COLUMNS · READABLE BY EVERY LATER STAGE', 702, 246);
    [['LOG_income', C.violet], ['income_band', C.violet]].forEach(([s, c], i) => { R(702 + i * 160, 264, 148, 34, { fill: C.violetS, stroke: c, r: 17 }); M(s, 776 + i * 160, 286, { size: 13, color: c, align: 'center' }); });
    [['filterers', 'FILTER_INCLUDE income_band ∈ {3}'], ['groups', 'GROUP_CATEGORY income_band'], ['every later stage', 'reads them like any field']].forEach(([a, b], i) => A(seg(t, 4.0 + i * 0.35, 4.3 + i * 0.35), () => {
      arrow(712, 330 + i * 38, 740, 330 + i * 38, { stroke: C.teal, head: 6 }); M(a, 752, 334 + i * 38, { size: 13, color: C.ink }); M(b, 1196, 334 + i * 38, { size: 12, align: 'right' });
    }));
  });
  A(seg(t, 6.2, 6.6), () => {
    R(64, 478, 1152, 56, { fill: C.panel2, stroke: C.rule });
    T('A growing set of operators, and embedders can register their own. The manifest lists what your instance offers.', 86, 512, { size: 15 });
  });
}

/* ---------- 2. cost classes ---------- */
function lane(t, y, label, sub, color, phases) {
  CAP(label, 64, y - 72, { color }); M(sub, 64, y - 50, { size: 12.5 });
  Ln([[64, y], [1216, y]], { stroke: C.rule, lw: 1.5 });
}
function laneBox(y, color, label) {
  R(560, y - 34, 160, 68, { fill: C.panel, stroke: color, lw: 1.6 });
  T(label, 640, y - 6, { size: 14, weight: 600, align: 'center' });
}
function sCost(t) {
  // per-row lane
  const Y1 = 230, Y2 = 440;
  lane(t, Y1, 'PER-ROW · ONE PASS', 'log · sqrt · one-hot · date features · poly · bucketize with boundaries', C.teal);
  for (let i = 0; i < 14; i++) {
    const s = 0.4 + i * 0.5, x = 80 + (t - s) * 260; if (t < s || x > 1210) continue;
    const tagged = x > 640;
    R(x - 14, Y1 - 12, 28, 24, { fill: C.tealS, stroke: C.teal, r: 3 });
    if (tagged) R(x + 16, Y1 - 12, 12, 24, { fill: C.violet, r: 2 });
  }
  laneBox(Y1, C.teal, 'emit now');
  // global-pass lane: sweep, rewind, emit
  lane(t, Y2, 'GLOBAL-PASS · SWEEP, REWIND, EMIT', 'frequency encode · target encode · train/test split · bucketize by quantiles', C.amber);
  const sweep = i => 1.2 + i * 0.22, emit = i => 5.6 + i * 0.22;
  let learned = 0;
  for (let i = 0; i < 14; i++) {
    const x1 = 80 + (t - sweep(i)) * 300;
    if (t >= sweep(i) && x1 < 640) R(x1 - 14, Y2 - 12, 28, 24, { fill: C.tealS, stroke: C.teal, r: 3 });
    if (x1 >= 640) learned++;
    const x2 = 80 + (t - emit(i)) * 300;
    if (t >= emit(i) && x2 < 1210) { R(x2 - 14, Y2 - 12, 28, 24, { fill: C.tealS, stroke: C.teal, r: 3 }); if (x2 > 640) R(x2 + 16, Y2 - 12, 12, 24, { fill: C.violet, r: 2 }); }
  }
  // state bars inside the box
  laneBox(Y2, C.amber, t < 4.9 ? 'learn' : 'emit');
  for (let k = 0; k < 5; k++) { const h = Math.min(learned, 14) * [1.6, 2.2, 1.1, 2.6, 1.4][k] * 0.9; R(580 + k * 26, Y2 + 30 - h, 16, h, { fill: C.amber, r: 1 }); }
  A(seg(t, 4.9, 5.3) * (1 - seg(t, 6.2, 6.6)), () => { ctx().beginPath(); ctx().arc(360, Y2 + 44, 24, Math.PI * 0.15, Math.PI * 1.15, true); ctx().strokeStyle = C.amber; ctx().lineWidth = 2; ctx().stroke(); M('rewind', 396, Y2 + 50, { size: 12.5, color: C.amber, align: 'center' }); });
  A(seg(t, 7.2, 7.6), () => { R(64, 528, 1152, 50, { fill: C.panel2, stroke: C.rule }); T('Both classes can stream: a global pass rewinds the iterator, so a file-backed cohort is read twice.', 86, 559, { size: 15 }); });
}

/* ---------- 3. taming skew ---------- */
const SK = (() => {
  const r = rng(31), g = gaussOf(r), xs = Array.from({ length: 600 }, () => Math.exp(Math.log(48) + 0.75 * g()));
  const hist = f => { const v = xs.map(f), lo = Math.min(...v), hi = Math.max(...v), b = new Array(26).fill(0); v.forEach(x => b[Math.min(25, Math.floor((x - lo) / (hi - lo) * 26))]++); const m = Math.max(...b); return { b: b.map(x => x / m), lo, hi }; };
  const skew = f => { const v = xs.map(f), n = v.length, m = v.reduce((a, b) => a + b, 0) / n, s2 = v.reduce((a, b) => a + (b - m) ** 2, 0) / n; return v.reduce((a, b) => a + (b - m) ** 3, 0) / n / Math.pow(s2, 1.5); };
  return { raw: hist(x => x), sqrt: hist(Math.sqrt), log: hist(Math.log1p), sRaw: skew(x => x), sSqrt: skew(Math.sqrt), sLog: skew(Math.log1p) };
})();
function sSkew(t) {
  const u1 = eio(seg(t, 3.6, 4.6)), u2 = eio(seg(t, 6.1, 7.1));
  const X = 80, Y = 520, BW = 22, HMAX = 300;
  const grow = eo(seg(t, 0.4, 1.6));
  for (let k = 0; k < 26; k++) {
    const h = lerp(lerp(SK.raw.b[k], SK.sqrt.b[k], u1), SK.log.b[k], u2) * HMAX * grow;
    R(X + k * BW, Y - h, BW - 3, h, { fill: u2 > 0.5 ? C.violetS : u1 > 0.5 ? C.amberS : C.tealS, stroke: u2 > 0.5 ? C.violet : u1 > 0.5 ? C.amber : C.teal, r: 2, lw: 1 });
  }
  Ln([[X - 6, Y], [X + 26 * BW, Y]], { stroke: C.rule });
  const name = u2 > 0.5 ? 'LOG_income = log1p(income)' : u1 > 0.5 ? 'SQRT_income = sqrt(income)' : 'income (raw)';
  const sk = u2 > 0.5 ? SK.sLog : u1 > 0.5 ? SK.sSqrt : SK.sRaw;
  M(name, X, 160, { size: 15, color: C.ink }); M('skewness ' + sk.toFixed(2), X + 26 * BW, 160, { size: 15, align: 'right', color: u2 > 0.5 ? C.violet : u1 > 0.5 ? C.amber : C.teal });
  A(seg(t, 3.4, 3.8), () => {
    card(720, 150, 496, 150, C.amber);
    M('FEAT_SQRT', 742, 182, { size: 14, color: C.amber, weight: 600 }); M('sqrt(x)', 850, 182, { size: 14, color: C.ink });
    M('gentler: good for moderate skew, like counts', 742, 214, { size: 12.5 });
    M('x < 0      →  null, not an error', 742, 242, { size: 13, color: C.ink }); M('null in     →  null out', 742, 268, { size: 13, color: C.ink });
  });
  A(seg(t, 5.9, 6.3), () => {
    card(720, 320, 496, 178, C.violet);
    M('FEAT_LOG', 742, 352, { size: 14, color: C.violet, weight: 600 }); M('log1p(x) = ln(1 + x)', 850, 352, { size: 14, color: C.ink });
    M('stronger: the standard skew-tamer', 742, 384, { size: 12.5 });
    M('x = 0      →  0, not −∞', 742, 414, { size: 13, color: C.ink }); M('x ≤ −1     →  null, the rest keeps going', 742, 440, { size: 13, color: C.ink });
    M('decimal128 is read as an f64 approximation', 742, 470, { size: 12 });
  });
}

/* ---------- 4. bucketize ---------- */
const BND = [18, 35, 50, 65];
const bk = v => { let i = 0; while (i < BND.length && v > BND[i]) i++; return i; };
const QS = (() => { const r = rng(9), g = gaussOf(r); const v = Array.from({ length: 40 }, () => Math.max(1, Math.exp(3.2 + 0.55 * g()))).sort((a, b) => a - b); const cuts = [v[9], v[19], v[29]]; return { v, cuts }; })();
const BCOL = [C.teal, C.amber, C.violet, C.coral, C.ink];
function sBucket(t) {
  const X0 = 100, X1 = 1180, ax = a => lerp(X0, X1, a / 80);
  CAP('FEAT_BUCKETIZE age · params.boundaries [18, 35, 50, 65]', 64, 130, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => { Ln([[X0, 240], [X1, 240]], { stroke: C.rule, lw: 2 }); [0, 20, 40, 60, 80].forEach(a => M(String(a), ax(a), 266, { size: 11.5, align: 'center' })); });
  BND.forEach((b, i) => A(seg(t, 0.6 + i * 0.2, 0.9 + i * 0.2), () => { Ln([[ax(b), 196], [ax(b), 250]], { stroke: C.violet, lw: 2 }); M(String(b), ax(b), 188, { size: 12.5, color: C.violet, align: 'center' }); }));
  [0, 1, 2, 3, 4].forEach(i => A(seg(t, 1.4 + i * 0.12, 1.7 + i * 0.12), () => { const a = i ? BND[i - 1] : 0, b = i < 4 ? BND[i] : 80; M('bucket ' + i, ax((a + b) / 2), 222, { size: 12.5, align: 'center', color: BCOL[i] }); }));
  const VALS = [12, 18, 27, 35, 44, 50.5, 61, 72];
  VALS.forEach((v, i) => A(seg(t, 2.0 + i * 0.12, 2.3 + i * 0.12), () => { dot(ax(v), 240, 7, BCOL[bk(v)]); }));
  A(seg(t, 3.2, 3.6), () => {
    Ln([[ax(18), 254], [ax(18), 300]], { stroke: C.amber, dash: [3, 3] });
    R(ax(18) - 120, 300, 300, 50, { fill: C.amberS, stroke: C.amber });
    M('18 sits on a cut point → bucket 0', ax(18) - 104, 330, { size: 13, color: C.ink });
    card(760, 296, 456, 58);
    M('output: the bucket INDEX · label BUCKET_<field>', 780, 320, { size: 12.5, color: C.ink }); M('null in → null bucket', 780, 342, { size: 12.5 });
  });
  // quantiles
  A(seg(t, 6.0, 6.4), () => CAP('params.quantiles 4 · equal-population buckets · global pass', 64, 410, { color: C.amber }));
  const qx = v => lerp(X0, X1, Math.min(v, 90) / 90);
  QS.v.forEach((v, i) => { const q = v <= QS.cuts[0] ? 0 : v <= QS.cuts[1] ? 1 : v <= QS.cuts[2] ? 2 : 3; A(seg(t, 6.3 + i * 0.02, 6.6 + i * 0.02), () => dot(qx(v), 480 + (i % 3) * 12 - 12, 5.5, t > 7.6 ? BCOL[q] : C.muted)); });
  QS.cuts.forEach((c, i) => A(seg(t, 7.0 + i * 0.2, 7.3 + i * 0.2), () => { Ln([[qx(c), 448], [qx(c), 508]], { stroke: C.amber, lw: 2 }); }));
  A(seg(t, 7.8, 8.2), () => { M('10 records per bucket · cut points learned from the data', X0, 540, { size: 12.5, color: C.ink }); M('boundaries XOR quantiles', X1, 540, { size: 12.5, align: 'right', color: C.coral }); });
}

/* ---------- 5. categories ---------- */
const CATROWS = ['North', 'South', 'East', null, 'West', 'North'];
const DICT = ['North', 'South', 'East', 'West', 'Central'];
const FREQ = { North: 30, South: 25, East: 25, West: 20, Central: 0 };
function sCategories(t) {
  CAP('FEAT_ONE_HOT region', 64, 130, { color: C.violet });
  T('region', 64, 170, { size: 14, weight: 600 }); Ln([[64, 182], [580, 182]]);
  CATROWS.forEach((c, i) => M(c == null ? 'null' : c, 64, 212 + i * 34, { size: 14, color: c == null ? C.coral : C.ink }));
  DICT.forEach((d, j) => {
    const x = 150 + j * 92;
    A(seg(t, 0.8 + j * 0.2, 1.1 + j * 0.2), () => { M('region_' + d, x, 170, { size: 10.5, color: d === 'Central' ? C.amber : C.violet }); });
    CATROWS.forEach((c, i) => A(seg(t, 1.2 + j * 0.2 + i * 0.06, 1.5 + j * 0.2 + i * 0.06), () => { const on = c === d; R(x, 194 + i * 34, 70, 26, { fill: on ? C.violetS : C.panel, stroke: on ? C.violet : C.rule, r: 3 }); M(on ? '1' : '0', x + 35, 212 + i * 34, { size: 13.5, color: on ? C.violet : C.faint, align: 'center' }); }));
  });
  A(seg(t, 3.4, 3.8), () => {
    R(150 + 4 * 92 - 4, 156, 80, 252, { stroke: C.amber, lw: 1.6, dash: [4, 4] });
    M('in the dictionary, no records', 150 + 4 * 92 + 36, 432, { size: 11.5, color: C.amber, align: 'center' });
    R(144, 194 + 3 * 34 - 4, 450, 34, { stroke: C.coral, lw: 1.6, dash: [4, 4] });
    M('null → all zeros', 150, 460, { size: 12.5, color: C.coral });
    M('"New York" → region_New_York', 150, 486, { size: 12.5 });
  });
  // frequency
  A(seg(t, 6.0, 6.4), () => {
    CAP('FEAT_FREQUENCY_ENCODE region', 680, 130, { color: C.amber }); M('count ÷ non-null total, over the whole cohort', 680, 152, { size: 12.5 });
    const tot = 100;
    ['North', 'South', 'East', 'West'].forEach((c, i) => {
      const y = 180 + i * 52, w = FREQ[c] / tot * 900 * eo(seg(t, 6.3 + i * 0.15, 7.0 + i * 0.15));
      T(c, 680, y + 22, { size: 14 }); R(760, y, w, 30, { fill: C.amberS, stroke: C.amber, r: 3 });
      A(seg(t, 7.0 + i * 0.15, 7.3 + i * 0.15), () => { M(FREQ[c] + ' of 100', 760 + w + 10, y + 20, { size: 12.5 }); M((FREQ[c] / tot).toFixed(2), 1216, y + 20, { size: 15, color: C.amber, align: 'right', weight: 600 }); });
    });
    A(seg(t, 7.8, 8.2), () => { M('FREQ_region · values in (0, 1] · null row → null', 680, 400, { size: 12.5, color: C.ink }); M('counted before filters: shares of the whole cohort', 680, 424, { size: 12.5 }); });
  });
}

/* ---------- 6. target encoding ---------- */
const TE = [['Nurse', 40, 0.32], ['Engineer', 55, 0.18], ['Teacher', 30, 0.25], ['Artist', 4, 0.75], ['Pilot', 2, 0.0]];
const GM = TE.reduce((a, [, n, m]) => a + n * m, 0) / TE.reduce((a, [, n]) => a + n, 0);
function sTarget(t) {
  CAP('FEAT_TARGET_ENCODE occupation · params.target churned · params.smoothing s', 64, 130, { color: C.violet });
  const s = 10 * eio(seg(t, 3.4, 5.6));
  const X = 220, W = 560, sx = v => X + v * W;
  A(seg(t, 0.4, 0.8), () => { Ln([[sx(GM), 156], [sx(GM), 446]], { stroke: C.amber, dash: [4, 4], lw: 1.5 }); M('cohort mean ' + GM.toFixed(3), sx(GM) + 6, 156, { size: 12, color: C.amber }); });
  TE.forEach(([name, n, m], i) => {
    const y = 190 + i * 54; const enc = (n * m + s * GM) / (n + s);
    A(seg(t, 0.6 + i * 0.15, 0.9 + i * 0.15), () => {
      T(name, 64, y + 6, { size: 15 }); M('n ' + n, 160, y + 6, { size: 12.5 });
      Ln([[X, y], [X + W, y]], { stroke: C.rule });
      dot(sx(m), y, 5, C.faint);
      if (s > 0.05) Ln([[sx(m), y], [sx(enc), y]], { stroke: C.violet, lw: 2 });
      dot(sx(enc), y, 8, C.violet);
      M(enc.toFixed(3), X + W + 24, y + 5, { size: 14, color: C.ink });
    });
  });
  M('s = ' + s.toFixed(1), X + W + 24, 166, { size: 13, color: C.violet });
  A(seg(t, 2.8, 3.2), () => { card(64, 470, 760, 52); M('encoded = (n · mean_cat + s · mean_global) / (n + s)', 86, 502, { size: 14.5, color: C.ink }); });
  A(seg(t, 6.6, 7.0), () => {
    R(880, 150, 336, 372, { fill: C.coralS, stroke: C.coral, lw: 1.6 });
    M('PULSE_FEAT_TARGET_LEAKAGE_RISK', 900, 182, { size: 13, color: C.coral, weight: 600 });
    ['Every encoded mean uses every', 'record\'s target: test rows and', 'the record\'s own included.', '', 'Fires on every target encoder.', 'An error under --strict.'].forEach((l, i) => T(l, 900, 220 + i * 26, { size: 14.5 }));
  });
  A(seg(t, 9.0, 9.4), () => {
    Ln([[900, 384], [1196, 384]], { stroke: C.coral });
    ['A prior split does not silence it.', 'Train-only means: average the', 'target by category on split = 0', 'in a separate request; map back.'].forEach((l, i) => T(l, 900, 412 + i * 26, { size: 14, color: i ? C.ink : C.coral }));
  });
}

/* ---------- 7. dates ---------- */
function sDates(t) {
  CAP('FEAT_DATE_FEATURES signup', 64, 130, { color: C.violet });
  A(seg(t, 0.3, 0.7), () => { R(64, 160, 300, 64, { fill: C.panel2, stroke: C.amber }); M('signup · date', 84, 184, { size: 12, color: C.amber }); M('2024-03-14', 84, 210, { size: 18, color: C.ink }); });
  const parts = [['signup_year', '2024'], ['signup_month', '3'], ['signup_day', '14'], ['signup_dow', '4'], ['signup_quarter', '1']];
  parts.forEach(([k, v], i) => {
    const u = eo(seg(t, 0.9 + i * 0.25, 1.5 + i * 0.25));
    A(u, () => { const x = lerp(220, 420 + i * 160, u), y = lerp(192, 192, u); R(x, y - 32, 148, 64, { fill: C.violetS, stroke: C.violet }); M(k, x + 12, y - 10, { size: 11.5, color: C.violet }); M(v, x + 12, y + 18, { size: 18, color: C.ink }); });
  });
  A(seg(t, 3.0, 3.4), () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach((d, i) => { const on = i === 4; R(420 + i * 72, 260, 64, 46, { fill: on ? C.violetS : C.panel, stroke: on ? C.violet : C.rule }); M(String(i), 452 + i * 72, 280, { size: 13, align: 'center', color: on ? C.violet : C.muted }); M(d, 452 + i * 72, 298, { size: 12, align: 'center', color: on ? C.ink : C.faint }); });
    M('dow counts from 0 = Sunday, not ISO', 420, 330, { size: 12.5 });
  });
  // zones
  A(seg(t, 5.4, 5.8), () => {
    CAP('A DATETIME IS READ ON THE LOCAL CLOCK', 64, 386, { color: C.amber });
    R(64, 404, 380, 112, { fill: C.panel2, stroke: C.amber });
    M('event · datetime', 84, 430, { size: 12, color: C.amber }); M('2024-03-15T02:30:00Z', 84, 458, { size: 17, color: C.ink }); M('tz America/New_York (UTC−4 in March)', 84, 488, { size: 12.5 });
    arrow(452, 460, 500, 460, { stroke: C.amber, head: 7 });
    [['event_year', '2024'], ['event_month', '3'], ['event_day', '14'], ['event_dow', '4'], ['event_quarter', '1'], ['event_hour', '22']].forEach(([k, v], i) => A(seg(t, 5.8 + i * 0.12, 6.1 + i * 0.12), () => { const x = 512 + i * 118; R(x, 428, 110, 64, { fill: C.violetS, stroke: k.endsWith('day') || k.endsWith('hour') ? C.amber : C.violet }); M(k, x + 10, 450, { size: 11, color: C.violet }); M(v, x + 10, 478, { size: 17, color: C.ink }); }));
    A(seg(t, 6.8, 7.2), () => M('the hour column exists only for datetime · a plain date ignores zones', 512, 520, { size: 12.5 }));
  });
}

/* ---------- 8. polynomial ---------- */
const PY = (() => { const r = rng(4), g = gaussOf(r); const pts = Array.from({ length: 46 }, () => { const x = r() * 10; return [x, 2 + 2.1 * x - 0.19 * x * x + 0.6 * g()]; });
  const fit = cols => { // least squares via normal equations, small p
    const p = cols.length, A2 = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
    pts.forEach(([x, y]) => { const f = cols.map(c => c(x)); for (let i = 0; i < p; i++) { b[i] += f[i] * y; for (let j = 0; j < p; j++) A2[i][j] += f[i] * f[j]; } });
    for (let i = 0; i < p; i++) { const piv = A2[i][i]; for (let j = i + 1; j < p; j++) { const k = A2[j][i] / piv; for (let c = i; c < p; c++) A2[j][c] -= k * A2[i][c]; b[j] -= k * b[i]; } }
    const w = new Array(p).fill(0); for (let i = p - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < p; j++) s -= A2[i][j] * w[j]; w[i] = s / A2[i][i]; } return w; };
  return { pts, lin: fit([() => 1, x => x]), quad: fit([() => 1, x => x, x => x * x]) }; })();
function sPoly(t) {
  CAP('FEAT_POLY x · params.degree 3', 64, 130, { color: C.violet });
  const cols = [['x', x => x.toFixed(1), C.ink], ['x_poly_2', x => (x * x).toFixed(1), C.violet], ['x_poly_3', x => (x ** 3).toFixed(0), C.violet]];
  cols.forEach(([h, f, c], j) => A(seg(t, 0.3 + j * 0.5, 0.6 + j * 0.5), () => { T(h, 64 + j * 120, 170, { size: 14, weight: 600, color: c }); [1.5, 3.0, 4.2, 6.8, 9.1].forEach((x, i) => M(f(x), 64 + j * 120, 206 + i * 30, { size: 14, color: j ? C.violet : C.ink })); }));
  A(seg(t, 1.8, 2.2), () => M('original column untouched · degree 2 to 10', 64, 370, { size: 12.5 }));
  const X = 480, Y = 470, sx = x => X + x / 10 * 700, sy = y => Y - (y - 0) / 9 * 300;
  A(seg(t, 2.4, 2.8), () => { Ln([[X, Y], [X + 720, Y]]); Ln([[X, Y], [X, Y - 310]]); });
  PY.pts.forEach((p, i) => A(seg(t, 2.6 + i * 0.02, 2.9 + i * 0.02), () => dot(sx(p[0]), sy(p[1]), 4, C.teal)));
  const u1 = eo(seg(t, 3.6, 4.4)), u2 = eo(seg(t, 4.8, 5.8));
  if (u1 > 0) A(1 - 0.6 * u2, () => Ln([[sx(0), sy(PY.lin[0])], [sx(10 * u1), sy(PY.lin[0] + PY.lin[1] * 10 * u1)]], { stroke: C.muted, lw: 2, dash: [6, 5] }));
  if (u2 > 0) { const pts = []; for (let k = 0; k <= 60 * u2; k++) { const x = k / 6; pts.push([sx(x), sy(PY.quad[0] + PY.quad[1] * x + PY.quad[2] * x * x)]); } if (pts.length > 1) Ln(pts, { stroke: C.violet, lw: 2.5 }); }
  A(seg(t, 4.4, 4.8), () => M('straight line on x', X + 712, Y - 42, { size: 12.5, align: 'right' }));
  A(seg(t, 5.8, 6.2), () => M('linear regression on x and x_poly_2 follows the curve', X + 712, Y - 18, { size: 12.5, align: 'right', color: C.violet }));
  A(seg(t, 6.6, 7.0), () => { R(64, 400, 380, 120, { fill: C.coralS, stroke: C.coral }); M('overflow', 84, 428, { size: 12.5, color: C.coral, weight: 600 }); M('100^10 = 1e20', 84, 460, { size: 20, color: C.ink }); M('standardise the column first', 84, 494, { size: 13 }); });
}

/* ---------- 9. train / test split ---------- */
const SPLIT = (() => { const N = 60, cls = Array.from({ length: N }, (_, i) => (i * 7) % 10 < 7 ? 0 : 1);
  const lab = new Array(N); [0, 1].forEach(c => { const idx = cls.map((v, i) => v === c ? i : -1).filter(i => i >= 0); const r = rng(42 + c * 7919); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const n = idx.length, a = Math.round(n * 0.7), b = Math.round(n * 0.85); idx.forEach((ri, k) => lab[ri] = k < a ? 0 : k < b ? 1 : 2); });
  return { cls, lab }; })();
const SC = [C.teal, C.amber, C.violet];
function sSplit(t) {
  CAP('FEAT_TRAIN_TEST_SPLIT · ratios [0.7, 0.15, 0.15] · seed 42 · stratify plan', 64, 130, { color: C.violet });
  const gx = i => 64 + (i % 12) * 50, gy = i => 166 + Math.floor(i / 12) * 50;
  SPLIT.cls.forEach((c, i) => {
    const asg = t >= 1.6 + (i % 12) * 0.06 + Math.floor(i / 12) * 0.12;
    A(seg(t, 0.2 + i * 0.01, 0.5 + i * 0.01), () => {
      R(gx(i), gy(i), 40, 40, { fill: asg ? (SPLIT.lab[i] === 0 ? C.tealS : SPLIT.lab[i] === 1 ? C.amberS : C.violetS) : C.panel, stroke: asg ? SC[SPLIT.lab[i]] : C.rule, r: c ? 20 : 4 });
      if (asg) M(String(SPLIT.lab[i]), gx(i) + 20, gy(i) + 25, { size: 13, color: SC[SPLIT.lab[i]], align: 'center' });
    });
  });
  A(seg(t, 0.6, 1.0), () => { R(64, 434, 16, 16, { fill: C.panel, stroke: C.muted, r: 3 }); M('plan Basic (70%)', 88, 447, { size: 12.5 }); R(240, 434, 16, 16, { fill: C.panel, stroke: C.muted, r: 8 }); M('plan Pro (30%)', 264, 447, { size: 12.5 }); });
  A(seg(t, 3.0, 3.4), () => {
    card(700, 160, 516, 200);
    [['0', 'train', C.teal], ['1', 'validation', C.amber], ['2', 'test', C.violet]].forEach(([k, n, c], i) => {
      const y = 196 + i * 52; const all = SPLIT.lab.filter(v => v === +k).length;
      const basic = SPLIT.lab.filter((v, j) => v === +k && SPLIT.cls[j] === 0).length;
      M(k, 722, y, { size: 18, color: c, weight: 600 }); T(n, 752, y, { size: 15 });
      M(`${all} records`, 900, y, { size: 13.5, color: C.ink }); M(`Basic ${basic} · Pro ${all - basic}`, 1196, y, { size: 13, align: 'right' });
    });
    M('each class split in the same proportions', 722, 346, { size: 12.5, color: C.violet });
  });
  A(seg(t, 5.8, 6.2), () => {
    card(700, 380, 516, 140);
    M('same seed + same rows in the same order', 722, 410, { size: 13.5, color: C.ink }); M('→ the same split, every run', 722, 434, { size: 13.5, color: C.teal });
    M('downstream: FILTER_INCLUDE split ∈ {0} keeps train', 722, 468, { size: 12.5 }); M('holds an assignment table: O(rows) memory', 722, 494, { size: 12.5 });
  });
}

/* ---------- 10. a full pipeline ---------- */
const PIPE = [['FEAT_TRAIN_TEST_SPLIT', 'ratios [0.8, 0.2] · seed 42', ['split']],
  ['FEAT_LOG income', 'label log_income', ['log_income']],
  ['FEAT_BUCKETIZE log_income', 'quantiles 10', ['log_income_decile']],
  ['FEAT_ONE_HOT region', '', ['region_North', 'region_South', '…']],
  ['FEAT_DATE_FEATURES signup_date', '', ['signup_date_year', '… _quarter']],
  ['FEAT_TARGET_ENCODE occupation', 'target label · smoothing 10', ['occupation_target_rate']]];
function sPipeline(t) {
  CAP('features · in declared order', 64, 130, { color: C.violet });
  PIPE.forEach(([op, p, out], i) => {
    const y = 150 + i * 62, a = seg(t, 0.3 + i * 0.45, 0.6 + i * 0.45);
    A(a, () => {
      R(64, y, 470, 50, { fill: C.panel, stroke: i === 5 && t > 7.6 ? C.coral : C.violet });
      M(op, 82, y + 22, { size: 13.5, color: C.ink, weight: 600 }); M(p, 82, y + 40, { size: 11.5 });
      if (i < 5) arrow(110, y + 50, 110, y + 62, { stroke: C.faint, head: 5 });
      let x = 560; out.forEach(o => { const w = measure(o, { font: PulseFilm.MONO, size: 12 }) + 20; R(x, y + 11, w, 28, { fill: C.violetS, stroke: C.violet, r: 14 }); M(o, x + 10, y + 30, { size: 12, color: C.violet }); x += w + 8; });
    });
  });
  A(seg(t, 4.0, 4.4), () => { arrow(560 + 50, 150 + 62 + 11, 300, 150 + 2 * 62 + 4, { stroke: C.amber, head: 6, lw: 1.2 }); M('reads the column the previous feature made', 1216, 216, { size: 12, color: C.amber, align: 'right' }); });
  A(seg(t, 5.0, 5.4), () => {
    R(64, 532, 1152, 46, { fill: C.panel2, stroke: C.rule });
    M('then  FILTER_INCLUDE split ∈ {0}  →  GROUP_CATEGORY log_income_decile  →  AGG_AVERAGE label', 86, 561, { size: 13.5, color: C.ink });
  });
  A(seg(t, 7.6, 8.0), () => {
    R(1000, 470, 216, 50, { fill: C.coralS, stroke: C.coral });
    M('predict: leakage risk', 1016, 500, { size: 12.5, color: C.coral });
    M('predict reports every new column before a record is read', 1216, 130, { size: 12.5, color: C.teal, align: 'right' });
  });
}

/* ---------- 11. recap ---------- */
const OPS = [['FEAT_LOG', 'tame a long tail'], ['FEAT_SQRT', 'gentler skew fix'], ['FEAT_BUCKETIZE', 'numbered bands'], ['FEAT_ONE_HOT', 'a column per category'],
  ['FEAT_FREQUENCY_ENCODE', 'category → its share'], ['FEAT_TARGET_ENCODE', 'category → mean outcome'], ['FEAT_DATE_FEATURES', 'calendar parts'], ['FEAT_POLY', 'powers for curves'], ['FEAT_TRAIN_TEST_SPLIT', 'model partitions']];
function sRecap(t) {
  const end = seg(t, 8.2, 9.0);
  A(1 - end, () => {
    CAP('FEATURE OPERATORS TODAY', 64, 130, { color: C.violet });
    OPS.forEach(([op, d], i) => A(seg(t, 0.2 + i * 0.12, 0.5 + i * 0.12), () => { const x = 64 + (i % 3) * 388, y = 150 + Math.floor(i / 3) * 84; R(x, y, 372, 72, { fill: C.panel, stroke: C.violet }); M(op, x + 18, y + 30, { size: 13.5, color: C.violet, weight: 600 }); T(d, x + 18, y + 54, { size: 14.5 }); }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 410, 566, 72, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 440, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 464, { size: 14.5 });
      R(650, 410, 566, 72, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 440, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 464, { size: 14.5 });
    });
  });
  A(seg(t, 8.8, 9.6), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('FEATURES', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('features run first, so they see everything', 640, 430, { size: 15, align: 'center' });
    M('next: filters', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[4.48, 6.571, 8.064, 6.571, 8.171, 7.275, 8.661, 3.029, 4.693, 8.107, 7.381, 8.64, 7.403, 7.509, 9.088, 7.317, 7.317, 8.704, 5.248, 6.933, 9.408, 8.256, 5.76, 2.901, 9.472, 8.192, 7.915, 5.931, 6.912, 6.464, 7.808, 7.253, 8.192, 7.253, 7.957, 8.107, 4.992, 1.067]/*END*/;
PulseFilm.mount({
  series: 'PULSE · FEATURES',
  narr: NARR,
  scenes: [
    { name: 'Pulse Features', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse features. The first stage of every request, taken apart in depth.', true]] },
    { name: 'Where features run', dur: 8, draw: sWhere, caps: [
      [0, 'Features are the first stage of every request. They run before any filter, on every record in the cohort.'],
      [1.6, 'Each feature adds new columns. A later feature can build on an earlier one, like a bucketize that reads the log column just made.'],
      [3.6, 'And every later stage can read those columns, even the filters, which is something attributes can never offer.'],
      [6.0, 'Pulse ships a growing set of feature operators, and more are added over time. Your instance\'s manifest always lists the ones it offers.']] },
    { name: 'Two cost classes', dur: 8.4, draw: sCost, caps: [
      [0, 'Features come in two cost classes. Per-row features need only the record in front of them, so they finish in a single pass.'],
      [1.2, 'Global-pass features need the whole cohort first: category counts, target means or quantile cut points. Pulse sweeps once to learn them.'],
      [4.9, 'Then it rewinds and emits a value for every record.'],
      [7.0, 'Both classes can stream. A global pass just costs a second read of the file.']] },
    { name: 'Taming skew', dur: 8, draw: sSkew, caps: [
      [0, 'Many real measures have a long right tail: lots of small values and a few huge ones. That skew distorts averages and models.'],
      [3.4, 'Square root is the gentle fix. A negative value becomes null rather than an error, so the rest of the cohort keeps going.'],
      [5.9, 'Log goes further. Pulse uses the log of one plus x, so zero stays zero, and anything at or below minus one becomes null.']] },
    { name: 'Bucketize', dur: 9, draw: sBucket, caps: [
      [0, 'Bucketize turns a number into a band. With explicit boundaries, each value lands in a numbered bucket, in a single pass.'],
      [3.2, 'A value exactly on a cut point goes to the lower bucket. The output is the bucket number, not a label, and null stays null.'],
      [6.0, 'Or ask for quantiles, and Pulse learns cut points that give every bucket the same number of records. You choose boundaries or quantiles, never both.']] },
    { name: 'Encoding categories', dur: 9, draw: sCategories, caps: [
      [0, 'Categories need encoding before a model can use them. One-hot gives every category its own zero-or-one column.'],
      [3.3, 'The columns come from the schema\'s dictionary, so even a category with no records gets one. A null row is all zeros.'],
      [6.0, 'Frequency encoding replaces each category with its share of the cohort. Features run before filters, so those shares count every record.']] },
    { name: 'Target encoding', dur: 10.5, draw: sTarget, caps: [
      [0, 'Target encoding replaces a category with the average outcome of the records that share it.'],
      [2.8, 'Smoothing pulls rare categories toward the overall mean. A category seen only twice shouldn\'t get an extreme score.'],
      [6.5, 'But there\'s a trap. Each average includes every record\'s outcome, even test rows and the record\'s own. Pulse flags it every time with a leakage warning.'],
      [8.9, 'A train-test split doesn\'t silence it. For training-only means, run a separate request on the training rows, and map the averages back.']] },
    { name: 'Dates', dur: 8, draw: sDates, caps: [
      [0, 'Date features split one date into calendar parts: year, month, day, day of week, and quarter.'],
      [3.0, 'Day of week counts from zero, starting on Sunday.'],
      [5.4, 'A datetime adds the hour, and is read on the local clock, so a time zone can move it to a different day. A plain date has no zone, so it never shifts.']] },
    { name: 'Curves', dur: 7.6, draw: sPoly, caps: [
      [0, 'Polynomial features add powers of a number: its square, its cube, up to the tenth power. The original column stays as it is.'],
      [3.6, 'A straight line misses a curve. Give a linear regression the squared column too, and it follows the bend. That\'s polynomial regression.'],
      [6.5, 'Watch the scale. The tenth power of one hundred is ten to the twentieth. Standardise the column first.']] },
    { name: 'Train, validation, test', dur: 7.4, draw: sSplit, caps: [
      [0, 'Train-test split tags every record with a partition: zero for train, one for validation, two for test.'],
      [3.0, 'Stratify by a category, and each class is split in the same proportions, so the partitions stay balanced.'],
      [5.8, 'The same seed and the same rows always give the same split. Downstream, a filter on split zero keeps just the training rows.']] },
    { name: 'A full pipeline', dur: 9, draw: sPipeline, caps: [
      [0, 'Here\'s a full preparation pipeline in one request. Features run in the order you list them, so each can build on the last.'],
      [4.0, 'The log of income feeds a decile bucketize. Region becomes indicator columns, and the signup date becomes calendar parts.'],
      [7.4, 'Predict reports every new column before a single record is read, and flags the target encoder\'s leakage risk up front.']] },
    { name: 'The feature toolkit', dur: 10, draw: sRecap, caps: [
      [0, 'That\'s the feature toolkit today: reshape a number, bin it, encode a category, split a date, add curvature, or partition the cohort.'],
      [3.4, 'New feature operators are added over time, and embedders can register their own. The manifest always shows what your instance offers.'],
      [6.2, 'Remember the one rule: features run first, so they see everything. Next up, filters.'],
      [8.6, '', 'Pulse features.', true]] },
  ],
});
})();
