/* Pulse Overlays: film 16 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts, kinds listed as "today".
 * The cohort is an illustrative 1,282-row subscription table (region, plan, revenue, signup date over 2024–2025),
 * plus a 360-member usage table for the matrix-result host. Every figure on a result card is copied from a
 * recorded alpha.33 run in data/ (see data/README.md); the comment beside each constant names the run.
 * Share of row with a column-axis ref (Pulse #405) is shown as refused, per series policy; its run is never shown. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, ring, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });

const REGIONS = ['East', 'North', 'South'], PLANS = ['Basic', 'Plus', 'Pro'];
const XT = [[108, 83, 133], [249, 150, 107], [162, 199, 91]], RM = [324, 506, 452], CM = [519, 432, 331], GT = 1282;   // A
const SHARE = [[0.333, 0.256, 0.410], [0.492, 0.296, 0.211], [0.358, 0.440, 0.201]];                                    // A row_share
const LIFT = [[82.3, 76.0, 159.0], [121.6, 88.0, 81.9], [88.5, 130.7, 78.0]];                                           // F lift
const MONTHS = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12',
  '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];
const REV = [1754, 2330, 2529, 2167, 2633, 2082, 1949, 2115, 2190, 1994, 2007, 2752, 2658, 3315, 3873, 2603, 3203, 2851, 2842, 2295, 3117, 3008, 2813, 2961];  // B
const MOM = [null, 132.8, 108.5, 85.7, 121.5, 79.1, 93.6, 108.5, 103.6, 91.1, 100.6, 137.1, 96.6, 124.7, 116.9, 67.2, 123.1, 89.0, 99.7, 80.8, 135.8, 96.5, 93.5, 105.3];  // B mom
const BASE = [100, 132.8, 144.1, 123.5, 150.1, 118.7, 111.1, 120.5, 124.8, 113.7, 114.4, 156.8, 151.5, 188.9, 220.8, 148.4, 182.6, 162.5, 162.0, 130.8, 177.6, 171.4, 160.3, 168.8];  // B base
const YOY = [null, null, null, null, null, null, null, null, null, null, null, null, 151.5, 142.2, 153.2, 120.1, 121.7, 136.9, 145.8, 108.5, 142.3, 150.8, 140.1, 107.6];  // B yoy
const ROLL = [null, null, null, -0.1, 1.6, -1.5, -1.2, -0.3, 1.6, -0.7, -0.9, 6.3, 0.9, 2.1, 2.7, -1.1, -0.1, -0.6, -0.1, -3.3, 1.4, 0.6, 0.0, -0.1];  // B roll: default warm-up, count 21
const ROLL2_MAR = 1.1939, ROLL_COUNT = 21, ROLL2_COUNT = 22;                                                            // B2 roll (min_periods 2), count 22
const REG_REV = [18660.82, 22252.35, 21127.50], DSIB = [-3591.53, 0, -1124.85], ISIB = [83.86, 100, 94.95];            // C
const POP = { subset: [282, 234, 201], idx: [97.2, 96.9, 108.6], chi: 1.84, p: 0.399 };                                // D
const Y24 = [[47, 41, 51], [120, 69, 47], [70, 88, 32]], Y25 = [[61, 42, 82], [129, 81, 60], [92, 111, 59]], IREF = [[129.8, 102.4, 160.8], [107.5, 117.4, 127.7], [131.4, 126.1, 184.4]];  // E
/* J: plan × region, column shares, OVERLAY_PAIRWISE_PROP_Z scope column with letters. ABOVE = each cell's significant "above" letters. */
const JSHARE = [[0.333, 0.492, 0.358], [0.256, 0.296, 0.440], [0.410, 0.211, 0.201]];
const JLET = ['A', 'B', 'C'], JABOVE = [[[], ['A', 'C'], []], [[], [], ['A', 'B']], [['B', 'C'], [], []]];
const JPAIRS = ['East–North', 'East–South', 'North–South'], JP = [[6.58e-6, 0.4696, 3.00e-5], [0.2078, 1.46e-7, 3.88e-6], [6.83e-10, 2.28e-10, 0.6990]];
/* K: revenue by region, then year; OVERLAY_INDEX_VS_PRIOR runs once per region. */
const KREV = [[7796.5, 10864.32], [10102.51, 12149.84], [8603.6, 12523.9]], KIDX = [139.35, 120.27, 145.57];
/* L: u.pulse, MAT_CORRELATION of sessions, minutes, tickets per region; OVERLAY_MATRIX_GROUP_SUMMARY over them. */
const UVARS = ['sessions', 'minutes', 'tickets'];
const LCOR = [[[1, 0.84, -0.46], [0.84, 1, -0.35], [-0.46, -0.35, 1]], [[1, 0.87, -0.65], [0.87, 1, -0.63], [-0.65, -0.63, 1]], [[1, 0.84, -0.62], [0.84, 1, -0.52], [-0.62, -0.52, 1]]];
const LMEAN = [[1, 0.85, -0.58], [0.85, 1, -0.50], [-0.58, -0.50, 1]], LRANGE = [[0, 0.04, 0.19], [0.04, 0, 0.28], [0.19, 0.28, 0]];

const pfmt = p => p < 0.0001 ? '<.0001' : p.toFixed(p < 0.01 ? 4 : 2);
const f2 = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

/* a small grid of figures; tint by |v − centre| / span */
function grid(x, y, cw, ch, rows, cols, V, o = {}) {
  const t = o.t ?? 99, at = o.at ?? -9;
  A(seg(t, at, at + 0.3), () => {
    cols.forEach((k, j) => M(k, x + j * cw + cw / 2, y - 10, { size: 12, align: 'center', color: C.muted }));
    rows.forEach((k, i) => M(k, x - 10, y + i * ch + ch / 2 + 5, { size: 12.5, align: 'right', color: C.teal }));
  });
  rows.forEach((_, i) => cols.forEach((__, j) => A(seg(t, at + 0.1 + (i + j) * 0.06, at + 0.4 + (i + j) * 0.06), () => {
    const v = V[i][j], c = o.centre ?? 0, a = Math.min(1, Math.abs(v - c) / (o.span ?? 1));
    R(x + j * cw + 2, y + i * ch + 2, cw - 4, ch - 4, { fill: C.panel, stroke: o.stroke || C.rule, r: 4 });
    if (o.tint !== false) A(a * 0.7, () => R(x + j * cw + 2, y + i * ch + 2, cw - 4, ch - 4, { fill: v >= c ? (o.up || C.violet) : (o.down || C.amber), r: 4 }));
    T(o.fmt ? o.fmt(v) : String(v), x + j * cw + cw / 2, y + i * ch + ch / 2 + 7, { size: o.fs ?? 18, weight: 700, align: 'center' });
  })));
}

/* ---------- 0. title: the kit intro already shows the name; this is the layer motif and the tagline ---------- */
function sTitle(t) {
  A(seg(t, 0.0, 0.5), () => { [0, 1, 2].forEach(i => R(470 + i * 120, 230, 100, 110, { fill: C.panel, stroke: C.rule })); });
  A(seg(t, 0.4, 1.1), () => { [0, 1, 2].forEach(i => R(470 + i * 120 + 10, 230 - 10 * eo(seg(t, 0.4, 1.1)) - 6, 100, 110, { fill: 'rgba(168,147,240,0.15)', stroke: C.violet, dash: [5, 4] })); });
  A(seg(t, 1.0, 1.6), () => T('Read a finished result against something', 640, 430, { size: 24, align: 'center', color: C.muted }));
}

/* ---------- 1. where they run ---------- */
function sWhere(t) {
  const SP = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
  SP.forEach((n, i) => A(seg(t, 0.1 + i * 0.06, 0.4 + i * 0.06) * 0.6, () => {
    const x = 64 + i * 164; R(x, 110, 150, 46, { fill: C.panel, stroke: C.rule }); T(n, x + 14, 139, { size: 15, weight: 600, color: C.muted });
    if (i < 6) arrow(x + 150, 133, x + 162, 133, { stroke: C.faint, head: 6 });
  }));
  A(seg(t, 0.8, 1.2), () => {
    R(64, 176, 1152, 52, { fill: C.tealS, stroke: C.teal }); M('the finished result: Response.Data, Response.Crosstab or a grouped matrix result', 84, 208, { size: 14, color: C.ink });
    arrow(640, 158, 640, 172, { stroke: C.teal });
  });
  A(seg(t, 2.0, 2.4), () => {
    R(64, 248, 1152, 52, { fill: C.violetS, stroke: C.violet, dash: [6, 4] }); M('"overlays": one layer per spec, in order → Response.Overlays[i]', 84, 280, { size: 14, color: C.ink });
    arrow(640, 230, 640, 244, { stroke: C.violet });
  });
  A(seg(t, 3.8, 4.2), () => {
    card(64, 330, 560, 236, C.violet);
    CAP('READ-ONLY SIBLINGS', 86, 358, { color: C.violet });
    M('a layer never changes the base figures', 86, 394, { size: 14, color: C.ink });
    M('it is keyed to the host\'s coordinates:', 86, 422, { size: 13, color: C.muted });
    M('the same rows, columns or groups', 86, 444, { size: 13, color: C.muted });
    M('our crosstab, run with and without four overlays:', 86, 494, { size: 12.5, color: C.muted });
    M('crosstab and components byte-identical', 86, 520, { size: 13.5, color: C.teal, weight: 600 });
  });
  A(seg(t, 5.8, 6.2), () => {
    card(656, 330, 560, 236);
    CAP('USE ONE FOR A DERIVED FIGURE', 678, 358);
    ['a share', 'an index against a reference', 'a change over time', 'a z-score', 'a test between cells'].forEach((s, i) => M(s, 678, 392 + i * 28, { size: 14, color: C.ink }));
    M('base figures stay aggregations', 678, 544, { size: 12.5, color: C.muted });
  });
}

/* ---------- 2. anatomy of a spec ---------- */
function sSpec(t) {
  CAP('ONE SPEC', 64, 124, { color: C.violet });
  const L = [['{ "name": "mom",', C.ink, 'how later layers and formulas refer to it'], ['  "kind": "OVERLAY_INDEX_VS_PRIOR",', C.violet, 'what to compute'], ['  "scope": "group",', C.amber, 'cell · row · column · group · matrix · total'], ['  "ref": { "prior": {} } }', C.teal, 'what to compare against']];
  L.forEach(([s, c, d], i) => A(seg(t, 0.3 + i * 0.6, 0.6 + i * 0.6), () => { M(s, 64, 166 + i * 34, { size: 15, color: c }); M(d, 1216, 166 + i * 34, { size: 12.5, color: C.muted, align: 'right' }); }));
  A(seg(t, 3.0, 3.4), () => {
    card(64, 310, 560, 256, C.teal);
    CAP('REFERENCE FAMILIES', 86, 338, { color: C.teal });
    [['margin', 'a row, column or grand margin'], ['sibling', 'another group'], ['prior · baseline_index · rolling_mean · yoy', 'earlier in the series'], ['population', 'another cohort'], ['stage', 'an earlier chain stage'], ['reference + targets', 'another Compose slot'], ['matrix', 'a matrix spec, every group bucket']]
      .forEach(([a, b], i) => { M(a, 86, 370 + i * 28, { size: 12.5, color: a === 'matrix' ? C.violet : C.ink }); M(b, 604, 370 + i * 28, { size: 12, color: C.muted, align: 'right' }); });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(656, 310, 560, 256, C.violet);
    CAP('THREE PAYLOAD SHAPES', 678, 338, { color: C.violet });
    [['scalar', 'one figure: a whole-table χ²'], ['series', 'one entry per group key'], ['matrix', 'one cell per host cell']].forEach(([a, b], i) => { M(a, 678, 372 + i * 30, { size: 14, color: C.violet, weight: 600 }); M(b, 800, 372 + i * 30, { size: 13, color: C.ink }); });
    M('payload.parts: named payloads beside the primary', 678, 470, { size: 12.5, color: C.violet });
    M('summary.baseline: 100 index · 0 delta or z · 1 share', 678, 500, { size: 12.5, color: C.amber });
    M('absent on inferential kinds; an undefined figure is null', 678, 530, { size: 12.5, color: C.muted });
  });
}

/* ---------- 3. hosts ---------- */
function sHosts(t) {
  CAP('THE REQUEST DECIDES THE HOST · THE HOST DECIDES THE KINDS', 64, 124, { color: C.violet });
  const H = [['MATRIX', 'a crosstab', 'shares, margins, cell tests, pairwise, flows'], ['SERIES', 'a grouped process', 'prior, baseline, rolling, year over year, sibling'],
    ['MATRIX RESULT', 'grouped Request.Matrices', 'every group bucket of the matrix that ref.matrix names'], ['FACET', 'FacetRequest.Overlays', 'against a population cohort'],
    ['CHAIN', 'ChainRequest.Overlays', 'against an earlier stage'], ['COMPOSE', 'the composed request', 'one slot against another, after every slot runs'], ['FORMULA', 'any of them', 'an expression over the host\'s figures']];
  H.forEach(([a, b, c], i) => A(seg(t, 0.3 + i * 0.45, 0.6 + i * 0.45), () => {
    const y = 146 + i * 48; R(64, y, 1152, 40, { fill: C.panel, stroke: a === 'MATRIX RESULT' ? C.violet : C.rule });
    M(a, 84, y + 26, { size: 14, color: C.violet, weight: 600 }); M(b, 260, y + 26, { size: 13.5, color: C.ink }); M(c, 1196, y + 26, { size: 12.5, color: C.muted, align: 'right' });
  }));
  A(seg(t, 4.0, 4.4), () => {
    card(64, 496, 1152, 70, C.coral);
    M('OVERLAY_INDEX_VS_PRIOR on a crosstab with columns → PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE', 86, 524, { size: 13.5, color: C.coral });
    M('predict refuses it before any row is read, in errors[0].code · the runtime refuses it with the same code', 86, 550, { size: 12.5, color: C.ink });
  });
}

/* ---------- 4. matrix host ---------- */
function sMatrix(t) {
  CAP('MATRIX HOST · region × plan, subscriber counts', 64, 124, { color: C.violet });
  grid(160, 180, 110, 64, REGIONS, PLANS, XT, { t, at: 0.3, tint: false, fs: 20 });
  A(seg(t, 0.3, 0.7), () => RM.forEach((v, i) => M(String(v), 160 + 3 * 110 + 14, 180 + i * 64 + 38, { size: 13, color: C.muted })));
  A(seg(t, 0.3, 0.7), () => M('row margins', 160 + 3 * 110 + 14, 146, { size: 11.5, color: C.faint }));
  A(seg(t, 2.4, 2.8), () => {
    M('"OVERLAY_SHARE_OF_ROW" · ref margin row', 640, 146, { size: 12.5, color: C.violet });
    grid(700, 180, 110, 64, REGIONS, PLANS, SHARE, { t, at: 2.4, fmt: v => Math.round(v * 100) + '%', centre: 0.333, span: 0.2, fs: 18 });
  });
  A(seg(t, 3.0, 3.4), () => M('each row sums to 100% · North leans Basic, East leans Pro', 1216, 394, { size: 12.5, color: C.amber, align: 'right' }));
  A(seg(t, 3.8, 4.2), () => M('share of row reads the row margin: a column-axis ref is refused, PULSE_OVERLAY_REF_INCOMPATIBLE_WITH_SHAPE · column shares: OVERLAY_SHARE_OF_COL', 64, 424, { size: 12, color: C.coral }));
  A(seg(t, 5.0, 5.4), () => {
    card(64, 440, 1152, 126, C.violet);
    M('"OVERLAY_CHISQ_MATRIX" · scope matrix · a scalar layer', 86, 468, { size: 13.5, color: C.violet, weight: 600 });
    M('χ² 78.1 · df 4 · p below 0.0001: plan mix depends on region', 86, 496, { size: 14, color: C.ink });
    M('the same figure as the χ² test on this table · an expected count under 5 adds PULSE_OVERLAY_EXPECTED_LOW', 86, 522, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.6, 7.0), () => M('also here: margin index, delta, z · Fisher · pairwise · adjusted residuals · correspondence · rake · Markov, retention, symmetry', 86, 548, { size: 12, color: C.muted }));
}

/* ---------- 5. pairwise letters ---------- */
function sPairwise(t) {
  CAP('OVERLAY_PAIRWISE_PROP_Z · scope column · "letters": {} · plan × region, column shares', 64, 124, { color: C.violet });
  const x0 = 170, y0 = 190, cw = 120, ch = 70;
  A(seg(t, 0.3, 0.7), () => {
    REGIONS.forEach((r, j) => { M(r, x0 + j * cw + cw / 2 - 8, y0 - 14, { size: 12.5, align: 'center', color: C.muted }); A(seg(t, 2.2, 2.6), () => M(JLET[j], x0 + j * cw + cw / 2 + 26, y0 - 14, { size: 13, align: 'center', color: C.amber, weight: 600 })); });
    PLANS.forEach((p, i) => M(p, x0 - 12, y0 + i * ch + ch / 2 + 5, { size: 13, align: 'right', color: C.teal }));
  });
  PLANS.forEach((_, i) => REGIONS.forEach((__, j) => A(seg(t, 0.4 + (i + j) * 0.06, 0.7 + (i + j) * 0.06), () => {
    const x = x0 + j * cw, y = y0 + i * ch, ab = JABOVE[i][j];
    R(x + 3, y + 3, cw - 6, ch - 6, { fill: C.panel, stroke: ab.length ? C.violet : C.rule, r: 4 });
    T(Math.round(JSHARE[i][j] * 100) + '%', x + cw / 2, y + ch / 2 + 7, { size: 19, weight: 700, align: 'center' });
    if (ab.length) A(seg(t, 2.6, 3.0), () => M(ab.join(''), x + cw - 12, y + 22, { size: 13, color: C.amber, weight: 600, align: 'right' }));
  })));
  A(seg(t, 1.0, 1.4), () => {
    card(600, 150, 616, 168, C.violet);
    M('primary · raw two-sided p per pair of regions, per plan', 622, 178, { size: 12.5, color: C.violet });
    JPAIRS.forEach((p, j) => M(p, 830 + j * 128, 206, { size: 11.5, color: C.muted, align: 'center' }));
    PLANS.forEach((p, i) => { M(p, 622, 234 + i * 26, { size: 12.5, color: C.teal }); JP[i].forEach((v, j) => M(pfmt(v), 830 + j * 128, 234 + i * 26, { size: 12.5, align: 'center', color: v < 0.05 ? C.ink : C.faint })); });
  });
  A(seg(t, 2.2, 2.6), () => {
    card(600, 334, 616, 136, C.amber);
    M('payload.parts.letters · one cell per host cell', 622, 362, { size: 12.5, color: C.amber });
    M('{ letter, group, higher, above }', 622, 388, { size: 13, color: C.ink });
    M('higher: the letters it beats · above: those significant at p < 0.05', 622, 414, { size: 12.5, color: C.muted });
    M('"alpha" sets the level; under multiplicity it reads the adjusted p', 622, 440, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(64, 490, 1152, 76);
    M('North Basic 49% beats A and C · South Plus 44% beats A and B · East Pro 41% beats B and C', 86, 520, { size: 13.5, color: C.ink });
    M('the primary stays raw p-values · minimum n is still yours to check', 86, 546, { size: 12.5, color: C.muted });
  });
}

/* ---------- 6. formula ---------- */
function sFormula(t) {
  CAP('OVERLAY_FORMULA · your own derived figure', 64, 124, { color: C.violet });
  A(seg(t, 0.3, 0.7), () => {
    card(64, 150, 1152, 60, C.violet);
    M('"formula": "(cell / margin_row) / (margin_col / margin_grand) * 100"', 86, 186, { size: 15, color: C.ink });
  });
  A(seg(t, 1.2, 1.6), () => M('lift: a plan\'s share in a region against its share overall, 100 = no lift', 64, 246, { size: 13, color: C.muted }));
  grid(160, 290, 110, 64, REGIONS, PLANS, LIFT, { t, at: 1.6, centre: 100, span: 60, fmt: v => v.toFixed(0), up: C.violet, down: C.amber });
  A(seg(t, 3.0, 3.4), () => M('East Pro 159: East buys Pro at 1.6× the overall rate', 160, 500, { size: 13, color: C.violet }));
  A(seg(t, 3.8, 4.2), () => {
    card(640, 270, 576, 230);
    CAP('VARIABLES, FIXED PER SHAPE', 662, 298);
    M('matrix: cell · margin_row|col|grand · sd_row|col|grand', 662, 332, { size: 12.5, color: C.ink });
    M('series: value · total · prior (+ baseline)', 662, 358, { size: 12.5, color: C.ink });
    M('scalar: value · Compose adds ref_cell, ref_value, ref', 662, 384, { size: 12.5, color: C.ink });
    M('an unknown name → PULSE_OVERLAY_FORMULA_INVALID_IDENT,', 662, 424, { size: 12.5, color: C.coral });
    M('caught by predict before any row is read', 662, 446, { size: 12.5, color: C.coral });
    M('embedders\' expression functions work here too', 662, 478, { size: 12.5, color: C.amber });
  });
}

/* ---------- 7. series host ---------- */
function sSeries(t) {
  CAP('SERIES HOST · monthly revenue, GROUP_DATE by month', 64, 124, { color: C.violet });
  const X = i => 92 + i * 46, Y = v => 420 - v / 4000 * 230;
  REV.forEach((v, i) => A(seg(t, 0.2 + i * 0.03, 0.5 + i * 0.03), () => { R(X(i) - 15, Y(v), 30, 420 - Y(v), { fill: C.panel2, stroke: C.faint, r: 2 }); }));
  [0, 12, 23].forEach(i => M(MONTHS[i], X(i), 440, { size: 11, align: 'center', color: C.muted }));
  const lines = [[1.4, 'OVERLAY_INDEX_VS_PRIOR · month on month', MOM, C.teal], [3.0, 'OVERLAY_INDEX_VS_BASELINE · position 0: Jan 2024 = 100', BASE, C.violet], [4.6, 'OVERLAY_YOY · frequency monthly', YOY, C.amber]];
  const IY = v => 420 - (v - 40) / 200 * 230;
  lines.forEach(([at, lab, S, col], k) => A(seg(t, at, at + 0.4) * (k === 0 ? 1 - seg(t, 2.8, 3.0) * 0.75 : k === 1 ? 1 - seg(t, 4.4, 4.6) * 0.75 : 1), () => {
    const pts = []; S.forEach((v, i) => { if (v !== null) pts.push([X(i), IY(v)]); });
    Ln(pts, { stroke: col, lw: 2.5 }); pts.forEach(([x, y]) => dot(x, y, 3, col));
    M(lab, 1216, 150 + k * 22, { size: 12, color: col, align: 'right' });
  }));
  A(seg(t, 1.4, 1.8), () => { Ln([[70, IY(100)], [1170, IY(100)]], { stroke: C.faint, dash: [4, 4] }); M('100', 1176, IY(100) + 4, { size: 11, color: C.faint }); });
  A(seg(t, 3.4, 3.8), () => M('Mar 2025: 221', X(14) + 10, IY(220.8) - 4, { size: 12, color: C.violet }));
  A(seg(t, 5.0, 5.4), () => {
    card(64, 470, 1152, 96);
    M('2025 runs 108 to 153 against the same month a year before; 2024 has no prior year, so its entries are null with no warning', 86, 502, { size: 13, color: C.ink });
    M('a zero prior → null plus one PULSE_OVERLAY_REF_ZERO · "no comparison available" is not "denominator zero"', 86, 532, { size: 12.5, color: C.muted });
  });
}

/* ---------- 8. series per partition ---------- */
function sPartition(t) {
  CAP('SERIES HOST, PARTITIONED · revenue by region, then year', 64, 124, { color: C.violet });
  const X = v => 200 + v / 14000 * 440;
  REGIONS.forEach((r, i) => A(seg(t, 0.3 + i * 0.2, 0.7 + i * 0.2), () => {
    const y = 160 + i * 96;
    M(r, 184, y + 40, { size: 14, color: C.teal, align: 'right' });
    KREV[i].forEach((v, k) => {
      const w = (X(v) - 200) * eo(seg(t, 0.3 + i * 0.2, 1.0 + i * 0.2));
      R(200, y + k * 36, w, 30, { fill: k ? C.panel2 : C.panel, stroke: k ? C.teal : C.faint, r: 3 });
      M((k ? '2025 ' : '2024 ') + Math.round(v).toLocaleString('en-US'), 200 + w + 10, y + k * 36 + 20, { size: 12.5, color: k ? C.ink : C.muted });
    });
    A(seg(t, 1.8 + i * 0.15, 2.2 + i * 0.15), () => {
      M('2024 null', 800, y + 20, { size: 12.5, color: C.coral });
      T(KIDX[i].toFixed(1), 800, y + 58, { size: 22, weight: 700, color: C.violet });
    });
  }));
  A(seg(t, 1.8, 2.2), () => M('OVERLAY_INDEX_VS_PRIOR', 800, 146, { size: 12.5, color: C.violet }));
  A(seg(t, 2.6, 3.0), () => {
    card(940, 150, 276, 264, C.violet);
    M('the series runs down the', 960, 182, { size: 12.5, color: C.ink });
    M('last grouper, once per', 960, 204, { size: 12.5, color: C.ink });
    M('region: it never crosses', 960, 226, { size: 12.5, color: C.ink });
    M('into the next one', 960, 248, { size: 12.5, color: C.ink });
    M('params.partition_by:', 960, 290, { size: 12.5, color: C.amber });
    M('the leading keys to split by', 960, 312, { size: 12.5, color: C.muted });
    M('params.field: which', 960, 352, { size: 12.5, color: C.amber });
    M('aggregation it scores', 960, 374, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.0, 4.4), () => {
    card(64, 470, 1152, 96);
    M('is a change significant? OVERLAY_T_VS_PRIOR · OVERLAY_Z_VS_PRIOR · OVERLAY_PROP_Z_VS_PRIOR', 86, 502, { size: 13, color: C.ink });
    M('test each period against the present period before it, on means or proportions: a series host, or a crosstab with no columns', 86, 532, { size: 12.5, color: C.muted });
  });
}

/* ---------- 9. rolling z ---------- */
function sRolling(t) {
  CAP('OVERLAY_ZSCORE_VS_ROLLING · "window": 3 · is this month unusual?', 64, 124, { color: C.violet });
  M('z = (point − mean of the 3 before) / their sample SD', 64, 150, { size: 12.5, color: C.muted });
  const X = i => 92 + i * 46, Y = v => 330 - v * 22;
  Ln([[70, Y(0)], [1180, Y(0)]], { stroke: C.rule });
  [-2, 2].forEach(v => A(seg(t, 0.4, 0.8), () => { Ln([[70, Y(v)], [1180, Y(v)]], { stroke: C.faint, dash: [3, 5] }); M((v > 0 ? '+' : '') + v, 1186, Y(v) + 4, { size: 11, color: C.faint }); }));
  ROLL.forEach((v, i) => A(seg(t, 0.3 + i * 0.04, 0.6 + i * 0.04), () => {
    if (v === null) { if (!(i === 2 && t > 4.6)) M('null', X(i), Y(0) + 4, { size: 10, color: C.coral, align: 'center' }); return; }
    const big = Math.abs(v) > 2; R(X(i) - 14, Math.min(Y(0), Y(v)), 28, Math.abs(Y(v) - Y(0)) || 1, { fill: big ? C.coral : C.violet, r: 2 });
  }));
  A(seg(t, 4.6, 5.0), () => {
    R(X(2) - 14, Y(ROLL2_MAR), 28, Y(0) - Y(ROLL2_MAR), { stroke: C.amber, dash: [4, 3], r: 2 });
    M('1.19', X(2), Y(ROLL2_MAR) - 8, { size: 12, color: C.amber, align: 'center', weight: 600 });
  });
  [0, 12, 23].forEach(i => M(MONTHS[i], X(i), 470, { size: 11, align: 'center', color: C.muted }));
  A(seg(t, 1.8, 2.2), () => { M('Dec 2024: z 6.3', X(11) + 18, Y(6.3) + 8, { size: 13, color: C.coral, weight: 600 }); M('Aug 2025: −3.3', X(19) + 18, Y(-3.3) + 4, { size: 12.5, color: C.coral }); });
  A(seg(t, 3.2, 3.6), () => {
    card(64, 490, 368, 76);
    M('default warm-up: a full window', 84, 520, { size: 13, color: C.ink });
    M('first 3 months null, no warning · count ' + ROLL_COUNT, 84, 546, { size: 12, color: C.muted });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(456, 490, 368, 76, C.amber);
    M('"min_periods": 2', 476, 520, { size: 13, color: C.amber });
    M('2024-03 answers ' + ROLL2_MAR.toFixed(2) + ' · count ' + ROLL2_COUNT, 476, 546, { size: 12, color: C.ink });
  });
  A(seg(t, 6.0, 6.4), () => {
    card(848, 490, 368, 76, C.coral);
    M('no "window": PULSE_OVERLAY_PARAM_MISSING', 866, 520, { size: 11, color: C.coral });
    M('min_periods 1: PULSE_OVERLAY_LEVEL_OUT_OF_RANGE', 866, 546, { size: 11, color: C.coral });
  });
}

/* ---------- 10. siblings ---------- */
function sSibling(t) {
  CAP('AGAINST A SIBLING · revenue by region against North', 64, 124, { color: C.violet });
  const X = v => 200 + v / 25000 * 520;
  REGIONS.forEach((r, i) => A(seg(t, 0.3 + i * 0.2, 0.7 + i * 0.2), () => {
    const y = 170 + i * 70, w = X(REG_REV[i]) - 200;
    M(r, 184, y + 26, { size: 14, color: C.teal, align: 'right' });
    R(200, y, w * eo(seg(t, 0.3 + i * 0.2, 1.0 + i * 0.2)), 40, { fill: r === 'North' ? C.violet : C.panel2, stroke: r === 'North' ? null : C.faint, r: 3 });
    M(REG_REV[i].toLocaleString('en-US', { maximumFractionDigits: 0 }), 200 + w + 10, y + 26, { size: 13 });
  }));
  A(seg(t, 1.8, 2.2), () => {
    card(840, 150, 376, 210, C.violet);
    M('DELTA_VS_SIBLING · INDEX_VS_SIBLING', 862, 180, { size: 12, color: C.violet });
    REGIONS.forEach((r, i) => { M(r, 862, 212 + i * 26, { size: 13, color: C.teal }); M(DSIB[i] === 0 ? '0' : f2(DSIB[i]).replace(/(\d)(?=(\d{3})+\.)/g, '$1,'), 1090, 212 + i * 26, { size: 13, align: 'right' }); M(ISIB[i] === 100 ? '100' : ISIB[i].toFixed(2), 1196, 212 + i * 26, { size: 13, align: 'right', color: C.amber }); });
    M('delta', 1090, 296, { size: 11, color: C.muted, align: 'right' }); M('index', 1196, 296, { size: 11, color: C.muted, align: 'right' });
    M('North itself: 0 and 100', 862, 336, { size: 12, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 410, 1152, 156, C.coral);
    M('"ref": { "sibling": { "field": "region", "value": "West" } } · no West in the data', 86, 444, { size: 13.5, color: C.coral });
    M('→ warning PULSE_OVERLAY_REF_UNKNOWN, every entry null', 86, 472, { size: 13.5, color: C.ink });
    M('the request still succeeds: overlay warnings never fail it, so read them before you report a figure', 86, 500, { size: 13, color: C.muted });
    M('a delta never divides, so a zero sibling just gives the raw value; the index twin warns PULSE_OVERLAY_REF_ZERO', 86, 528, { size: 12.5, color: C.muted });
  });
}

/* ---------- 11. population ---------- */
function sPop(t) {
  CAP('FACET HOST · the 2025 sign-ups against the whole cohort', 64, 124, { color: C.violet });
  const X = v => 200 + v * 3.6;
  PLANS.forEach((p, i) => A(seg(t, 0.3 + i * 0.2, 0.7 + i * 0.2), () => {
    const y = 180 + i * 80;
    M(p, 184, y + 30, { size: 14, color: C.teal, align: 'right' });
    R(200, y + 6, X(POP.idx[i]) - 200, 36, { fill: POP.idx[i] > 100 ? C.violet : C.panel2, stroke: POP.idx[i] > 100 ? null : C.faint, r: 3 });
    M(POP.idx[i].toFixed(1), X(POP.idx[i]) + 10, y + 30, { size: 14, color: POP.idx[i] > 100 ? C.violet : C.ink });
    M('n ' + POP.subset[i], 120, y + 30, { size: 11.5, color: C.faint, align: 'right' });
  }));
  A(seg(t, 0.8, 1.2), () => { Ln([[X(100), 170], [X(100), 420]], { stroke: C.amber, dash: [4, 4] }); M('100 = same share as the population', X(100) + 8, 440, { size: 12, color: C.amber }); });
  A(seg(t, 2.2, 2.6), () => {
    card(760, 160, 456, 190, C.violet);
    M('OVERLAY_INDEX_VS_POP', 782, 192, { size: 13, color: C.violet });
    M('Pro runs 8.6% above its overall share', 782, 222, { size: 13.5, color: C.ink });
    M('OVERLAY_CHISQ_VS_POP', 782, 262, { size: 13, color: C.violet });
    M('χ² ' + POP.chi.toFixed(2) + ' · df 2 · p ' + POP.p.toFixed(2), 782, 292, { size: 15, color: C.ink, weight: 600 });
    M('a shift that size is well within chance', 782, 322, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.0, 4.4), () => {
    card(64, 470, 1152, 96);
    M('"ref": { "population": { "cohort": "o.pulse" } } on FacetRequest.Overlays, not Request.Overlays', 86, 498, { size: 13, color: C.ink });
    M('also against a population: a z-score per value, and Kolmogorov-Smirnov for a numeric field', 86, 522, { size: 12.5, color: C.muted });
    M('a facet overlay never takes a weight: a set "weight" → PULSE_WEIGHT_UNSUPPORTED', 86, 548, { size: 12.5, color: C.coral });
  });
}

/* ---------- 12. compose ---------- */
function sCompose(t) {
  CAP('COMPOSE HOST · slot "y2025" against slot "y2024"', 64, 124, { color: C.violet });
  A(seg(t, 0.3, 0.7), () => { M('y2024', 140, 150, { size: 13, color: C.muted }); grid(140, 190, 70, 48, REGIONS, PLANS, Y24, { t, at: 0.3, tint: false, fs: 15 }); });
  A(seg(t, 0.8, 1.2), () => { M('y2025', 440, 150, { size: 13, color: C.muted }); grid(440, 190, 70, 48, ['', '', ''], PLANS, Y25, { t, at: 0.8, tint: false, fs: 15 }); });
  A(seg(t, 1.8, 2.2), () => { M('OVERLAY_INDEX_VS_REF', 760, 150, { size: 13, color: C.violet }); grid(760, 190, 76, 48, ['', '', ''], PLANS, IREF, { t, at: 1.8, centre: 100, span: 90, fmt: v => v.toFixed(0), fs: 15 }); });
  A(seg(t, 2.8, 3.2), () => M('South Pro 184: almost double · every cell grew', 760, 362, { size: 12.5, color: C.violet }));
  A(seg(t, 3.8, 4.2), () => {
    card(64, 390, 560, 176, C.violet);
    M('OVERLAY_CHISQ_VS_REF · scope matrix', 86, 422, { size: 13, color: C.violet });
    M('χ² 19.08 · df 8 · p 0.014', 86, 452, { size: 16, color: C.ink, weight: 600 });
    M('the 2025 mix differs from 2024 rescaled', 86, 480, { size: 12.5, color: C.muted });
    M('careful: this kind\'s scalar is the p-value, not χ²;', 86, 516, { size: 12.5, color: C.amber });
    M('read summary.statistic and summary.p_value', 86, 538, { size: 12.5, color: C.amber });
  });
  A(seg(t, 5.2, 5.6), () => {
    card(656, 390, 560, 176);
    M('layers land on ComposedResponse.overlays', 678, 422, { size: 13, color: C.ink });
    M('slots must share keys, schema and dictionaries', 678, 450, { size: 12.5, color: C.muted });
    M('always buffered: the fold waits for every slot', 678, 478, { size: 12.5, color: C.muted });
    M('also: cell t, z and two-proportion tests, rank, a panel', 678, 514, { size: 12.5, color: C.muted });
    M('of targets against one reference', 678, 536, { size: 12.5, color: C.muted });
  });
}

/* ---------- 13. matrix-result host ---------- */
function sMatResult(t) {
  CAP('MATRIX RESULT HOST · MAT_CORRELATION per region, 360 members', 64, 124, { color: C.violet });
  const cw = 58, ch = 40, ab = ['ses', 'min', 'tix'];
  REGIONS.forEach((r, g) => A(seg(t, 0.3 + g * 0.25, 0.7 + g * 0.25), () => {
    const x = 150 + g * 196, y = 196;
    M(r, x + 1.5 * cw, 160, { size: 13, color: C.teal, align: 'center' });
    ab.forEach((k, j) => M(k, x + j * cw + cw / 2, y - 8, { size: 11, color: C.muted, align: 'center' }));
    if (g === 0) UVARS.forEach((k, i) => M(k, x - 8, y + i * ch + ch / 2 + 5, { size: 11.5, color: C.muted, align: 'right' }));
    LCOR[g].forEach((row, i) => row.forEach((v, j) => {
      R(x + j * cw + 2, y + i * ch + 2, cw - 4, ch - 4, { fill: C.panel, stroke: C.rule, r: 3 });
      M(i === j ? '1' : f2(v), x + j * cw + cw / 2, y + i * ch + ch / 2 + 5, { size: 12.5, align: 'center', color: i === j ? C.faint : C.ink });
    }));
  }));
  A(seg(t, 2.0, 2.4), () => {
    arrow(740, 256, 790, 256, { stroke: C.violet });
    M('OVERLAY_MATRIX_GROUP_SUMMARY · mean', 1216, 160, { size: 12, color: C.violet, align: 'right' });
    const x = 900, y = 196, w = 76;
    ab.forEach((k, j) => M(k, x + j * w + w / 2, y - 8, { size: 11, color: C.muted, align: 'center' }));
    LMEAN.forEach((row, i) => row.forEach((v, j) => {
      R(x + j * w + 2, y + i * ch + 2, w - 4, ch - 4, { fill: i === j ? C.panel : C.violetS, stroke: C.violet, r: 3 });
      M(i === j ? '1' : f2(v), x + j * w + w / 2, y + i * ch + ch / 2 + 5, { size: 13, align: 'center', color: C.ink, weight: 600 });
    }));
  });
  A(seg(t, 2.0, 2.4), () => {
    card(64, 340, 560, 226, C.violet);
    M('"ref": { "matrix": { "name": "cor" } } · scope matrix', 86, 372, { size: 13, color: C.ink });
    M('the host: groups + matrices, no crosstab', 86, 402, { size: 12.5, color: C.muted });
    M('primary: each cell\'s mean across the buckets', 86, 432, { size: 12.5, color: C.muted });
    M('every bucket counts once, whatever its size', 86, 456, { size: 12.5, color: C.muted });
    M('crosstab + matrices on one request is refused', 86, 496, { size: 12.5, color: C.coral });
    M('the base matrices are untouched', 86, 536, { size: 12.5, color: C.teal });
  });
  A(seg(t, 4.0, 4.4), () => {
    card(656, 340, 560, 226, C.amber);
    M('payload.parts · min · max · range · n_groups', 678, 372, { size: 13, color: C.amber });
    M('range, minutes × tickets', 678, 410, { size: 12.5, color: C.muted }); T(LRANGE[1][2].toFixed(2), 1196, 412, { size: 20, weight: 700, align: 'right', color: C.amber });
    M('range, sessions × tickets', 678, 442, { size: 12.5, color: C.muted }); T(LRANGE[0][2].toFixed(2), 1196, 444, { size: 20, weight: 700, align: 'right', color: C.amber });
    M('range, sessions × minutes', 678, 474, { size: 12.5, color: C.muted }); T(LRANGE[0][1].toFixed(2), 1196, 476, { size: 20, weight: 700, align: 'right', color: C.amber });
    M('n_groups: 3 in every cell', 678, 508, { size: 12.5, color: C.muted });
    M('return: overlays[*].payload.parts.range', 678, 540, { size: 12.5, color: C.ink });
  });
}

/* ---------- 14. inferential ---------- */
function sInfer(t) {
  CAP('DESCRIPTIVE OR INFERENTIAL', 64, 124, { color: C.violet });
  A(seg(t, 0.3, 0.7), () => {
    card(64, 150, 560, 240, C.teal);
    CAP('DESCRIPTIVE', 86, 178, { color: C.teal });
    M('shares · indices · deltas · z-scores', 86, 212, { size: 14, color: C.ink });
    M('a weighted host gives weighted figures,', 86, 246, { size: 13, color: C.muted });
    M('with no overlay setting', 86, 268, { size: 13, color: C.muted });
    M('a baseline: 100 for an index, 0 for a delta', 86, 306, { size: 13, color: C.muted });
  });
  A(seg(t, 2.0, 2.4), () => {
    card(656, 150, 560, 240, C.amber);
    CAP('INFERENTIAL', 678, 178, { color: C.amber });
    M('χ² · Fisher · cell, pairwise and prior-period tests', 678, 210, { size: 13.5, color: C.ink });
    M('a p-value per cell, pair or table; no baseline', 678, 238, { size: 12.5, color: C.muted });
    M('weighted host: each runs on the cell\'s N*,', 678, 266, { size: 12.5, color: C.ink });
    M('Σw (frequency) or Kish n_eff (probability),', 678, 288, { size: 12.5, color: C.ink });
    M('echoed as sum_weights and n_eff', 678, 310, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.4, 3.8), () => {
    M('PULSE_WEIGHT_UNSUPPORTED: probit t, unweighted two-means z,', 678, 342, { size: 12, color: C.coral });
    M('Fisher under probability, any facet overlay', 678, 364, { size: 12, color: C.coral });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 410, 1152, 156, C.violet);
    M('"multiplicity" on an inferential layer adds p_adjusted beside the raw p', 86, 440, { size: 14, color: C.ink, weight: 600 });
    M('families: the layer (default) · each row or column of a matrix layer · the whole request · a Compose batch', 86, 470, { size: 13, color: C.muted });
    M('"weight": null opts one slot out · pairwise kinds add letters on request', 86, 500, { size: 13, color: C.muted });
    M('cell t and z tests read {n, mean, variance} from a Welford, variance or stddev cell', 86, 530, { size: 13, color: C.muted });
  });
}

/* ---------- 15. cost ---------- */
function sCost(t) {
  CAP('PREDICT · overlays_applied for the monthly series', 64, 124, { color: C.teal });
  const L = [['mom', 'OVERLAY_INDEX_VS_PRIOR', 'true'], ['roll', 'OVERLAY_ZSCORE_VS_ROLLING', 'false'], ['yoy', 'OVERLAY_YOY', 'false'], ['base', 'OVERLAY_INDEX_VS_BASELINE', 'false']];
  M('name', 86, 166, { size: 12, color: C.muted }); M('kind', 260, 166, { size: 12, color: C.muted }); M('streamable', 760, 166, { size: 12, color: C.muted, align: 'right' });
  L.forEach(([a, b, c], i) => A(seg(t, 0.3 + i * 0.2, 0.6 + i * 0.2), () => { const y = 200 + i * 34; M(a, 86, y, { size: 14 }); M(b, 260, y, { size: 14, color: C.violet }); M(c, 760, y, { size: 14, align: 'right', color: c === 'true' ? C.teal : C.coral }); }));
  A(seg(t, 1.8, 2.2), () => {
    card(820, 150, 396, 190, C.teal);
    M('index vs prior keeps one number,', 842, 182, { size: 13, color: C.ink }); M('so it folds inside a streaming run', 842, 204, { size: 13, color: C.ink });
    M('a window, a sibling or a year back', 842, 244, { size: 13, color: C.ink }); M('needs the whole series: buffered', 842, 266, { size: 13, color: C.ink });
    M('one buffered kind prices the request', 842, 306, { size: 12.5, color: C.muted }); M('as buffered', 842, 326, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 370, 1152, 196);
    M('the manifest lists each kind with its shapes, scopes, reference families, parts, buffered and inferential flags', 86, 404, { size: 13, color: C.ink });
    M('pick by intent: composition · benchmark · compare_groups · change_over_time · relationship · flows', 86, 434, { size: 13, color: C.muted });
    M('matrix kinds fold after the crosstab finishes, so an overlay never decides whether a crosstab fuses', 86, 470, { size: 13, color: C.muted });
    M('a chain overlay compares the last stage with an earlier one; stages of different shapes', 86, 506, { size: 13, color: C.muted });
    M('→ PULSE_OVERLAY_CHAIN_STAGE_SHAPE_DIVERGENT', 86, 530, { size: 13, color: C.coral });
  });
}

/* ---------- 16. recap ---------- */
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('TODAY · OVERLAY_…', 64, 124, { color: C.violet });
    [['SHARES', 'SHARE_OF_ROW · SHARE_OF_COL · SHARE_OF_TOTAL'],
     ['INDICES', 'INDEX_VS_MARGIN · INDEX_VS_TOTAL · INDEX_VS_PRIOR · INDEX_VS_BASELINE · INDEX_VS_ROLLING_MEAN · INDEX_VS_SIBLING · INDEX_VS_POP · INDEX_VS_REF · INDEX_VS_STAGE · PANEL_INDEX_VS_REF · YOY'],
     ['DELTAS', 'DELTA_VS_MARGIN · DELTA_VS_PRIOR · DELTA_VS_BASELINE · DELTA_VS_SIBLING · DELTA_VS_REF · DELTA_VS_STAGE'],
     ['Z-SCORES', 'ZSCORE_VS_MARGIN · ZSCORE_VS_TOTAL · ZSCORE_VS_ROLLING · ZSCORE_VS_POP'],
     ['TESTS', 'CHISQ_MATRIX · CHISQ_ROW · CHISQ_COL · CHISQ_VS_POP · CHISQ_VS_REF · KS_VS_POP · FISHER_EXACT_CELL · STD_RESIDUAL · PROP_Z_CELL · PROP_Z_PANEL · T_CELL · Z_CELL · T_VS_REF · Z_VS_REF · T_VS_PRIOR · Z_VS_PRIOR · PROP_Z_VS_PRIOR · SYMMETRY · PAIRWISE_PROP_Z · PAIRWISE_PROBIT_T · PAIRWISE_TWO_MEANS_Z · PAIRWISE_WELCH_T · PAIRWISE_WEIGHTED_TWO_MEANS_Z'],
     ['STRUCTURE', 'CORRESPONDENCE · RAKE · MATRIX_GROUP_SUMMARY'],
     ['FLOWS', 'MARKOV · RETENTION'],
     ['OTHER', 'FORMULA · RANK']].reduce((y, [h, ops], k) => {
      A(seg(t, 0.2 + k * 0.3, 0.5 + k * 0.3), () => { M(h, 64, y + 15, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, k === 4 ? C.amber : C.violet]), 180, y, 1036, { size: 10.5, h: 21, gap: 5 }); });
      return y + [30, 56, 30, 30, 82, 30, 30, 30][k];
    }, 136);
    A(seg(t, 3.4, 3.8), () => {
      R(64, 488, 566, 62, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 514, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 538, { size: 14.5 });
      R(650, 488, 566, 62, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('built in today', 668, 514, { size: 14, color: C.amber, weight: 600 }); T('your own expression functions still reach OVERLAY_FORMULA', 668, 538, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('OVERLAYS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('the base result never moves', 640, 430, { size: 15, align: 'center' });
    M('next: Compose, batch and sweep', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[2.304, 3.499, 3.733, 9.003, 7.467, 3.669, 9.877, 9.259, 5.44, 5.952, 4.608, 5.739, 7.595, 5.483, 6.165, 4.117, 6.72, 4.117, 8.021, 5.483, 3.904, 2.624, 8.128, 8.512, 7.147, 6.72, 6.443, 6.208, 6.315, 5.376, 4.629, 4.053, 4.608, 9.344, 7.083, 6.784, 6.379, 4.8, 7.168, 6.293, 3.349, 6.933, 7.851, 8.299, 5.163, 8.128, 7.829, 2.709, 7.488, 5.973, 6.891, 4.288, 2.347, 1.152]/*END*/;
PulseFilm.mount({
  series: 'PULSE · OVERLAYS',
  title: 'Pulse Overlays',
  narr: NARR,
  scenes: [
    { name: 'Pulse Overlays', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Reading a finished result against something.', true]] },
    { name: 'Where they run', dur: 7.6, draw: sWhere, caps: [
      [0, 'Overlays run last, on a result that is already computed.'],
      [2.0, 'Each spec adds one layer to the response, in the order you list them.'],
      [3.8, 'A layer is a read-only sibling keyed to the result\'s rows and columns. Run with or without overlays, the base figures are byte-identical.'],
      [5.8, 'Use one for a figure derived from the result: a share, an index, a change, a z-score, or a test between cells.']] },
    { name: 'One spec', dur: 7, draw: sSpec, caps: [
      [0, 'A spec names its kind, its scope, and what it compares against.'],
      [3.0, 'The reference can be a margin, a sibling group, an earlier point in the series, another cohort, an earlier chain stage, another Compose slot, or a named matrix.'],
      [5.0, 'Every layer is a scalar, a series or a matrix, with named parts for multi-output kinds. Indices centre on a hundred, deltas on zero.']] },
    { name: 'Hosts', dur: 6.6, draw: sHosts, caps: [
      [0, 'The request that carries the spec decides the host, and the host decides which kinds make sense.'],
      [4.0, 'On a crosstab with columns, predict and the runtime both refuse an index against the prior point.']] },
    { name: 'Matrix host', dur: 8, draw: sMatrix, caps: [
      [0, 'On a crosstab of region by plan, overlays read the cells and their margins.'],
      [2.4, 'Share of row turns counts into each region\'s plan mix. North leans Basic, East leans Pro.', 'Share of row turns counts into each region\'s plan mix. North leans basic, East leans pro.'],
      [3.8, 'Share of row reads the row margin only: a column-axis reference is refused. Crosstabs themselves are film 15.', 'Share of row reads the row margin only: a column-axis reference is refused. Crosstabs themselves are film fifteen.'],
      [5.0, 'A chi-square layer tests the whole table at once. Here plan mix clearly depends on region.']] },
    { name: 'Pairwise letters', dur: 6.6, draw: sPairwise, caps: [
      [0, 'Pairwise overlays test one region against another in the same crosstab, with a raw p-value per pair.'],
      [2.2, 'Ask for letters, and each cell lists the regions it beats at five percent.'],
      [4.4, 'North leads on Basic, South on Plus, East on Pro. Minimum sample sizes are still yours to check.', 'North leads on basic, South on plus, and East on pro. Minimum sample sizes are still yours to check.']] },
    { name: 'Formula', dur: 6.2, draw: sFormula, caps: [
      [0, 'A formula overlay computes your own figure from the host\'s variables.'],
      [1.2, 'Here, lift: each plan\'s share in a region against its share overall. East buys Pro at 1.6 times the overall rate.', 'Here, lift: each plan\'s share in a region against its share overall. East buys pro at one point six times the overall rate.'],
      [3.8, 'The variables are fixed per shape, and predict catches an unknown name before any row is read.']] },
    { name: 'Series host', dur: 7, draw: sSeries, caps: [
      [0, 'On a monthly series, overlays compare each point with earlier ones.'],
      [1.4, 'Index against prior shows month-on-month change.'],
      [3.0, 'Index against a baseline sets January 2024 to 100, so March 2025 reads 221.', 'Index against a baseline sets January twenty twenty-four to a hundred, so March twenty twenty-five reads two hundred and twenty-one.'],
      [4.6, 'Year over year compares each month with the same month a year before. The first year has nothing to compare, so it is null, with no warning.']] },
    { name: 'Per partition', dur: 5.6, draw: sPartition, caps: [
      [0, 'Over two or more groupers, a series overlay runs once per partition. By default it runs down the last grouper.'],
      [1.8, 'Here, each region\'s 2025 revenue is indexed on its own 2024. South grew most.', 'Here, each region\'s twenty twenty-five revenue is indexed on its own twenty twenty-four. South grew most.']] },
    { name: 'Rolling z-score', dur: 7.6, draw: sRolling, caps: [
      [0, 'A rolling z-score asks whether a point is unusual against the few points before it, using their sample spread.'],
      [1.8, 'December 2024 stands out at more than six standard deviations above the three months before it.', 'December twenty twenty-four stands out at more than six standard deviations above the three months before it.'],
      [3.2, 'By default a point needs a full window of earlier points, so the first three months are null, with no warning.'],
      [4.6, 'Set min_periods to 2, and March 2024 answers, at 1.19.', 'Set min periods to two, and March twenty twenty-four answers, at one point one nine.'],
      [6.0, 'Leave out the window, or set min_periods out of range, and predict refuses it.', 'Leave out the window, or set min periods out of range, and predict refuses it.']] },
    { name: 'Siblings', dur: 6, draw: sSibling, caps: [
      [0, 'A sibling overlay compares every group with one named group, here North.'],
      [1.8, 'East trails North by about 3,600, an index of 84.', 'East trails North by about three thousand six hundred, an index of eighty-four.'],
      [3.6, 'Name a sibling that is not there, and every entry comes back null with a warning. The request still succeeds, so read the warnings before you report a figure.']] },
    { name: 'Population', dur: 6, draw: sPop, caps: [
      [0, 'On a facet, overlays compare a subset with a population cohort: here, this year\'s sign-ups against everyone.'],
      [2.2, 'Pro runs about 9% above its overall share, but a chi-square says a shift that size is well within chance.', 'Pro runs about nine percent above its overall share, but a chi-square says a shift that size is well within chance.'],
      [4.0, 'Population overlays ride on the facet request, not the process request, and they refuse a set weight.']] },
    { name: 'Compose host', dur: 7, draw: sCompose, caps: [
      [0, 'In Compose, overlays compare one slot with another after every slot has run.'],
      [1.8, 'Indexing 2025 against 2024 shows every cell grew, with South\'s Pro plan almost doubling.', 'Indexing twenty twenty-five against twenty twenty-four shows every cell grew, with South\'s pro plan almost doubling.'],
      [3.8, 'A chi-square says the mix itself changed. On this kind the scalar is the p-value, so read the summary.'],
      [5.2, 'The slots must line up on keys, schema and dictionaries.']] },
    { name: 'Matrix result host', dur: 6.4, draw: sMatResult, caps: [
      [0, 'A grouped request can carry a matrix, such as a correlation for each region. That grouped result is a host too.'],
      [2.0, 'A group summary names the matrix in its reference and reads every bucket. Its primary layer is each cell\'s mean across the regions.'],
      [4.0, 'The minimum, maximum, range and group count ride beside it as named parts. Minutes and tickets vary most from region to region.']] },
    { name: 'Inferential layers', dur: 7, draw: sInfer, caps: [
      [0, 'Descriptive overlays read weighted figures from a weighted host, with no extra setting.'],
      [2.0, 'Inferential overlays return p-values. On a weighted host they run on each cell\'s effective base; only a few refuse a weight.'],
      [4.8, 'A multiplicity block adds adjusted p-values beside the raw ones, per layer, row, column, request or Compose batch.']] },
    { name: 'Streams or buffers', dur: 6, draw: sCost, caps: [
      [0, 'Predict lists each overlay and whether it streams.'],
      [1.8, 'An index against the prior point keeps one number and streams. Windows, siblings and year-back lookups need the whole series.'],
      [3.6, 'The manifest lists every kind with its shapes, scopes, parts and flags, so you can pick by intent.']] },
    { name: 'The toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the toolkit today: shares, indices, deltas, z-scores, tests, structure and flows, formulas and ranks.'],
      [3.4, 'More are added over time, and the manifest shows what your instance offers.'],
      [6.4, 'Remember: the base result never moves.'],
      [9.0, '', 'Pulse overlays.', true]] },
  ],
});
})();
