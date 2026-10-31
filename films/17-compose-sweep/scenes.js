/* Pulse Compose, batch and sweep: film 17 of the 23-film Pulse Anatomy series. Follows SERIES-RULES.md. Film 18
 * (fit, bind and optimize) continues from it on the same cohort. The cohort is illustrative: 208 weekly rows, two
 * markets over two years, with TV spend, search spend and sales (TV carries over at 0.6 a week, search at 0.2), plus a
 * 600-respondent brand survey for the banner. Every figure on screen comes from a recorded Pulse v1.0.0-alpha.33 run
 * in data/ (see data/README.md): batch, collide, batch.parallel, fold/fold0, grid (+ predict), zip, decay, badrank,
 * lhs, random, replay, reseed, fan (+ predict), cut, badslot and banner. The stratum counts are computed from the
 * recorded draws. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, lerp, R, T, M, CAP, Ln, A, dot, ring, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), f3 = v => v.toFixed(3);
const num = v => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* batch.out.json */
const BATCH = { total: { sales: 66618.3, tv: 4907.6 }, market: { north: 355.647, south: 284.913 }, notv: { avg: 283.960, rows: 87 } };
/* fold.out.json (fold0.out.json: the same two slots without overlays, byte-identical responses) */
const FOLD = { y24: { north: 18986.6, south: 15086.3 }, y25: { north: 18000.7, south: 14544.7 }, idx: { north: 94.81, south: 96.41 }, delta: { north: -985.9, south: -541.6 } };
/* grid.out.json, zip.out.json */
const GRID = [['north_2024', 18986.6, 1412.2], ['north_2025', 18000.7, 1126.3], ['south_2024', 15086.3, 1216.3], ['south_2025', 14544.7, 1152.8]];
const ZIP = [['tv_off', '"0"', '"0"', 283.960, 87], ['tv_low', '"0.1"', '"40"', 323.898, 58], ['tv_high', '"40"', '"60"', 367.106, 63]];
/* decay.out.json: one slot per TV decay; holdout rmse of regression "sales" (weeks 92 to 104 held out) */
const DECAY = [[0, 30.401], [0.2, 23.997], [0.4, 16.988], [0.6, 13.313], [0.8, 18.244]];
/* lhs.out.json and random.out.json: every slot's draws [tv, search, holdout rmse], in slot order */
const LHS = [[0.307,0.743,19.05],[0.433,0.927,16.1],[0.274,0.186,21.4],[0.055,0.769,27.13],[0.525,0.03,14.29],[0.309,0.301,20.08],[0.154,0.141,25.56],[0.181,0.113,24.62],[0.402,0.851,16.34],[0.9,0.559,26.36],[0.907,0.696,28.04],[0.876,0.528,23.88],[0.552,0.894,14.35],[0.715,0.333,14.74],[0.655,0.283,13.54],[0.776,0.448,16.93],[0.225,0.197,23.13],[0.707,0.364,14.44],[0.484,0.152,14.7],[0.007,0.862,28.42],[0.47,0.571,14.12],[0.617,0.808,14.01],[0.406,0.719,15.78],[0.631,0.911,15.36],[0.248,0.482,21.99],[0.088,0.606,26.88],[0.51,0.454,13.42],[0.142,0.394,25.86],[0.942,0.26,30.78],[0.786,0.619,18.2],[0.672,0.224,14.03],[0.115,0.425,26.71],[0.029,0.786,27.83],[0.378,0.083,17.83],[0.83,0.062,20.18],[0.758,0.006,17.06],[0.843,0.688,22.42],[0.211,0.515,23.22],[0.351,0.325,18.52],[0.577,0.659,12.54]];
const RND = [[0.155,0.696,24.34],[0.055,0.346,28.73],[0.052,0.029,28.73],[0.816,0.794,21.76],[0.582,0.156,13.46],[0.762,0.544,16.53],[0.706,0.453,14.31],[0.814,0.908,22.47],[0.602,0.334,12.87],[0.82,0.73,21.28],[0.292,0.881,19.83],[0.095,0.557,26.92],[0.888,0.421,24.66],[0.003,0.257,30.34],[0.194,0.62,23.39],[0.846,0.039,21.26],[0.788,0.016,18.17],[0.593,0.771,13.33],[0.385,0.817,16.65],[0.895,0.219,25.37],[0.387,0.582,16.7],[0.299,0.603,19.75],[0.272,0.061,21.47],[0.656,0.476,13.11],[0.315,0.477,19.59],[0.127,0.765,24.99],[0.045,0.928,27.57],[0.002,0.707,28.87],[0.048,0.434,28.78],[0.877,0.854,26.65],[0.495,0.17,14.43],[0.089,0.892,26.21],[0.082,0.284,27.9],[0.217,0.606,22.64],[0.231,0.092,22.89],[0.822,0.028,19.75],[0.579,0.235,13.19],[0.432,0.526,15.34],[0.657,0.201,13.86],[0.504,0.794,13.76]];
/* ranking[0..4] [slot, tv, search, rmse]: lhs (sweep_seed 4503367277782454912; replay.out.json pins it, identical) and reseed (rng_seed 7) */
const TOP = [[39, 0.577, 0.659, 12.54], [26, 0.510, 0.454, 13.42], [14, 0.655, 0.283, 13.54], [21, 0.617, 0.808, 14.01], [30, 0.672, 0.224, 14.03]];
const TOP7 = [[26, 0.583, 0.560, 12.40], [31, 0.564, 0.648, 12.53], [11, 0.647, 0.522, 12.92], [18, 0.528, 0.453, 13.09], [36, 0.608, 0.215, 13.29]];
/* fan.out.json: market north, weeks 1 to 8; one window item fanned out by zip over (d, decay) */
const FAN = [[1, 40.9, 40.9, 40.9, 40.9], [2, 58.4, 70.67, 82.94, 95.21], [3, 50.6, 71.80, 100.36, 136.29], [4, 0, 21.54, 60.22, 122.66],
  [5, 35.4, 41.86, 71.53, 145.79], [6, 0, 12.56, 42.92, 131.21], [7, 0, 3.77, 25.75, 118.09], [8, 57.8, 58.93, 73.25, 164.08]];
/* cut.out.json: the holdout start swept through a request param */
const CUT = [['holdout_from_79', 52, 16.117], ['holdout_from_92', 26, 13.313], ['holdout_from_105', 0, null]];
/* banner.out.json, section "all": column shares (%) and the significance letters each cell is above */
const BCOL = ['Total', 'female', 'male', '18-34', '35-54', '55+'], BN = [600, 303, 297, 212, 229, 159], BLET = ['', 'A', 'B', 'C', 'D', 'E'];
const BROW = [['Alto', [35, 33, 38, 52, 34, 14], ['', '', '', 'DE', 'E', '']], ['Brio', [35, 37, 33, 24, 44, 36], ['', '', '', '', 'C', 'C']], ['Cora', [30, 30, 29, 24, 22, 49], ['', '', '', '', '', 'CD']]];

/* a slot card: label on top, a teal frame for a running request */
function slot(x, y, w, h, label, o = {}) {
  R(x, y, w, h, { fill: C.panel2, stroke: o.stroke || C.teal });
  M(label, x + 12, y + 22, { size: 13, color: o.lc || C.ink, weight: 600 });
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  const labels = ['total', 'by_market', 'request_3', 'north_2024', 'tv=0.6'];
  labels.forEach((s, i) => {
    const u = eo(seg(t, 0.1 + i * 0.12, 0.7 + i * 0.12)), x = lerp(640 - 110, 180 + i * 200, u);
    A(u, () => slot(x, 250, 180, 70, s, { stroke: i > 2 ? C.violet : C.teal }));
  });
  A(seg(t, 0.2, 0.6), () => { R(470, 380, 340, 54, { fill: C.panel, stroke: C.teal }); M('one ComposedRequest · one round-trip', 640, 412, { size: 14, color: C.teal, align: 'center' }); });
  A(seg(t, 1.2, 1.7), () => T('Many requests as one call', 640, 520, { size: 22, align: 'center', color: C.muted }));
}

/* ---------- 1. a batch ---------- */
function sBatch(t) {
  CAP('ComposedRequest · "requests": [ … ]', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 420, C.teal);
    const L = [['{ "requests": [', C.ink], ['  { "label": "total",', C.teal], ['    "cohort": { "filename": "m.pulse" },', C.muted], ['    "aggregations": [AGG_SUM sales, AGG_SUM tv] },', C.muted],
      ['  { "label": "by_market",', C.teal], ['    "groups": [GROUP_CATEGORY market],', C.muted], ['    "aggregations": [AGG_AVERAGE sales] },', C.muted],
      ['  { "filterers": [FILTER_RANGE tv "0".."0"],', C.teal], ['    "aggregations": [AGG_AVERAGE sales] }', C.muted], [']}', C.ink]];
    L.forEach(([s, c], i) => A(seg(t, 0.3 + i * 0.08, 0.6 + i * 0.08), () => M(s, 86, 184 + i * 30, { size: 13, color: c })));
    M('every slot: a complete request, run as if alone', 86, 506, { size: 12.5, color: C.ink });
    M('its own cohort, filters, groups and aggregations', 86, 530, { size: 12.5, color: C.muted });
  });
  const rows = [['responses[0] · "total"', 'sales ' + num(BATCH.total.sales) + ' · tv ' + num(BATCH.total.tv), '208 rows'],
    ['responses[1] · "by_market"', 'north ' + f1(BATCH.market.north) + ' · south ' + f1(BATCH.market.south), 'avg_sales by market'],
    ['responses[2] · "request_3"', 'avg_sales ' + f1(BATCH.notv.avg), BATCH.notv.rows + ' rows with no TV']];
  rows.forEach(([h, v, n], i) => A(seg(t, 2.8 + i * 0.4, 3.2 + i * 0.4), () => {
    const y = 146 + i * 112; slot(656, y, 560, 96, h, { lc: i === 2 ? C.amber : C.ink });
    M(v, 668, y + 56, { size: 15, color: C.ink }); M(n, 668, y + 82, { size: 12, color: C.muted });
  }));
  A(seg(t, 4.6, 5.0), () => { R(656, 488, 560, 78, { fill: C.panel, stroke: C.amber, dash: [5, 4] });
    M('no label → request_<index+1>, on a clone', 676, 520, { size: 13, color: C.amber }); M('responses[i] answers requests[i], whatever finished first', 676, 546, { size: 12.5, color: C.muted }); });
}

/* ---------- 2. labels and workers ---------- */
function sLabels(t) {
  CAP('LABELS NAME SLOTS · WORKERS RUN THEM', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 200, C.coral);
    CAP('slot 1 labelled "request_3"', 86, 174, { color: C.muted });
    M('PULSE_COMPOSE_LABEL_COLLISION', 86, 210, { size: 15, color: C.coral, weight: 600 });
    M('label "request_3" is used by 2 slots', 86, 240, { size: 13, color: C.ink });
    M('details.indices [1, 2]', 86, 266, { size: 13, color: C.ink });
    M('caught before any slot runs', 86, 304, { size: 12.5, color: C.muted });
    M('labels are how overlays and rankings name slots', 86, 328, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 200, C.teal);
    M('pulse api compose --parallel 4', 678, 184, { size: 15, color: C.teal, weight: 600 });
    [0, 1, 2].forEach(i => { const u = eo(seg(t, 3.0 + [0.5, 0, 0.3][i], 3.6 + [0.5, 0, 0.3][i])); R(678, 206 + i * 30, 300 * u, 20, { fill: C.tealS, stroke: C.teal, r: 3 }); M('slot ' + i, 990, 221 + i * 30, { size: 12, color: C.muted }); });
    M('responses come back in request order:', 678, 312, { size: 12.5, color: C.ink });
    M('byte for byte the serial run', 678, 334, { size: 12.5, color: C.violet });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 364, 1152, 202);
    CAP('WHAT A BATCH SAVES, AND WHAT IT DOES NOT', 86, 392);
    M('saves round-trips · every slot still opens and decodes its own cohort', 86, 428, { size: 13.5, color: C.ink });
    M('workers: --parallel N (1 = serial, the default · 0 = one per CPU) · ComposeParallel{MaxWorkers} in Go', 86, 460, { size: 12.5, color: C.muted });
    M('filters in one slot never touch another · per-slot components, as if run alone', 86, 490, { size: 12.5, color: C.muted });
    M('a later step that reads an earlier step\'s rows is a chain, not a batch', 86, 530, { size: 12.5, color: C.amber });
  });
}

/* ---------- 3. the overlay fold ---------- */
function sFold(t) {
  CAP('ComposedRequest.overlays · THE FOLD RUNS AFTER EVERY SLOT', 64, 124, { color: C.violet });
  [['y2024', FOLD.y24, 0.2], ['y2025', FOLD.y25, 0.6]].forEach(([lab, v, at], i) => A(seg(t, at, at + 0.4), () => {
    const x = 64 + i * 330; slot(x, 146, 310, 150, '"' + lab + '" · sum of sales by market');
    M('north', x + 16, 214, { size: 14, color: C.muted }); M(num(v.north), x + 290, 214, { size: 16, color: C.ink, align: 'right' });
    M('south', x + 16, 252, { size: 14, color: C.muted }); M(num(v.south), x + 290, 252, { size: 16, color: C.ink, align: 'right' });
    M('filter year · group market', x + 16, 282, { size: 11.5, color: C.faint });
  }));
  A(seg(t, 2.4, 2.8), () => {
    card(724, 146, 492, 150, C.violet);
    CAP('reference "y2024" · targets ["y2025"] · scope group', 744, 172, { color: C.violet });
    M('OVERLAY_INDEX_VS_REF', 744, 206, { size: 12.5, color: C.violet }); M('OVERLAY_DELTA_VS_REF', 1000, 206, { size: 12.5, color: C.violet });
    [['north', 0], ['south', 1]].forEach(([k, i]) => { const y = 240 + i * 34; M(k, 744, y, { size: 13, color: C.muted });
      M(f1(FOLD.idx[k]), 920, y, { size: 16, color: C.ink, align: 'right', weight: 600 }); M(num(FOLD.delta[k]), 1180, y, { size: 16, color: C.ink, align: 'right', weight: 600 }); });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(64, 316, 1152, 120, C.teal);
    M('responses[0] and responses[1]: byte-identical with or without the overlays', 86, 352, { size: 14, color: C.teal, weight: 600 });
    M('the fold reads each finished slot\'s data, crosstab and components, read-only, and never mutates them', 86, 382, { size: 12.5, color: C.ink });
    M('one layer per spec on ComposedResponse.overlays · always buffered: it waits for every slot', 86, 410, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.6, 7.0), () => {
    card(64, 452, 1152, 114, C.amber);
    M('compared slots must share keys, schema and dictionaries: vary the filter or the cohort, not the shape', 86, 488, { size: 13, color: C.ink });
    M('a slot label the spec names but the batch lacks is refused when the fold runs, after the slots', 86, 516, { size: 12.5, color: C.amber });
    M('the overlays film covers the kinds; the manifest lists the ones your instance serves', 86, 544, { size: 12, color: C.muted });
  });
}

/* ---------- 4. sweep: grid and zip ---------- */
function sSweep(t) {
  CAP('"sweep" · ONE BODY, AXES OF VALUES, MANY SLOTS', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 260, C.teal);
    const L = [['"sweep": { "mode": "grid",', C.ink], ['  "axes": [{ "name": "market", "values": ["north", "south"] },', C.amber], ['           { "name": "year", "values": ["2024", "2025"] }],', C.amber],
      ['  "label": "{{market}}_{{year}}",', C.teal], ['  "request": { … FILTER_INCLUDE market', C.muted], ['      "values": [{ "$var": "market" }] …', C.teal], ['      AGG_SUM sales · AGG_SUM tv } }', C.muted]];
    L.forEach(([s, c], i) => M(s, 80, 180 + i * 28, { size: 12.5, color: c }));
    M('{{axis}} splices text · { "$var": axis } keeps the JSON type', 80, 388, { size: 12, color: C.muted });
  });
  GRID.forEach(([lab, s, tv], i) => A(seg(t, 2.4 + i * 0.25, 2.8 + i * 0.25), () => {
    const x = 656 + (i % 2) * 284, y = 146 + Math.floor(i / 2) * 132; slot(x, y, 268, 116, lab);
    M('sales ' + num(s), x + 14, y + 62, { size: 14, color: C.ink }); M('tv ' + num(tv), x + 14, y + 90, { size: 13, color: C.muted });
  }));
  A(seg(t, 2.4, 2.8), () => M('grid: the Cartesian product, first axis slowest · 2 × 2 → 4 slots', 656, 428, { size: 12.5, color: C.ink }));
  A(seg(t, 5.0, 5.4), () => {
    card(64, 446, 1152, 120, C.teal);
    M('"mode": "zip" · band ["off","low","high"] · lo ["0","0.1","40"] · hi ["0","40","60"] → 3 slots, in lockstep', 86, 478, { size: 12.5, color: C.amber });
    ZIP.forEach(([lab, lo, hi, avg, n], i) => { const x = 86 + i * 376; M(lab, x, 512, { size: 14, color: C.ink, weight: 600 }); M('tv ' + lo + '..' + hi, x + 110, 512, { size: 12, color: C.muted });
      M('avg_sales ' + f1(avg) + ' · ' + n + ' rows', x, 544, { size: 13, color: C.ink }); });
  });
}

/* ---------- 5. predict the expansion ---------- */
function sExpand(t) {
  CAP('pulse api predict-compose · NOTHING RUNS', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 180, C.amber);
    M('"sweep": {', 86, 182, { size: 14, color: C.amber });
    M('  "axes": [{ "name": "market", "count": 2 }, { "name": "year", "count": 2 }], "mode": "grid",', 86, 210, { size: 13.5, color: C.ink });
    M('  "expanded_count": 4,', 86, 238, { size: 13.5, color: C.amber, weight: 600 });
    M('  "labels": ["north_2024", "north_2025", "south_2024", "south_2025"] }', 86, 266, { size: 13.5, color: C.ink });
    M('"valid": true · every slot streamable · the same labels the run will use', 86, 304, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 344, 560, 222);
    CAP('BEFORE ANY SLOT RUNS', 86, 372);
    M('explicit requests first, then the sweep slots', 86, 406, { size: 13, color: C.ink });
    M('MaxComposeSlots counts the expanded total', 86, 434, { size: 13, color: C.ink });
    M('over it: PULSE_LIMIT_EXCEEDED', 86, 462, { size: 13, color: C.coral });
    M('a body that sets "label": refused', 86, 496, { size: 12.5, color: C.muted });
    M('an unknown key: PULSE_REQUEST_UNKNOWN_FIELD', 86, 522, { size: 12.5, color: C.muted });
    M('the substituted body decodes strictly', 86, 546, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(656, 344, 560, 222, C.coral);
    CAP('PLACEHOLDERS ARE NOT EXPRESSIONS', 678, 372, { color: C.coral });
    M('{{axis}} inside expression or holdout:', 678, 406, { size: 13, color: C.ink });
    M('PULSE_SWEEP_EXPR_SPLICE, before expansion', 678, 432, { size: 13, color: C.coral, weight: 600 });
    M('sweep a param instead:', 678, 474, { size: 13, color: C.ink });
    M('"params": { "cut": { "$var": "cut" } }', 678, 500, { size: 13, color: C.teal });
    M('and read params.cut in the expression', 678, 526, { size: 13, color: C.teal });
  });
}

/* ---------- 6. rank a sweep ---------- */
function sRank(t) {
  CAP('A DECAY SEARCH · ONE SLOT PER TV DECAY', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 270, C.teal);
    const L = [['"axes": [{ "name": "tv", "values": [0, 0.2, 0.4, 0.6, 0.8] }]', C.amber], ['WIN_DISTRIBUTED_LAG tv → tv_ad', C.teal], ['  geometric · max_lag 8 · "decay": { "$var": "tv" }', C.teal],
      ['WIN_DISTRIBUTED_LAG search → search_ad · decay 0.2', C.muted], ['REG_OLS "sales" ~ tv_ad + search_ad + north', C.violet], ['  "holdout": "week >= 92"', C.violet], ['"return": { "exclude": ["data"] }', C.muted]];
    L.forEach(([s, c], i) => M(s, 80, 182 + i * 30, { size: 12.5, color: c }));
    M('"rank": { "by": "regressions.sales.holdout.rmse" }', 80, 398, { size: 13, color: C.violet, weight: 600 });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(656, 146, 560, 270, C.violet);
    CAP('holdout.rmse · lower is better (order asc)', 678, 174, { color: C.violet });
    const x0 = 760, sc = 13;
    DECAY.forEach(([d, v], i) => A(seg(t, 3.0 + i * 0.15, 3.3 + i * 0.15), () => {
      const y = 196 + i * 42, best = d === 0.6;
      M('tv=' + d, 678, y + 18, { size: 13, color: best ? C.violet : C.ink, weight: best ? 600 : 400 });
      R(x0, y + 4, v * sc, 20, { fill: best ? C.violet : C.panel2, stroke: best ? C.violet : C.rule, r: 3 });
      M(f2(v), x0 + v * sc + 8, y + 19, { size: 12.5, color: best ? C.violet : C.muted });
    }));
  });
  A(seg(t, 5.4, 5.8), () => {
    card(64, 434, 1152, 132, C.violet);
    CAP('ComposedResponse.ranking[0]', 86, 462, { color: C.violet });
    M('{ "label": "tv=0.6", "value": 13.3133, "rank": 1, "slot": 3, "axes": { "tv": 0.6 } }', 86, 498, { size: 15, color: C.ink });
    M('the generator\'s TV decay was 0.6 · read the winner from axes, a typed number, never from its label', 86, 534, { size: 12.5, color: C.muted });
  });
}

/* ---------- 7. rank rules ---------- */
function sRankRules(t) {
  CAP('"rank": { "by", "order", "top" }', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 250, C.violet);
    M('by: a dot path into each slot\'s response', 86, 182, { size: 13.5, color: C.ink });
    M('regressions . sales . holdout . rmse', 86, 214, { size: 14, color: C.violet });
    M('a list step picks the element whose name or label', 86, 248, { size: 12.5, color: C.muted });
    M('matches, never an index · it ends on a number', 86, 270, { size: 12.5, color: C.muted });
    M('order asc (default) or desc · top keeps the first N', 86, 306, { size: 12.5, color: C.ink });
    M('ranks sweep slots only, never explicit ones', 86, 332, { size: 12.5, color: C.ink });
    M('slot: the 0-based sweep index · axes: typed values', 86, 366, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 250, C.coral);
    CAP('by "regressions.sales.holdout.rsme"', 678, 174, { color: C.muted });
    M('PULSE_SWEEP_RANK_PATH', 678, 212, { size: 15, color: C.coral, weight: 600 });
    M('reason missing · segment "rsme"', 678, 242, { size: 13, color: C.ink });
    M('names nothing in any sweep slot\'s response', 678, 268, { size: 13, color: C.ink });
    M('the batch is refused', 678, 302, { size: 13, color: C.coral });
    M('also: syntax · not_number · ambiguous', 678, 340, { size: 12.5, color: C.muted });
    M('a path missing in one slot only: that slot is', 678, 366, { size: 12.5, color: C.muted });
    M('left out, with a warning on its response', 678, 386, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 414, 1152, 152);
    CAP('RANKING SITS OUTSIDE THE RETURN', 86, 442);
    M('always emitted, never rounded · a ranked slot computes the ranked part even if its return drops it', 86, 476, { size: 13, color: C.ink });
    M('the slots ran with "return": { "exclude": ["data"] }: no rows on the wire, the ranking still there', 86, 504, { size: 12.5, color: C.muted });
    M('--stream ends with one {"ranking": [...]} line', 86, 532, { size: 12.5, color: C.muted });
  });
}

/* ---------- 8. sampling ---------- */
function scatter(x0, y0, sz, pts, top, t, at, col, strata) {
  const X = v => x0 + v / 0.95 * sz, Y = v => y0 + sz - v / 0.95 * sz;
  R(x0, y0, sz, sz, { fill: C.panel, stroke: C.rule, r: 2 });
  M('tv decay →', x0 + sz, y0 + sz + 20, { size: 11, color: C.faint, align: 'right' }); M('search ↑', x0 - 10, y0 + sz / 2, { size: 11, color: C.faint, align: 'right' });
  M('0', x0, y0 + sz + 20, { size: 11, color: C.faint }); M('0.95', x0 - 10, y0 + 10, { size: 11, color: C.faint, align: 'right' });
  if (strata) A(seg(t, strata, strata + 0.5), () => { for (let k = 0; k <= 40; k++) { const s = x0 + k / 40 * sz; Ln([[s, y0 + sz], [s, y0 + sz + 6]], { stroke: C.faint, lw: 1 }); Ln([[x0 - 6, y0 + sz - k / 40 * sz], [x0, y0 + sz - k / 40 * sz]], { stroke: C.faint, lw: 1 }); } });
  pts.forEach((p, i) => A(seg(t, at + i * 0.03, at + 0.2 + i * 0.03), () => {
    const best = top.includes(i);
    dot(X(p[0]), Y(p[1]), best ? 5.5 : 4, best ? C.violet : col);
    if (strata && seg(t, strata, strata + 0.5) > 0) { A(0.35, () => { Ln([[X(p[0]), Y(p[1])], [X(p[0]), y0 + sz]], { stroke: col, lw: 1, dash: [2, 3] }); }); }
  }));
}
function sSample(t) {
  CAP('"mode": "random" | "lhs" · "samples": 40 · AXES TAKE A "range"', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 64);
    M('{ "name": "tv", "range": { "min": 0, "max": 0.95 } } · { "name": "search", "range": { "min": 0, "max": 0.95 } } · scale linear or log', 86, 184, { size: 12.5, color: C.amber });
  });
  A(seg(t, 2.4, 2.8), () => { M('random · every draw independent', 150, 248, { size: 13, color: C.ink, weight: 600 }); scatter(150, 262, 270, RND, [8, 23, 36, 17, 4], t, 2.5, C.muted, 0); });
  A(seg(t, 4.4, 4.8), () => { M('lhs · Latin hypercube', 560, 248, { size: 13, color: C.ink, weight: 600 }); scatter(560, 262, 270, LHS, TOP.map(r => r[0]), t, 4.5, C.teal, 6.4); });
  A(seg(t, 6.4, 6.8), () => {
    card(900, 262, 316, 270, C.teal);
    CAP('40 STRATA PER AXIS', 920, 290, { color: C.teal });
    M('lhs: every stratum drawn once', 920, 322, { size: 12.5, color: C.ink });
    M('tv 40 of 40 · search 40 of 40', 920, 346, { size: 13, color: C.teal, weight: 600 });
    M('random: tv 25 of 40 · search 29', 920, 380, { size: 12.5, color: C.muted });
    M('violet: the five best holdout rmse', 920, 424, { size: 12, color: C.violet });
    M('cost: samples, whatever the axes', 920, 458, { size: 12, color: C.muted });
    M('a 30-value grid on 4 axes:', 920, 488, { size: 12, color: C.muted }); M('810,000 slots', 920, 510, { size: 12, color: C.coral });
  });
}

/* ---------- 9. the seed ---------- */
function topTable(x, y, rows, t, at, head) {
  CAP(head, x, y, { color: C.violet });
  ['rank', 'slot', 'tv', 'search', 'rmse'].forEach((h, j) => M(h, x + [0, 60, 150, 240, 330][j] + (j ? 40 : 0), y + 28, { size: 11.5, color: C.muted, align: j ? 'right' : 'left' }));
  rows.forEach((r, i) => A(seg(t, at + i * 0.12, at + 0.3 + i * 0.12), () => {
    const yy = y + 56 + i * 26; M(String(i + 1), x, yy, { size: 13, color: C.ink });
    [String(r[0]), f3(r[1]), f3(r[2]), f2(r[3])].forEach((v, j) => M(v, x + [60, 150, 240, 330][j] + 40, yy, { size: 13, color: j === 1 ? C.violet : j === 2 ? C.muted : C.ink, align: 'right', weight: j === 1 ? 600 : 400 }));
  }));
}
function sSeed(t) {
  CAP('"sweep_seed" · THE DRAWS ARE A PURE FUNCTION OF THE SPEC AND THE SEED', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 92, C.amber);
    M('no rng_seed: derived from the spec alone, never from the data or the clock', 86, 180, { size: 13.5, color: C.ink });
    M('"sweep_seed": 4503367277782454912', 86, 214, { size: 15, color: C.amber, weight: 600 });
    M('echoed on the response', 500, 214, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.4, 2.8), () => { card(64, 256, 560, 230, C.violet); topTable(86, 284, TOP, t, 2.5, 'LHS · RANKING[0..4]'); });
  A(seg(t, 4.4, 4.8), () => { card(656, 256, 560, 230, C.violet); topTable(678, 284, TOP7, t, 4.5, '"rng_seed": 7 · A FRESH SET'); });
  A(seg(t, 2.4, 2.8), () => M('pin it as "rng_seed": the same 40 draws, the same ranking', 64, 512, { size: 12.5, color: C.teal }));
  A(seg(t, 6.4, 6.8), () => {
    R(64, 524, 1152, 42, { fill: C.panel, stroke: C.rule });
    M('both runs: TV between 0.51 and 0.67 · search anywhere from 0.21 to 0.81 · read the top few, not only the first', 82, 550, { size: 12.5, color: C.ink });
  });
}

/* ---------- 10. for_each ---------- */
function sFan(t) {
  CAP('"for_each" · ONE ITEM, FANNED OUT IN PLACE', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 260, C.teal);
    const L = [['"windows": [{ "for_each": { "mode": "zip",', C.ink], ['    "axes": [{ "name": "d", "values": [30, 60, 90] },', C.amber], ['             { "name": "decay", "values": [0.3, 0.6, 0.9] }] },', C.amber],
      ['  "type": "WIN_DISTRIBUTED_LAG", "field": "tv",', C.teal], ['  "label": "tv_ad{{d}}",', C.teal], ['  "params": { "kernel": "geometric", "max_lag": 8,', C.muted], ['    "decay": { "$var": "decay" } } }]', C.teal]];
    L.forEach(([s, c], i) => M(s, 80, 180 + i * 28, { size: 12.5, color: c }));
    M('a label cannot compute 30 from 0.3: zip a label axis', 80, 388, { size: 12, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 290, C.violet);
    CAP('market north · weeks 1 to 8', 678, 174, { color: C.violet });
    const X = [700, 800, 920, 1040, 1160];
    ['week', 'tv', 'tv_ad30', 'tv_ad60', 'tv_ad90'].forEach((h, j) => M(h, X[j], 202, { size: 12, color: j > 1 ? C.violet : C.muted, align: 'right' }));
    FAN.forEach((r, i) => A(seg(t, 2.8 + i * 0.08, 3.1 + i * 0.08), () => r.forEach((v, j) => M(j ? f2(v) : String(v), X[j], 230 + i * 26, { size: 12.5, color: j === 1 ? (v ? C.teal : C.faint) : C.ink, align: 'right' }))));
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 424, 560, 142, C.amber);
    CAP('PREDICT EXPANDS IT TOO', 86, 452, { color: C.amber });
    M('"for_each": [{ "path": "windows[0]", "mode": "zip",', 86, 484, { size: 12.5, color: C.amber });
    M('  "axes": [d 3, decay 3], "expanded_count": 3 }]', 86, 508, { size: 12.5, color: C.amber });
    M('windows, features and attributes · grid or zip only', 86, 544, { size: 12, color: C.muted });
  });
  A(seg(t, 6.8, 7.2), () => {
    card(656, 452, 560, 114, C.coral);
    M('inside a sweep body: PULSE_FOR_EACH_INVALID, nested_in_sweep', 678, 484, { size: 12.5, color: C.coral });
    M('add the item\'s axes to the sweep instead', 678, 510, { size: 12.5, color: C.ink });
    M('Limits.MaxDerivedColumns counts every expanded item', 678, 540, { size: 12, color: C.muted });
  });
}

/* ---------- 11. a slot fails alone ---------- */
function sFail(t) {
  CAP('"axes": [{ "name": "cut", "values": [79, 92, 105] }] · "holdout": "week >= params.cut"', 64, 124, { color: C.teal });
  CUT.forEach(([lab, n, v], i) => A(seg(t, 0.2 + i * 0.3, 0.6 + i * 0.3), () => {
    const x = 64 + i * 390, failed = v === null; slot(x, 146, 370, 150, lab, { stroke: failed ? C.coral : C.teal, lc: failed ? C.coral : C.ink });
    if (!failed) { M('holdout.n ' + n, x + 14, 210, { size: 13, color: C.muted }); M('rmse ' + f2(v), x + 14, 246, { size: 18, color: C.violet, weight: 600 }); M('rank ' + (i === 1 ? 1 : 2), x + 14, 278, { size: 12.5, color: C.muted }); }
    else A(seg(t, 1.8, 2.2), () => { M('regressions[0].error', x + 14, 204, { size: 12, color: C.muted }); M('PROCESSING_REGRESSION_', x + 14, 230, { size: 13, color: C.coral, weight: 600 });
      M('INSUFFICIENT_DATA', x + 14, 252, { size: 13, color: C.coral, weight: 600 }); M('reason holdout_empty: week 105 is past the data', x + 14, 280, { size: 11.5, color: C.ink }); });
  }));
  A(seg(t, 3.8, 4.2), () => {
    card(64, 314, 1152, 110, C.coral);
    CAP('envelope warnings', 86, 340, { color: C.coral });
    M('PULSE_SLOT_FAILED · slot_kind regressions · label "sales" · request 2', 86, 372, { size: 13.5, color: C.coral, weight: 600 });
    M('PULSE_SWEEP_RANK_PATH · "holdout_from_105" is left out of the ranking · the ranking keeps two slots', 86, 402, { size: 13, color: C.ink });
  });
  A(seg(t, 6.0, 6.4), () => {
    card(64, 440, 560, 126, C.teal);
    M('a fault in the data fails that part alone', 86, 474, { size: 13.5, color: C.teal, weight: 600 });
    M('the slot\'s response survives, and so do the others', 86, 502, { size: 12.5, color: C.ink });
    M('Strict fails the batch with the slot\'s own code', 86, 530, { size: 12.5, color: C.muted });
  });
  A(seg(t, 8.0, 8.4), () => {
    card(656, 440, 560, 126, C.coral);
    M('a fault in the request refuses the batch', 678, 474, { size: 13.5, color: C.coral, weight: 600 });
    M('SERVICE_VALIDATION · unknown field: salse', 678, 502, { size: 12.5, color: C.ink });
    M('details.request 1 names the slot · data null', 678, 530, { size: 12.5, color: C.muted });
  });
}

/* ---------- 12. a banner ---------- */
function sBanner(t) {
  CAP('"banner" · A SURVEY TABLE AS ONE COMPOSE REQUEST', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 110, C.teal);
    M('request: crosstab rows brand · AGG_COUNT · normalize column   sections: all · aware (FILTER_TRUE aware)', 86, 178, { size: 12.5, color: C.ink });
    M('groups: Gender [gender] · Age [age]   total: true   overlays: OVERLAY_PAIRWISE_PROP_Z · scope column · letters', 86, 204, { size: 12.5, color: C.ink });
    chips(['all:Total', 'all:Gender', 'all:Age', 'aware:Total', 'aware:Gender', 'aware:Age'].map(s => [s, C.teal]), 86, 220, 1100, { size: 11.5, h: 24, t, at: 0.8 });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(64, 272, 1152, 294, C.violet);
    CAP('ComposedResponse.banner.sections[0] · "all" · column %', 86, 300, { color: C.violet });
    const X0 = 220, CW = 150;
    BCOL.forEach((c, j) => { const x = X0 + j * CW; M(c, x + 100, 330, { size: 13, color: j ? C.ink : C.muted, align: 'right', weight: 600 });
      M((BLET[j] ? BLET[j] + ' · ' : '') + 'n ' + BN[j], x + 100, 352, { size: 11, color: C.faint, align: 'right' }); });
    [[0, 1], [3, 3]].forEach(([s, n], k) => A(1, () => Ln([[X0 + (s + (k ? 0 : 1)) * CW + 14, 362], [X0 + (s + (k ? 0 : 1) + (k ? n : 2)) * CW + 4, 362]], { stroke: C.rule })));
    BROW.forEach(([b, v, l], i) => A(seg(t, 3.0 + i * 0.25, 3.3 + i * 0.25), () => {
      const y = 396 + i * 44; M(b, 86, y, { size: 14, color: C.ink, weight: 600 });
      v.forEach((p, j) => { const x = X0 + j * CW; M(p + '%', x + 70, y, { size: 15, color: j ? C.ink : C.muted, align: 'right' });
        if (l[j]) A(seg(t, 5.0, 5.4), () => M(l[j], x + 78, y, { size: 13, color: C.violet, weight: 600 })); });
    }));
    A(seg(t, 5.0, 5.4), () => M('a letter: significantly above that column, within its own group · Total is compared to nothing · Gender: no letters here', 86, 548, { size: 11.5, color: C.muted }));
  });
}

/* ---------- 13. recap ---------- */
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('COMPOSE TODAY · BATCH AND SWEEP', 64, 124, { color: C.teal });
    [['THE BATCH', 'requests · label · request_<n> · --parallel · overlays fold'], ['THE SWEEP', 'grid · zip · random · lhs · samples · range · sweep_seed'], ['THE RANKING', 'rank.by · order · top · ranking[].axes · slot'],
     ['FAN-OUT', 'for_each on a window, feature or attribute · banner'], ['FAILURE', 'a slot fails alone · PULSE_SLOT_FAILED · Strict']].forEach(([h, ops], k) => A(seg(t, 0.2 + k * 0.4, 0.6 + k * 0.4), () => {
      const y = 146 + k * 46; M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, k === 4 ? C.coral : k === 2 ? C.violet : C.teal]), 300, y, 916, { size: 12 });
    }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 400, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 428, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 452, { size: 14.5 });
      R(650, 400, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own regressions', 668, 428, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions', 668, 452, { size: 14.5 });
    });
    A(seg(t, 6.4, 6.8), () => { R(64, 484, 1152, 66, { fill: C.panel, stroke: C.violet }); M('next film: fits · fits[].from_sweep binds the winner · sweep_axis() · optimize', 82, 523, { size: 14, color: C.violet }); });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('COMPOSE', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
    M('read the winner from axes, and read the top few', 640, 430, { size: 15, align: 'center' });
    M('next: Compose, fit, bind and optimize', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[1.707, 9.941, 9.515, 8.171, 6.976, 7.467, 8.235, 8.96, 7.659, 8.043, 6.592, 8.768, 7.061, 7.872, 6.123, 7.936, 6.699, 7.893, 6.123, 9.6, 8.661, 6.784, 6.848, 8.576, 4.053, 7.915, 7.424, 7.232, 6.293, 3.477, 8.683, 7.36, 6.528, 6.869, 4.395, 5.867, 3.755, 6.656, 6.165, 6.443, 8.043, 5.355, 6.208, 6.912, 9.493, 5.333, 1.067]/*END*/;
PulseFilm.mount({
  series: 'PULSE · COMPOSE',
  title: 'Pulse Compose: batch and sweep',
  narr: NARR,
  scenes: [
    { name: 'Pulse Compose', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Many requests, as one call.', true]] },
    { name: 'One batch', dur: 7.0, draw: sBatch, caps: [
      [0, 'A ComposedRequest bundles independent requests into one call. Each slot is a complete request, with its own cohort, filters, groups and aggregations.',
        'A composed request bundles independent requests into one call. Each slot is a complete request, with its own cohort, filters, groups and aggregations.'],
      [2.8, 'Our cohort is illustrative: two markets, a hundred and four weeks each of TV spend, search spend and sales. Three slots ask three questions of it.'],
      [4.6, 'responses[i] answers requests[i]. A slot with no label gets request_ and its position: here, request_3.',
        'Response i answers request i. A slot with no label gets request, underscore, and its position: here, request three.']] },
    { name: 'Labels and workers', dur: 7.4, draw: sLabels, caps: [
      [0, 'Labels are how overlays and rankings name slots, so two slots with one label are refused before any slot runs.'],
      [2.6, 'With parallel workers, slots overlap, but the responses still come back in request order, byte for byte the serial run.'],
      [5.0, 'A batch saves round-trips, not decode work: every slot opens its own cohort. When one step reads another\'s rows, that is a chain.']] },
    { name: 'The overlay fold', dur: 8.6, draw: sFold, caps: [
      [0, 'Overlays on the composed request run after every slot has finished. Here, sales by market in 2024 and in 2025.',
        'Overlays on the composed request run after every slot has finished. Here, sales by market in twenty twenty-four and in twenty twenty-five.'],
      [2.4, 'An index and a delta against the 2024 slot: North fell to about 95, South to about 96.',
        'An index and a delta against the twenty twenty-four slot: north fell to about ninety-five, south to about ninety-six.'],
      [4.6, 'The fold reads the finished slots and never changes them. With or without the overlays, both slots\' responses are byte-identical.'],
      [6.6, 'Compared slots must share their shape, so vary the filter or the cohort. The overlays film covers the kinds.']] },
    { name: 'One body, many slots', dur: 9.0, draw: sSweep, caps: [
      [0, 'A sweep is one request body plus axes of values. Double braces splice a value as text; a $var marker keeps its JSON type.',
        'A sweep is one request body plus axes of values. Double braces splice a value as text; a var marker keeps its JSON type.'],
      [2.4, 'Grid mode takes every combination: two markets by two years make four ordinary slots, labelled by the pattern.'],
      [5.0, 'Zip mode walks the axes in lockstep instead: three bands of TV spend make three slots, and average sales climb with spend.']] },
    { name: 'Before anything runs', dur: 7.0, draw: sExpand, caps: [
      [0, 'Predict expands the sweep without running it: the expanded count and the very labels the run will use.'],
      [2.6, 'The slot limit counts the expanded total, so an oversized sweep is refused before anything runs. Each body decodes strictly.'],
      [4.8, 'A placeholder never goes inside an expression. To vary a value an expression reads, sweep a request param.']] },
    { name: 'Rank a sweep', dur: 8.0, draw: sRank, caps: [
      [0, 'Now a real search. Each slot adstocks TV with a different decay and fits a regression, holding out the last thirteen weeks.'],
      [2.8, 'rank orders the sweep slots by one number: here, the held-out error. A decay of 0.6 wins.',
        'Rank orders the sweep slots by one number: here, the held-out error. A decay of point six wins.'],
      [5.4, 'The ranking reports each slot\'s value, rank, index and axes. Our generator used 0.6, and the winner\'s decay comes back as a number in axes.',
        'The ranking reports each slot\'s value, rank, index and axes. Our generator used point six, and the winner\'s decay comes back as a number in axes.']] },
    { name: 'Rank rules', dur: 7.4, draw: sRankRules, caps: [
      [0, 'The path walks object keys, and picks list elements by name or label, never by index. Order is ascending unless you say otherwise.'],
      [2.6, 'A path that names nothing in any slot, here a misspelt rmse, is refused with PULSE_SWEEP_RANK_PATH.',
        'A path that names nothing in any slot, here a misspelt R M S E, is refused with a sweep rank path error.'],
      [5.0, 'The ranking sits outside the return. It is always emitted and never rounded, even when the slots drop their rows.']] },
    { name: 'Sample, don\'t list', dur: 8.6, draw: sSample, caps: [
      [0, 'A grid multiplies with every axis. Random and LHS modes draw a fixed number of samples from each axis\'s range instead.',
        'A grid multiplies with every axis. Random and L H S modes draw a fixed number of samples from each axis\'s range instead.'],
      [2.4, 'Random draws every point independently, so it leaves gaps and clumps.'],
      [4.4, 'LHS, a Latin hypercube, cuts each axis into as many strata as samples, and draws each stratum exactly once.',
        'L H S, a Latin hypercube, cuts each axis into as many strata as samples, and draws each stratum exactly once.'],
      [6.4, 'Here, every one of the forty strata on both axes. Random reached twenty-five on one axis and twenty-nine on the other.']] },
    { name: 'The seed', dur: 8.6, draw: sSeed, caps: [
      [0, 'The draws come from the spec and a seed, never from the data or the clock. The response echoes the seed as sweep_seed.',
        'The draws come from the spec and a seed, never from the data or the clock. The response echoes the seed as sweep seed.'],
      [2.4, 'Pin it as rng_seed and the run replays exactly: the same forty draws, the same ranking.',
        'Pin it as R N G seed and the run replays exactly: the same forty draws, the same ranking.'],
      [4.4, 'Set another seed and you get a fresh set. The winner moves a little.'],
      [6.4, 'Both times, TV\'s decay sits near 0.6, but search\'s wanders: these data barely tell it. Read the top few, not only the first.',
        'Both times, TV\'s decay sits near point six, but search\'s wanders: these data barely tell it. Read the top few, not only the first.']] },
    { name: 'One item, fanned out', dur: 8.6, draw: sFan, caps: [
      [0, 'for_each does the same on one item inside a request. One window item becomes three, one per zipped decay and label.',
        'For each does the same on one item inside a request. One window item becomes three, one per zipped decay and label.'],
      [2.6, 'Each becomes an ordinary column. The higher the decay, the longer last week\'s TV carries into this one.'],
      [5.0, 'Predict expands it exactly as the run does. It works on windows, features and attributes, by grid or zip.'],
      [6.8, 'Inside a sweep body it is refused: put its axes on the sweep instead.']] },
    { name: 'A slot fails alone', dur: 10.0, draw: sFail, caps: [
      [0, 'Sweep the holdout start through a request param. A start at week 105 holds out nothing.',
        'Sweep the holdout start through a request param. A start at week one hundred and five holds out nothing.'],
      [1.8, 'That regression fails on its data, and its result carries the error.'],
      [3.8, 'A PULSE_SLOT_FAILED warning names it, the ranking leaves that slot out with a warning, and the other slots rank as usual.',
        'A slot failed warning names it, the ranking leaves that slot out with a warning, and the other slots rank as usual.'],
      [6.0, 'A fault in the data fails that part alone, and the rest survives. Under Strict, the batch fails instead.'],
      [8.0, 'A fault in the request itself, like a misspelt field, refuses the whole batch, and the error names the slot.']] },
    { name: 'A banner', dur: 7.6, draw: sBanner, caps: [
      [0, 'A banner writes a survey table once. Sections and column groups expand into ordinary crosstab slots, a Total block first.'],
      [2.8, 'The response stitches them side by side. This one comes from a small survey of six hundred.'],
      [5.0, 'Letters mark a column significantly above another in its own group. The Total block is compared to nothing.']] },
    { name: 'The toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s Compose today: batches, the overlay fold, sweeps and their rankings, fan-out, and slots that fail alone.'],
      [3.4, 'More are added over time, and the manifest lists what your instance offers. Embedders can register their own regressions through Options.Extensions.',
        'More are added over time, and the manifest lists what your instance offers. Embedders can register their own regressions through options dot extensions.'],
      [6.4, 'Next, the same cohort goes further: fit once, bind the winner, and optimize the budget.'],
      [9.0, '', 'Pulse Compose.', true]] },
  ],
});
})();
