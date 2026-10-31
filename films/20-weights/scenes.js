/* Pulse weights: film 20 of the 23-film Pulse Anatomy series. Follows SERIES-RULES.md.
 * The cohorts are illustrative: survey (600 rows, two waves of 300, young and male against made-up census targets, a
 * design weight dwt), freq (six rows with a count n) and dup (the twenty rows those counts stand for), and inv (ten rows
 * of bad weights). Every figure on screen comes from a recorded Pulse v1.0.0-alpha.33 run in data/ (see data/README.md):
 * kinds_* (one table three ways), neff, resolve (+ predict), invalid*, max / mwu / tukey (refusals), win / win_slot,
 * total_*, rake (by wave), rake_cap, rake_cell, rake_pooled, rake_bad, use / use_age (the raked cohort), pooled_cells
 * and overlay (OVERLAY_RAKE). */
(() => {
const { C } = PulseFilm;
const { seg, eo, lerp, R, T, M, CAP, Ln, A, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke, o = {}) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule, ...o });
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), f3 = v => v.toFixed(3), pc = v => (100 * v).toFixed(1) + '%';

/* freq.csv: the six stored rows, [plan, score, n] */
const TABLE = [['basic', 3, 4], ['basic', 5, 2], ['plus', 6, 3], ['plus', 8, 5], ['pro', 7, 2], ['pro', 9, 4]];
/* kinds_dup / kinds_freq / kinds_prob .out.json: count, mean, CI bounds, sum_weights, n_eff */
const KINDS = [
  ['dup.pulse · 20 rows · no weight', 20, 6.5, 5.541, 7.459, null, null],
  ['freq.pulse · weight n · frequency', 20, 6.5, 5.541, 7.459, 20, null],
  ['freq.pulse · weight n · probability', 20, 6.5, 4.508, 8.492, 20, 5.405]];
/* neff.out.json: the design weight dwt over the survey, and TEST_T spend by gender, weighted and with "weight": null */
const NEFF = { n: 600, sw: 593.5, sw2: 622.35, neff: 565.99, mean: 44.97, lo: 43.90, hi: 46.05 };
const TT = { n: [243, 357], sw: [239.4, 354.1], neff: [229.2, 336.8], w: { diff: -1.41, df: 517.8, p: 0.199 }, u: { diff: -1.49, df: 545.4, p: 0.167 } };
/* resolve.predict.json data.weights[], and resolve.out.json (wave w1, by gender) */
const RES = [['aggregations[0]', 'AGG_AVERAGE', 'dwt', 'applied', 'request'], ['aggregations[1]', 'AGG_COUNT', 'dwt', 'applied', 'slot'],
  ['aggregations[2]', 'AGG_COUNT', '', 'opted_out', 'slot'], ['groups[0]', 'GROUP_CATEGORY', 'dwt', 'skipped_not_weight_aware', 'request']];
const RESOUT = [['F', 0.505, 121.3, 121], ['M', 0.438, 178.2, 179]];
/* inv.csv and invalid / invalid_p .out.json */
const INV = [[12, '1'], [15, '2'], [9, 'null'], [20, '-1'], [14, '0'], [11, '1.5'], [18, '3'], [16, '2'], [10, '1'], [13, '4']];
const INVF = { count: 13, mean: 14.62, n: 10, bad: 3 }, INVP = { count: 14.5, mean: 14.24, n: 10, bad: 2, neff: 5.64 };
/* win_slot.out.json: weight the aggregation, rank the result rows */
const WIN = [['18-34', 39.38, 3], ['35-54', 46.68, 2], ['55+', 56.09, 1]];
/* total_fw / total_dup .out.json */
const TOT = { w: 130, raw: 38, dup: 130 };
/* rake.out.json (by wave): the pooled margins [category, observed, target, achieved], iterations and the efficiency report */
const AGE = [['18-34', 0.490, 0.29, 0.290], ['35-54', 0.298, 0.33, 0.330], ['55+', 0.212, 0.38, 0.380]];
const GEN = [['F', 0.405, 0.51, 0.510], ['M', 0.595, 0.49, 0.490]];
const EFF = { n: 600, sw: 600, neff: 461.4, deff: 1.300, pct: 76.9, min: 0.451, max: 2.610, ratio: 5.79, cv: 0.548, capped: 0, it: 3 };
const WAVES = [['w1', 210.9, 70.3, 2.61], ['w2', 254.7, 84.9, 2.00]];
/* rake_cap.out.json (max_weight 2): per wave, and pooled */
const CAP2 = { neff: 474.5, pct: 79.1, capped: 79, w1: { it: 100, conv: false, res: 0.033, old: 0.347, capped: 52 }, w2: { it: 6, conv: true, capped: 27 } };
/* rake_cell.out.json: one joint margin age × gender, [age, gender, observed_n, target] */
const CELLS = [['18-34', 'F', 123, 0.145], ['18-34', 'M', 171, 0.145], ['35-54', 'F', 68, 0.165], ['35-54', 'M', 111, 0.165], ['55+', 'F', 52, 0.20], ['55+', 'M', 75, 0.18]];
const CELL = { it: 1, pct: 76.2, neff: 457.5 };
/* use.out.json and use_age.out.json, over raked.pulse with weight rake_weight */
const USE = { raw: [0.517, 0.477, 0.557], raked: [0.546, 0.500, 0.591], neff: 461.4 };
const UAGE = [['18-34', 294, 174.0], ['35-54', 179, 198.0], ['55+', 127, 228.0]];
/* overlay.out.json: the host crosstab (age × gender counts), OVERLAY_RAKE's fitted table and factors; pooled_cells.out.json agrees */
const XT = [[123, 171], [68, 111], [52, 75]], FIT = [[91.6, 82.4], [96.3, 101.7], [118.0, 110.0]], FAC = [[0.745, 0.482], [1.417, 0.916], [2.269, 1.467]];

/* a small JSON card: lines [text, colour?] */
function code(x, y, w, lines, o = {}) {
  const h = o.h ?? (lines.length * 26 + (o.cap ? 46 : 20));
  card(x, y, w, h, o.stroke);
  if (o.cap) CAP(o.cap, x + 20, y + 26, { color: o.stroke || C.muted });
  lines.forEach(([s, c], i) => M(s, x + 20, y + (o.cap ? 56 : 30) + i * 26, { size: o.size ?? 13.5, color: c || C.ink }));
}
/* an error card: code, then message lines */
function refusal(x, y, w, codeName, lines, a) {
  A(a, () => {
    card(x, y, w, 30 + 26 + lines.length * 22, C.coral);
    M(codeName, x + 18, y + 30, { size: 13.5, color: C.coral, weight: 600 });
    lines.forEach((s, i) => M(s, x + 18, y + 56 + i * 22, { size: 12, color: C.muted }));
  });
}
/* observed → achieved bars for one margin: rows [label, observed, target, achieved] */
function margin(x, y, w, rows, t, at, title) {
  CAP(title, x, y, { color: C.violet });
  rows.forEach(([k, ob, tg, ac], i) => {
    const yy = y + 22 + i * 44, u = eo(seg(t, at + 0.6 + i * 0.1, at + 1.6 + i * 0.1)), bw = w - 230;
    A(seg(t, at + i * 0.1, at + 0.3 + i * 0.1), () => {
      M(k, x, yy + 16, { size: 13, color: C.ink });
      R(x + 70, yy + 4, bw, 16, { fill: C.panel2, r: 3 });
      R(x + 70, yy + 4, bw * lerp(ob, ac, u), 16, { fill: u > 0 ? C.violet : C.teal, r: 3 });
      Ln([[x + 70 + bw * tg, yy], [x + 70 + bw * tg, yy + 24]], { stroke: C.amber, lw: 2 });
      M(pc(ob), x + 80 + bw, yy + 16, { size: 12.5, color: C.teal });
      A(u, () => M('→ ' + pc(ac), x + 140 + bw, yy + 16, { size: 12.5, color: C.violet, weight: 600 }));
    });
  });
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  const xs = [380, 470, 560, 650, 740, 830, 920], ws = [1, 1, 3, 1, 2, 1, 1];
  xs.forEach((x, i) => A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08), () => {
    const h = 30 + ws[i] * 46, u = eo(seg(t, 0.8, 1.6));
    R(x, 420 - lerp(30, h, u), 60, lerp(30, h, u), { fill: ws[i] > 1 ? C.violetS : C.tealS, stroke: ws[i] > 1 ? C.violet : C.teal });
    M('w ' + ws[i], x + 30, 446, { size: 13, color: ws[i] > 1 ? C.violet : C.teal, align: 'center' });
  }));
  A(seg(t, 1.4, 1.9), () => T('What one row stands for', 640, 540, { size: 22, align: 'center', color: C.muted }));
}

/* ---------- 1. a weight on each row ---------- */
function sIntro(t) {
  CAP('A WEIGHT ON EACH ROW', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 74);
    T('A weight column makes each row count as w rows in every weight-aware figure.', 86, 178, { size: 17 });
    M('the field must be u4…u64, f32 or f64 · it is a schema field, so computing weights is its own step', 86, 204, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    CAP('SET IT IN THREE PLACES', 64, 262);
    [['on the request', '"weight": { "field": "dwt", "kind": "probability" }', C.teal], ['on one slot', '"weight": "dwt"  ·  or  "weight": null  to opt out', C.violet],
     ['on the instance', 'Options.DefaultWeight  (an embedder setting)', C.amber]].forEach(([h, s, c], i) => A(seg(t, 2.8 + i * 0.3, 3.2 + i * 0.3), () => {
      card(64, 280 + i * 64, 1152, 52, c); M(h, 86, 312 + i * 64, { size: 13.5, color: c, weight: 600 }); M(s, 290, 312 + i * 64, { size: 14, color: C.ink });
    }));
  });
  A(seg(t, 6.0, 6.4), () => {
    card(64, 488, 1152, 84, C.teal, { dash: [6, 5] });
    CAP('THE COHORT', 86, 514, { color: C.teal });
    T('600 illustrative survey rows over two waves. The sample runs young and male, and north is oversampled.', 86, 542, { size: 15 });
    M('design weight dwt: north 0.8 · south 1.3', 86, 564, { size: 12.5, color: C.muted });
  });
}

/* ---------- 2. two kinds ---------- */
function sKinds(t) {
  CAP('TWO KINDS', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 562, 120, C.teal);
    M('"kind": "probability"  (the default)', 86, 176, { size: 14, color: C.teal, weight: 600 });
    T('Design and raked weights. Means and shares are', 86, 204, { size: 14.5 }); T('scale-free, totals scale, and n_eff is added.', 86, 226, { size: 14.5 });
    M('any finite, non-negative value', 86, 252, { size: 12, color: C.muted });
    card(654, 146, 562, 120, C.violet);
    M('"kind": "frequency"', 676, 176, { size: 14, color: C.violet, weight: 600 });
    T('A row stands for w identical rows. Integer weights', 676, 204, { size: 14.5 }); T('reproduce the duplicated cohort exactly.', 676, 226, { size: 14.5 });
    M('a fractional weight is invalid', 676, 252, { size: 12, color: C.coral });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 286, 300, 286);
    CAP('freq.csv · six rows', 84, 312);
    ['plan', 'score', 'n'].forEach((h, j) => M(h, 84 + j * 90, 342, { size: 12, color: C.muted }));
    TABLE.forEach((r, i) => r.forEach((v, j) => M(String(v), 84 + j * 90, 370 + i * 28, { size: 13.5, color: j === 2 ? C.violet : C.ink })));
    M('Σn = 20 rows in dup.csv', 84, 552, { size: 12, color: C.muted });
  });
  A(seg(t, 3.4, 3.8), () => {
    card(384, 286, 832, 286, C.violet);
    CAP('THE SAME AGGREGATIONS, THREE WAYS', 404, 312, { color: C.violet });
    const X = [750, 830, 970, 1080, 1180]; ['count', 'mean', '95% CI', 'sum_weights', 'n_eff'].forEach((h, j) => M(h, X[j], 344, { size: 12, color: C.muted, align: 'right' }));
    KINDS.forEach((r, i) => A(seg(t, 3.6 + i * 0.5, 4.0 + i * 0.5), () => {
      const y = 384 + i * 52, hl = i === 2 && seg(t, 6.4, 6.8) > 0;
      M(r[0], 404, y, { size: 13, color: i === 1 ? C.violet : i === 2 ? C.teal : C.ink });
      M(String(r[1]), X[0], y, { size: 14, align: 'right', color: C.ink }); M(f2(r[2]), X[1], y, { size: 14, align: 'right', weight: 600, color: C.ink });
      M(f2(r[3]) + '–' + f2(r[4]), X[2], y, { size: 14, align: 'right', color: hl ? C.coral : C.ink, weight: hl ? 600 : 400 });
      M(r[5] == null ? '—' : String(r[5]), X[3], y, { size: 14, align: 'right', color: r[5] == null ? C.faint : C.ink });
      M(r[6] == null ? '—' : f2(r[6]), X[4], y, { size: 14, align: 'right', color: r[6] == null ? C.faint : C.coral, weight: r[6] == null ? 400 : 600 });
    }));
    A(seg(t, 4.8, 5.2), () => M('frequency = the duplicated rows, figure for figure', 404, 520, { size: 12.5, color: C.violet }));
    A(seg(t, 6.4, 6.8), () => M('probability: same mean, wider interval — it reads n_eff, not Σw', 404, 548, { size: 12.5, color: C.coral }));
  });
}

/* ---------- 3. Kish n_eff ---------- */
function sNeff(t) {
  CAP('ONE RULE FOR INFERENCE · N*', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 92);
    M('unweighted formula, sample size N*:', 86, 178, { size: 14, color: C.muted });
    M('frequency  N* = Σw', 420, 178, { size: 15, color: C.violet, weight: 600 }); M('probability  N* = n_eff = (Σw)² / Σw²   (Kish)', 640, 178, { size: 15, color: C.teal, weight: 600 });
    M('tests · regressions · CI bounds · inferential overlays · point estimates match across kinds; SEs, df and p read N*', 86, 214, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 258, 470, 314, C.teal);
    CAP('neff.json · weight dwt over 600 rows', 86, 286, { color: C.teal });
    [['n', String(NEFF.n), C.ink], ['Σw', f1(NEFF.sw), C.ink], ['Σw²', f2(NEFF.sw2), C.ink], ['n_eff = 593.5² ÷ 622.35', f1(NEFF.neff), C.teal], ['mean spend', f2(NEFF.mean), C.violet], ['95% CI', f2(NEFF.lo) + ' – ' + f2(NEFF.hi), C.violet]]
      .forEach(([k, v, c], i) => A(seg(t, 2.8 + i * 0.15, 3.1 + i * 0.15), () => { M(k, 86, 324 + i * 38, { size: 13.5, color: C.muted }); M(v, 512, 324 + i * 38, { size: 15, color: c, align: 'right', weight: 600 }); }));
  });
  A(seg(t, 5.2, 5.6), () => {
    card(554, 258, 662, 314, C.violet);
    CAP('TEST_T spend by gender · details', 576, 286, { color: C.violet });
    const X = [800, 900, 1010, 1190]; ['n', 'sum_weights', 'n_eff', ''].forEach((h, j) => M(h, X[j], 318, { size: 12, color: C.muted, align: 'right' }));
    ['F', 'M'].forEach((g, i) => { const y = 350 + i * 30; M(g, 576, y, { size: 13.5 }); M(String(TT.n[i]), X[0], y, { size: 14, align: 'right' }); M(f1(TT.sw[i]), X[1], y, { size: 14, align: 'right' }); M(f1(TT.neff[i]), X[2], y, { size: 14, align: 'right', color: C.teal, weight: 600 }); });
    M('n stays the raw count · the sample size is n_eff', 576, 420, { size: 12.5, color: C.muted });
    Ln([[576, 440], [1194, 440]], { stroke: C.rule });
    [['weighted', TT.w, C.violet], ['"weight": null', TT.u, C.muted]].forEach(([k, r, c], i) => {
      const y = 476 + i * 34; M(k, 576, y, { size: 13.5, color: c, weight: 600 });
      M('diff ' + f2(r.diff), 820, y, { size: 13.5, align: 'right' }); M('df ' + f1(r.df), 960, y, { size: 13.5, align: 'right' }); M('p ' + f3(r.p), 1090, y, { size: 13.5, align: 'right', color: c });
    });
    M('Welch · fractional df', 1194, 548, { size: 11.5, color: C.faint, align: 'right' });
  });
}

/* ---------- 4. which weight a slot uses ---------- */
function sResolve(t) {
  CAP('RESOLUTION · PER SLOT', 64, 124, { color: C.amber });
  const steps = [['its own weight', C.violet], ['the request weight', C.teal], ['Options.DefaultWeight', C.amber], ['none', C.faint]];
  steps.forEach(([s, c], i) => A(seg(t, 0.2 + i * 0.3, 0.5 + i * 0.3), () => {
    const x = 64 + i * 296; card(x, 146, 260, 50, c); M(s, x + 130, 177, { size: 14, color: c, align: 'center', weight: 600 });
    if (i < 3) arrow(x + 264, 171, x + 292, 171, { stroke: C.faint, head: 6 });
  }));
  A(seg(t, 1.6, 2.0), () => M('"weight": null on a slot stops the chain there: that one slot runs unweighted, even under a default', 64, 224, { size: 13, color: C.coral }));
  A(seg(t, 3.2, 3.6), () => {
    card(64, 246, 1152, 206, C.amber);
    CAP('PREDICT · data.weights[] · resolve.json, before a row is read', 86, 272, { color: C.amber });
    const X = [86, 290, 480, 560, 900]; ['slot', 'operator', 'field', 'status', 'source'].forEach((h, j) => M(h, X[j], 302, { size: 12, color: C.muted }));
    RES.forEach((r, i) => A(seg(t, 3.4 + i * 0.25, 3.7 + i * 0.25), () => {
      const y = 332 + i * 30; r.forEach((v, j) => M(v || '—', X[j], y, { size: 13.5, color: j === 3 ? (v === 'applied' ? C.teal : v === 'opted_out' ? C.coral : C.amber) : j === 4 ? C.muted : C.ink, weight: j === 3 ? 600 : 400 }));
    }));
  });
  A(seg(t, 6.2, 6.6), () => {
    card(64, 464, 1152, 116, C.violet);
    CAP('PROCESS · wave w1 by gender', 86, 488, { color: C.violet });
    ['gender', 'sat (weighted)', 'wt_n = Σw', 'base · "weight": null'].forEach((h, j) => M(h, [86, 380, 640, 920][j], 514, { size: 12, color: C.muted }));
    RESOUT.forEach((r, i) => { const y = 542 + i * 26; M(r[0], 86, y, { size: 13.5 }); M(pc(r[1]), 380, y, { size: 13.5, color: C.violet }); M(f1(r[2]), 640, y, { size: 13.5, color: C.violet }); M(String(r[3]), 920, y, { size: 13.5 }); });
  });
}

/* ---------- 5. invalid weights ---------- */
function sInvalid(t) {
  CAP('INVALID WEIGHTS · NEVER COERCED', 64, 124, { color: C.coral });
  A(seg(t, 0.2, 0.6), () => { card(64, 146, 360, 426); CAP('inv.csv', 86, 172); M('x', 110, 202, { size: 12, color: C.muted }); M('w', 200, 202, { size: 12, color: C.muted }); });
  const why = { 'null': 'null', '-1': 'negative', '1.5': 'non-integer (frequency)', '0': 'valid · adds nothing' };
  INV.forEach(([x, w], i) => A(seg(t, 0.3 + i * 0.06, 0.6 + i * 0.06), () => {
    const y = 232 + i * 32, hl = seg(t, 2.4, 2.8), bad = w === 'null' || w === '-1' || (w === '1.5' && hl > 0);
    M(String(x), 110, y, { size: 14, color: bad && hl > 0 ? C.faint : C.ink }); M(w, 200, y, { size: 14, color: bad && hl > 0 ? C.coral : C.teal, weight: 600 });
    if (why[w]) A(hl, () => M(why[w], 250, y, { size: 12, color: w === '0' ? C.muted : C.coral }));
  }));
  A(seg(t, 2.4, 2.8), () => {
    card(444, 146, 772, 160, C.violet);
    CAP('THE ROW LEAVES THAT SLOT · n STAYS RAW', 466, 172, { color: C.violet });
    const X = [700, 800, 900, 1040, 1180]; ['count', 'mean', 'n', 'n_weight_invalid', 'n_eff'].forEach((h, j) => M(h, X[j], 204, { size: 12, color: C.muted, align: 'right' }));
    [['frequency', INVF], ['probability', INVP]].forEach(([k, r], i) => {
      const y = 238 + i * 34; M(k, 466, y, { size: 13.5, color: i ? C.teal : C.violet, weight: 600 });
      M(String(r.count), X[0], y, { size: 14, align: 'right' }); M(f2(r.mean), X[1], y, { size: 14, align: 'right' }); M(String(r.n), X[2], y, { size: 14, align: 'right' });
      M(String(r.bad), X[3], y, { size: 14, align: 'right', color: C.coral, weight: 600 }); M(r.neff ? f2(r.neff) : '—', X[4], y, { size: 14, align: 'right', color: r.neff ? C.ink : C.faint });
    });
  });
  A(seg(t, 5.0, 5.4), () => code(444, 326, 772, [['"code": "PULSE_WEIGHT_INVALID_ROWS",', C.coral], ['"details": { "field": "w", "count": 3,', C.ink], ['  "by_reason": { "null": 1, "negative": 1,', C.ink], ['                "non_integer_frequency": 1, "nan_inf": 0 } }', C.ink]],
    { cap: 'ONE WARNING PER WEIGHT COLUMN · FREQUENCY RUN', stroke: C.coral }));
  A(seg(t, 5.8, 6.2), () => M('--strict turns the warning into an error (invalid.strict.json)', 466, 520, { size: 12.5, color: C.muted }));
}

/* ---------- 6. honour, skip or refuse ---------- */
function sHonour(t) {
  CAP('HONOUR, SKIP OR REFUSE · THE MANIFEST IS THE TABLE', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 58, C.amber);
    M('each manifest entry lists weight_kinds:', 86, 181, { size: 13.5, color: C.muted });
    M('AGG_AVERAGE ["frequency","probability"]', 430, 181, { size: 13.5, color: C.teal }); M('TEST_MANN_WHITNEY_U ["frequency"]', 860, 181, { size: 13.5, color: C.violet });
  });
  const cols = [['HONOUR', C.teal, ['aggregators such as count, mean, CI', 'tests such as TEST_T, TEST_CHISQ', 'OLS and GLM, most matrix fits', 'z-scores, GROUP_QUANTILE']],
    ['SKIP', C.amber, ['filters, features', 'row-local attributes', 'most groupers', 'status skipped_not_weight_aware']],
    ['REFUSE', C.coral, ['min, max, distinct-style:', '  PROCESSING_CONFIG', 'no weighted form:', '  PULSE_WEIGHT_UNSUPPORTED']]];
  cols.forEach(([h, c, items], k) => A(seg(t, 1.4 + k * 0.8, 1.8 + k * 0.8), () => {
    const x = 64 + k * 392; card(x, 222, 368, 168, c); CAP(h, x + 20, 248, { color: c });
    items.forEach((s, i) => M(s, x + 20, 280 + i * 26, { size: 13, color: s.startsWith('  ') ? c : C.ink }));
  }));
  refusal(64, 408, 368, 'PROCESSING_CONFIG', ['max.json: AGG_MAX is not weight-aware;', 'drop the weight or set "weight": null'], seg(t, 4.6, 5.0));
  refusal(456, 408, 368, 'PULSE_WEIGHT_UNSUPPORTED', ['mwu.json: kind "probability"', 'supported_kinds ["frequency"]'], seg(t, 6.2, 6.6));
  refusal(848, 408, 368, 'PULSE_WEIGHT_UNSUPPORTED', ['tukey.json: a post-test reads the', 'aggregated result rows, which carry', 'no row weights'], seg(t, 7.8, 8.2));
  A(seg(t, 4.6, 5.0), () => M('under only an instance default, min and max skip it and the others still refuse · predict refuses what the run refuses', 64, 586, { size: 12.5, color: C.muted }));
}

/* ---------- 7. windows and total() ---------- */
function sWindows(t) {
  CAP('WINDOWS HAVE NO WEIGHTED FORM', 64, 124, { color: C.coral });
  A(seg(t, 0.2, 0.6), () => code(64, 146, 560, [['"weight": { "field": "dwt" },', C.coral], ['"groups": [ age ], "aggregations": [ mean spend ],', C.ink], ['"windows": [{ "type": "WIN_RANK", … }]', C.ink]], { cap: 'win.json', h: 136 }));
  refusal(64, 300, 560, 'PROCESSING_CONFIG', ['windows[0]: WIN_RANK has no weighted form and carries', 'no slot weight; drop the request weight', '(an instance default is skipped on it)'], seg(t, 1.6, 2.0));
  A(seg(t, 3.4, 3.8), () => {
    card(656, 146, 560, 260, C.violet);
    CAP('win_slot.json · weight the aggregation instead', 678, 172, { color: C.violet });
    M('{ "type": "AGG_AVERAGE", "field": "spend", "weight": "dwt" }', 678, 202, { size: 12.5, color: C.violet });
    ['age', 'spend (weighted)', 'rank'].forEach((h, j) => M(h, [678, 940, 1190][j], 240, { size: 12, color: C.muted, align: j ? 'right' : 'left' }));
    WIN.forEach((r, i) => { const y = 274 + i * 32; M(r[0], 678, y, { size: 14 }); M(f2(r[1]), 940, y, { size: 14, align: 'right', color: C.violet }); M(String(r[2]), 1190, y, { size: 14, align: 'right' }); });
    M('the window ranks the weighted result rows', 678, 384, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.6, 6.0), () => {
    CAP('total() UNDER A WEIGHT', 64, 448, { color: C.teal });
    card(64, 462, 760, 110, C.teal);
    M('ATTR_FORMULA "total(score)"', 86, 492, { size: 13.5, color: C.ink });
    [['frequency weight n', TOT.w, C.violet], ['unweighted', TOT.raw, C.muted], ['dup.pulse, 20 rows', TOT.dup, C.ink]].forEach(([k, v, c], i) => {
      const x = 86 + i * 250; M(k, x, 524, { size: 12, color: C.muted }); M(String(v), x, 554, { size: 22, color: c, weight: 600 });
    });
  });
  A(seg(t, 7.6, 8.0), () => { card(844, 462, 372, 110, C.coral); M('probability weight', 864, 492, { size: 13, color: C.muted }); M('PULSE_WEIGHT_UNSUPPORTED', 864, 522, { size: 13.5, color: C.coral, weight: 600 }); M('a total would scale with the weights', 864, 550, { size: 12, color: C.muted }); });
}

/* ---------- 8. computing weights ---------- */
function sRake(t) {
  CAP('WHERE WEIGHTS COME FROM · pulse rake · Pulse.Rake · pulse_rake', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 70);
    T('Raking computes a weight per record so the weighted sample matches known margins, such as census shares.', 86, 178, { size: 16 });
    M('a weight is a schema field, so it writes a NEW cohort: every source column, plus a nullable f64 rake_weight', 86, 202, { size: 12.5, color: C.violet });
  });
  A(seg(t, 2.8, 3.2), () => code(64, 236, 620, [
    ['{ "cohort": "survey.pulse", "out": "raked.pulse",', C.ink],
    ['  "margins": [', C.ink],
    ['    { "field": "age",', C.amber], ['      "targets": { "18-34": 29, "35-54": 33, "55+": 38 } },', C.amber],
    ['    { "field": "gender",', C.amber], ['      "targets": { "F": 0.51, "M": 0.49 } } ],', C.amber],
    ['  "by": "wave" }', C.teal]], { cap: 'rake.json · CLI: pulse rake -r rake.json', h: 248, size: 13.5 }));
  A(seg(t, 5.4, 5.8), () => {
    card(704, 236, 512, 248, C.violet);
    CAP('HOW IT SOLVES', 724, 262, { color: C.violet });
    [['iterative proportional fitting:', C.muted], ['each sweep rescales every margin', C.ink], ['to its target share, in request order', C.ink], ['stops when the largest gap ≤ tol (1e-6)', C.ink],
     ['or at max_iter (100)', C.ink], ['by: each wave raked on its own', C.teal], ['deterministic: same request, same bits', C.muted]].forEach(([s, c], i) => M(s, 724, 294 + i * 26, { size: 13, color: c }));
  });
  A(seg(t, 7.6, 8.0), () => M('targets come inline, as shares (sum 1 or 100) or counts · base_weight starts from a design weight', 64, 516, { size: 13, color: C.muted }));
}

/* ---------- 9. the report ---------- */
function sReport(t) {
  CAP('THE RAKE REPORT · rake.out.json', 64, 124, { color: C.violet });
  A(seg(t, 0.1, 0.4), () => card(64, 140, 620, 336));
  margin(86, 172, 600, AGE, t, 0.2, 'age · observed → achieved · target in amber');
  margin(86, 338, 600, GEN, t, 0.6, 'gender');
  A(seg(t, 2.6, 3.0), () => M('iterations ' + EFF.it + ' · converged true', 86, 460, { size: 12.5, color: C.muted }));
  A(seg(t, 3.6, 4.0), () => {
    card(704, 140, 512, 336, C.violet);
    CAP('efficiency', 724, 166, { color: C.violet });
    [['n', String(EFF.n)], ['sum_weights', String(EFF.sw)], ['n_eff', f1(EFF.neff)], ['deff_kish', f3(EFF.deff)], ['efficiency_pct', f1(EFF.pct)], ['weight_min · max', f3(EFF.min) + ' · ' + f3(EFF.max)], ['weight_range_ratio', f2(EFF.ratio)], ['weight_cv', f3(EFF.cv)], ['n_capped', String(EFF.capped)]]
      .forEach(([k, v], i) => A(seg(t, 3.8 + i * 0.1, 4.1 + i * 0.1), () => { M(k, 724, 200 + i * 30, { size: 13.5, color: C.muted }); M(v, 1196, 200 + i * 30, { size: 14.5, align: 'right', color: i === 2 || i === 4 ? C.violet : C.ink, weight: i === 2 || i === 4 ? 600 : 400 }); }));
  });
  A(seg(t, 6.2, 6.6), () => {
    card(64, 494, 1152, 78, C.teal);
    CAP('groups[] · by wave', 86, 520, { color: C.teal });
    WAVES.forEach(([w, ne, p, mx], i) => { const x = 300 + i * 440; M(w, x, 552, { size: 14, weight: 600, color: C.teal }); M('n_eff ' + f1(ne) + ' of 300 · ' + f1(p) + '% · max ' + f2(mx), x + 40, 552, { size: 13.5 }); });
  });
  A(seg(t, 8.4, 8.8), () => M('deff_kish = n ÷ n_eff = 1 + cv²: the unequal-weighting design effect only · no strata, clusters or FPC', 64, 596, { size: 12.5, color: C.coral }));
}

/* ---------- 10. caps and cells ---------- */
function sCaps(t) {
  CAP('CAPS TRADE FIT FOR EFFICIENCY · rake_cap.json', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 250, C.violet);
    M('"max_weight": 2', 86, 178, { size: 14, color: C.amber, weight: 600 }); M('relative to the group\'s mean weight', 240, 178, { size: 12.5, color: C.muted });
    const X = [400, 560]; ['no cap', 'max_weight 2'].forEach((h, j) => M(h, X[j], 212, { size: 12, color: C.muted, align: 'right' }));
    [['n_eff', f1(EFF.neff), f1(CAP2.neff)], ['efficiency_pct', f1(EFF.pct), f1(CAP2.pct)], ['n_capped', '0', String(CAP2.capped)], ['weight_max', f2(EFF.max), '2.00']]
      .forEach(([k, a, b], i) => { const y = 244 + i * 30; M(k, 86, y, { size: 13.5, color: C.muted }); M(a, X[0], y, { size: 14, align: 'right' }); M(b, X[1], y, { size: 14, align: 'right', color: C.violet, weight: 600 }); });
    M('w1 55+ share: 34.7% against a 38% target', 86, 376, { size: 12.5, color: C.coral });
  });
  A(seg(t, 2.6, 3.0), () => code(64, 412, 560, [['"code": "PULSE_RAKE_NOT_CONVERGED",', C.coral], ['"details": { "group": "w1", "iterations": 100,', C.ink], ['             "residual": 0.033 }', C.ink]],
    { cap: 'STILL WRITTEN · w2 CONVERGED IN 6 SWEEPS', stroke: C.coral, h: 160 }));
  A(seg(t, 5.2, 5.6), () => {
    card(656, 146, 560, 250, C.teal);
    CAP('CELL WEIGHTING · rake_cell.json · one joint margin', 678, 172, { color: C.teal });
    M('{ "fields": ["age", "gender"], "cells": [ … ] }', 678, 202, { size: 12.5, color: C.amber });
    CELLS.forEach(([a, g, n, tg], i) => { const x = 678 + (i % 2) * 260, y = 236 + Math.floor(i / 2) * 30; M(a + ' ' + g, x, y, { size: 13 }); M('n ' + n + ' → ' + pc(tg), x + 230, y, { size: 13, align: 'right', color: C.violet }); });
    M('exact after ' + CELL.it + ' sweep · efficiency ' + f1(CELL.pct) + '%', 678, 352, { size: 13, color: C.violet, weight: 600 });
    M('one margin, rim or joint, is exact after one sweep', 678, 376, { size: 12, color: C.muted });
  });
  refusal(656, 412, 560, 'PULSE_RAKE_UNTARGETED_CATEGORY', ['rake_bad.json: 127 records hold 55+, which has no target', 'every refusal comes before anything is written'], seg(t, 7.6, 8.0));
}

/* ---------- 11. using the weights ---------- */
function sUse(t) {
  CAP('USING THE WEIGHTS · raked.pulse', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 56, C.teal);
    M('"weight": { "field": "rake_weight" }', 86, 180, { size: 14.5, color: C.teal, weight: 600 }); M('probability, the default · never frequency: raked weights are fractional', 500, 180, { size: 13, color: C.muted });
  });
  A(seg(t, 1.8, 2.2), () => {
    card(64, 222, 560, 350, C.violet);
    CAP('use_age.json · by age', 86, 248, { color: C.violet });
    ['age', 'base · "weight": null', 'AGG_COUNT · Σw', 'share'].forEach((h, j) => M(h, [86, 330, 480, 600][j], 280, { size: 12, color: C.muted, align: j ? 'right' : 'left' }));
    UAGE.forEach(([a, b, w], i) => { const y = 316 + i * 34; M(a, 86, y, { size: 14 }); M(String(b), 330, y, { size: 14, align: 'right' }); M(f1(w), 480, y, { size: 14, align: 'right', color: C.violet, weight: 600 }); M(pc(w / 600), 600, y, { size: 14, align: 'right', color: C.violet }); });
    M('the weighted counts carry the census margin;', 86, 446, { size: 12.5, color: C.muted }); M('an opted-out count shows the unweighted base', 86, 468, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(656, 222, 560, 350, C.violet);
    CAP('use.json · share satisfied', 678, 248, { color: C.violet });
    const bar = (y, [m, lo, hi], c, k) => {
      const X0 = 700, Wd = 480, xs = v => X0 + (v - 0.40) / 0.25 * Wd;
      M(k, 678, y - 14, { size: 13, color: c, weight: 600 });
      Ln([[xs(lo), y], [xs(hi), y]], { stroke: c, lw: 3 }); Ln([[xs(lo), y - 7], [xs(lo), y + 7]], { stroke: c, lw: 2 }); Ln([[xs(hi), y - 7], [xs(hi), y + 7]], { stroke: c, lw: 2 });
      R(xs(m) - 5, y - 5, 10, 10, { fill: c, r: 5 });
      M(pc(m) + '  [' + pc(lo) + ', ' + pc(hi) + ']', 1196, y - 14, { size: 13, align: 'right', color: C.ink });
    };
    bar(320, USE.raw, C.muted, '"weight": null · n 600');
    A(seg(t, 5.0, 5.4), () => bar(400, USE.raked, C.violet, 'raked · n_eff ' + f1(USE.neff)));
    M('40%', 700, 456, { size: 11.5, color: C.faint, align: 'center' }); M('65%', 1180, 456, { size: 11.5, color: C.faint, align: 'center' });
    A(seg(t, 6.4, 6.8), () => { M('older respondents are more often satisfied,', 678, 500, { size: 12.5, color: C.muted }); M('so the estimate rises · the interval widens', 678, 522, { size: 12.5, color: C.muted }); });
  });
}

/* ---------- 12. OVERLAY_RAKE ---------- */
function grid3(x, y, title, cells, c, fmt, t, at) {
  A(seg(t, at, at + 0.4), () => {
    CAP(title, x, y, { color: c });
    ['F', 'M'].forEach((g, j) => M(g, x + 130 + j * 90, y + 30, { size: 12, color: C.muted, align: 'right' }));
    ['18-34', '35-54', '55+'].forEach((a, i) => { M(a, x, y + 62 + i * 34, { size: 13, color: C.muted }); cells[i].forEach((v, j) => M(fmt(v), x + 130 + j * 90, y + 62 + i * 34, { size: 14.5, align: 'right', color: c, weight: 600 })); });
  });
}
function sOverlay(t) {
  CAP('OVERLAY_RAKE · RAKE A TABLE, WRITE NOTHING', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => code(64, 146, 1152, [['"crosstab": { "rows": [age], "columns": [gender], "cell": AGG_COUNT },', C.teal],
    ['"overlays": [{ "kind": "OVERLAY_RAKE", "scope": "matrix", "params": { "row_targets": { "18-34": 0.29, … }, "col_targets": { "F": 0.51, … } } }]', C.violet]], { h: 82, size: 12.5 }));
  A(seg(t, 2.2, 2.6), () => { card(64, 246, 360, 230, C.teal); card(460, 246, 360, 230, C.violet); card(856, 246, 360, 230, C.violet); });
  grid3(86, 274, 'host · counts', XT, C.teal, String, t, 2.4);
  grid3(482, 274, 'payload · fitted', FIT, C.violet, f1, t, 2.8);
  grid3(878, 274, 'parts.factors', FAC, C.violet, f3, t, 3.2);
  A(seg(t, 2.8, 3.2), () => arrow(426, 360, 456, 360, { stroke: C.faint, head: 6 }));
  A(seg(t, 4.6, 5.0), () => {
    M('summary.parameters: iterations 4 · converged 1 · residual 1.5e-11', 86, 506, { size: 13, color: C.muted });
    M('the host crosstab is unchanged · every host key needs exactly one target', 86, 532, { size: 13, color: C.muted });
  });
  A(seg(t, 6.6, 7.0), () => M('the factors match the rake_weight of a pooled rake over the same margins (pooled_cells.json)', 86, 566, { size: 13, color: C.amber }));
}

/* ---------- 13. recap ---------- */
function sRecap(t) {
  const end = seg(t, 9.2, 10.0);
  A(1 - end, () => {
    CAP('WEIGHTS IN PULSE TODAY', 64, 124, { color: C.teal });
    [['KINDS', 'probability · frequency · n_eff · sum_weights', C.teal], ['WHERE', 'slot · request · Options.DefaultWeight · "weight": null', C.amber], ['RULES', 'honour · skip · refuse · PULSE_WEIGHT_INVALID_ROWS · no weighted windows', C.coral],
     ['COMPUTE', 'pulse rake · rim · cells · by · base_weight · caps · efficiency', C.violet], ['TABLES', 'OVERLAY_RAKE · weighted crosstab bases', C.violet]].forEach(([h, ops, c], k) => A(seg(t, 0.2 + k * 0.4, 0.6 + k * 0.4), () => {
      const y = 146 + k * 46; M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, c]), 240, y, 976, { size: 12 });
    }));
    A(seg(t, 3.8, 4.2), () => {
      R(64, 400, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more weight-aware operators over time', 82, 428, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists each operator\'s weight_kinds', 82, 452, { size: 14.5 });
      R(650, 400, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own operators', 668, 428, { size: 14, color: C.amber, weight: 600 }); T('Options.Extensions · weight_aware runs under both kinds', 668, 452, { size: 14.5 });
    });
  });
  A(seg(t, 9.8, 10.6), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('WEIGHTS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
    M('know what one row stands for', 640, 430, { size: 15, align: 'center' });
    M('next: time zones and panels', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[2.069, 4.843, 6.272, 7.168, 9.323, 6.549, 5.525, 6.4, 11.264, 6.485, 5.12, 7.019, 4.352, 6.037, 5.419, 5.184, 7.339, 8.853, 5.675, 6.144, 5.312, 4.587, 5.44, 6.912, 6.613, 5.269, 4.352, 6.741, 4.544, 7.851, 6.507, 5.44, 6.997, 4.8, 7.957, 6.997, 6.677, 6.848, 7.467, 4.907, 7.253, 7.403, 3.733, 7.829, 7.232, 6.677, 5.184, 5.611, 6.059, 4.523, 5.781, 8.043, 10.261, 5.589, 1.003]/*END*/;
PulseFilm.mount({
  series: 'PULSE · WEIGHTS',
  title: 'Pulse Weights',
  narr: NARR,
  scenes: [
    { name: 'Pulse Weights', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Weights, and what one row stands for.', true]] },
    { name: 'A weight on each row', dur: 8.0, draw: sIntro, caps: [
      [0, 'A weight column makes each row count as w rows in every weight-aware figure.'],
      [2.6, 'You set it on the request, on one slot, or, for an embedder, as the instance default, Options.DefaultWeight.',
        'You set it on the request, on one slot, or, for an embedder, as the instance default weight in the options.'],
      [6.0, 'Our cohort: six hundred illustrative survey rows over two waves, running young and male, with the north oversampled.']] },
    { name: 'Two kinds', dur: 8.4, draw: sKinds, caps: [
      [0, 'A weight has a kind. Probability, the default, is for design and raked weights. Frequency means a row stands for w identical rows.'],
      [2.6, 'Here is one small table stored two ways: six rows with a count, and the twenty rows that count stands for.'],
      [3.4, 'Under a frequency weight, the six rows give exactly the twenty rows\' count, mean and interval.'],
      [6.4, 'As a probability weight, the mean holds but the interval widens: it rests on the effective sample size.']] },
    { name: 'Effective sample size', dur: 8.0, draw: sNeff, caps: [
      [0, 'Weighted inference uses one rule: the unweighted formula on a sample size N star. That is the sum of weights for frequency weights, and Kish\'s effective n for probability weights.',
        'Weighted inference uses one rule: the unweighted formula on a sample size N star. That is the sum of weights for frequency weights, and Kish\'s effective N for probability weights.'],
      [2.6, 'The survey\'s design weight leaves an effective sample of five hundred and sixty-six, out of six hundred rows.'],
      [5.2, 'A weighted t-test keeps the raw n, and uses n_eff as its sample size.', 'A weighted t-test keeps the raw N, and uses the effective N as its sample size.']] },
    { name: 'Which weight a slot uses', dur: 8.4, draw: sResolve, caps: [
      [0, 'Each slot resolves its weight on its own: its own weight first, then the request\'s, then the instance default, then none.'],
      [1.6, 'Setting a slot\'s weight to null opts that one slot out, even under a default.'],
      [3.2, 'Predict shows the resolution before a row is read: each slot, its field, a status and the source.'],
      [5.0, 'Here the mean and the weighted count are applied, the base opts out, and the grouper skips the weight.'],
      [6.2, 'In the run, the weighted count is a sum of weights, and the opted-out base stays a plain count.']] },
    { name: 'Invalid weights', dur: 7.2, draw: sInvalid, caps: [
      [0, 'Pulse never coerces a bad weight. Here are ten rows whose weights include a null, a negative, a zero and a fraction.'],
      [2.4, 'Null and negative weights drop the row from that slot, and so does a fraction under a frequency weight. Zero is valid. n stays the raw count.',
        'Null and negative weights drop the row from that slot, and so does a fraction under a frequency weight. Zero is valid. N stays the raw count.'],
      [5.0, 'One warning per weight column counts the dropped rows by reason. Strict mode makes it an error.']] },
    { name: 'Honour, skip or refuse', dur: 9.6, draw: sHonour, caps: [
      [0, 'Which operators take a weight? The manifest is the table: each entry lists the weight kinds it supports.'],
      [1.4, 'Most aggregators, many tests, the main regressions and most matrix fits honour a weight.'],
      [2.2, 'Filters, features and most groupers skip it. The rest refuse, at predict too.'],
      [4.6, 'A minimum or maximum has no weighted form, so an explicit weight on it is a config error.'],
      [6.2, 'A rank test weights only under frequency weights, so a probability weight is refused, naming the kinds it supports.'],
      [7.8, 'A post-test reads the result rows, which carry no row weights. Opt any refused slot out with weight null.']] },
    { name: 'Windows and total()', dur: 9.2, draw: sWindows, caps: [
      [0, 'Windows have no weighted form, so a request weight on a request with windows is refused.'],
      [3.4, 'Put the weight on the aggregation instead, and the window ranks the weighted rows.'],
      [5.6, 'The total function is weighted too. Under a frequency weight it gives one hundred and thirty, the twenty rows\' total.'],
      [7.6, 'Under a probability weight it is refused, because a total would scale with the weights.']] },
    { name: 'Computing weights', dur: 9.6, draw: sRake, caps: [
      [0, 'So where do weights come from? pulse rake computes a weight per record, so the weighted sample matches known margins, such as census shares.',
        'So where do weights come from? Pulse rake computes a weight per record, so the weighted sample matches known margins, such as census shares.'],
      [1.6, 'A weight is a schema field, so it writes a new cohort with a rake_weight column. Embedders call Pulse.Rake.',
        'A weight is a schema field, so it writes a new cohort with a rake weight column. Embedders call Pulse dot Rake.'],
      [2.8, 'Here we rake age and gender to census targets, written inline, and each wave on its own.'],
      [5.4, 'Each sweep rescales every margin to its target, until the largest gap is within tolerance, or the sweeps run out.'],
      [7.6, 'Targets can be shares or counts, and a base weight lets you start from a design weight.']] },
    { name: 'The rake report', dur: 9.2, draw: sReport, caps: [
      [0, 'The report gives each category\'s observed share, its target, and what the weights achieve. Three sweeps, and every margin is met.'],
      [3.6, 'The efficiency report says what that cost: an effective sample of four hundred and sixty-one, seventy-seven percent.'],
      [6.2, 'Per wave, the first wave needed bigger weights, so it kept only seventy percent. The second kept eighty-five.'],
      [8.4, 'This design effect covers unequal weighting only: no strata, clusters or finite-population corrections.']] },
    { name: 'Caps and cells', dur: 9.6, draw: sCaps, caps: [
      [0, 'A cap trades fit for efficiency. Cap each weight at twice its wave\'s mean, and efficiency rises to seventy-nine percent.'],
      [1.6, 'But wave one can\'t reach its target for the over-fifty-fives with the cap in place.'],
      [2.6, 'It stops at a hundred sweeps, but still writes the cohort, with a warning naming the wave. Wave two converged in six.'],
      [5.2, 'A joint margin over two fields is cell weighting. One margin, rim or joint, is exact after a single sweep.'],
      [7.6, 'A category with no target is refused, and nothing is written.']] },
    { name: 'Using the weights', dur: 8.4, draw: sUse, caps: [
      [0, 'Raked weights are probability weights, so name the column with the default kind. Never declare them frequency weights: they are fractional.'],
      [1.8, 'Weighted counts by age now carry the census margin, and an opted-out count shows the unweighted base beside them.'],
      [4.4, 'Older respondents are more often satisfied, so the raked share rises, from fifty-two to fifty-five percent.'],
      [6.4, 'Its interval is wider, because it rests on the effective sample, not six hundred rows.']] },
    { name: 'OVERLAY_RAKE', dur: 8.4, draw: sOverlay, caps: [
      [0, 'To rake a table rather than a cohort, use OVERLAY_RAKE on a crosstab of counts or sums.', 'To rake a table rather than a cohort, use the rake overlay on a crosstab of counts or sums.'],
      [2.2, 'It returns the fitted table and each cell\'s adjustment factor, beside the host, which stays unchanged.'],
      [4.6, 'It writes nothing, and every row and column key needs exactly one target.'],
      [6.6, 'Its factors match the weights from raking the whole cohort, with no wave split, to the same margins.']] },
    { name: 'The toolkit', dur: 10.8, draw: sRecap, caps: [
      [0, 'That\'s weights in Pulse today: two kinds and the effective sample, where a weight comes from, what honours it, and raking cohorts and tables.'],
      [3.8, 'More are added over time. The manifest lists each operator\'s weight kinds, and an extension registered through Options.Extensions can declare itself weight-aware.',
        'More are added over time. The manifest lists each operator\'s weight kinds, and an extension registered through options dot extensions can declare itself weight-aware.'],
      [7.2, 'Remember: know what one row stands for before you count it. Next up, time zones and panels.'],
      [9.8, '', 'Pulse weights.', true]] },
  ],
});
})();
