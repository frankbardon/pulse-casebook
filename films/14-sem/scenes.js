/* Pulse SEM: film 14 of the 23-film Pulse Anatomy series. Follows SERIES-RULES.md. A sequel to 13-matrices.
 * The cohort is an illustrative 900-row survey (three waves of 300, two channels, five-point service items s1–s3 and
 * value items v1–v3, a 0–10 recommend score; s3 also leans on value). Every figure on screen comes from a recorded
 * Pulse v1.0.0-alpha.33 run in data/ (see data/README.md): fit (the first model and the freed one), ladder (channel
 * invariance), pair (a derived wave pair with := effects, delta and bootstrap), bad (a refused := line), ord (ML vs
 * WLSMV), score (ATTR_SEM_SCORE by wave) and pair.predict. The path diagram's layout is a sketch; its numbers are recorded. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, lerp, R, T, M, CAP, Ln, A, dot, ring, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const f2 = v => v.toFixed(2), f3 = v => v.toFixed(3);

/* fit.out.json, slot "model" (semopy convention): standardized estimates and the fit indices */
const FIT = { std: { s1: 0.714, s2: 0.725, s3: 0.722, v1: 0.794, v2: 0.756, v3: 0.700, rs: 0.380, rv: 0.542, cov: 0.373 },
  chi2: 77.17, dof: 12, cfi: 0.971, tli: 0.949, rmsea: 0.078, n: 900 };
/* fit.out.json, slot "freed": s3 also loads on value */
const FREED = { std: { s1: 0.741, s2: 0.757, s3: 0.595, s3v: 0.284, v1: 0.794, v2: 0.754, v3: 0.700, rs: 0.358, rv: 0.596, cov: 0.250 },
  est: 0.352, se: 0.040, z: 8.83, chi2: 2.53, dof: 11, p: 0.996, cfi: 1.004, rmsea: 0 };
/* raw rows of the "model" estimates table: estimate, std_estimate, std_err, z_value, p_value (null on a fixed row) */
const EST = [['s1 ~ service', 1, 0.714, null, null, null], ['s2 ~ service', 0.982, 0.725, 0.057, 17.25, 0], ['recommend ~ value', 1.112, 0.542, 0.070, 15.98, 0],
  ['recommend ~ service', 0.911, 0.380, 0.081, 11.21, 0], ['service ~~ value', 0.222, 0.373, 0.028, 7.93, 0]];
/* fit.out.json "model": auxiliary.residual_covariance (S − Σ̂) */
const RK = ['s1', 's2', 's3', 'v1', 'v2', 'v3', 'rec'];
const RES = [[0, 0.044, -0.020, -0.075, -0.046, -0.049, -0.081], [0.044, 0, -0.025, -0.080, -0.054, -0.044, -0.059], [-0.020, -0.025, 0, 0.129, 0.122, 0.121, 0.143],
  [-0.075, -0.080, 0.129, 0, 0.004, -0.001, -0.010], [-0.046, -0.054, 0.122, 0.004, 0, -0.005, -0.002], [-0.049, -0.044, 0.121, -0.001, -0.005, 0, 0.015],
  [-0.081, -0.059, 0.143, -0.010, -0.002, 0.015, -0.001]];
/* ladder.out.json: group "channel", lavaan conventions */
const LAD = [['configural', '(none)', 8.06, 22, 0.997, 1, 0], ['metric', '["loadings"]', 12.05, 27, 0.994, 1, 0], ['scalar', '["loadings","intercepts"]', 28.62, 32, 0.638, 1, 0]];
const LADN = { online: 475, store: 425 };
/* pair.out.json: latent means per level, and the := rows. delta = slot "delta", boot = slot "boot" */
const MEANS = { value: [2.95352, 2.55052], service: [2.99738, 3.42464] };
const DEF = [
  ['dv', 'bv*(mvt-mvf)', -0.477, { se: 0.095, p: '< 0.001', lo: -0.662, hi: -0.291 }, { se: 0.092, p: '< 0.001', lo: -0.655, hi: -0.302 }],
  ['ds', 'bst*mst-bsf*msf', 0.219, { se: 0.115, p: '0.058', lo: -0.007, hi: 0.444 }, { se: 0.108, p: '0.043', lo: -0.006, hi: 0.421 }],
  ['dtot', 'dv+ds', -0.258, { se: 0.141, p: '0.066', lo: -0.533, hi: 0.017 }, { se: 0.141, p: '0.067', lo: -0.537, hi: 0.023 }],
  ['share', 'dv/dtot', 1.847, { se: 0.847, p: '0.029', lo: 0.188, hi: 3.506 }, { se: 6.060, p: '0.761', lo: -3.827, hi: 13.83 }]];
/* ord.out.json: standardized loadings, ML vs WLSMV, s1's thresholds and the scaled test */
const ORD = { keys: ['s1', 's2', 's3', 'v1', 'v2', 'v3'], ml: [0.748, 0.753, 0.592, 0.796, 0.756, 0.697], wl: [0.783, 0.788, 0.617, 0.827, 0.796, 0.736],
  th: [-1.667, -0.765, 0.248, 1.314], thse: [0.072, 0.047, 0.042, 0.058], chi2: 0.78, chi2s: 2.46, ps: 0.930, sf: 0.545, dof: 7 };
/* score.out.json: AGG_AVERAGE of each ATTR_SEM_SCORE label by wave (n 300 each) */
const SCORE = { waves: ['w1', 'w2', 'w3'], value: [0.155, -0.014, -0.141], service: [-0.147, -0.012, 0.159] };

/* the path diagram: indicators on the left, latents in the middle, recommend on the right. o.freed adds s3 ← value. */
function path(x0, y0, t, at, S, o = {}) {
  const IY = [0, 46, 92, 168, 214, 260].map(v => y0 + v), IX = x0, LX = x0 + 220, RX = x0 + 420;
  const LY = { service: y0 + 46, value: y0 + 214 }, RY = y0 + 130;
  const items = ['s1', 's2', 's3', 'v1', 'v2', 'v3'];
  const a0 = seg(t, at, at + 0.4), a1 = seg(t, at + 0.4, at + 0.9), a2 = seg(t, at + 0.9, at + 1.4);
  A(a0, () => items.forEach((k, i) => { R(IX, IY[i] - 16, 64, 32, { fill: C.panel2, stroke: C.teal }); M(k, IX + 32, IY[i] + 5, { size: 14, color: C.ink, align: 'center' }); }));
  A(a0, () => { [['service', LY.service], ['value', LY.value]].forEach(([k, y]) => { ring(LX, y, 40, C.violet, 2); M(k, LX, y + 5, { size: 13, color: C.violet, align: 'center', weight: 600 }); }); });
  A(a1, () => items.forEach((k, i) => {
    const ly = i < 3 ? LY.service : LY.value; arrow(LX - 40, ly + (IY[i] - ly) * 0.15, IX + 68, IY[i], { stroke: C.faint, head: 6 });
    M(f2(S[k]), lerp(LX - 40, IX + 68, 0.45), lerp(ly, IY[i], 0.45) - 5, { size: 11.5, color: C.violet, align: 'center' });
  }));
  if (o.freed) A(seg(t, o.freed, o.freed + 0.4), () => {
    arrow(LX - 36, LY.value - 18, IX + 68, IY[2] + 6, { stroke: C.amber, head: 6, lw: 2 });
    M(f2(S.s3v), LX - 70, IY[2] + 34, { size: 12, color: C.amber, align: 'center', weight: 600 });
  });
  A(a2, () => {
    R(RX - 10, RY - 18, 108, 36, { fill: C.panel2, stroke: C.teal }); M('recommend', RX + 44, RY + 5, { size: 13, color: C.ink, align: 'center' });
    arrow(LX + 40, LY.service + 10, RX - 12, RY - 8, { stroke: C.faint, head: 6 }); arrow(LX + 40, LY.value - 10, RX - 12, RY + 8, { stroke: C.faint, head: 6 });
    M(f2(S.rs), LX + 110, LY.service + 48, { size: 11.5, color: C.violet, align: 'center' }); M(f2(S.rv), LX + 110, LY.value - 38, { size: 11.5, color: C.violet, align: 'center' });
    ctx().beginPath(); ctx().moveTo(LX + 18, LY.service + 36); ctx().quadraticCurveTo(LX + 60, (LY.service + LY.value) / 2, LX + 18, LY.value - 36);
    ctx().lineWidth = 1.3; ctx().strokeStyle = C.faint; ctx().setLineDash([4, 4]); ctx().stroke(); ctx().setLineDash([]);
    M('~~ ' + f2(S.cov), LX + 50, (LY.service + LY.value) / 2 + 4, { size: 11.5, color: C.violet });
  });
}
const ctx = () => PulseFilm.ctx;

/* ---------- 0. title (the kit intro has already shown the film title) ---------- */
function sTitle(t) {
  path(400, 210, t, 0.1, FREED.std, { freed: 1.2 });
  A(seg(t, 1.2, 1.7), () => T('A model you write, fitted in one request', 640, 560, { size: 22, align: 'center', color: C.muted }));
}

/* ---------- 1. from factors to a model ---------- */
function sModel(t) {
  CAP('FROM FACTORS TO A MODEL', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 70);
    M('MAT_FACTOR finds the factors in a battery', 86, 176, { size: 13.5, color: C.muted });
    M('MAT_SEM fits the model you write, and says how well it holds', 86, 200, { size: 13.5, color: C.violet, weight: 600 });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 234, 560, 330, C.violet);
    CAP('params.model · lavaan / semopy syntax', 86, 262, { color: C.violet });
    [['service =~ s1 + s2 + s3', 'a latent and its indicators'], ['value =~ v1 + v2 + v3', ''], ['recommend ~ service + value', 'a regression'], ['service ~~ value', 'a covariance (free by default)'],
     ['s1 ~ 1', 'an intercept or a latent mean'], ['dv := bv*(mvt - mvf)', 'a defined parameter'], ['b1*x · 0*1 · c(a, b)*x', 'labels, fixed values, per group']]
      .forEach(([a, b], i) => A(seg(t, 2.8 + i * 0.14, 3.1 + i * 0.14), () => { M(a, 86, 300 + i * 36, { size: 14, color: C.ink }); M(b, 604, 300 + i * 36, { size: 11.5, color: C.muted, align: 'right' }); }));
  });
  A(seg(t, 5.0, 5.4), () => {
    card(656, 234, 560, 330);
    CAP('ONE SLOT IN ONE REQUEST', 678, 262);
    [['"vectors": [{ "name": "brand",', C.ink], ['  "fields": ["s1",…,"v3","recommend"] }],', C.ink], ['"matrices": [{ "type": "MAT_SEM",', C.violet], ['  "vector": "brand",', C.violet],
     ['  "params": { "model": "service =~ …" } }]', C.violet]].forEach(([s, c], i) => M(s, 678, 300 + i * 30, { size: 13.5, color: c }));
    M('observed variables = exactly the vector\'s members', 678, 470, { size: 12.5, color: C.amber });
    M('listwise · frequency weights fold in · a probability weight is refused', 678, 498, { size: 12.5, color: C.muted });
    M('900 illustrative rows · every figure is a real Pulse result', 678, 538, { size: 12, color: C.faint });
  });
}

/* ---------- 2. the fit ---------- */
function sFit(t) {
  CAP('THE FIRST MODEL · STANDARDIZED ESTIMATES', 64, 124, { color: C.violet });
  path(70, 186, t, 0.2, FIT.std);
  A(seg(t, 2.6, 3.0), () => {
    card(640, 146, 576, 250, C.violet);
    CAP('auxiliary.estimates · a row per parameter', 662, 174, { color: C.violet });
    const H = ['estimate', 'std', 'SE', 'z', 'p'], X = [870, 950, 1020, 1090, 1170];
    H.forEach((h, j) => M(h, X[j], 204, { size: 11.5, color: C.muted, align: 'right' }));
    EST.forEach((r, i) => A(seg(t, 2.8 + i * 0.12, 3.1 + i * 0.12), () => {
      const y = 234 + i * 28; M(r[0], 662, y, { size: 12.5, color: C.ink });
      r.slice(1).forEach((v, j) => M(v === null ? 'null' : j === 4 ? '< .001' : j === 3 ? v.toFixed(2) : v.toFixed(3), X[j], y, { size: 12.5, color: v === null ? C.coral : j === 1 ? C.violet : C.ink, align: 'right' }));
    }));
    M('a marker loading is fixed at 1: no SE, z or p', 662, 384, { size: 12, color: C.muted });
  });
  A(seg(t, 5.2, 5.6), () => {
    card(640, 410, 576, 156, C.coral);
    CAP('scalars · the fit indices', 662, 436, { color: C.coral });
    [['chi2', f2(FIT.chi2)], ['dof', String(FIT.dof)], ['p', '< 0.001'], ['cfi', f3(FIT.cfi)], ['tli', f3(FIT.tli)], ['rmsea', f3(FIT.rmsea)]]
      .forEach(([k, v], i) => { const x = 662 + (i % 3) * 184, y = 472 + Math.floor(i / 3) * 34; M(k, x, y, { size: 12.5, color: C.muted }); M(v, x + 150, y, { size: 15, color: i < 3 ? C.coral : C.ink, align: 'right', weight: 600 }); });
    M('also aic · bic · gfi · agfi · nfi · loglik · n · converged', 662, 548, { size: 11.5, color: C.faint });
  });
}

/* ---------- 3. finding the misfit ---------- */
function sMisfit(t) {
  CAP('auxiliary.residual_covariance · S − Σ̂', 64, 124, { color: C.violet });
  const gx = 110, gy = 170, cs = 50;
  A(seg(t, 0.2, 0.5), () => {
    RK.forEach((k, j) => M(k, gx + j * cs + cs / 2, gy - 8, { size: 12, align: 'center', color: C.muted }));
    RK.forEach((k, i) => M(k, gx - 8, gy + i * cs + cs / 2 + 4, { size: 12, align: 'right', color: C.muted }));
  });
  RES.forEach((row, i) => row.forEach((v, j) => A(seg(t, 0.3 + (i + j) * 0.04, 0.6 + (i + j) * 0.04), () => {
    const x = gx + j * cs, y = gy + i * cs, hl = (i === 2 || j === 2) && i !== j && (i >= 3 || j >= 3) && seg(t, 1.6, 2.0) > 0;
    R(x + 1, y + 1, cs - 2, cs - 2, { fill: C.panel, stroke: hl ? C.ink : null, lw: 2, r: 3 });
    A(Math.min(1, Math.abs(v) / 0.15) * 0.85, () => R(x + 1, y + 1, cs - 2, cs - 2, { fill: v >= 0 ? C.violet : C.amber, r: 3 }));
    M(v.toFixed(2).replace('-0.00', '0.00'), x + cs / 2, y + cs / 2 + 4, { size: 10.5, align: 'center', color: Math.abs(v) > 0.075 ? C.bg : C.ink, weight: 600 });
  })));
  A(seg(t, 1.6, 2.0), () => M('s3 runs with every value item, and with recommend', gx, gy + 7 * cs + 26, { size: 12.5, color: C.amber }));
  A(seg(t, 2.8, 3.2), () => {
    card(560, 146, 656, 212, C.violet);
    CAP('SLOT "freed" · value =~ v1 + v2 + v3 + s3', 582, 174, { color: C.violet });
    M('s3 ~ value  ' + f3(FREED.est) + ' · std ' + f2(FREED.std.s3v) + ' · SE ' + f3(FREED.se) + ' · z ' + f2(FREED.z), 582, 210, { size: 13, color: C.amber });
    const rows = [['', 'first', 'freed'], ['chi2', f2(FIT.chi2), f2(FREED.chi2)], ['dof', FIT.dof, FREED.dof], ['p', '< 0.001', f3(FREED.p)], ['cfi', f3(FIT.cfi), f3(FREED.cfi)], ['rmsea', f3(FIT.rmsea), f3(FREED.rmsea)]];
    rows.forEach((r, i) => { const y = 246 + i * 20; M(String(r[0]), 582, y, { size: 12, color: C.muted }); M(String(r[1]), 790, y, { size: 12.5, color: i ? C.coral : C.muted, align: 'right' }); M(String(r[2]), 900, y, { size: 12.5, color: i ? C.violet : C.muted, align: 'right', weight: 600 }); });
    M('the rest of this film', 1194, 246, { size: 11.5, color: C.faint, align: 'right' }); M('fits the freed model', 1194, 266, { size: 11.5, color: C.faint, align: 'right' });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(560, 376, 656, 190);
    CAP('WHICH CONVENTION A FIT FOLLOWS', 582, 404);
    M('covariance-only, as above: semopy\'s default fit', 582, 438, { size: 13, color: C.ink });
    M('means, a group, := lines or the bootstrap: lavaan\'s ML fit', 582, 466, { size: 13, color: C.violet });
    M('Fisher scoring · lavaan\'s chi2 and indices · Wald ci_lower / ci_upper', 582, 492, { size: 12, color: C.muted });
    M('the two can report a different chi2 for one model:', 582, 526, { size: 12.5, color: C.amber });
    M('compare fits on one convention', 582, 548, { size: 12.5, color: C.amber });
  });
}

/* ---------- 4. groups and invariance ---------- */
function sGroups(t) {
  CAP('params.group · ONE JOINT FIT ACROSS LEVELS', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 92);
    M('"group": "channel"', 86, 180, { size: 14, color: C.violet });
    M('levels in dictionary order · n_group_online ' + LADN.online + ' · n_group_store ' + LADN.store, 300, 180, { size: 13, color: C.ink });
    M('rows keyed "[online] s2 ~ service" · a group fit models the means and follows lavaan', 86, 214, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.4, 2.8), () => {
    card(64, 256, 1152, 214, C.violet);
    CAP('"group_equal" · THE INVARIANCE LADDER, ONE SLOT PER STEP', 86, 284, { color: C.violet });
    const X = [86, 250, 700, 800, 900, 1000, 1100];
    ['step', 'group_equal', 'chi2', 'dof', 'p', 'cfi', 'rmsea'].forEach((h, j) => M(h, X[j] + (j > 1 ? 80 : 0), 316, { size: 11.5, color: C.muted, align: j > 1 ? 'right' : 'left' }));
    LAD.forEach((r, i) => A(seg(t, 2.7 + i * 0.5, 3.0 + i * 0.5), () => {
      const y = 352 + i * 36; M(r[0], X[0], y, { size: 14, color: C.ink, weight: 600 }); M(r[1], X[1], y, { size: 13, color: C.violet });
      [f2(r[2]), String(r[3]), f3(r[4]), String(r[5]), String(r[6])].forEach((v, j) => M(v, X[j + 2] + 80, y, { size: 13.5, color: C.ink, align: 'right' }));
    }));
    M('also residuals · means · lv.variances · regressions … · "group_partial" frees single rows', 86, 456, { size: 12, color: C.faint });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 486, 1152, 80, C.amber);
    M('compare chi2, dof, cfi and rmsea step to step · here cfi stays 1 and rmsea 0 at every step', 86, 518, { size: 13, color: C.ink });
    M('Pulse computes no chi-square difference test: that comparison is yours', 86, 546, { size: 12.5, color: C.amber });
  });
}

/* ---------- 5. derived groups ---------- */
function sDerived(t) {
  CAP('A GROUP THE REQUEST COMPUTES', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 132, C.teal);
    M('"params": { "from_wave": "w1", "to_wave": "w3" }', 86, 180, { size: 13.5, color: C.amber });
    M('{ "type": "ATTR_FORMULA", "label": "period",', 86, 212, { size: 13.5, color: C.teal });
    M('  "expression": "wave == params.to_wave ? 2 : (wave == params.from_wave ? 1 : 0)" }', 86, 238, { size: 13.5, color: C.teal });
    M('change the params, not the model, to fit another pair', 86, 264, { size: 12, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 296, 560, 270, C.violet);
    CAP('THE MAT_SEM PARAMS', 86, 324, { color: C.violet });
    M('"group": "period",', 86, 358, { size: 13.5, color: C.violet });
    M('"group_levels": [{ "value": 1, "name": "from" },', 86, 386, { size: 13.5, color: C.violet });
    M('                 { "value": 2, "name": "to" }]', 86, 412, { size: 13.5, color: C.violet });
    M('rows "[from] value ~1" · "[to] value ~1"', 86, 448, { size: 13, color: C.ink });
    M('n_group_from 300 · n_group_to 300 · reference: from', 86, 476, { size: 13, color: C.ink });
    M('array order is the c(...) position', 86, 510, { size: 12, color: C.muted });
    M('MAT_SEM params take no params reference', 86, 534, { size: 12, color: C.muted });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(656, 296, 560, 270, C.coral);
    CAP('WAVE w2 → 0 · NO LEVEL', 678, 324, { color: C.coral });
    M('PULSE_MATRIX_GROUP_LEVEL_UNDECLARED', 678, 362, { size: 13.5, color: C.coral, weight: 600 });
    M('details.count 300 · on the envelope\'s warnings', 678, 390, { size: 13, color: C.ink });
    M('n 600 · n_listwise_dropped 300', 678, 424, { size: 13, color: C.ink });
    M('the fit stands · under Strict it fails with this code', 678, 452, { size: 12.5, color: C.muted });
    M('a declared level with no rows: _GROUP_LEVEL_EMPTY', 678, 494, { size: 12, color: C.muted });
    M('and its n_group_ / chi2_group_ scalars are absent', 678, 518, { size: 12, color: C.muted });
  });
}

/* ---------- 6. defined parameters ---------- */
function sDefined(t) {
  CAP('LATENT MEANS · SCALAR INVARIANCE ACROSS THE PAIR', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 96);
    M('group_equal ["loadings","intercepts"] · v1 ~ 0*1 · s1 ~ 0*1 · value ~ c(mvf, mvt)*1 · service ~ c(msf, mst)*1', 86, 176, { size: 12.5, color: C.muted });
    [['value', MEANS.value, C.violet], ['service', MEANS.service, C.ink]].forEach(([k, m, c], i) => {
      const x = 86 + i * 560; M(k + ' ~1', x, 216, { size: 14, color: C.ink, weight: 600 });
      M('from ' + f3(m[0]) + '  →  to ' + f3(m[1]), x + 120, 216, { size: 14, color: c });
    });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(64, 258, 1152, 64, C.violet);
    M('recommend ~ bv*value + c(bsf, bst)*service', 86, 284, { size: 13, color: C.ink });
    M('dv := bv*(mvt - mvf) · ds := bst*mst - bsf*msf · dtot := dv + ds · share := dv/dtot', 86, 308, { size: 13, color: C.violet });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(64, 338, 1152, 178, C.violet);
    const X = [86, 380, 520, 640, 760, 900];
    ['row', 'estimate', 'SE (delta)', 'p', 'ci_lower', 'ci_upper'].forEach((h, j) => M(h, X[j] + (j ? 90 : 0), 362, { size: 11.5, color: C.muted, align: j ? 'right' : 'left' }));
    DEF.forEach((r, i) => {
      const y = 392 + i * 26, d = r[3], clear = d.lo * d.hi > 0;
      M(r[0] + ' := ' + r[1], X[0], y, { size: 12.5, color: C.ink });
      [f3(r[2]), f3(d.se), d.p, f3(d.lo), f3(d.hi)].forEach((v, j) => M(v, X[j + 1] + 90, y, { size: 12.5, color: j >= 3 ? (clear ? C.violet : C.coral) : C.ink, align: 'right' }));
    });
    M('distinguishable from 0: p below alpha AND an interval that excludes 0 · := rows close the table, unprefixed', 86, 502, { size: 11.5, color: C.muted });
  });
  A(seg(t, 7.6, 8.0), () => {
    R(64, 532, 1152, 36, { fill: C.coralS, stroke: C.coral });
    M('dv := bv*(mvt - mvx) → SERVICE_VALIDATION · reason defined_invalid · problem unknown_label · before any row is read', 82, 555, { size: 12.5, color: C.coral });
  });
}

/* ---------- 7. bootstrap ---------- */
function sBoot(t) {
  CAP('"resample": "bootstrap"', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 92, C.teal);
    M('"bootstrap_iters": 500 · "rng_seed": 14 · rows drawn within each level', 86, 180, { size: 14, color: C.teal });
    M('scalars.bootstrap_requested 500 · bootstrap_succeeded 500 · same rows and seed: the same figures, bit for bit', 86, 212, { size: 12.5, color: C.ink });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 256, 1152, 62);
    M('estimate and std_estimate: the full data\'s · std_err: the replicates\' SD · ci: the percentile interval at ci_level', 86, 292, { size: 13, color: C.ink });
  });
  // two rows, delta vs bootstrap, as intervals on one axis
  A(seg(t, 4.8, 5.2), () => {
    card(64, 336, 1152, 168, C.violet);
    const ax0 = 440, ax1 = 1180, lo = -4, hi = 14, X = v => ax0 + (v - lo) / (hi - lo) * (ax1 - ax0);
    Ln([[X(0), 352], [X(0), 492]], { stroke: C.faint, dash: [3, 4] }); M('0', X(0), 498, { size: 11, color: C.faint, align: 'center' });
    [[0, 'dv · delta', DEF[0][3]], [1, 'dv · bootstrap', DEF[0][4]], [2, 'share · delta', DEF[3][3]], [3, 'share · bootstrap', DEF[3][4]]].forEach(([i, k, d]) => {
      const y = 368 + i * 30, est = DEF[i < 2 ? 0 : 3][2], c = i % 2 ? C.violet : C.muted;
      M(k, 86, y + 4, { size: 12.5, color: C.ink }); M('[' + f2(d.lo) + ', ' + f2(d.hi) + ']', 420, y + 4, { size: 12.5, color: c, align: 'right' });
      Ln([[X(d.lo), y], [X(d.hi), y]], { stroke: c, lw: 3 }); dot(X(est), y, 4.5, C.ink);
    });
  });
  A(seg(t, 7.0, 7.4), () => {
    card(64, 516, 1152, 52, C.coral);
    M('the slot keeps its rows: the buffered path · any weight → PULSE_WEIGHT_UNSUPPORTED · fewer than 10 good refits fail the slot', 86, 548, { size: 12.5, color: C.coral });
  });
}

/* ---------- 8. ordinal items ---------- */
function sOrdinal(t) {
  CAP('"estimator": "wlsmv" · "ordered": ["s1", … , "v3"]', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 64);
    M('each ordered member: a cut-up latent normal response · polychoric correlations · fitted under lavaan\'s conventions', 86, 184, { size: 13, color: C.ink });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(64, 226, 560, 340, C.violet);
    CAP('STANDARDIZED LOADINGS · ML vs WLSMV', 86, 254, { color: C.violet });
    ORD.keys.forEach((k, i) => {
      const y = 284 + i * 42, w = 360;
      M(k, 86, y + 14, { size: 13, color: C.ink });
      R(130, y, w * ORD.ml[i], 12, { fill: C.muted, r: 2 }); M(f3(ORD.ml[i]), 136 + w * ORD.ml[i], y + 11, { size: 11, color: C.muted });
      R(130, y + 15, w * ORD.wl[i], 12, { fill: C.violet, r: 2 }); M(f3(ORD.wl[i]), 136 + w * ORD.wl[i], y + 26, { size: 11, color: C.violet });
    });
    M('grey ML · violet WLSMV · s3 shows its service loading', 86, 556, { size: 11.5, color: C.faint });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(656, 226, 560, 160);
    CAP('THRESHOLDS · ONE FEWER THAN THE CATEGORIES', 678, 254);
    ORD.th.forEach((v, i) => { const y = 286 + i * 24; M('s1 | t' + (i + 1), 678, y, { size: 12.5, color: C.ink }); M(f3(v), 880, y, { size: 12.5, color: C.violet, align: 'right' }); M('SE ' + f3(ORD.thse[i]), 1000, y, { size: 12, color: C.muted, align: 'right' }); });
  });
  A(seg(t, 6.8, 7.2), () => {
    card(656, 398, 560, 168, C.coral);
    CAP('JUDGE FIT BY THE SCALED TEST', 678, 426, { color: C.coral });
    M('chi2 ' + f2(ORD.chi2) + ' · chi2_p_value null', 678, 458, { size: 13, color: C.muted });
    M('chi2_scaled ' + f2(ORD.chi2s) + ' · dof ' + ORD.dof + ' · p ' + f3(ORD.ps), 678, 486, { size: 13.5, color: C.ink, weight: 600 });
    M('scaling_factor ' + f3(ORD.sf) + ' · cfi_scaled · tli_scaled · rmsea_scaled', 678, 512, { size: 12, color: C.muted });
    M('loglik · aic · bic: null, there is no likelihood', 678, 546, { size: 12.5, color: C.coral });
  });
}

/* ---------- 9. scores ---------- */
function sScore(t) {
  CAP('ATTR_SEM_SCORE · EACH ROW ON ONE LATENT', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 210, C.teal);
    M('{ "type": "ATTR_SEM_SCORE", "label": "value_score",', 86, 180, { size: 13, color: C.teal });
    M('  "vector": "items",', 86, 204, { size: 13, color: C.teal });
    M('  "params": { "model": "…", "latent": "value" } }', 86, 228, { size: 13, color: C.teal });
    M('"method": "regression" (default) · "bartlett" under ML', 86, 264, { size: 12.5, color: C.ink });
    M('takes MAT_SEM\'s fit knobs · no bootstrap', 86, 290, { size: 12.5, color: C.muted });
    M('an ordinal fit: empirical Bayes modal scores', 86, 316, { size: 12.5, color: C.muted });
    M('a null member scores null', 86, 340, { size: 12.5, color: C.coral });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 300, C.violet);
    CAP('AGG_AVERAGE BY wave · n 300 EACH', 678, 174, { color: C.violet });
    const zx = 936, sc = 700;
    Ln([[zx, 196], [zx, 420]], { stroke: C.faint, dash: [3, 4] });
    SCORE.waves.forEach((w, i) => A(seg(t, 2.9 + i * 0.3, 3.2 + i * 0.3), () => {
      const y = 214 + i * 72;
      M(w, 690, y + 26, { size: 14, color: C.ink, weight: 600 });
      [['value', SCORE.value[i]], ['service', SCORE.service[i]]].forEach(([k, v], j) => {
        const yy = y + j * 26, w2 = v * sc; R(Math.min(zx, zx + w2), yy + 4, Math.abs(w2), 16, { fill: c(k), r: 2 });
        M(k + ' ' + (v >= 0 ? '+' : '') + f3(v), v >= 0 ? zx - 8 : zx + 8, yy + 17, { size: 11.5, color: c(k), align: v >= 0 ? 'right' : 'left' });
      });
    }));
    function c(k) { return k === 'value' ? C.violet : C.muted; }
    M('scores centre on the fit rows without a mean structure', 678, 436, { size: 11.5, color: C.faint });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 372, 560, 194);
    CAP('THE FIT', 86, 400);
    M('cohort-wide, never per request group: learn, then score', 86, 432, { size: 12.5, color: C.ink });
    M('"fit_on" fits a subset and still scores every row', 86, 458, { size: 12.5, color: C.ink });
    M('"group": each group scores with its own parameters', 86, 484, { size: 12.5, color: C.ink });
    M('Compose: fit once in "fits", bind by "params.fit",', 86, 518, { size: 12.5, color: C.violet });
    M('save a .pulse-sem.json and score from it later', 86, 542, { size: 12.5, color: C.violet });
  });
  A(seg(t, 5.0, 5.4), () => { card(656, 462, 560, 104); M('the Compose film covers fits, saves and loads', 678, 520, { size: 13, color: C.muted }); });
}

/* ---------- 10. before a row is read ---------- */
function sPredict(t) {
  CAP('PREDICT · NO ROW IS READ', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 150, C.amber);
    M('"streamable": false', 86, 182, { size: 14, color: C.amber, weight: 600 });
    M('streamable_reasons: ["matrix MAT_SEM requires the buffered path"]', 300, 182, { size: 13, color: C.ink });
    M('delta   streamable true  · mergeable true  · estimated_bytes 960', 86, 220, { size: 13, color: C.ink });
    M('boot    streamable false · mergeable false · row_buffer_bytes 57,600', 86, 248, { size: 13, color: C.amber });
    M('the bootstrap and an ordinal estimator keep the slot\'s rows', 86, 278, { size: 12, color: C.muted });
  });
  A(seg(t, 2.4, 2.8), () => {
    card(64, 312, 1152, 90);
    M('"group_levels": ["from", "to"] · "group_levels_basis": "declared"', 86, 348, { size: 14, color: C.amber });
    M('an upper bound: a declared level without rows is no group · undeclared: basis "unknown"', 86, 378, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.2, 4.6), () => {
    card(64, 418, 1152, 148, C.coral);
    CAP('A FAILED SEM SLOT FAILS ALONE', 86, 446, { color: C.coral });
    M('an error on the slot · PULSE_SLOT_FAILED on the envelope · the rest of the response survives · Strict fails fast', 86, 480, { size: 13, color: C.ink });
    M('PULSE_MATRIX_INSUFFICIENT_N: fewer than two levels with rows, or a level with no more rows than variables', 86, 510, { size: 12.5, color: C.muted });
    M('warns: PULSE_MATRIX_NOT_CONVERGED · _NOT_IDENTIFIED · _NEAREST_PD · fails: PULSE_MATRIX_SINGULAR', 86, 538, { size: 12.5, color: C.muted });
  });
}

/* ---------- 11. recap ---------- */
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('SEM IN PULSE TODAY', 64, 124, { color: C.violet });
    [['THE MODEL', '=~ · ~ · ~~ · ~ 1 · := · labels · c(...)'], ['JUDGE IT', 'estimates · fit indices · residual_covariance · implied_means'], ['ACROSS GROUPS', 'group · group_equal · group_partial · group_levels'],
     ['UNCERTAINTY', 'delta method · resample bootstrap · multiplicity'], ['ITEMS AND SCORES', 'estimator wlsmv · ordered · ATTR_SEM_SCORE']].forEach(([h, ops], k) => A(seg(t, 0.2 + k * 0.4, 0.6 + k * 0.4), () => {
      const y = 146 + k * 46; M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, k === 2 ? C.amber : C.violet]), 300, y, 916, { size: 12 });
    }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 400, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 428, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists MAT_SEM\'s params on your instance', 82, 452, { size: 14.5 });
      R(650, 400, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own MAT_* operators', 668, 428, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions', 668, 452, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('SEM', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('read the fit before you read the paths', 640, 430, { size: 15, align: 'center' });
    M('next: crosstabs', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[2.325, 8.811, 11.072, 9.899, 5.611, 8.213, 7.659, 3.883, 2.667, 8.661, 11.072, 6.272, 8.235, 5.995, 7.552, 5.781, 6.869, 11.051, 9.429, 10.155, 4.224, 8.619, 7.424, 10.944, 4.565, 11.477, 8.832, 5.333, 7.083, 8.533, 5.675, 8.32, 6.784, 4.416, 7.915, 7.744, 9.984, 4.032, 1.131]/*END*/;
PulseFilm.mount({
  series: 'PULSE · SEM',
  title: 'Pulse SEM',
  narr: NARR,
  scenes: [
    { name: 'Pulse SEM', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'A model you write, fitted in one request.', true]] },
    { name: 'A model you write', dur: 7.4, draw: sModel, caps: [
      [0, 'Factor analysis finds the factors in a battery. A structural equation model goes further: you write the model, and Pulse says how well it holds.'],
      [2.6, 'MAT_SEM reads lavaan syntax in params.model: =~ for a latent and its items, ~ for a regression, ~~ for a covariance.',
        'The SEM matrix operator reads lavaan syntax in its model param: equals tilde for a latent and its items, tilde for a regression, double tilde for a covariance.'],
      [5.0, 'Its observed variables are exactly the vector\'s members, and it runs as one slot of one request. Our cohort is nine hundred illustrative survey rows.']] },
    { name: 'The fit', dur: 7.6, draw: sFit, caps: [
      [0, 'Here, service and value each have three five-point items, and both drive a recommend score.'],
      [2.6, 'The estimates table has a row per parameter: estimate, standardized, standard error, z and p. A marker loading is fixed at one.'],
      [5.2, 'The scalars carry the fit indices. A chi-square of 77 on 12 degrees of freedom says this model misses something.',
        'The scalars carry the fit indices. A chi-square of seventy-seven on twelve degrees of freedom says this model misses something.']] },
    { name: 'Finding the misfit', dur: 7.4, draw: sMisfit, caps: [
      [0, 'The residual covariance, the sample\'s minus the model\'s, shows where.'],
      [1.6, 'Item s3 runs with every value item.', 'Item S three runs with every value item.'],
      [2.8, 'Let s3 load on value too, and the chi-square falls to 2.5 on 11 degrees of freedom. The rest of the film uses that model.',
        'Let S three load on value too, and the chi-square falls to two point five on eleven degrees of freedom. The rest of the film uses that model.'],
      [5.4, 'A covariance-only model follows semopy\'s default fit. Means, groups, defined parameters or the bootstrap switch it to lavaan\'s, so compare fits on one convention.',
        'A covariance-only model follows sem-oh-pie\'s default fit. Means, groups, defined parameters or the bootstrap switch it to lavaan\'s, so compare fits on one convention.']] },
    { name: 'Groups and invariance', dur: 7.0, draw: sGroups, caps: [
      [0, 'params.group fits one joint model across a field\'s levels. Here, the online and in-store channels.', 'The group param fits one joint model across a field\'s levels. Here, the online and in-store channels.'],
      [2.4, 'group_equal climbs the invariance ladder: configural, then equal loadings, then equal intercepts too. Each step is one slot.', 'Group equal climbs the invariance ladder: configural, then equal loadings, then equal intercepts too. Each step is one slot.'],
      [4.8, 'Compare the fit step to step. Pulse computes no chi-square difference test; that judgement is yours.']] },
    { name: 'A computed group', dur: 7.0, draw: sDerived, caps: [
      [0, 'The group can also be a column the request computes. A formula maps two waves, chosen by request params, to one and two.'],
      [2.6, 'params.group_levels declares those values and names them from and to. The names key every estimate row.', 'Group levels declares those values and names them from and to. The names key every estimate row.'],
      [4.8, 'Wave two maps to zero, which is no level. Its three hundred rows drop, a warning counts them, and the fit stands.']] },
    { name: 'Defined parameters', dur: 9.6, draw: sDefined, caps: [
      [0, 'With equal loadings and intercepts, the latent means can move. Value falls from 2.95 to 2.55, and service rises from 3.00 to 3.42.',
        'With equal loadings and intercepts, the latent means can move. Value falls from two point nine five to two point five five, and service rises from three to three point four two.'],
      [2.8, 'A defined parameter, a name, colon-equals, and an expression, turns labels into an answer. dv is value\'s path times its mean change.',
        'A defined parameter, a name, colon equals, and an expression, turns labels into an answer. D V is value\'s path times its mean change.'],
      [5.4, 'Each row gets a delta-method standard error, a p and an interval. dv is clearly negative. Service\'s part, ds, has an interval that crosses zero.',
        'Each row gets a delta-method standard error, a p and an interval. D V is clearly negative. Service\'s part, D S, has an interval that crosses zero.'],
      [7.6, 'A label the model never defines is refused before any row is read.']] },
    { name: 'Bootstrap', dur: 8.6, draw: sBoot, caps: [
      [0, 'The bootstrap refits the model on resampled rows, drawn within each group. Here five hundred seeded replicates, and all five hundred refit.'],
      [2.6, 'The estimates stay the full data\'s. The standard error becomes the replicates\' spread, and the interval is a percentile interval.'],
      [4.8, 'For dv the two methods agree. For share, a ratio over a total whose interval crosses zero, the bootstrap interval runs from minus 3.8 to 13.8.',
        'For D V the two methods agree. For share, a ratio over a total whose interval crosses zero, the bootstrap interval runs from minus three point eight to thirteen point eight.'],
      [7.0, 'The bootstrap keeps its rows, so the request buffers, and it refuses any weight.']] },
    { name: 'Ordinal items', dur: 8.8, draw: sOrdinal, caps: [
      [0, 'Maximum likelihood reads these five-point ratings as continuous. WLSMV reads each as a cut-up latent response, through polychoric correlations.',
        'Maximum likelihood reads these five-point ratings as continuous. The W L S M V estimator reads each as a cut-up latent response, through polychoric correlations.'],
      [2.8, 'Reading coarse ratings as continuous pulls loadings down. Here WLSMV\'s are a few hundredths higher on every item.', 'Reading coarse ratings as continuous pulls loadings down. Here W L S M V\'s are a few hundredths higher on every item.'],
      [5.0, 'Each item gets thresholds, one fewer than its categories, each with its own standard error.'],
      [6.8, 'Judge the fit by the scaled chi-square. Log-likelihood, AIC and BIC are null: there is no likelihood.']] },
    { name: 'Scores', dur: 7.6, draw: sScore, caps: [
      [0, 'ATTR_SEM_SCORE puts each row on one latent: regression scores by default, or Bartlett scores under maximum likelihood.',
        'The SEM score attribute puts each row on one latent: regression scores by default, or Bartlett scores under maximum likelihood.'],
      [2.6, 'Group the scores by wave and average them: value falls across the waves while service rises.'],
      [5.0, 'The fit is cohort-wide, learned first and then scored. A Compose fit can fit once and score many requests, covered in the Compose film.']] },
    { name: 'Before a row is read', dur: 6.4, draw: sPredict, caps: [
      [0, 'Predict reads the request without running it. The bootstrap slot keeps its rows, so the request takes the buffered path.'],
      [2.4, 'Declared levels come back with the basis declared, an upper bound on the groups.'],
      [4.2, 'A failed SEM slot fails alone: an error on the slot, a warning on the envelope, and the rest of the response survives.']] },
    { name: 'The toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s SEM in Pulse today: the model you write, the figures that judge it, groups, uncertainty, ordinal items and scores.'],
      [3.4, 'More are added over time, and the manifest lists what your instance offers. Embedders can register their own matrix operators through Options.Extensions.',
        'More are added over time, and the manifest lists what your instance offers. Embedders can register their own matrix operators through options dot extensions.'],
      [6.4, 'Remember: read the fit before you read the paths. Next up, crosstabs.'],
      [9.0, '', 'Pulse SEM.', true]] },
  ],
});
})();
