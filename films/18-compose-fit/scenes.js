/* Pulse Compose, fit, bind and optimize: film 18 of the 23-film Pulse Anatomy series. Follows SERIES-RULES.md.
 * Continues from film 17 (batch and sweep) on its cohort, m.pulse: 208 weekly rows, two markets over two years, TV
 * carrying over at 0.6 a week and search at 0.2, sales linear in both. The media-mix part uses h.pulse, the same spend
 * with saturating (Hill) sales. Every figure on screen comes from a recorded Pulse v1.0.0-alpha.33 run in data/ (see
 * data/README.md): fit (+ predict), unknown, bind (+ predict), norank, mmm, popsave, popload, load, bayes and bayes99.
 * The response curves are drawn from fits.mmm's recorded coefficients; the current-mix figure is computed from them. */
(() => {
const { C } = PulseFilm;
const { seg, eo, lerp, R, T, M, CAP, Ln, A, dot, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), f3 = v => v.toFixed(3);
const num = v => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const code = (L, x, y, dy, size) => L.forEach(([s, c], i) => M(s, x, y + i * dy, { size: size || 12.5, color: c }));

/* fit.out.json: fits.base (REG_OLS sales ~ tv_ad + search_ad + north, decays 0.6 and 0.2, holdout week >= 92) and two slots */
const BASE = { b: { int: 160.102, tv: 1.5906, search: 3.2694, north: 62.002 }, se: { tv: 0.0365, search: 0.2756 }, n: 182, hold: { n: 26, rmse: 13.313 } };
const SLOTS = [['north', 36987.3, 9886.4, -1.217, 13.131], ['south', 29631.0, 9095.1, -0.953, 13.415]];
/* bind.out.json: film 17's lhs sweep (sweep_seed 4503367277782454912), fits.best from_sweep, slot long_run */
const WIN = { slot: 39, tv: 0.5774, search: 0.6592, rmse: 12.536 };
const BEST = { int: 149.418, tv: 1.5841, search: 2.0286, north: 61.685 };
const LONG = { mult: 2.3494, tv: 3.7218, search: 5.8119 };
/* mmm.out.json: lhs 400 over h.pulse, REG_MMM_HILL "mmm", ranking[0..4] [slot, tv, search, holdout rmse] */
const MTOP = [[341, 0.616, 0.548, 10.415], [27, 0.639, 0.531, 10.450], [241, 0.623, 0.586, 10.451], [298, 0.600, 0.570, 10.473], [343, 0.628, 0.591, 10.491]];
const MAX = { tv: 0.6160, search: 0.5482 };
const HILL = { int: 172.961, north: 58.583, tv: { b: 295.99, k: 90.429, s: 1.3905, seb: 82.14, sek: 29.35, ses: 0.298 }, search: { b: 92.477, k: 22.303, s: 5, seb: 5.72, sek: 1.09, ses: null }, hold: 10.415 };
const CONTRIB = [['north', 38936.6, 10798.8, 4154.6], ['south', 31877.9, 10139.3, 3845.5]];
const OPT = { obj: 161.90, tv: [21.0, 4.319], search: [12, 8.073], mult: 4.319, starts: 8, agree: 3, iters: 2 };
/* popsave.out.json / popload.out.json; load.out.json */
const POP = { n: 104, mean: [25.27, 9.57, 327.62], d2: [['2024', 2.971], ['2025', 2.922]] };
const LOAD = [['2024', 347.10, 347.76], ['2025', 333.81, 335.00]];
/* bayes.out.json (target_accept 0.8) and bayes99.out.json (0.99): market north, 90% credible intervals */
const BAY = { div: 17, draws: 4000, decay: { tv: [0.561, 0.587, 0.613], search: [0.132, 0.202, 0.269] }, roi: { tv: [3.32, 3.76, 4.24], search: [4.14, 7.07, 11.84] }, mroi: { tv: [3.07, 3.33, 3.60], search: [6.24, 7.11, 8.00] }, rhat: 1.002 };

/* the fitted curves at steady state: weekly spend x settles to an adstock of x · (1 - d^9) / (1 - d) */
const hill = (x, k, s) => Math.pow(x, s) / (Math.pow(x, s) + Math.pow(k, s));
const mult = d => (1 - Math.pow(d, 9)) / (1 - d);
const resp = (ch, x) => HILL[ch].b * hill(mult(MAX[ch]) * x, HILL[ch].k, HILL[ch].s);

function slot(x, y, w, h, label, o = {}) {
  R(x, y, w, h, { fill: C.panel2, stroke: o.stroke || C.teal });
  M(label, x + 12, y + 22, { size: 13, color: o.lc || C.ink, weight: 600 });
}
function coefRows(x, y, rows, t, at, w) {
  rows.forEach(([k, v, se, col], i) => A(seg(t, at + i * 0.1, at + 0.3 + i * 0.1), () => {
    const yy = y + i * 26; M(k, x, yy, { size: 13, color: C.muted });
    M(v, x + w - 110, yy, { size: 13.5, color: col || C.ink, align: 'right', weight: 600 });
    if (se !== undefined) M(se, x + w, yy, { size: 12, color: se === 'null' ? C.coral : C.faint, align: 'right' });
  }));
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  A(eo(seg(t, 0.1, 0.6)), () => { R(300, 230, 250, 80, { fill: C.panel2, stroke: C.violet }); M('fits · run once', 320, 276, { size: 15, color: C.violet }); });
  [0, 1, 2].forEach(i => A(eo(seg(t, 0.4 + i * 0.12, 0.9 + i * 0.12)), () => { slot(740, 160 + i * 80, 240, 60, ['north', 'south', 'long_run'][i]); arrow(552, 270, 734, 190 + i * 80, { stroke: C.violet }); }));
  A(seg(t, 1.0, 1.5), () => { R(470, 410, 340, 54, { fill: C.panel, stroke: C.violet }); M('fit · bind · optimize', 640, 442, { size: 14, color: C.violet, align: 'center' }); });
  A(seg(t, 1.2, 1.7), () => T('Fit once, use it everywhere', 640, 530, { size: 22, align: 'center', color: C.muted }));
}

/* ---------- 1. a fit runs once ---------- */
function sFit(t) {
  CAP('ComposedRequest.fits · ONE MODEL, RUN ONCE, BEFORE ANY SLOT', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 420, C.violet);
    code([['"fits": [{ "name": "base",', C.violet], ['  "request": { "cohort": { "filename": "m.pulse" },', C.muted], ['    WIN_DISTRIBUTED_LAG tv 0.6 · search 0.2', C.teal],
      ['    REG_OLS sales ~ tv_ad + search_ad + north', C.violet], ['    "holdout": "week >= 92" } }],', C.violet], ['"requests": [', C.ink],
      ['  { "label": "north", FILTER_INCLUDE market north,', C.teal], ['    ATTR_REG_PREDICT pred · "params": { "fit": "base" },', C.violet], ['    ATTR_FORMULA miss = sales - pred, … },', C.muted],
      ['  { "label": "south", … the same, market south }]', C.teal]], 86, 182, 30);
    M('one ordinary request · exactly one regression', 86, 506, { size: 12.5, color: C.ink });
    M('its own cohort, filters and windows pick the fit rows', 86, 530, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(656, 146, 560, 210, C.violet);
    CAP('ComposedResponse.fits.base', 678, 174, { color: C.violet });
    coefRows(678, 206, [['(intercept)', f2(BASE.b.int)], ['tv_ad', f3(BASE.b.tv), 'se ' + f3(BASE.se.tv)], ['search_ad', f3(BASE.b.search), 'se ' + f3(BASE.se.search)], ['north', f2(BASE.b.north)]], t, 3.0, 510);
    M('n_obs ' + BASE.n + ' · holdout n ' + BASE.hold.n + ' · rmse ' + f2(BASE.hold.rmse), 678, 316, { size: 12.5, color: C.muted });
    M('true slopes 1.6 and 3.2', 678, 338, { size: 12, color: C.faint });
  });
  SLOTS.forEach(([lab, s, tp, mm, sd], i) => A(seg(t, 5.0 + i * 0.3, 5.4 + i * 0.3), () => {
    const x = 656 + i * 284; slot(x, 372, 268, 194, 'responses[' + i + '] · "' + lab + '"');
    M('sum sales ' + num(s), x + 14, 424, { size: 13.5, color: C.ink }); M('mean miss ' + f2(mm), x + 14, 456, { size: 13, color: C.ink });
    M('sd miss ' + f2(sd), x + 14, 484, { size: 13, color: C.muted }); M('scored, never refitted', x + 14, 540, { size: 11.5, color: C.violet });
  }));
}

/* ---------- 2. reading a fit by name ---------- */
function sNames(t) {
  CAP('A FIT IS READ BY NAME · ONE NAMESPACE', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 200, C.violet);
    M('ATTR_FORMULA "tv_part":', 86, 182, { size: 13, color: C.muted });
    M('coef("base", "tv_ad") * tv_ad', 86, 212, { size: 15, color: C.violet, weight: 600 });
    M('a term\'s "point", "lower", "upper" or "se" · formulas and filters', 86, 244, { size: 12, color: C.muted });
    SLOTS.forEach(([lab, , tp], i) => { M(lab + ': sum tv_part ' + num(tp), 86, 284 + i * 26, { size: 13.5, color: C.ink }); });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 200, C.coral);
    CAP('slot 1 reads "fit": "bsae"', 678, 174, { color: C.muted });
    M('PULSE_MODEL_UNKNOWN', 678, 212, { size: 15, color: C.coral, weight: 600 });
    M('no fit or model named "bsae" is bound', 678, 242, { size: 13, color: C.ink });
    M('details.available ["base"] · request 1', 678, 268, { size: 13, color: C.ink });
    M('a name used twice: PULSE_MODEL_NAME_COLLISION', 678, 304, { size: 12, color: C.muted });
    M('a name of another kind: PULSE_MODEL_KIND_MISMATCH', 678, 326, { size: 12, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 364, 1152, 202, C.amber);
    CAP('pulse api predict-compose · NOTHING IS FITTED', 86, 392, { color: C.amber });
    M('"fits": [{ "name": "base", "type": "REG_OLS", "target": "sales",', 86, 428, { size: 13.5, color: C.ink });
    M('           "predictors": ["tv_ad", "search_ad", "north"], "cohort": "m.pulse" }]', 86, 454, { size: 13.5, color: C.ink });
    M('every params.fit name and kind is judged before anything runs', 86, 494, { size: 12.5, color: C.amber });
    M('a fit that fails on its data fails alone: its readers go null with PULSE_FIT_UNAVAILABLE', 86, 524, { size: 12.5, color: C.muted });
    M('a fit adds no row · fits sit outside the return and are never rounded', 86, 548, { size: 12, color: C.faint });
  });
}

/* ---------- 3. bind the winner ---------- */
function sBind(t) {
  CAP('fits[].from_sweep · THE SWEEP\'S WINNER, AS A NAMED FIT', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 230, C.teal);
    code([['"sweep": { "mode": "lhs", "samples": 40,', C.teal], ['  tv, search: "range" [0, 0.95]', C.amber], ['  "request": { … REG_OLS "name": "sales" … },', C.violet],
      ['  "rank": { "by": "regressions.sales.holdout.rmse" } },', C.violet], ['"fits": [{ "name": "best",', C.violet], ['  "from_sweep": { "regression": "sales" } }]', C.violet, ]], 86, 182, 30);
    M('film 17\'s lhs search, the same seed, one entry more', 86, 360, { size: 12, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 230, C.violet);
    CAP('ranking[0] · slot ' + WIN.slot, 678, 174, { color: C.violet });
    M('axes { "tv": ' + f3(WIN.tv) + ', "search": ' + f3(WIN.search) + ' } · rmse ' + f2(WIN.rmse), 678, 206, { size: 13, color: C.ink });
    CAP('fits.best · refitted on that slot\'s rows', 678, 246, { color: C.violet });
    coefRows(678, 276, [['(intercept)', f2(BEST.int)], ['tv_ad', f3(BEST.tv)], ['search_ad', f3(BEST.search)], ['north', f2(BEST.north)]], t, 2.8, 510);
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 394, 1152, 172, C.violet);
    M('fits.best equals slot 39\'s own regression, figure for figure', 86, 430, { size: 14, color: C.violet, weight: 600 });
    M('the fit request is the winning slot\'s rows plus that one regression: cohort, filters, windows, attributes, weight, params', 86, 462, { size: 12.5, color: C.ink });
    M('dropped: groups, crosstab, aggregations, tests, matrices, return, and the regression\'s own save', 86, 488, { size: 12.5, color: C.muted });
    M('the winner is ranking[0] · ties go to the earliest slot · a slot that failed is never ranked', 86, 520, { size: 12.5, color: C.muted });
    M('no winner: fits.best carries the error · there is no fallback to rank 2', 86, 546, { size: 12, color: C.coral });
  });
}

/* ---------- 4. run order and sweep_axis() ---------- */
function sAxis(t) {
  CAP('A BATCH WITH A BINDING RUNS SWEEP-FIRST', 64, 124, { color: C.teal });
  const steps = [['authored fits', C.violet], ['sweep slots', C.teal], ['rank', C.violet], ['bound fit', C.violet], ['optimize', C.violet], ['explicit slots', C.teal]];
  steps.forEach(([s, c], i) => A(seg(t, 0.2 + i * 0.2, 0.5 + i * 0.2), () => {
    const x = 64 + i * 194; R(x, 146, 176, 52, { fill: C.panel2, stroke: c }); M(s, x + 88, 177, { size: 13, color: c, align: 'center' });
    if (i) arrow(x - 16, 172, x - 2, 172, { stroke: C.faint });
  }));
  A(seg(t, 1.6, 2.0), () => M('responses keep index order · the explicit slot is responses[0], then the 40 sweep slots', 64, 226, { size: 12.5, color: C.muted }));
  A(seg(t, 2.8, 3.2), () => {
    card(64, 246, 680, 200, C.violet);
    CAP('sweep_axis("best", "<axis>") · THE WINNER\'S VALUE, A NUMBER', 86, 274, { color: C.violet });
    M('"tv_mult": (1 - sweep_axis("best", "tv") ^ 9)', 86, 308, { size: 13.5, color: C.ink });
    M('            / (1 - sweep_axis("best", "tv"))', 86, 332, { size: 13.5, color: C.ink });
    M('"tv_long": coef("best", "tv_ad") * tv_mult', 86, 366, { size: 13.5, color: C.ink });
    M('steady state: what a constant weekly spend of 1 settles to, over 9 weeks', 86, 400, { size: 12, color: C.muted });
    M('no label parsing · in a slot\'s formula or filter, and in optimize', 86, 424, { size: 12, color: C.muted });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(764, 246, 452, 200, C.violet);
    CAP('responses[0] · "long_run"', 786, 274, { color: C.violet });
    [['tv_mult', f3(LONG.mult), ''], ['tv_long', f2(LONG.tv), 'true 3.96'], ['search_long', f2(LONG.search), 'true 4.00']].forEach(([k, v, tr], i) => {
      M(k, 786, 316 + i * 34, { size: 13.5, color: C.muted }); M(v, 1010, 316 + i * 34, { size: 16, color: C.ink, align: 'right', weight: 600 }); M(tr, 1196, 316 + i * 34, { size: 12, color: C.faint, align: 'right' });
    });
    M('sales per unit of steady weekly spend', 786, 426, { size: 11.5, color: C.faint });
  });
  A(seg(t, 6.8, 7.2), () => {
    R(64, 464, 1152, 102, { fill: C.panel, stroke: C.amber, dash: [5, 4] });
    M('TV lands close · search is nearly half too high: the weakly identified channel film 17 warned about', 86, 502, { size: 13.5, color: C.ink });
    M('the bound fit is one slot\'s answer: read the top few ranks before you trust it', 86, 532, { size: 12.5, color: C.amber });
  });
}

/* ---------- 5. binding rules ---------- */
function sRules(t) {
  CAP('A STATIC SIGNATURE · REFUSED BEFORE ANYTHING RUNS', 64, 124, { color: C.coral });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 250);
    CAP('THE SWEEP VARIES THE DATA, NOT THE MODEL', 86, 174);
    M('type, target and predictors: identical in every slot', 86, 210, { size: 13, color: C.ink });
    M('vary a window, a filter or a param', 86, 238, { size: 13, color: C.teal });
    M('predict reads the signature off the first slot,', 86, 276, { size: 12.5, color: C.muted });
    M('so coef() terms and optimize names validate', 86, 298, { size: 12.5, color: C.muted });
    M('with no data', 86, 320, { size: 12.5, color: C.muted });
    M('predict-compose: { "name": "best", "type": "REG_OLS", …', 86, 356, { size: 11.5, color: C.amber });
    M('  "from_sweep": { "regression": "sales" } }', 86, 376, { size: 11.5, color: C.amber });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 250, C.coral);
    CAP('the same batch with no sweep.rank', 678, 174, { color: C.muted });
    M('PULSE_FIT_INVALID', 678, 212, { size: 15, color: C.coral, weight: 600 });
    M('reason from_sweep_no_rank · fit 0 · name "best"', 678, 242, { size: 13, color: C.ink });
    M('no rank, so no slot wins', 678, 268, { size: 13, color: C.ink });
    M('also: from_sweep_with_request · _no_sweep', 678, 310, { size: 12, color: C.muted });
    M('_regression_unknown · _signature_varies', 678, 332, { size: 12, color: C.muted });
    M('_cycle: a sweep slot reads the fit it feeds', 678, 354, { size: 12, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 414, 1152, 152, C.violet);
    CAP('THE BOUND FIT IS AN ORDINARY FIT', 86, 442, { color: C.violet });
    M('coef("best", …) · ATTR_REG_PREDICT { "fit": "best" } · optimize · save', 86, 476, { size: 13.5, color: C.ink });
    M('its figures and save file match an authored fit of the winning body', 86, 506, { size: 12.5, color: C.muted });
    M('search, fit and use in one Compose call', 86, 536, { size: 12.5, color: C.violet });
  });
}

/* ---------- 6. diminishing returns ---------- */
function curvePlot(x0, y0, w, h, t, at, o = {}) {
  R(x0, y0, w, h, { fill: C.panel, stroke: C.rule, r: 2 });
  const X = v => x0 + v / 60 * w, Y = v => y0 + h - v / 220 * h;
  M('weekly spend →', x0 + w / 2, y0 + h + 20, { size: 11, color: C.faint, align: 'center' }); M('0', x0, y0 + h + 20, { size: 11, color: C.faint });
  M('60', X(60), y0 + h + 20, { size: 11, color: C.faint, align: 'right' }); M('sales / week', x0 + 8, y0 + 18, { size: 11, color: C.faint });
  [['tv', C.teal], ['search', C.amber]].forEach(([ch, col], j) => {
    const u = eo(seg(t, at + j * 0.4, at + 1.2 + j * 0.4)); if (u <= 0) return;
    const pts = []; for (let i = 0; i <= 120 * u; i++) { const v = i / 2; pts.push([X(v), Y(resp(ch, v))]); }
    if (pts.length > 1) Ln(pts, { stroke: col, lw: 2.2 });
    if (u >= 1) M(ch, X(58), Y(resp(ch, 58)) - 10, { size: 12, color: col, align: 'right' });
  });
  if (o.marks) o.marks(X, Y);
}
function sCurve(t) {
  CAP('A SIBLING COHORT · THE SAME SPEND, SALES THAT SATURATE', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 186, C.teal);
    M('h.pulse: film 17\'s markets, weeks, TV and search spend', 86, 180, { size: 13, color: C.ink });
    M('sales now take each adstock through a Hill curve', 86, 206, { size: 13, color: C.ink });
    M('true: TV decay 0.6 · k 70 · s 1.6', 86, 244, { size: 12.5, color: C.muted });
    M('      search decay 0.2 · k 14 · s 2.2', 86, 268, { size: 12.5, color: C.muted });
    M('a linear model cannot see the bend, so the curve is fitted', 86, 308, { size: 12, color: C.faint });
  });
  A(seg(t, 2.4, 2.8), () => {
    card(64, 350, 560, 216, C.violet);
    M('hill(x, k, s) = x^s / (x^s + k^s)', 86, 386, { size: 15, color: C.violet, weight: 600 });
    M('k: the adstock at half saturation · s: the shape', 86, 416, { size: 12.5, color: C.ink });
    M('REG_MMM_HILL: y = β0 + Σ β·hill(adstock, k, s) + controls', 86, 452, { size: 12.5, color: C.ink });
    M('params.channels: which predictors bend · the rest are linear', 86, 478, { size: 12, color: C.muted });
    M('it does not adstock: WIN_DISTRIBUTED_LAG does, upstream', 86, 504, { size: 12, color: C.muted });
    M('coefficients: (intercept), betas, controls, k:<ch>, s:<ch>', 86, 530, { size: 12, color: C.muted });
    M('k within 0.02–20× the channel mean · s within 0.5–5', 86, 552, { size: 11.5, color: C.faint });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(656, 146, 560, 420, C.violet);
    CAP('fits.mmm · the fitted curves at steady state', 678, 174, { color: C.violet });
    curvePlot(700, 196, 480, 300, t, 4.8);
    M('TV keeps climbing · search rises steeply near 10 a week, then flattens', 678, 548, { size: 12, color: C.muted });
  });
}

/* ---------- 7. the one call ---------- */
function sCall(t) {
  CAP('ONE COMPOSE CALL · SEARCH, FIT, SCORE, ALLOCATE', 64, 124, { color: C.teal });
  const parts = [
    ['"sweep"', C.teal, ['lhs · 400 samples · tv [0.3, 0.8] · search [0, 0.6]', 'WIN_DISTRIBUTED_LAG per channel, decay { "$var" }', 'REG_MMM_HILL "mmm" · channels tv_ad, search_ad · holdout week >= 92', 'rank regressions.mmm.holdout.rmse asc']],
    ['"fits"', C.violet, ['{ "name": "mmm", "from_sweep": { "regression": "mmm" },', '  "save": "models/mmm.pulse-model.json" }']],
    ['"requests"', C.teal, ['"contribution": rebuild each adstock at the winning decay,', 'then coef("mmm", "tv_ad") * hill(tv_ad, k, s) per channel']],
    ['"optimize"', C.violet, ['maximize the summed curves · tv + search = params.budget', 'search capped at params.cap_search']]];
  let y = 146;
  parts.forEach(([h, col, L], i) => {
    const hh = 24 + L.length * 24; const yy = y;
    const at = [0.2, 2.2, 4.0, 5.6][i];
    A(seg(t, at, at + 0.4), () => {
      R(64, yy, 1152, hh, { fill: C.panel, stroke: col });
      M(h, 86, yy + 30, { size: 14, color: col, weight: 600 });
      L.forEach((s, j) => M(s, 260, yy + 30 + j * 24, { size: 12.5, color: C.ink }));
    });
    y += hh + 12;
  });
  A(seg(t, 5.6, 6.0), () => {
    M('"params": { "budget": 33, "cap_search": 12 } · MaxComposeSlots counts 400 samples + 1 explicit slot (default 1,000)', 64, 552, { size: 12, color: C.amber });
  });
}

/* ---------- 8. the search's answer ---------- */
function sAnswer(t) {
  CAP('ranking[0..4] · fits.mmm', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 230, C.violet);
    ['rank', 'slot', 'tv', 'search', 'rmse'].forEach((h, j) => M(h, 86 + [0, 100, 200, 300, 400][j] + (j ? 60 : 0), 178, { size: 11.5, color: C.muted, align: j ? 'right' : 'left' }));
    MTOP.forEach((r, i) => A(seg(t, 0.4 + i * 0.12, 0.7 + i * 0.12), () => {
      const yy = 208 + i * 28; M(String(i + 1), 86, yy, { size: 13, color: C.ink });
      [String(r[0]), f3(r[1]), f3(r[2]), f2(r[3])].forEach((v, j) => M(v, 86 + [100, 200, 300, 400][j] + 60, yy, { size: 13, color: j === 1 ? C.violet : j === 2 ? C.amber : C.ink, align: 'right', weight: j === 1 ? 600 : 400 }));
    }));
    M('sweep_seed 4924538234750439822', 86, 360, { size: 11.5, color: C.faint });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 230, C.violet);
    CAP('fits.mmm · REG_MMM_HILL · holdout rmse ' + f2(HILL.hold), 678, 174, { color: C.violet });
    M('estimate', 1086, 200, { size: 11, color: C.faint, align: 'right' }); M('se', 1196, 200, { size: 11, color: C.faint, align: 'right' });
    coefRows(678, 226, [['tv_ad', f1(HILL.tv.b), f1(HILL.tv.seb)], ['k:tv_ad', f1(HILL.tv.k), f1(HILL.tv.sek)], ['s:tv_ad', f2(HILL.tv.s), f2(HILL.tv.ses)],
      ['search_ad', f1(HILL.search.b), f2(HILL.search.seb)], ['k:search_ad', f1(HILL.search.k), f2(HILL.search.sek)], ['s:search_ad', f2(HILL.search.s), 'null', C.coral]], t, 2.8, 518);
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 394, 1152, 172, C.amber);
    M('TV: every near-best rank sits at 0.60–0.64, around the true 0.6', 86, 430, { size: 13.5, color: C.ink });
    M('search: 0.53–0.59, far from the true 0.2 · and its shape s sits on the upper bound of 5, with a null se', 86, 460, { size: 13.5, color: C.ink });
    M('no decay has a standard error: report the spread across the near-best ranks', 86, 498, { size: 12.5, color: C.amber });
    M('a parameter on a bound is a warning sign · an always-on channel is the hardest to identify', 86, 526, { size: 12.5, color: C.muted });
    M('decays conditional on the sweep: the Bayesian model, at the end, puts them inside the fit', 86, 552, { size: 11.5, color: C.faint });
  });
}

/* ---------- 9. contribution ---------- */
function sContrib(t) {
  CAP('"contribution" · A WINDOW\'S DECAY IS A LITERAL, SO REBUILD THE ADSTOCK', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 680, 260, C.teal);
    code([['WIN_LAG "for_each": grid · ch [tv, search] × lag 1..8', C.teal], ['  "field": "{{ch}}", "label": "{{ch}}_l{{lag}}",', C.teal], ['  "params": { "offset": { "$var": "lag" }, "default": 0 }', C.muted],
      ['ATTR_FORMULA "tv_ad":', C.violet], ['  tv + d * (tv_l1 + d * (tv_l2 + … + d * tv_l8))', C.violet], ['  d = sweep_axis("mmm", "tv")', C.violet],
      ['ATTR_FORMULA "tv_c": coef("mmm", "tv_ad")', C.violet], ['  * hill(tv_ad, coef("mmm", "k:tv_ad"), coef("mmm", "s:tv_ad"))', C.violet]], 86, 180, 26);
  });
  A(seg(t, 2.8, 3.2), () => {
    card(764, 146, 452, 260, C.amber);
    CAP('WHY NOT JUST A LAG WINDOW?', 786, 174, { color: C.amber });
    M('WIN_DISTRIBUTED_LAG takes its decay', 786, 210, { size: 12.5, color: C.ink }); M('as a number, written in the request', 786, 232, { size: 12.5, color: C.ink });
    M('the winner is known only after the', 786, 268, { size: 12.5, color: C.ink }); M('sweep, so plain lags carry the history', 786, 290, { size: 12.5, color: C.ink });
    M('and a formula applies the decay', 786, 312, { size: 12.5, color: C.ink });
    M('aggregating a post-window label runs', 786, 352, { size: 12, color: C.muted }); M('the slot windows-first, per week', 786, 374, { size: 12, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 424, 1152, 142, C.violet);
    CAP('responses[0] · grouped by market · sums over 104 weeks', 86, 452, { color: C.violet });
    ['market', 'sales', 'tv_c', 'share', 'search_c', 'share'].forEach((h, j) => M(h, [86, 400, 600, 720, 920, 1040][j], 480, { size: 11.5, color: C.muted, align: j ? 'right' : 'left' }));
    CONTRIB.forEach(([m, s, tc, sc], i) => {
      const y = 508 + i * 28; M(m, 86, y, { size: 13.5, color: C.ink });
      [[400, num(s)], [600, num(tc)], [720, f1(100 * tc / s) + '%'], [920, num(sc)], [1040, f1(100 * sc / s) + '%']].forEach(([x, v], j) => M(v, x, y, { size: 13.5, color: j === 0 ? C.ink : j % 2 ? C.violet : C.muted, align: 'right' }));
    });
  });
}

/* ---------- 10. optimize ---------- */
function sOpt(t) {
  CAP('"optimize" · BEST KNOB SETTINGS OVER THE FITTED MODEL', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 420, C.violet);
    code([['{ "name": "allocation", "direction": "maximize",', C.violet], ['  "variables": [', C.ink], ['    { "name": "tv", "lower": 0, "upper": 60 },', C.amber],
      ['    { "name": "search", "lower": 0,', C.amber], ['      "upper": "params.cap_search" } ],', C.amber], ['  "objective":', C.ink],
      ['    coef("mmm", "tv_ad") * hill(m_tv * tv, k, s)', C.violet], ['    + coef("mmm", "search_ad") * hill(m_s * search, …),', C.violet],
      ['  "constraints": [{ "expr": "tv + search - params.budget",', C.teal], ['                   "type": "eq" }],', C.teal], ['  "starts": 8 }', C.ink]], 86, 180, 28);
    M('m = (1 - d^9) / (1 - d), d = sweep_axis("mmm", ch)', 86, 500, { size: 12, color: C.muted });
    M('eq: expr = 0 · ineq: expr >= 0 · reads no record', 86, 524, { size: 12, color: C.muted });
    M('multi-start SLSQP, gradients by finite differences', 86, 548, { size: 12, color: C.faint });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(656, 146, 560, 260, C.violet);
    CAP('ComposedResponse.optimizations[0] · "allocation"', 678, 174, { color: C.violet });
    ['variable', 'value', 'marginal', 'active'].forEach((h, j) => M(h, [678, 880, 1040, 1196][j], 206, { size: 11.5, color: C.muted, align: j ? 'right' : 'left' }));
    [['tv', f1(OPT.tv[0]), f3(OPT.tv[1]), '—'], ['search', String(OPT.search[0]), f3(OPT.search[1]), 'upper']].forEach((r, i) => A(seg(t, 3.0 + i * 0.2, 3.3 + i * 0.2), () =>
      r.forEach((v, j) => M(v, [678, 880, 1040, 1196][j], 240 + i * 30, { size: 14.5, color: j === 3 && v === 'upper' ? C.amber : j === 2 ? C.violet : C.ink, align: j ? 'right' : 'left', weight: j === 1 ? 600 : 400 }))));
    M('constraint tv + search - params.budget · multiplier ' + f3(OPT.mult), 678, 318, { size: 12.5, color: C.teal });
    M('objective ' + f1(OPT.obj) + ' a week · converged · ' + OPT.iters + ' iterations', 678, 348, { size: 12.5, color: C.ink });
    M('starts ' + OPT.starts + ' · starts_agreeing ' + OPT.agree, 678, 378, { size: 12.5, color: C.coral });
  });
  A(seg(t, 5.2, 5.6), () => {
    card(656, 424, 560, 142);
    M('current mix, about 23.6 TV and 9.6 search a week:', 678, 460, { size: 12.5, color: C.muted });
    M('148.1 on the same curves (computed)', 678, 484, { size: 12.5, color: C.ink });
    M('the optimum: ' + f1(OPT.obj) + ', spend moved from TV to search, up to its cap', 678, 518, { size: 13, color: C.violet, weight: 600 });
    M('a figure from one fitted model, not a forecast', 678, 546, { size: 11.5, color: C.faint });
  });
}

/* ---------- 11. reading the marginals ---------- */
function sMarg(t) {
  CAP('MARGINALS AND THE SHADOW PRICE', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 300, C.violet);
    const x0 = 230, sc = 40;
    [['tv', OPT.tv[1], 'free'], ['search', OPT.search[1], 'at its cap']].forEach(([k, v, s], i) => A(seg(t, 0.4 + i * 0.3, 0.8 + i * 0.3), () => {
      const y = 196 + i * 70; M(k, 86, y + 18, { size: 14, color: C.ink, weight: 600 }); M(s, 86, y + 40, { size: 11.5, color: C.muted });
      R(x0, y, v * sc, 28, { fill: i ? C.amberS : C.violetS, stroke: i ? C.amber : C.violet, r: 3 }); M(f2(v), x0 + v * sc + 10, y + 19, { size: 13, color: i ? C.amber : C.violet });
    }));
    A(seg(t, 1.6, 2.0), () => { const x = x0 + OPT.mult * sc; Ln([[x, 180], [x, 350]], { stroke: C.teal, lw: 1.6, dash: [5, 4] }); M('budget multiplier ' + f2(OPT.mult), x + 6, 372, { size: 12, color: C.teal }); });
    M('marginal: d objective / d variable at the optimum', 86, 410, { size: 12, color: C.muted });
    M('multiplier: what one more unit of budget adds', 86, 430, { size: 12, color: C.muted });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(656, 146, 560, 300, C.violet);
    curvePlot(700, 170, 480, 230, t, -2, { marks: (X, Y) => {
      dot(X(OPT.tv[0]), Y(resp('tv', OPT.tv[0])), 6, C.violet); dot(X(OPT.search[0]), Y(resp('search', OPT.search[0])), 6, C.violet);
      Ln([[X(12), Y(0)], [X(12), Y(215)]], { stroke: C.amber, dash: [3, 4] }); M('cap 12', X(12) + 6, Y(200), { size: 11, color: C.amber });
    } });
    M('violet: the optimum on each fitted curve', 678, 436, { size: 11.5, color: C.violet });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 462, 560, 104, C.teal);
    M('every free channel\'s marginal equals the multiplier', 86, 494, { size: 13, color: C.teal, weight: 600 });
    M('at its upper bound: above it, so raise the cap to gain', 86, 520, { size: 12.5, color: C.ink });
    M('at zero: below it, not worth a unit', 86, 544, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.8, 7.2), () => {
    card(656, 462, 560, 104, C.coral);
    M('"overspend": tv + search = 80, above the bounds\' 72', 678, 492, { size: 12.5, color: C.ink });
    M('PULSE_OPTIMIZE_INFEASIBLE · the block fails alone', 678, 518, { size: 13, color: C.coral, weight: 600 });
    M('PULSE_SLOT_FAILED · slot_kind optimizations', 678, 544, { size: 12, color: C.coral });
  });
}

/* ---------- 12. save and load ---------- */
function sSave(t) {
  CAP('"save" WRITES A FIT · "models" AND "populations" LOAD IT', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 200, C.violet);
    M('models/mmm.pulse-model.json', 86, 182, { size: 15, color: C.violet, weight: 600 });
    M('written under the data root once the fit runs', 86, 212, { size: 12.5, color: C.ink });
    M('atomic · full precision · on the fit entry', 86, 236, { size: 12.5, color: C.ink });
    M('{ "model_format_version": 3, "name": "mmm",', 86, 274, { size: 12, color: C.muted });
    M('  "type": "REG_MMM_HILL", "coefficients": { … } }', 86, 296, { size: 12, color: C.muted });
    M('replacing a file warns PULSE_MODEL_OVERWRITTEN', 86, 330, { size: 11.5, color: C.faint });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 200, C.teal);
    CAP('pulse api process · a later, ordinary request', 678, 174, { color: C.teal });
    M('"models": [{ "name": "mmm", "path": "models/mmm.pulse-model.json" }]', 678, 204, { size: 11.5, color: C.ink });
    M('ATTR_REG_PREDICT { "fit": "mmm" } · no refit', 678, 228, { size: 12, color: C.violet });
    ['year', 'mean sales', 'mean pred'].forEach((h, j) => M(h, [678, 960, 1180][j], 262, { size: 11.5, color: C.muted, align: j ? 'right' : 'left' }));
    LOAD.forEach(([y, s, p], i) => { const yy = 290 + i * 26; M(y, 678, yy, { size: 13.5, color: C.ink }); M(f2(s), 960, yy, { size: 13.5, color: C.ink, align: 'right' }); M(f2(p), 1180, yy, { size: 13.5, color: C.violet, align: 'right' }); });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 364, 1152, 202, C.violet);
    CAP('A VECTOR FIT SAVES AS A POPULATION', 86, 392, { color: C.violet });
    M('fits "y2024": MAT_COVARIANCE of tv, search, sales over 2024 · n ' + POP.n + ' · means ' + POP.mean.map(f2).join(', '), 86, 424, { size: 12.5, color: C.ink });
    M('"save": "pops/y2024.pulse-population.json" → "populations": [{ "name": "y2024", "path": … }]', 86, 450, { size: 12.5, color: C.violet });
    M('ATTR_MAHALANOBIS { "fit": "y2024" } · mean D² 2024 ' + f3(POP.d2[0][1]) + ' (in sample: 3 × 103/104) · 2025 ' + f3(POP.d2[1][1]), 86, 480, { size: 12.5, color: C.ink });
    M('a loaded name reads like the fit that saved it, on any cohort holding its columns', 86, 514, { size: 12, color: C.muted });
    M('registered populations (PULSE_POPULATIONS_DIR, or Options.Extensions.Populations) are bound in every request', 86, 540, { size: 12, color: C.amber });
  });
}

/* ---------- 13. the Bayesian model ---------- */
function interval(x0, y, w, lo, mid, hi, max, col, label) {
  const X = v => x0 + v / max * w;
  M(label, x0 - 14, y + 5, { size: 13, color: C.ink, align: 'right' });
  Ln([[X(lo), y], [X(hi), y]], { stroke: col, lw: 4 }); dot(X(mid), y, 6, col);
  M(f2(lo) + ' – ' + f2(hi), X(hi) + 12, y + 5, { size: 12, color: col });
}
function sBayes(t) {
  CAP('REG_MMM_BAYES · DECAY INSIDE THE MODEL', 64, 124, { color: C.violet });
  const out = 1 - seg(t, 6.8, 7.1);
  A(seg(t, 0.2, 0.6) * out, () => {
    card(64, 146, 560, 200, C.teal);
    code([['FILTER_INCLUDE market north · one row per week', C.teal], ['REG_MMM_BAYES sales ~ tv + search', C.violet], ['  "params": { "channels": ["tv", "search"],', C.violet],
      ['    "time": "week", "max_lag": 8 } · "rng_seed": 18', C.violet]], 86, 182, 28);
    M('raw spend: it adstocks inside the fit, so the decay is', 86, 306, { size: 12, color: C.muted }); M('a posterior parameter · NUTS, 4 chains × 1,000 draws', 86, 326, { size: 12, color: C.muted });
  });
  A(seg(t, 2.4, 2.8) * out, () => {
    card(656, 146, 560, 200, C.coral);
    CAP('target_accept 0.8 (the default)', 678, 174, { color: C.muted });
    M('PROCESSING_REGRESSION_DIAGNOSTIC', 678, 210, { size: 14, color: C.coral, weight: 600 });
    M('reason divergences · ' + BAY.div + ' of ' + num(BAY.draws).replace('.0', '') + ' transitions', 678, 238, { size: 13, color: C.ink });
    M('reported, not refused · Strict fails the slot', 678, 270, { size: 12.5, color: C.muted });
    M('"target_accept": 0.99 → no divergences · max rhat ' + f3(BAY.rhat), 678, 314, { size: 12.5, color: C.teal });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(64, 364, 1152, 202, C.violet);
    CAP('outputs · 90% credible intervals (credible_level 0.9)', 86, 392, { color: C.violet });
    M('decay', 86, 424, { size: 12, color: C.muted }); M('roi', 680, 424, { size: 12, color: C.muted });
    interval(220, 452, 300, ...BAY.decay.tv, 1, C.teal, 'tv'); interval(220, 488, 300, ...BAY.decay.search, 1, C.amber, 'search');
    interval(780, 452, 260, ...BAY.roi.tv, 14, C.teal, 'tv'); interval(780, 488, 260, ...BAY.roi.search, 14, C.amber, 'search');
    M('true decays 0.6 and 0.2 · search\'s roi interval is the wide one: read its width, not its centre', 86, 540, { size: 12.5, color: C.ink });
  });
  A(seg(t, 7.1, 7.5), () => {
    R(64, 146, 1152, 200, { fill: C.panel, stroke: C.amber });
    CAP('WHICH ROUTE', 86, 174, { color: C.amber });
    M('the sweep and REG_MMM_HILL: fast, scores a holdout, saves, feeds optimize', 86, 212, { size: 13.5, color: C.ink });
    M('REG_MMM_BAYES: intervals that include the decay · no save, no scoring, no optimizer', 86, 244, { size: 13.5, color: C.ink });
    M('pick the sweep to allocate budget, Bayes to say how sure you are', 86, 284, { size: 13.5, color: C.violet, weight: 600 });
    M('a lift test can enter as a prior on a channel\'s roi · check the diagnostics first', 86, 318, { size: 12, color: C.muted });
  });
}

/* ---------- 14. recap ---------- */
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('COMPOSE TODAY · FIT, BIND AND OPTIMIZE', 64, 124, { color: C.violet });
    [['FITS', 'fits · run once · ATTR_REG_PREDICT · coef() · one namespace'], ['BINDING', 'from_sweep · sweep_axis() · ranking[0] · sweep-first'], ['MEDIA MIX', 'REG_MMM_HILL · hill() · WIN_DISTRIBUTED_LAG · REG_MMM_BAYES'],
     ['OPTIMIZE', 'variables · objective · eq / ineq · marginal · multiplier'], ['KEEP IT', 'save · models · populations']].forEach(([h, ops], k) => A(seg(t, 0.2 + k * 0.4, 0.6 + k * 0.4), () => {
      const y = 146 + k * 46; M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, C.violet]), 300, y, 916, { size: 12 });
    }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 400, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 428, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 452, { size: 14.5 });
      R(650, 400, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own regressions', 668, 428, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions', 668, 452, { size: 14.5 });
    });
    A(seg(t, 6.4, 6.8), () => { R(64, 484, 1152, 66, { fill: C.panel, stroke: C.rule }); M('batches, sweeps, rankings and banners: the previous film · next: derived cohorts', 82, 523, { size: 14, color: C.muted }); });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('COMPOSE', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('fit once · bind the winner · read the marginals', 640, 430, { size: 15, align: 'center' });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[1.92, 10.325, 9.173, 7.637, 7.061, 6.016, 7.851, 7.723, 7.659, 7.403, 7.403, 7.36, 8.064, 4.779, 8.427, 8.32, 6.293, 6.635, 9.941, 4.245, 7.403, 2.432, 6.059, 6.229, 7.083, 7.573, 7.339, 8.128, 5.632, 6.421, 9.472, 10.347, 7.147, 8.725, 6.805, 9.579, 7.36, 4.395, 6.677, 8.32, 10.005, 8.853, 8.192, 6.571, 6.827, 9.493, 4.544, 1.067]/*END*/;
PulseFilm.mount({
  series: 'PULSE · COMPOSE',
  title: 'Pulse Compose: fit, bind and optimize',
  narr: NARR,
  scenes: [
    { name: 'Pulse Compose', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Fit once, and use it everywhere.', true]] },
    { name: 'A fit runs once', dur: 7.4, draw: sFit, caps: [
      [0, 'The last film ran many requests as one. Now they share a model. A fits entry is an ordinary request with one regression, and it runs once, before any slot.'],
      [2.8, 'On film 17\'s cohort, with the true decays written in, the fit recovers both slopes. Its full result comes back under fits, keyed by name.',
        'On film seventeen\'s cohort, with the true decays written in, the fit recovers both slopes. Its full result comes back under fits, keyed by name.'],
      [5.0, 'Each slot scores its own rows with ATTR_REG_PREDICT: the same model, scored at full precision, never refitted.',
        'Each slot scores its own rows with a regression predict attribute: the same model, scored at full precision, never refitted.']] },
    { name: 'Read by name', dur: 7.4, draw: sNames, caps: [
      [0, 'A formula or a filter reads one figure with coef: here, TV\'s slope times its adstock, summed per market.',
        'A formula or a filter reads one figure with coef: here, TV\'s slope times its adstock, summed per market.'],
      [2.6, 'Fits share one namespace. A misspelt name is refused, and the error lists the names that are bound.'],
      [5.0, 'Predict lists every fit without fitting it, and judges every name and kind first. A fit that fails on its data fails alone.']] },
    { name: 'Bind the winner', dur: 7.6, draw: sBind, caps: [
      [0, 'Now film 17\'s search, with one entry more. from_sweep names the sweep body\'s regression, instead of writing a request.',
        'Now film seventeen\'s search, with one entry more. From sweep names the sweep body\'s regression, instead of writing a request.'],
      [2.6, 'The same seed gives the same winner, slot 39. Pulse refits its regression on that slot\'s rows, under the name best.',
        'The same seed gives the same winner, slot thirty-nine. Pulse refits its regression on that slot\'s rows, under the name best.'],
      [5.0, 'The bound fit matches the winning slot figure for figure. With no winner, it carries an error. There is no fallback to rank two.']] },
    { name: 'Sweep first', dur: 9.0, draw: sAxis, caps: [
      [0, 'A batch with a binding runs sweep-first: the sweep slots, the rank, the bound fit, then optimize and the explicit slots.'],
      [2.8, 'sweep_axis reads the winner\'s decay as a number. Here it turns into a steady-state multiplier, with no label parsing.',
        'Sweep axis reads the winner\'s decay as a number. Here it turns into a steady-state multiplier, with no label parsing.'],
      [4.8, 'TV\'s long-run effect lands close to the truth. Search\'s is nearly half too high: the weak channel film 17 warned about.',
        'TV\'s long-run effect lands close to the truth. Search\'s is nearly half too high: the weak channel film seventeen warned about.'],
      [6.8, 'A bound fit is one slot\'s answer. Read the top few ranks before you trust it.']] },
    { name: 'Binding rules', dur: 7.4, draw: sRules, caps: [
      [0, 'The sweep may vary the data, never the model: type, target and predictors match in every slot, so predict can check names with no data.'],
      [2.6, 'Remove the rank and nothing can win, so the batch is refused before it runs. A slot that reads the fit it feeds is refused too.'],
      [5.0, 'Otherwise a bound fit is an ordinary fit: read it with coef, score it, optimize over it, save it.']] },
    { name: 'Diminishing returns', dur: 7.4, draw: sCurve, caps: [
      [0, 'For a media mix we need returns that bend. A sibling cohort keeps the same spend, but its sales saturate.'],
      [2.4, 'REG_MMM_HILL fits every channel\'s slope and Hill curve together: k is the half-saturation point, s the shape. It reads adstocks built upstream.',
        'The Hill media-mix regression fits every channel\'s slope and Hill curve together: k is the half-saturation point, s the shape. It reads adstocks built upstream.'],
      [4.6, 'Here are the fitted curves. TV keeps climbing; search flattens fast.']] },
    { name: 'One call', dur: 8.4, draw: sCall, caps: [
      [0, 'The whole workflow is one Compose call. A Latin hypercube sweep searches both decays, each slot fitting the Hill model.'],
      [2.2, 'A from_sweep fit binds the winner and saves it.', 'A from sweep fit binds the winner and saves it.'],
      [4.0, 'A contribution slot rebuilds each adstock at the winning decay, and an optimize block splits the budget.'],
      [5.6, 'Budget and caps are your own figures, passed as params. The sweep\'s samples count against the slot limit.']] },
    { name: 'What the search found', dur: 7.6, draw: sAnswer, caps: [
      [0, 'The near-best ranks agree on TV: about 0.6, its true decay. On search they sit near 0.55.',
        'The near-best ranks agree on TV: about point six, its true decay. On search they sit near point five five.'],
      [2.6, 'The fit reports betas, then each channel\'s k and s. Search\'s shape sits on its upper bound, so its standard error is null.'],
      [5.0, 'Search\'s true decay was 0.2. Report the spread across near-best ranks, and treat a parameter on a bound as a warning.',
        'Search\'s true decay was point two. Report the spread across near-best ranks, and treat a parameter on a bound as a warning.']] },
    { name: 'Contribution', dur: 7.4, draw: sContrib, caps: [
      [0, 'A window\'s decay is written in the request, so the slot rebuilds the adstock: fanned-out lags, and a formula applying the winning decay.'],
      [2.8, 'Then each channel\'s contribution is its fitted slope times its curve, read with coef and hill.'],
      [5.0, 'Summed per market, TV carries 28 to 32 percent of sales, and search 11 to 12 percent.']] },
    { name: 'Optimize', dur: 7.8, draw: sOpt, caps: [
      [0, 'An optimize block maximises an expression over bounded variables, under constraints. Here, the steady-state curves, with spend summing to the budget.'],
      [2.8, 'Multi-start SLSQP finds TV at 21 and search at its cap of 12. Only three of eight starts agree, so raise starts before you trust it.',
        'Multi-start S L S Q P finds TV at twenty-one and search at its cap of twelve. Only three of eight starts agree, so raise starts before you trust it.'],
      [5.2, 'On these curves, the current mix makes about 148 a week. The optimum makes 162.',
        'On these curves, the current mix makes about a hundred and forty-eight a week. The optimum makes a hundred and sixty-two.']] },
    { name: 'Marginals', dur: 9.0, draw: sMarg, caps: [
      [0, 'Each variable\'s marginal is the gain from one more unit. The budget\'s multiplier is the shadow price: what one more unit of budget adds.'],
      [2.8, 'At the optimum, TV, which is free, earns exactly the multiplier. Search, held at its cap, earns more.'],
      [4.8, 'That is the reading: free channels equalise marginal ROI. A channel above it wants a higher cap; one below it, at zero, is not worth a unit.'],
      [6.8, 'A budget the bounds cannot reach is infeasible. That block fails alone, with a slot-failed warning, and the rest survives.']] },
    { name: 'Save and load', dur: 7.4, draw: sSave, caps: [
      [0, 'save writes the fit under the data root as a model file, at full precision.', 'Save writes the fit under the data root as a model file, at full precision.'],
      [2.6, 'A later request loads it under models and scores with no refit. Here it tracks average sales in both years.'],
      [4.8, 'A vector fit saves as a population. Loaded under populations, it scores another year\'s weeks by their distance from 2024.',
        'A vector fit saves as a population. Loaded under populations, it scores another year\'s weeks by their distance from twenty twenty-four.']] },
    { name: 'The Bayesian route', dur: 9.6, draw: sBayes, caps: [
      [0, 'REG_MMM_BAYES takes raw spend and adstocks it inside the model, so each decay gets its own posterior. It fits one market at a time.',
        'The Bayesian media-mix regression takes raw spend and adstocks it inside the model, so each decay gets its own posterior. It fits one market at a time.'],
      [2.4, 'Check the diagnostics first. At the default, some transitions diverged. That is reported, not refused. Raising target_accept cleared it.',
        'Check the diagnostics first. At the default, some transitions diverged. That is reported, not refused. Raising target accept cleared it.'],
      [4.6, 'Its intervals cover both true decays, search\'s included. Search\'s ROI interval is wide: read its width, not its centre.',
        'Its intervals cover both true decays, search\'s included. Search\'s R O I interval is wide: read its width, not its centre.'],
      [7.0, 'It cannot save, score or optimize. Use the sweep to allocate budget, and Bayes to say how sure you are.']] },
    { name: 'The toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s Compose today: fits that run once, a bound winner, media-mix curves, an optimizer, and models you keep.'],
      [3.4, 'More are added over time, and the manifest lists what your instance offers. Embedders can register their own regressions through Options.Extensions.',
        'More are added over time, and the manifest lists what your instance offers. Embedders can register their own regressions through options dot extensions.'],
      [6.4, 'Batches, sweeps and banners were the last film. Next, derived cohorts.'],
      [9.0, '', 'Pulse Compose.', true]] },
  ],
});
})();
