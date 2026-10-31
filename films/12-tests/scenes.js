/* Pulse Tests and Regressions: film 12 of the 23-film Pulse Anatomy series. Follows SERIES-RULES.md.
 * D is an illustrative 240-row cohort; every figure on a result card comes from a recorded Pulse
 * v1.0.0-alpha.33 run on it in data/ (tr: four tests with a Holm block, REG_OLS, REG_GLM; xp: the
 * sample-ratio check, reference and CUPED; grp: grouped TEST_T; fit: hc3, holdout, REG_BAYES_LINEAR;
 * sep: a separated GLM failing alone beside an OLS fit). */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, ring, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const D = {"arm":"BAAAAAABBBAABBBBBBAAABABABBBAAABBABBBAABAABAABBABABBBBBABABBBBAAAAAAAAABABABBBABBAAABBAAABABBABABABABAABAABBBAABBAAABABABBBABABAAABBBAABAAAABABBBBAABABAABBBBABAAAAAAAAABBABABBBBBAABABBBBBBBAAAAAAABBAABBABAAABBAAABBAABAABBAAABBAABBAABBBAABBA","region":"NENEENESNEEEESENNNSNNESNNENSEEENESSSNSSNEENENESENENESEEENSNSNENSESSSNNSNEENNSENNNESEEEENSSENSNEESSSENNSSESNSNNESSNSNSSENSESENEESESENNNSNSNENNNNNNNSSSNSESNEENSESESNSNNNSESSESNNNSNENNEENNSNEENESSSEEEESSEEEENEEENNNEENNSSSESEEEENNEENESENNEESENS","spend":[66.89,38.77,44.76,61.6,37.18,63.36,64.61,62.19,46.62,66.63,35.24,78.74,46.38,69.42,74.77,51.21,54.41,47.24,46.67,33.91,60.21,68.74,60.07,45.87,56.49,37.75,60.63,65.06,37.92,43.72,58.28,47.18,51.4,56.45,71.47,79.17,34.15,61.61,63.86,70.73,36.29,69.01,77.0,73.22,26.42,66.18,76.37,33.14,60.06,24.31,57.01,43.05,67.45,46.03,53.89,42.78,44.75,37.99,77.32,51.94,52.16,35.79,44.76,70.08,56.05,28.03,36.99,61.22,78.52,37.49,56.28,37.5,38.53,66.12,52.31,28.26,33.57,42.5,41.32,64.01,40.72,29.08,59.82,70.25,52.47,64.33,58.44,6.99,46.05,28.69,49.78,68.84,55.8,50.98,51.13,44.04,71.06,39.99,57.22,51.09,53.29,55.71,50.37,51.33,47.72,56.56,37.71,77.93,74.22,57.09,52.16,41.7,53.0,41.92,49.38,48.96,77.28,43.6,36.52,48.86,55.63,51.1,51.23,71.98,70.03,62.83,67.83,36.37,49.21,59.43,75.06,47.36,48.37,54.09,40.58,59.95,65.57,41.49,15.09,39.17,46.37,31.0,70.41,47.37,52.6,48.47,49.85,64.04,28.39,27.17,57.02,44.18,48.6,34.88,76.26,34.47,25.35,44.86,45.78,39.04,40.23,40.43,44.47,51.37,59.57,43.56,37.9,63.96,46.11,49.55,61.17,51.67,40.01,29.61,60.37,64.6,45.21,68.97,38.31,52.39,37.45,24.83,53.39,38.59,64.26,25.9,57.84,54.56,47.24,48.53,78.09,59.18,51.79,41.93,50.03,30.22,66.01,47.14,45.75,54.59,41.86,64.72,65.97,48.95,44.28,37.57,42.32,70.63,58.47,39.6,38.5,31.88,62.89,42.39,69.19,54.4,76.8,43.18,34.39,71.8,45.64,37.91,36.66,39.15,82.16,49.15,34.38,33.03,46.98,74.24,31.56,28.15,59.82,39.67,48.55,39.62,71.91,43.75,54.23,32.48],"visits":[7.5,4.5,2.5,10.5,3.5,10.5,12.5,8.5,3.5,8.5,7.5,10.5,6.5,12.5,10.5,8.5,4.5,3.5,9.5,2.5,8.5,10.5,11.5,4.5,6.5,1.5,11.5,8.5,6.5,6.5,5.5,6.5,4.5,12.5,12.5,12.5,4.5,11.5,12.5,12.5,3.5,10.5,9.5,12.5,1.5,7.5,11.5,3.5,10.5,1.5,9.5,1.5,10.5,4.5,4.5,4.5,3.5,4.5,11.5,4.5,6.5,2.5,2.5,11.5,9.5,2.5,2.5,9.5,9.5,5.5,8.5,1.5,8.5,7.5,6.5,3.5,3.5,4.5,5.5,1.5,1.5,1.5,10.5,12.5,8.5,12.5,10.5,1.5,8.5,1.5,9.5,12.5,7.5,10.5,10.5,4.5,8.5,1.5,7.5,9.5,12.5,8.5,6.5,2.5,5.5,7.5,1.5,9.5,11.5,12.5,5.5,5.5,11.5,4.5,6.5,6.5,10.5,5.5,6.5,5.5,5.5,8.5,4.5,12.5,9.5,12.5,11.5,5.5,5.5,9.5,11.5,5.5,8.5,5.5,4.5,10.5,7.5,1.5,1.5,3.5,5.5,1.5,9.5,1.5,6.5,7.5,4.5,12.5,1.5,4.5,5.5,5.5,6.5,4.5,9.5,2.5,4.5,5.5,5.5,2.5,2.5,6.5,4.5,10.5,11.5,4.5,6.5,9.5,9.5,5.5,12.5,4.5,3.5,3.5,10.5,9.5,4.5,10.5,4.5,7.5,3.5,6.5,7.5,1.5,8.5,2.5,8.5,9.5,3.5,3.5,12.5,10.5,9.5,6.5,5.5,1.5,9.5,6.5,6.5,9.5,1.5,6.5,11.5,4.5,6.5,3.5,5.5,11.5,3.5,1.5,7.5,5.5,9.5,4.5,6.5,11.5,11.5,4.5,6.5,9.5,4.5,3.5,3.5,2.5,9.5,4.5,2.5,4.5,6.5,9.5,1.5,2.5,9.5,8.5,6.5,4.5,12.5,2.5,5.5,3.5],"tenure":[6.86,1.34,5.96,4.57,3.61,6.14,1.57,6.27,7.29,3.59,2.48,8.1,6.35,6.98,9.94,4.2,7.91,5.04,3.51,2.59,8.48,3.87,8.18,1.61,6.41,1.63,3.27,5.35,7.66,2.32,9.81,7.95,6.52,8.23,1.26,9.89,1.92,4.1,7.75,4.56,2.53,9.82,5.93,9.4,3.27,8.51,6.25,5.71,1.04,3.93,1.51,7.84,9.76,7.29,8.56,4.86,9.46,7.72,8.49,4.21,5.99,2.02,3.39,8.37,6.14,3.42,6.47,4.76,7.39,6.66,5.5,1.17,3.21,9.73,2.79,1.13,1.5,7.23,5.01,9.69,4.02,1.82,1.38,8.06,2.35,8.31,8.18,2.2,6.03,5.11,1.59,7.81,1.69,2.33,2.2,7.08,5.2,3.61,2.89,3.36,4.29,7.13,4.38,9.46,3.28,7.8,8.51,3.84,4.6,4.7,5.37,3.68,3.15,5.51,9.97,6.0,2.82,4.04,2.13,9.07,8.64,1.0,8.05,6.83,7.99,3.73,4.94,3.01,9.97,3.11,3.77,3.05,1.31,7.65,3.81,5.46,9.19,9.77,2.66,3.96,6.98,1.7,9.68,7.35,4.28,1.31,7.73,7.45,7.49,1.97,9.22,8.4,5.15,4.67,3.93,2.88,2.2,3.51,2.79,4.56,6.88,1.36,6.4,3.34,6.37,10.0,4.68,5.35,2.39,7.01,6.1,4.52,4.81,1.13,6.6,2.55,3.71,9.34,6.59,9.45,3.22,2.06,3.77,1.03,7.87,1.6,5.54,1.72,1.23,9.84,9.38,3.47,9.68,1.33,7.12,6.73,6.22,3.38,7.88,3.28,7.72,9.06,1.41,4.72,6.62,5.06,4.62,6.21,9.13,9.21,2.8,1.57,1.06,9.97,9.02,5.98,9.36,8.58,2.73,7.28,6.13,2.3,4.1,7.63,9.02,2.85,8.43,3.65,3.31,5.28,4.93,6.17,2.82,7.26,9.61,5.48,6.05,4.8,3.37,5.78],"conv":"100001110000011000001111001100001110010100010101101010000111100111001010011001000011110001111100100111000000111010101100110111100110000100001000110100000000101000101111100000110101101010100010010000000110010100001111100001110100110010111000"};
const NR = D.spend.length;
const pfmt = p => p < 0.0001 ? p.toExponential(1).replace('e-', '×10⁻').replace(/⁻(\d+)/, (m, d) => '⁻' + d.split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('')) : p.toFixed(4);
const RES = {
  // data/tr.out.json
  t: { stat: -4.0118, df: 236.84, p: 8.0829e-5, padj: 2.4249e-4, diff: -7.0588, lo: -10.52499, hi: -3.59251, d: -0.5183, mean: [47.447, 54.506], vari: [181.85, 189.23], n: [123, 117] },
  chi: { stat: 7.9040, df: 2, p: 0.019216, padj: 0.038433, v: 0.1815, tab: [[48, 39], [33, 51], [42, 27]], rows: ['East', 'North', 'South'], cols: ['A', 'B'], exMin: 33.64 },
  r: { stat: 0.78197, p: 9.0866e-51, padj: 3.6346e-50, lo: 0.7274, hi: 0.8267 },
  f: { stat: 1.3352, p: 0.26508, padj: 0.26508, means: [50.291, 49.650, 53.178], groups: ['North', 'East', 'South'], msw: 196.62, dfw: 237, eta: 0.0111 },
  ols: { b0: 21.3246, bv: 3.15029, bt: 1.53066, se: [1.4677, 0.14936, 0.19024], lo: [18.433, 2.8560, 1.1559], hi: [24.216, 3.4445, 1.9054], r2: 0.6948, adj: 0.6923, rse: 7.789, df: 237 },
  glm: { b0: -2.57096, bv: 0.33286, se: [0.37893, 0.049133], lo: [-3.3137, 0.23656], hi: [-1.8283, 0.42916], dev: 270.43, nulldev: 328.95, pr2: 0.1779, iters: 5 },
  // data/xp.out.json
  srm: { obs: [123, 117], exp: [120, 120], stat: 0.15, p: 0.69854 },
  ref: { diff: 7.0588, lo: 3.59251, hi: 10.52499 },
  cup: { diff: 6.1190, lo: 4.9006, hi: 7.3374, theta: 0.86808, vr: 0.87645 },
  // data/grp.out.json: [group_key, diff B − A, ci_low, ci_high, p, n B, n A]
  grp: [['East', 8.6070, 2.7693, 14.4446, 0.0043327, 39, 48], ['North', 6.9198, 0.9059, 12.9337, 0.024754, 51, 33], ['South', 7.0817, -0.0615, 14.2250, 0.051916, 27, 42]],
  // data/fit.out.json
  hc3: [1.4937, 0.15462, 0.19406],
  ho: { n: 48, rmse: 8.3787, mae: 6.9799, r2: 0.6364, nTrain: 192, r2Train: 0.7067, rse: 7.6443 },
  bay: { b: 3.15034, se: 0.14843, lo: 2.85796, hi: 3.44273 },
};
const meanOf = a => a.reduce((x, y) => x + y, 0) / a.length;
const TEN = meanOf(D.tenure);

/* ---------- 0. title (the kit intro has already shown the film title) ---------- */
function sTitle(t) {
  const g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
  [[C.teal, 560, 46], [C.violet, 720, 46]].forEach(([col, m, s], k) => A(seg(t, 0.1 + k * 0.3, 0.6 + k * 0.3), () => {
    const pts = []; for (let x = 360; x <= 920; x += 6) pts.push([x, 380 - 110 * g(x, lerp(640, m, eio(seg(t, 0.4, 1.4))), s)]);
    Ln(pts, { stroke: col, lw: 2.5 });
  }));
  A(seg(t, 0.8, 1.5), () => T('Is the difference real, and what drives it?', 640, 450, { size: 30, weight: 700, align: 'center' }));
}

/* ---------- 1. where they run ---------- */
function sWhere(t) {
  const SP = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
  SP.forEach((n, i) => A(seg(t, 0.1 + i * 0.06, 0.4 + i * 0.06) * 0.6, () => {
    const x = 64 + i * 164; R(x, 110, 150, 46, { fill: C.panel, stroke: C.rule }); T(n, x + 14, 139, { size: 15, weight: 600, color: C.muted });
    if (i < 6) arrow(x + 150, 133, x + 162, 133, { stroke: C.faint, head: 6 });
  }));
  A(seg(t, 0.8, 1.2), () => {
    R(392, 172, 578, 44, { fill: C.violetS, stroke: C.violet });
    M('"tests" (tier 1) and "regressions": read raw records, in the scan', 410, 199, { size: 13, color: C.ink });
    arrow(330, 194, 388, 194, { stroke: C.violet });
    M('after filters', 230, 199, { size: 12, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    R(884, 228, 332, 64, { fill: C.amberS, stroke: C.amber });
    M('"post_tests" (tier 2)', 900, 254, { size: 13, color: C.amber, weight: 600 }); M('read the result rows, after windows', 900, 278, { size: 12.5, color: C.ink });
    arrow(1054, 160, 1054, 224, { stroke: C.amber });
  });
  A(seg(t, 4.2, 4.6), () => {
    card(64, 316, 560, 250, C.violet);
    CAP('THE SLOTS', 86, 344);
    const L = [['"tests": [{ "type": "TEST_T",', C.ink], ['  "field": "spend", "split_by": "arm" }],', C.ink], ['"post_tests": [ … ],', C.amber], ['"regressions": [{ "type": "REG_OLS",', C.ink], ['  "target": "spend",', C.ink], ['  "predictors": ["visits", "tenure"] }]', C.ink]];
    L.forEach(([s, c], i) => A(seg(t, 4.4 + i * 0.1, 4.7 + i * 0.1), () => M(s, 86, 376 + i * 28, { size: 13.5, color: c })));
  });
  A(seg(t, 6.0, 6.4), () => {
    card(656, 316, 560, 250);
    CAP('WHERE RESULTS LAND', 678, 344);
    [['Response.Tests', C.violet], ['Response.PostTests', C.amber], ['Response.Regressions', C.violet]].forEach(([s, c], i) => M(s, 678, 380 + i * 30, { size: 14, color: c }));
    M('no Response.Components: the result carries', 678, 488, { size: 12.5, color: C.muted }); M('its own details', 678, 510, { size: 12.5, color: C.muted });
    M('cohort: 240 illustrative rows', 678, 546, { size: 12, color: C.faint });
  });
}

/* ---------- 2. one result shape ---------- */
function sShape(t) {
  CAP('EVERY TEST RETURNS THE SAME SHAPE · TEST_T spend by arm', 64, 124, { color: C.violet });
  const F = [['type', 'TEST_T', C.ink, 'which test'], ['variant', 'welch_two_sample', C.ink, 'the form that ran'], ['statistic', RES.t.stat.toFixed(2), C.violet, 't'],
    ['df', RES.t.df.toFixed(1), C.ink, 'Welch degrees of freedom'], ['p_value', pfmt(RES.t.p), C.violet, 'two-sided'], ['alpha', '0.05', C.muted, 'the default threshold'],
    ['reject_null', 'true', C.teal, 'p below alpha'], ['details.diff', RES.t.diff.toFixed(2), C.ink, 'mean A − mean B (default order)'], ['details.ci_low … ci_high', RES.t.lo.toFixed(2) + ' … ' + RES.t.hi.toFixed(2), C.ink, '95% interval on the difference'],
    ['details.effect_size.cohens_d', RES.t.d.toFixed(2), C.amber, 'how big, not just how sure']];
  F.forEach(([k, v, c, d], i) => A(seg(t, 0.3 + i * (i < 7 ? 0.35 : 0.5), 0.6 + i * (i < 7 ? 0.35 : 0.5)), () => {
    const y = 162 + i * 38;
    M(k, 64, y, { size: 14, color: C.muted }); M(v, 380, y, { size: 15, color: c, weight: 600 }); M(d, 660, y, { size: 13, color: C.faint });
  }));
  A(seg(t, 5.6, 6.0), () => M('a tiny p with a tiny effect is still a tiny effect: read both', 64, 566, { size: 13.5, color: C.amber }));
}

/* ---------- 3. choosing ---------- */
function sChoose(t) {
  CAP('CHOOSING A TEST · START FROM THE OUTCOME', 64, 124, { color: C.violet });
  const B = [
    [0.3, 'a number, two groups', 'TEST_T · TEST_WELCH · TEST_MANN_WHITNEY_U', 'skewed or ranked → the rank test'],
    [0.9, 'a number, three or more groups', 'TEST_ANOVA_F · TEST_ANOVA_WELCH · TEST_KRUSKAL_WALLIS', 'unequal spread → Welch'],
    [1.5, 'the same subjects twice', 'TEST_PAIRED_T · TEST_WILCOXON_SR · TEST_ANOVA_RM', 'pairs on one row'],
    [2.1, 'a yes / no rate', 'TEST_PROP_Z', 'two groups, or one against p0'],
    [2.7, 'two categories', 'TEST_CHISQ · TEST_FISHER_EXACT', 'small 2×2 → Fisher'],
    [3.3, 'two numbers', 'TEST_PEARSON_R · TEST_SPEARMAN_R · TEST_KENDALL_TAU', 'outliers → ranks'],
    [3.9, 'a shape', 'TEST_SHAPIRO_WILK · TEST_KS · TEST_BROWN_FORSYTHE', 'normal? same shape? same spread?']];
  B.forEach(([at, q, ops, d], i) => A(seg(t, at, at + 0.4), () => {
    const y = 146 + i * 62;
    R(64, y, 1152, 52, { fill: C.panel, stroke: C.rule });
    T(q, 84, y + 33, { size: 16, weight: 600 }); M(ops, 420, y + 32, { size: 12.5, color: C.violet }); M(d, 1196, y + 32, { size: 12, color: C.muted, align: 'right' });
  }));
}

/* ---------- 4. two groups ---------- */
function sTwo(t) {
  CAP('TEST_T · spend, A against B', 64, 124, { color: C.violet });
  const X = v => 100 + (v - 10) / 80 * 760, base = 400, g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / s;
  Ln([[90, base], [880, base]], { stroke: C.rule });
  [10, 30, 50, 70, 90].forEach(v => M(String(v), X(v), base + 20, { size: 12, align: 'center' }));
  [[0, C.teal, 'A'], [1, C.violet, 'B']].forEach(([k, col, lab]) => A(seg(t, 0.3 + k * 0.8, 1.0 + k * 0.8), () => {
    const m = RES.t.mean[k], s = Math.sqrt(RES.t.vari[k]), pts = [];
    for (let v = 10; v <= 90; v += 0.5) pts.push([X(v), base - 2600 * g(v, m, s) * eo(seg(t, 0.3 + k * 0.8, 1.2 + k * 0.8))]);
    Ln(pts, { stroke: col, lw: 2.5 });
    Ln([[X(m), base], [X(m), base - 205]], { stroke: col, dash: [4, 4] });
    M(lab + ' mean ' + m.toFixed(1) + ' · n ' + RES.t.n[k], X(m) + (k ? 8 : -8), 170 + k * 22, { size: 13, color: col, align: k ? 'left' : 'right' });
  }));
  A(seg(t, 2.6, 3.0), () => {
    card(910, 150, 306, 250, C.violet);
    M('t', 930, 186, { size: 13, color: C.muted }); T(RES.t.stat.toFixed(2), 1196, 188, { size: 22, weight: 700, align: 'right' });
    M('df', 930, 222, { size: 13, color: C.muted }); T(RES.t.df.toFixed(1), 1196, 224, { size: 22, weight: 700, align: 'right' });
    M('p', 930, 258, { size: 13, color: C.muted }); T(pfmt(RES.t.p), 1196, 260, { size: 22, weight: 700, align: 'right', color: C.teal });
    M('A − B', 930, 300, { size: 13, color: C.muted }); M(RES.t.lo.toFixed(1) + ' … ' + RES.t.hi.toFixed(1), 1196, 300, { size: 14, align: 'right' });
    M('Cohen\'s d', 930, 336, { size: 13, color: C.muted }); M(RES.t.d.toFixed(2), 1196, 336, { size: 14, align: 'right', color: C.amber });
    M('Welch: no equal-spread assumption', 930, 380, { size: 11.5, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 450, 1152, 110);
    M('skewed values or outliers?', 86, 482, { size: 14, color: C.ink, weight: 600 });
    M('TEST_MANN_WHITNEY_U compares ranks: does one group tend to sit higher? It tests a different question from the mean,', 86, 510, { size: 13, color: C.muted });
    M('so when the two disagree, that is information, not a bug', 86, 534, { size: 13, color: C.muted });
  });
}

/* ---------- 5. many groups ---------- */
function sMany(t) {
  CAP('TEST_ANOVA_F · spend across three regions', 64, 124, { color: C.violet });
  const Y = v => 420 - (v - 10) / 90 * 260;
  [10, 40, 70, 100].forEach(v => { M(String(v), 92, Y(v) + 4, { size: 12, align: 'right' }); Ln([[100, Y(v)], [640, Y(v)]], { stroke: C.panel2 }); });
  RES.f.groups.forEach((g, k) => {
    const x = 180 + k * 170, col = [C.teal, C.violet, C.amber][k];
    A(seg(t, 0.3 + k * 0.3, 0.8 + k * 0.3), () => {
      let j = 0;
      D.region.split('').forEach((r, i) => { if (r !== g[0]) return; j++; const jit = ((j * 37) % 60) - 30; dot(x + jit, Y(D.spend[i]), 2.6, col); });
      Ln([[x - 50, Y(RES.f.means[k])], [x + 50, Y(RES.f.means[k])]], { stroke: C.ink, lw: 3 });
      M(g, x, 452, { size: 13, align: 'center', color: col }); M(RES.f.means[k].toFixed(1), x + 56, Y(RES.f.means[k]) + 4, { size: 12.5 });
    });
  });
  A(seg(t, 1.6, 2.0), () => {
    card(690, 150, 526, 140, C.violet);
    M('F ' + RES.f.stat.toFixed(2) + ' · df 2 · p ' + RES.f.p.toFixed(3), 712, 186, { size: 16, color: C.ink, weight: 600 });
    M('reject_null: false', 712, 216, { size: 13.5, color: C.coral });
    M('eta² ' + RES.f.eta.toFixed(3) + ': region explains about 1% of spend', 712, 246, { size: 13, color: C.amber });
    M('a rejection would say SOME means differ, not which', 712, 274, { size: 12, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(690, 306, 526, 120);
    CAP('CHECK FIRST', 712, 334);
    M('TEST_SHAPIRO_WILK with split_by: normal enough per group?', 712, 362, { size: 12.5, color: C.ink });
    M('TEST_BROWN_FORSYTHE: similar spread?', 712, 386, { size: 12.5, color: C.ink });
    M('evidence, not proof: big samples flag trivial departures', 712, 410, { size: 12, color: C.muted });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(64, 474, 1152, 92, C.amber);
    M('unequal spread → TEST_ANOVA_WELCH · badly skewed → TEST_KRUSKAL_WALLIS', 86, 504, { size: 13.5, color: C.ink });
    M('which pairs differ? TEST_TUKEY_HSD as a post-test, given this ANOVA\'s ms_within ' + RES.f.msw.toFixed(1) + ' and df_within ' + RES.f.dfw, 86, 534, { size: 13.5, color: C.amber });
  });
}

/* ---------- 6. counts ---------- */
function sCounts(t) {
  CAP('TEST_CHISQ · region × arm', 64, 124, { color: C.violet });
  const c = RES.chi, x0 = 200, y0 = 190;
  c.cols.forEach((cl, j) => A(seg(t, 0.2, 0.5), () => T('arm ' + cl, x0 + 80 + j * 170, y0 - 12, { size: 14, weight: 600, align: 'center' })));
  const tot = 240, rt = c.tab.map(r => r[0] + r[1]), ct = [0, 1].map(j => c.tab.reduce((s, r) => s + r[j], 0));
  c.tab.forEach((row, i) => A(seg(t, 0.4 + i * 0.2, 0.7 + i * 0.2), () => {
    const y = y0 + 20 + i * 76;
    M(c.rows[i], x0 - 20, y + 42, { size: 14, color: C.teal, align: 'right' });
    row.forEach((v, j) => {
      const ex = rt[i] * ct[j] / tot, over = v > ex;
      R(x0 + j * 170, y, 160, 64, { fill: C.panel, stroke: over ? C.violet : C.rule });
      T(String(v), x0 + 20 + j * 170, y + 40, { size: 24, weight: 700 });
      A(seg(t, 2.0, 2.4), () => M('expected ' + ex.toFixed(1), x0 + 150 + j * 170, y + 40, { size: 11.5, color: C.amber, align: 'right' }));
    });
  }));
  A(seg(t, 0.9, 1.3), () => M('row_labels and col_labels sort byte-wise', x0, y0 + 270, { size: 12, color: C.muted }));
  A(seg(t, 3.4, 3.8), () => {
    card(620, 170, 596, 170, C.violet);
    M('χ² ' + c.stat.toFixed(2) + ' · df ' + c.df + ' · p ' + c.p.toFixed(4), 642, 210, { size: 17, weight: 600, color: C.ink });
    M('Cramér\'s V ' + c.v.toFixed(2) + ': a weak association', 642, 244, { size: 14, color: C.amber });
    M('smallest expected count ' + c.exMin.toFixed(1), 642, 276, { size: 13, color: C.muted });
    M('axes: categorical or packed_bool fields', 642, 306, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(620, 360, 596, 110, C.coral);
    M('any expected count under 5', 642, 392, { size: 13.5, color: C.coral, weight: 600 });
    M('→ warning PULSE_TEST_EXPECTED_COUNT_TOO_LOW', 642, 420, { size: 13, color: C.ink });
    M('a small 2×2 table → TEST_FISHER_EXACT, an exact p', 642, 448, { size: 13, color: C.ink });
  });
}

/* ---------- 7. experiment readout ---------- */
function sExp(t) {
  CAP('READING AN EXPERIMENT · ARM B AGAINST CONTROL A', 64, 124, { color: C.violet });
  // the sample-ratio check
  A(seg(t, 0.2, 0.6), () => {
    card(64, 150, 360, 410, C.teal);
    CAP('SAMPLE-RATIO CHECK', 84, 180, { color: C.teal });
    M('TEST_CHISQ, "rows": "arm",', 84, 212, { size: 12.5, color: C.ink }); M('no cols, "params": { "expected":', 84, 234, { size: 12.5, color: C.ink }); M('  { "A": 0.5, "B": 0.5 } }', 84, 256, { size: 12.5, color: C.ink });
    const Yb = v => 450 - v / 130 * 150;
    ['A', 'B'].forEach((l, j) => {
      const x = 130 + j * 140, u = eo(seg(t, 0.5 + j * 0.2, 1.2 + j * 0.2)), o = RES.srm.obs[j];
      R(x, Yb(o * u), 60, 450 - Yb(o * u), { fill: C.tealS, stroke: C.teal, r: 3 });
      Ln([[x - 10, Yb(RES.srm.exp[j])], [x + 70, Yb(RES.srm.exp[j])]], { stroke: C.amber, dash: [5, 4], lw: 2 });
      A(u, () => T(String(o), x + 30, Yb(o) + 26, { size: 16, weight: 700, align: 'center' }));
      M('arm ' + l, x + 30, 472, { size: 12.5, align: 'center', color: C.muted });
    });
    M('dashed: expected 120 each', 244, 492, { size: 11.5, color: C.amber, align: 'center' });
    M('goodness_of_fit · χ² ' + RES.srm.stat.toFixed(2) + ' · p ' + RES.srm.p.toFixed(3), 84, 520, { size: 12.5, color: C.ink });
    M('no mismatch: the split held', 84, 544, { size: 13, color: C.teal, weight: 600 });
  });
  // reference
  A(seg(t, 3.0, 3.4), () => {
    card(444, 150, 360, 410, C.violet);
    CAP('REFERENCE', 464, 180, { color: C.violet });
    M('TEST_T, "params": { "reference": "A" }', 464, 212, { size: 12.5, color: C.ink });
    M('diff reads B − A, variant − control', 464, 252, { size: 13, color: C.muted });
    T('+' + RES.ref.diff.toFixed(2), 624, 340, { size: 54, weight: 800, align: 'center', color: C.violet });
    M('95% CI ' + RES.ref.lo.toFixed(2) + ' … ' + RES.ref.hi.toFixed(2), 624, 384, { size: 14, align: 'center' });
    M('without it: alphabetical, A − B = ' + RES.t.diff.toFixed(2), 464, 470, { size: 12.5, color: C.faint });
  });
  // CUPED
  A(seg(t, 5.4, 5.8), () => {
    card(824, 150, 392, 410, C.amber);
    CAP('CUPED', 844, 180, { color: C.amber });
    M('"reference": "A",', 844, 212, { size: 12.5, color: C.ink }); M('"covariate": "pre_spend"', 844, 234, { size: 12.5, color: C.ink });
    const X = v => 864 + v / 12 * 312, iv = [['raw', RES.ref.diff, RES.ref.lo, RES.ref.hi, C.faint, 300], ['CUPED', RES.cup.diff, RES.cup.lo, RES.cup.hi, C.amber, 350]];
    Ln([[X(0), 390], [X(12), 390]], { stroke: C.rule });
    [0, 4, 8, 12].forEach(v => M(String(v), X(v), 408, { size: 11, align: 'center' }));
    iv.forEach(([lab, d, lo, hi, col, y], k) => A(k ? eo(seg(t, 6.0, 6.8)) : 1, () => {
      Ln([[X(lo), y], [X(hi), y]], { stroke: col, lw: 4 }); dot(X(d), y, 6, col);
      M(lab, X(lo) - 8, y + 4, { size: 11.5, color: col, align: 'right' });
    }));
    M('diff ' + RES.cup.diff.toFixed(2) + ' · CI ' + RES.cup.lo.toFixed(2) + ' … ' + RES.cup.hi.toFixed(2), 844, 448, { size: 13, color: C.ink, weight: 600 });
    M('diff_unadjusted ' + RES.ref.diff.toFixed(2), 844, 474, { size: 12.5, color: C.muted });
    M('theta ' + RES.cup.theta.toFixed(2) + ' · variance_reduction ' + RES.cup.vr.toFixed(2), 844, 500, { size: 12.5, color: C.muted });
    M('the t family and TEST_PROP_Z', 844, 538, { size: 12, color: C.faint });
  });
}

/* ---------- 8. grouped tests ---------- */
function sGroup(t) {
  CAP('"groups": [{ "field": "region" }] · TEST_T RUNS ONCE PER GROUP', 64, 124, { color: C.violet });
  [['group_key', 64], ['n B / A', 230], ['diff B − A', 370], ['p_value', 520], ['reject_null', 640]].forEach(([h, x]) => M(h, x, 170, { size: 12.5, color: C.muted }));
  Ln([[64, 182], [1216, 182]]);
  const X = v => 820 + (v + 2) / 18 * 380;
  A(seg(t, 0.2, 0.5), () => {
    Ln([[X(0), 196], [X(0), 420]], { stroke: C.coral, dash: [4, 4] });
    [0, 4, 8, 12, 16].forEach(v => M(String(v), X(v), 440, { size: 11, align: 'center' }));
    M('95% CI on B − A', X(7), 462, { size: 11.5, align: 'center', color: C.muted });
  });
  RES.grp.forEach(([g, d, lo, hi, p, nb, na], i) => A(seg(t, 0.5 + i * 0.35, 0.8 + i * 0.35), () => {
    const y = 226 + i * 70, rej = p < 0.05;
    M('["' + g + '"]', 64, y, { size: 14, color: C.teal }); M(nb + ' / ' + na, 230, y, { size: 14 });
    M(d.toFixed(2), 370, y, { size: 14, weight: 600 }); M(p.toFixed(4), 520, y, { size: 14, color: rej ? C.teal : C.coral });
    M(String(rej), 640, y, { size: 14, color: rej ? C.teal : C.coral });
    Ln([[X(lo), y - 4], [X(hi), y - 4]], { stroke: rej ? C.violet : C.coral, lw: 3 }); dot(X(d), y - 4, 5, rej ? C.violet : C.coral);
  }));
  A(seg(t, 2.6, 3.0), () => {
    card(64, 490, 1152, 76);
    M('each result equals an ungrouped run filtered to that group · grouped tests buffer', 86, 520, { size: 13, color: C.ink });
    M('across groups, like ANOVA by region: leave "groups" out', 86, 546, { size: 12.5, color: C.muted });
  });
}

/* ---------- 9. relationships ---------- */
function sRel(t) {
  CAP('TEST_PEARSON_R · spend against visits', 64, 124, { color: C.violet });
  const X = v => 110 + (v - 1) / 12 * 600, Y = s => 470 - (s - 0) / 110 * 320;
  Ln([[100, 470], [720, 470]], { stroke: C.rule }); Ln([[100, 150], [100, 470]], { stroke: C.rule });
  M('visits', 720, 494, { size: 12, align: 'right' }); M('spend', 108, 160, { size: 12 });
  D.spend.forEach((s, i) => A(seg(t, 0.2 + (i % 40) * 0.02, 0.5 + (i % 40) * 0.02), () => dot(X(D.visits[i]), Y(s), 3, D.arm[i] === 'A' ? C.teal : C.violet)));
  A(seg(t, 1.6, 2.0), () => {
    card(760, 150, 456, 150, C.violet);
    M('r', 782, 190, { size: 14, color: C.muted }); T(RES.r.stat.toFixed(2), 1196, 194, { size: 30, weight: 800, align: 'right' });
    M('95% interval ' + RES.r.lo.toFixed(2) + ' … ' + RES.r.hi.toFixed(2), 782, 232, { size: 13, color: C.ink });
    M('p ' + pfmt(RES.r.p) + ' · n 240', 782, 262, { size: 13, color: C.teal });
  });
  A(seg(t, 3.4, 3.8), () => {
    card(760, 318, 456, 110);
    M('linear only, and outliers dominate', 782, 350, { size: 13.5, color: C.ink, weight: 600 });
    M('TEST_SPEARMAN_R and TEST_KENDALL_TAU use ranks', 782, 378, { size: 12.5, color: C.muted });
    M('Kendall\'s cost grows with n²', 782, 402, { size: 12.5, color: C.muted });
  });
}

/* ---------- 10. tier 2 ---------- */
function sPost(t) {
  CAP('POST-TESTS · TIER 2 · OVER THE RESULT ROWS', 64, 124, { color: C.amber });
  const st = [['raw records', C.teal], ['groups + aggregations', C.violet], ['windows', C.violet], ['result rows', C.amber]];
  st.forEach(([s, c], i) => A(seg(t, 0.2 + i * 0.3, 0.5 + i * 0.3), () => { const x = 64 + i * 296; R(x, 150, 270, 52, { fill: C.panel, stroke: c }); T(s, x + 16, 182, { size: 15, weight: 600 }); if (i < 3) arrow(x + 270, 176, x + 292, 176, { stroke: C.faint }); }));
  // an illustrative smoothed series (drawn, not a recorded run) under the trend test
  const raw = [31, 35, 30, 38, 36, 41, 37, 44, 40, 47, 43, 49], ma = raw.map((_, i) => { const s = raw.slice(Math.max(0, i - 2), i + 1); return s.reduce((a, b) => a + b, 0) / s.length; });
  const X = i => 100 + i * 46, Y = v => 470 - (v - 25) * 8;
  A(seg(t, 1.6, 2.0), () => {
    raw.forEach((v, i) => R(X(i) - 12, Y(v), 24, 470 - Y(v), { fill: C.panel2, stroke: C.faint, r: 2 }));
    Ln(ma.map((v, i) => [X(i), Y(v)]), { stroke: C.violet, lw: 2.5 });
    M('monthly mean · WIN_MOVING_AVG', 100, 254, { size: 12.5, color: C.violet });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(690, 240, 526, 130, C.amber);
    M('TEST_TREND on the moving average', 712, 272, { size: 13.5, color: C.amber, weight: 600 });
    M('Mann-Kendall: is the series rising or falling?', 712, 300, { size: 13, color: C.ink });
    M('needs order_by · at least 3 points, about 10 advised', 712, 326, { size: 12.5, color: C.muted });
    M('a moving average first tames seasonality and noise', 712, 350, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(690, 390, 526, 110);
    M('TEST_TUKEY_HSD reads group means', 712, 422, { size: 13.5, color: C.violet, weight: 600 });
    M('every pair, family-wise α already controlled', 712, 450, { size: 13, color: C.ink });
    M('result rows carry no row weights: never weighted', 712, 476, { size: 12.5, color: C.muted });
  });
}

/* ---------- 11. many tests ---------- */
function sMult(t) {
  CAP('"multiplicity": { "method": "holm" } · FOUR TESTS, ONE FAMILY', 64, 124, { color: C.violet });
  const rows = [['TEST_PEARSON_R', RES.r.p, RES.r.padj], ['TEST_T', RES.t.p, RES.t.padj], ['TEST_CHISQ', RES.chi.p, RES.chi.padj], ['TEST_ANOVA_F', RES.f.p, RES.f.padj]];
  [['test', 64], ['p_value (never moves)', 340], ['p_adjusted (beside it)', 680], ['significant_adjusted', 980]].forEach(([h, x]) => T(h, x, 166, { size: 14, weight: 600 }));
  Ln([[64, 178], [1216, 178]]);
  rows.forEach(([n, p, pa], i) => {
    const y = 214 + i * 46;
    A(seg(t, 0.3 + i * 0.15, 0.6 + i * 0.15), () => { M(n, 64, y, { size: 14, color: C.violet }); M(pfmt(p), 340, y, { size: 14 }); });
    A(seg(t, 1.6 + i * 0.3, 1.9 + i * 0.3), () => { M(pfmt(pa), 680, y, { size: 14, color: C.amber }); M('×' + (4 - i), 900, y, { size: 12, color: C.faint, align: 'right' }); M(pa < 0.05 ? 'true' : 'false', 980, y, { size: 14, color: pa < 0.05 ? C.teal : C.coral }); });
  });
  A(seg(t, 3.6, 4.0), () => M('Holm: sort the p-values, multiply the smallest by 4, the next by 3 … and never let one fall below the one before', 64, 410, { size: 13, color: C.ink }));
  A(seg(t, 5.0, 5.4), () => {
    card(64, 434, 1152, 136);
    M('methods: bonferroni · holm (family-wise error) · bh · by (false discovery rate) · same results as R p.adjust', 86, 464, { size: 13, color: C.ink });
    M('families: the request · a Compose batch · an overlay layer, row or column · one matrix result', 86, 492, { size: 13, color: C.muted });
    M('a regression\'s coefficients join only through its own "multiplicity" block, never inherited', 86, 520, { size: 13, color: C.muted });
  });
  A(seg(t, 6.6, 7.0), () => M('ten or more uncorrected p-values and no block → predict raises PULSE_ADVISORY_MANY_TESTS', 86, 550, { size: 13, color: C.amber }));
}

/* ---------- 12. least squares ---------- */
function sOLS(t) {
  CAP('REG_OLS · spend ~ visits + tenure', 64, 124, { color: C.violet });
  const X = v => 110 + (v - 1) / 12 * 560, Y = s => 470 - s / 110 * 320, o = RES.ols;
  Ln([[100, 470], [680, 470]], { stroke: C.rule }); Ln([[100, 150], [100, 470]], { stroke: C.rule });
  D.spend.forEach((s, i) => A(seg(t, 0.2, 0.6), () => dot(X(D.visits[i]), Y(s), 2.6, C.teal)));
  const fit = v => o.b0 + o.bv * v + o.bt * TEN;
  const u = eio(seg(t, 0.8, 1.8));
  A(seg(t, 0.8, 1.0), () => Ln([[X(1), Y(fit(1))], [lerp(X(1), X(13), u), Y(fit(lerp(1, 13, u)))]], { stroke: C.violet, lw: 3 }));
  A(seg(t, 2.2, 2.6), () => D.spend.forEach((s, i) => { if (i % 6) return; const f = o.b0 + o.bv * D.visits[i] + o.bt * D.tenure[i]; Ln([[X(D.visits[i]), Y(s)], [X(D.visits[i]), Y(f)]], { stroke: C.coral, lw: 1 }); }));
  A(seg(t, 1.2, 1.6), () => M('line drawn at the mean tenure', 120, 166, { size: 11.5, color: C.violet }));
  const rows = [['(intercept)', o.b0, o.se[0], o.lo[0], o.hi[0]], ['visits', o.bv, o.se[1], o.lo[1], o.hi[1]], ['tenure', o.bt, o.se[2], o.lo[2], o.hi[2]]];
  A(seg(t, 3.4, 3.8), () => {
    card(710, 150, 506, 220, C.violet);
    [['', 730], ['β', 880], ['SE', 970], ['95% CI', 1050]].forEach(([h, x]) => M(h, x, 180, { size: 12.5, color: C.muted }));
    rows.forEach(([n, b, se, lo, hi], i) => { const y = 214 + i * 34; M(n, 730, y, { size: 13.5, color: C.teal }); M(b.toFixed(2), 880, y, { size: 14, weight: 600 }); M(se.toFixed(2), 970, y, { size: 13 }); M(lo.toFixed(2) + ' … ' + hi.toFixed(2), 1050, y, { size: 12.5 }); });
    M('each visit adds about ' + o.bv.toFixed(2) + ' to spend, tenure held fixed', 730, 340, { size: 12, color: C.amber });
  });
  A(seg(t, 5.2, 5.6), () => {
    card(710, 390, 506, 176);
    M('R² ' + o.r2.toFixed(2) + ' · adjusted ' + o.adj.toFixed(2), 730, 422, { size: 14, color: C.ink, weight: 600 });
    M('residual std err ' + o.rse.toFixed(2) + ' · df ' + o.df + ' · n_obs 240', 730, 450, { size: 13, color: C.muted });
    M('p-values from Student\'s t', 730, 478, { size: 13, color: C.muted });
    M('a null, NaN or ±Inf in any column drops that row', 730, 506, { size: 13, color: C.coral });
    M('a plain fit streams: running sums, one pass', 730, 534, { size: 13, color: C.teal });
  });
}

/* ---------- 13. robust errors and holdouts ---------- */
function sRobust(t) {
  CAP('REG_OLS · spend ~ visits + tenure · TWO MORE OPTIONS', 64, 124, { color: C.violet });
  const o = RES.ols, h = RES.ho;
  A(seg(t, 0.2, 0.6), () => {
    card(64, 150, 560, 380, C.violet);
    CAP('ROBUST STANDARD ERRORS', 84, 180, { color: C.violet });
    M('"covariance": { "type": "hc3" }', 84, 212, { size: 13, color: C.ink });
    [['', 84], ['β', 244], ['SE classical', 344], ['SE hc3', 484]].forEach(([s, x]) => M(s, x, 256, { size: 12.5, color: C.muted }));
    [['(intercept)', o.b0, 0], ['visits', o.bv, 1], ['tenure', o.bt, 2]].forEach(([n, b, k], i) => {
      const y = 292 + i * 36;
      M(n, 84, y, { size: 13.5, color: C.teal }); M(b.toFixed(2), 244, y, { size: 14, weight: 600 });
      M(o.se[k].toFixed(4), 344, y, { size: 13.5, color: C.muted });
      A(seg(t, 0.8 + i * 0.2, 1.1 + i * 0.2), () => M(RES.hc3[k].toFixed(4), 484, y, { size: 13.5, color: C.amber, weight: 600 }));
    });
    M('same coefficients: only the errors, p-values', 84, 430, { size: 13, color: C.ink }); M('and intervals move', 84, 452, { size: 13, color: C.ink });
    M('hc0 … hc3 · cluster · hac · matches R sandwich', 84, 500, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.2, 3.6), () => {
    card(656, 150, 560, 380, C.amber);
    CAP('OUT-OF-SAMPLE CHECK', 676, 180, { color: C.amber });
    M('"holdout": "id > 192"', 676, 212, { size: 13, color: C.ink });
    const u = eo(seg(t, 3.4, 4.2)), W0 = 520 * h.nTrain / 240;
    R(676, 236, W0 * u, 30, { fill: C.tealS, stroke: C.teal, r: 3 });
    A(u, () => R(676 + W0 + 4, 236, (520 - W0 - 4) * u, 30, { fill: C.amberS, stroke: C.amber, r: 3 }));
    M('fit on ' + h.nTrain, 686, 256, { size: 12, color: C.ink }); A(u, () => M('held out ' + h.n, 1186, 256, { size: 12, color: C.ink, align: 'right' }));
    [['', 676], ['train', 900], ['holdout', 1040]].forEach(([s, x]) => M(s, x, 304, { size: 12.5, color: C.muted }));
    [['R²', h.r2Train.toFixed(2), h.r2.toFixed(2)], ['error', 'resid SE ' + h.rse.toFixed(2), 'RMSE ' + h.rmse.toFixed(2)], ['MAE', '', h.mae.toFixed(2)]].forEach(([n, a, b], i) => {
      const y = 340 + i * 34;
      M(n, 676, y, { size: 13.5, color: C.teal }); M(a, 900, y, { size: 13.5 }); A(seg(t, 4.2 + i * 0.2, 4.5 + i * 0.2), () => M(b, 1040, y, { size: 13.5, color: C.amber, weight: 600 }));
    });
    M('holdout { n, n_null, rmse, mae, r2 } sits beside the fit', 676, 460, { size: 12.5, color: C.muted });
    M('a Compose sweep can rank on holdout.rmse', 676, 500, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.2, 5.6), () => M('a robust covariance or a holdout forces a buffered run', 64, 566, { size: 13.5, color: C.ink }));
}

/* ---------- 14. variations ---------- */
function sVary(t) {
  CAP('ONE FIT, MANY TEXTBOOK NAMES', 64, 124, { color: C.violet });
  const B = [
    [0.3, 'Penalties', [['ridge', '"penalty": "l2" shrinks every predictor'], ['lasso · elastic net', '"l1" zeroes some out; "elasticnet" mixes'], ['', 'l1 and elasticnet: null SEs, p-values, CIs']], C.violet],
    [2.0, 'Resampling', [['jackknife', 'refit leaving one row out each time'], ['bootstrap', 'refit on resampled rows; seed it to repeat'], ['', 'replaces the standard errors, keeps the estimates']], C.amber],
    [3.7, 'Selection', [['forward · backward · stepwise', 'search predictors by AIC or BIC'], ['absent ≠ zero', 'dropped predictors vanish from the output'], ['', 'beside a penalty, predict warns: unusual']], C.teal]];
  B.forEach(([at, h, L, col], k) => A(seg(t, at, at + 0.4), () => {
    const x = 64 + k * 388;
    R(x, 150, 372, 300, { fill: C.panel, stroke: col });
    CAP(h.toUpperCase(), x + 18, 180, { color: col });
    L.forEach(([a, b], i) => { if (a) M(a, x + 18, 220 + i * 74, { size: 14, color: C.ink, weight: 600 }); T(b, x + 18, 244 + i * 74 - (a ? 0 : 24), { size: 14, color: C.muted }); });
  }));
  A(seg(t, 5.4, 5.8), () => {
    card(64, 470, 1152, 96);
    M('a curve? build polynomial columns upstream with FEAT_POLY, then fit a straight line through them', 86, 504, { size: 13.5, color: C.ink });
    M('penalties also fit REG_GLM (binomial, poisson) · resampling and selection force a buffered run', 86, 532, { size: 13, color: C.muted });
  });
}

/* ---------- 15. yes / no outcomes ---------- */
function sGLM(t) {
  CAP('REG_GLM · family binomial · converted ~ visits', 64, 124, { color: C.violet });
  const g = RES.glm, X = v => 110 + (v - 1) / 12 * 560, Y = p => 450 - p * 260;
  Ln([[100, 450], [680, 450]], { stroke: C.rule });
  M('converted', 108, 182, { size: 12 }); M('1', 92, Y(1) + 4, { size: 12, align: 'right' }); M('0', 92, Y(0) + 4, { size: 12, align: 'right' });
  D.conv.split('').forEach((c, i) => A(seg(t, 0.2, 0.6), () => dot(X(D.visits[i]) + ((i * 13) % 9 - 4), Y(+c) + ((i * 7) % 11 - 5), 2.6, c === '1' ? C.violet : C.teal)));
  const u = eio(seg(t, 1.2, 2.4)), pts = [];
  for (let v = 1; v <= lerp(1, 13, u); v += 0.1) pts.push([X(v), Y(1 / (1 + Math.exp(-(g.b0 + g.bv * v))))]);
  A(seg(t, 1.2, 1.4), () => pts.length > 1 && Ln(pts, { stroke: C.amber, lw: 3 }));
  A(seg(t, 2.4, 2.8), () => {
    card(710, 150, 506, 200, C.violet);
    M('visits β ' + g.bv.toFixed(3) + ' on the log-odds scale', 730, 186, { size: 14, color: C.ink, weight: 600 });
    M('odds × ' + Math.exp(g.bv).toFixed(2) + ' per extra visit', 730, 214, { size: 13.5, color: C.amber });
    M('95% CI ' + g.lo[1].toFixed(2) + ' … ' + g.hi[1].toFixed(2) + ' · Wald z', 730, 242, { size: 13, color: C.muted });
    M('deviance ' + g.dev.toFixed(0) + ' vs null ' + g.nulldev.toFixed(0), 730, 278, { size: 13, color: C.ink });
    M('pseudo R² ' + g.pr2.toFixed(2) + ' · converged in ' + g.iters + ' steps', 730, 306, { size: 13, color: C.muted });
    M('binomial · poisson for counts · gamma (t, not z)', 730, 334, { size: 12, color: C.faint });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(64, 480, 616, 86);
    M('always buffered: the fit iterates', 86, 512, { size: 13.5, color: C.ink, weight: 600 });
    M('another run: converted ~ checkout_mins, which splits the outcome', 86, 540, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(710, 370, 506, 196, C.coral);
    M('regressions[1] · REG_GLM', 730, 400, { size: 13, color: C.muted });
    M('error PROCESSING_REGRESSION_SEPARATION', 730, 426, { size: 13.5, color: C.coral, weight: 600 });
    A(seg(t, 7.0, 7.4), () => {
      M('warnings: PULSE_SLOT_FAILED', 730, 466, { size: 13.5, color: C.coral });
      M('regressions[0] · REG_OLS still returns', 730, 506, { size: 13, color: C.teal });
      M('R² ' + RES.ols.r2.toFixed(2) + ' · n_obs 240: the slot failed alone', 730, 532, { size: 13, color: C.ink });
    });
  });
}

/* ---------- 16. bayesian ---------- */
function sBayes(t) {
  CAP('REG_BAYES_LINEAR · a prior, updated by the data', 64, 124, { color: C.violet });
  const b = RES.bay, X = v => 140 + (v - 0) / 6 * 600, base = 420, g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
  Ln([[120, base], [760, base]], { stroke: C.rule });
  [0, 1, 2, 3, 4, 5, 6].forEach(v => M(String(v), X(v), base + 20, { size: 12, align: 'center' }));
  M('visits coefficient', 760, base + 44, { size: 12, align: 'right' });
  // the vague prior is drawn schematically; the posterior uses the recorded mean and scale
  A(seg(t, 0.4, 1.0), () => { const pts = []; for (let v = 0; v <= 6; v += 0.05) pts.push([X(v), base - 60 * g(v, 2, 2.2)]); Ln(pts, { stroke: C.faint, lw: 2, dash: [5, 4] }); M('prior: vague', X(0.4), base - 70, { size: 12.5, color: C.muted }); });
  A(seg(t, 1.6, 2.4), () => { const pts = []; for (let v = 0; v <= 6; v += 0.01) pts.push([X(v), base - 220 * g(v, b.b, b.se) * eo(seg(t, 1.6, 2.6))]); Ln(pts, { stroke: C.violet, lw: 2.5 }); M('posterior mean ' + b.b.toFixed(2), X(b.b) + 30, base - 200, { size: 13, color: C.violet }); });
  A(seg(t, 3.0, 3.4), () => { R(X(b.lo), base - 12, X(b.hi) - X(b.lo), 8, { fill: C.amber, r: 4 }); });
  A(seg(t, 3.0, 3.4), () => {
    card(800, 160, 416, 270, C.violet);
    M('credible_intervals', 822, 196, { size: 14, color: C.amber, weight: 600 });
    M('visits ' + b.lo.toFixed(2) + ' … ' + b.hi.toFixed(2), 822, 222, { size: 13.5, color: C.ink });
    M('"95% of the posterior lies here"', 822, 246, { size: 13, color: C.ink });
    M('no p_values at all', 822, 284, { size: 14, color: C.coral, weight: 600 });
    M('credibility, not tail probability', 822, 310, { size: 13, color: C.ink });
    M('vague prior: lands on OLS\'s ' + RES.ols.bv.toFixed(2), 822, 348, { size: 12.5, color: C.muted });
    M('streams like OLS · no resampling or selection', 822, 374, { size: 12.5, color: C.muted });
    M('prior: nig, Normal-Inverse-Gamma', 822, 400, { size: 12.5, color: C.muted });
  });
}

/* ---------- 17. streams or buffers ---------- */
function sStream(t) {
  CAP('STREAMS OR BUFFERS · read it from the manifest or predict, never from memory', 64, 124, { color: C.teal });
  const L = [
    [0.3, 'STREAMS · running counts and moments', C.teal, 'TEST_T · TEST_WELCH · TEST_PAIRED_T · TEST_ANOVA_F · TEST_ANOVA_WELCH · TEST_CHISQ · TEST_PEARSON_R · TEST_PROP_Z · TEST_Z_TWO_SAMPLE · REG_OLS · REG_BAYES_LINEAR'],
    [2.0, 'BUFFERS · ranks, sorts, exact tables, iteration, whole-sample options', C.coral, 'TEST_MANN_WHITNEY_U · TEST_KRUSKAL_WALLIS · TEST_WILCOXON_SR · TEST_SPEARMAN_R · TEST_KENDALL_TAU · TEST_SHAPIRO_WILK · TEST_KS · TEST_FISHER_EXACT · TEST_BROWN_FORSYTHE · REG_GLM · REG_MMM_HILL · REG_MMM_BAYES · resampling · selection · robust covariance · holdout · grouped tests']];
  L.forEach(([at, h, col, ops], k) => A(seg(t, at, at + 0.4), () => {
    const y = 150 + k * 186;
    R(64, y, 1152, k ? 196 : 166, { fill: C.panel, stroke: col });
    CAP(h, 86, y + 32, { color: col });
    chips(ops.split(' · ').map(o => [o, col]), 86, y + 52, 1110, { size: 12 });
  }));
  A(seg(t, 4.0, 4.4), () => M('a mean-based test beside AGG_WELFORD on the same field reuses its running mean, variance and n', 64, 566, { size: 13, color: C.ink }));
}

/* ---------- 18. recap ---------- */
function sRecap(t) {
  CAP('TODAY', 64, 124, { color: C.violet });
  [['COMPARE', 'TEST_T · TEST_WELCH · TEST_Z_TWO_SAMPLE · TEST_MANN_WHITNEY_U · TEST_ANOVA_F · TEST_ANOVA_WELCH · TEST_ANOVA_RM · TEST_KRUSKAL_WALLIS · TEST_PAIRED_T · TEST_WILCOXON_SR · TEST_PROP_Z · TEST_TUKEY_HSD'],
   ['RELATE AND SHAPE', 'TEST_CHISQ · TEST_FISHER_EXACT · TEST_PEARSON_R · TEST_SPEARMAN_R · TEST_KENDALL_TAU · TEST_TREND · TEST_SHAPIRO_WILK · TEST_KS · TEST_BROWN_FORSYTHE'],
   ['MULTIVARIATE', 'TEST_HOTELLING_T2 · TEST_MANOVA · TEST_BOX_M · TEST_BARTLETT_SPHERICITY · TEST_MARDIA'],
   ['REGRESSIONS', 'REG_OLS · REG_GLM · REG_BAYES_LINEAR · REG_MMM_HILL · REG_MMM_BAYES'],
   ['MODIFIERS', 'resample · selection · covariance · holdout · multiplicity']].reduce((y, [h, ops], k) => {
    A(seg(t, 0.2 + k * 0.4, 0.6 + k * 0.4), () => { M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, k === 4 ? C.amber : C.violet]), 260, y, 956, { size: 11.5 }); });
    return y + (k === 0 ? 96 : k === 1 ? 64 : 40);
  }, 144);
  A(seg(t, 3.4, 3.8), () => {
    R(64, 440, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 468, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 492, { size: 14.5 });
    R(650, 440, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own tests and regressions', 668, 468, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 492, { size: 14.5 });
  });
  A(seg(t, 6.4, 6.8), () => {
    M('read the effect size beside the p-value', 640, 548, { size: 15, align: 'center' });
    M('next: matrices', 640, 576, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[2.283, 5.888, 5.056, 5.632, 5.397, 8.64, 4.352, 4.629, 8.107, 3.819, 4.821, 7.509, 7.083, 4.267, 7.744, 9.92, 7.275, 3.179, 6.144, 6.485, 7.723, 6.357, 7.211, 4.971, 5.76, 4.224, 3.648, 5.397, 5.205, 6.336, 7.552, 7.189, 3.84, 5.269, 5.355, 4.309, 5.483, 5.184, 4.907, 9.237, 6.571, 6.251, 2.219, 8.107, 4.8, 7.488, 4.736, 4.949, 7.616, 8.149, 6.997, 4.032, 6.549, 5.696, 9.408, 5.483, 8.64, 9.813, 4.693]/*END*/;
PulseFilm.mount({
  series: 'PULSE · TESTS & REGRESSIONS',
  title: 'Pulse Tests and Regressions',
  narr: NARR,
  scenes: [
    { name: 'Is it real?', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Is the difference real, and what drives it?', true]] },
    { name: 'Where they run', dur: 7.6, draw: sWhere, caps: [
      [0, 'By default, tests and regressions read the raw records that survive the filters, in the same scan.'],
      [2.6, 'Post-tests are the second tier. They run after windows, on the finished result rows.'],
      [4.2, 'A test names a type, a field and often a split; a regression, a target and its predictors.'],
      [6.0, 'Results land in their own sections. The cohort has two hundred and forty illustrative rows.']] },
    { name: 'One result shape', dur: 7, draw: sShape, caps: [
      [0, 'Every test returns the same shape: a statistic, degrees of freedom, a two-sided p-value, its alpha, and whether the null was rejected.'],
      [3.0, 'The details carry the rest: the difference, its interval and an effect size.'],
      [5.6, 'Read both. A tiny p-value with a tiny effect is still a tiny effect.']] },
    { name: 'Choosing a test', dur: 5, draw: sChoose, caps: [
      [0, 'Start from the outcome: a number across groups, the same subjects twice, a yes or no rate, two categories, two numbers, or a shape.'],
      [4.0, 'Skew points to the rank tests, and unequal spread to the Welch forms.']] },
    { name: 'Two groups', dur: 6.8, draw: sTwo, caps: [
      [0, 'The t-test asks whether the gap between the two arms\' mean spend is bigger than chance.'],
      [2.6, 'It uses Welch\'s form, so it never assumes equal spread. B spends about seven more, and the effect size is moderate.'],
      [5.0, 'With skewed values, Mann-Whitney compares ranks instead. It asks a different question, so disagreement is information.']] },
    { name: 'Many groups', dur: 7.4, draw: sMany, caps: [
      [0, 'With three or more groups, one-way ANOVA asks whether any of the means differ.'],
      [1.6, 'Here it says no: region explains about one percent of spend. A rejection would only say that some means differ, not which.'],
      [3.6, 'Check normality and spread first. Unequal spread calls for Welch\'s ANOVA, skew for Kruskal-Wallis, and Tukey, as a post-test, finds which pairs differ.']] },
    { name: 'Counts', dur: 6.6, draw: sCounts, caps: [
      [0, 'Chi-square tests whether two categorical fields are independent, here region and arm. Labels sort alphabetically.'],
      [2.0, 'It compares each count with what independence would predict.'],
      [3.4, 'The p-value says the pattern is unlikely by chance, but Cramér\'s V says the association is weak.'],
      [5.0, 'An expected count under five draws a warning; for a small two-by-two table, use Fisher\'s exact test.']] },
    { name: 'Experiment readouts', dur: 8, draw: sExp, caps: [
      [0, 'First, check the split. Chi-square against expected shares, a goodness-of-fit test, finds no sample-ratio mismatch.'],
      [3.0, 'Name the control as the reference, and the difference reads variant minus control: B spends seven more than A.'],
      [5.4, 'Add a pre-period covariate, and CUPED removes the variance it explains. The interval narrows to about a third of its width.']] },
    { name: 'Grouped tests', dur: 6, draw: sGroup, caps: [
      [0, 'With groups set, every test runs once per group, and each result carries its group key.'],
      [2.0, 'East and North clear the bar. South, with sixty-nine rows, just misses. Grouped tests buffer.']] },
    { name: 'Relationships', dur: 5, draw: sRel, caps: [
      [0, 'Pearson\'s r measures how tightly two numbers move together in a straight line.'],
      [1.6, 'Spend and visits correlate strongly, at about point seven eight.'],
      [3.4, 'Pearson sees only straight lines, and outliers sway it. Spearman and Kendall use ranks.']] },
    { name: 'Post-tests', dur: 6.2, draw: sPost, caps: [
      [0, 'Post-tests run last, on the result rows: after groups, aggregations and windows.'],
      [1.6, 'The trend test asks whether an ordered series rises or falls; a moving average first tames the noise.'],
      [4.4, 'Tukey compares every pair of group means with family-wise control. Result rows carry no weights, so it never runs weighted.']] },
    { name: 'Many tests', dur: 8, draw: sMult, caps: [
      [0, 'Run many tests and some will look significant by luck. Add a multiplicity block, and Pulse corrects them as a family.'],
      [1.6, 'The adjusted p-value sits beside the raw one, which never moves.'],
      [3.6, 'Holm sorts them, multiplies the smallest by four, the next by three, and keeps their order.'],
      [5.0, 'Pick a method and a family. A regression\'s coefficients join only through their own block.'],
      [6.6, 'Ten or more uncorrected p-values make predict raise an advisory.']] },
    { name: 'Least squares', dur: 7.2, draw: sOLS, caps: [
      [0, 'Ordinary least squares fits a straight line through the data. Here, spend from visits and tenure.'],
      [2.2, 'Each residual is the gap from a point to the fit, and least squares minimizes their squares.'],
      [3.4, 'Each extra visit adds about three point one five to spend, holding tenure fixed.'],
      [5.2, 'It explains about seventy percent of the variation. A null, NaN or infinite value drops the row, and a plain fit streams in one pass.', 'It explains about seventy percent of the variation. A null, not-a-number or infinite value drops the row, and a plain fit streams in one pass.']] },
    { name: 'Robust errors, holdouts', dur: 6.4, draw: sRobust, caps: [
      [0, 'A robust covariance, like hc3, swaps in sandwich standard errors, and the coefficients stay put.', 'A robust covariance, like H C 3, swaps in sandwich standard errors, and the coefficients stay put.'],
      [3.2, 'A holdout fits on some rows and scores the rest. Out of sample, the error rises a little, as it should.'],
      [5.2, 'Either option forces a buffered run.']] },
    { name: 'Variations', dur: 6.6, draw: sVary, caps: [
      [0, 'One fit covers many textbook names. Penalties give ridge, lasso and elastic net; the last two report no standard errors.'],
      [2.0, 'Resampling replaces the standard errors with jackknife or bootstrap estimates.'],
      [3.7, 'Selection searches the predictors by AIC or BIC. A dropped predictor vanishes: absent is not zero.'],
      [5.4, 'For a curve, build polynomial columns upstream, then fit a straight line through them.']] },
    { name: 'Yes / no outcomes', dur: 8.4, draw: sGLM, caps: [
      [0, 'For a yes or no outcome, the generalized linear model fits a logistic curve.'],
      [2.4, 'Its coefficients are on the log-odds scale. Each extra visit multiplies the odds of converting by about one point four.'],
      [4.6, 'It always buffers, because the fit iterates. When a predictor splits the outcome perfectly, Pulse refuses the fit as separated.'],
      [7.0, 'That slot fails alone: it carries the error, the response warns, and the least-squares fit beside it still returns.']] },
    { name: 'Bayesian fits', dur: 5.6, draw: sBayes, caps: [
      [0, 'The Bayesian linear fit starts from a prior and updates it with the data.'],
      [3.0, 'It reports credible intervals and no p-values at all. With a vague prior, it lands on the least-squares answer.']] },
    { name: 'Streams or buffers', dur: 5.6, draw: sStream, caps: [
      [0, 'Tests built on running counts and moments stream, and so do plain least-squares and Bayesian fits.'],
      [2.0, 'Rank tests, exact tables, iterative fits and media-mix models buffer, as do resampling, selection, robust errors, holdouts and grouped tests.'],
      [4.0, 'A mean-based test beside a Welford aggregate on the same field reuses its running state.']] },
    { name: 'The toolkit', dur: 8.4, draw: sRecap, caps: [
      [0, 'That\'s the toolkit today: tests that compare, relate and check shape, multivariate tests, and regression models, media-mix models among them.'],
      [3.4, 'More are added over time, and embedders can register their own tests and regressions through Options.Extensions. The manifest shows what your instance offers.', 'More are added over time, and embedders can register their own tests and regressions through the extensions option. The manifest shows what your instance offers.'],
      [6.4, 'Remember: read the effect size beside the p-value. Next up, matrices.']] },
  ],
});
})();
