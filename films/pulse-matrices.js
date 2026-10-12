/* Pulse Matrices: film 9 of the Pulse Anatomy series. Follows SERIES-RULES.md.
 * The cohort is an illustrative 300-row survey (service items s1–s3 and reverse-keyed r4, value items v1–v3 with
 * 30 nulls in v3, age / tenure / income, a segment). Every figure on screen comes from running Pulse on it. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, ring, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });

const ITEMS = ['s1', 's2', 's3', 'v1', 'v2', 'v3'];
const COR = [[1, 0.740, 0.700, -0.010, -0.047, -0.041], [0.740, 1, 0.661, 0.016, 0.010, -0.039], [0.700, 0.661, 1, 0.049, -0.012, 0.001],
  [-0.010, 0.016, 0.049, 1, 0.645, 0.623], [-0.047, 0.010, -0.012, 0.645, 1, 0.595], [-0.041, -0.039, 0.001, 0.623, 0.595, 1]];
const COV_DIAG = [2.085, 2.280, 2.039, 1.679, 1.982, 1.721];
const PCOR = [[1, 0.519, 0.415, -0.018, -0.055, 0.018], [0.519, 1, 0.300, -0.007, 0.089, -0.069], [0.415, 0.300, 1, 0.071, -0.052, 0.021],
  [-0.018, -0.007, 0.071, 1, 0.436, 0.387], [-0.055, 0.089, -0.052, 0.436, 1, 0.326], [0.018, -0.069, 0.021, 0.387, 0.326, 1]];
const PAIRN = [[300, 300, 300, 300, 300, 270], [300, 300, 300, 300, 300, 270], [300, 300, 300, 300, 300, 270], [300, 300, 300, 300, 300, 270], [300, 300, 300, 300, 300, 270], [270, 270, 270, 270, 270, 270]];
const REL_RAW = { r: [[1, 0.741, 0.696, -0.624], [0.741, 1, 0.668, -0.600], [0.696, 0.668, 1, -0.645], [-0.624, -0.600, -0.645, 1]], alpha: 0.189, itr: [0.617, 0.605, 0.526, -0.695] };
const REL = { r: [[1, 0.741, 0.696, 0.624], [0.741, 1, 0.668, 0.600], [0.696, 0.668, 1, 0.645], [0.624, 0.600, 0.645, 1]], alpha: 0.887, omega: 0.888, mir: 0.662,
  itr: [0.791, 0.764, 0.763, 0.695], aid: [0.840, 0.851, 0.851, 0.876] };
const PCA = { eig: [2.406, 2.240, 0.418, 0.363, 0.323, 0.250], expl: [0.401, 0.373], load: [[0.906, 0.098], [0.885, 0.133], [0.865, 0.153], [-0.100, 0.871], [-0.143, 0.852], [-0.155, 0.839]],
  rot: [[0.911, -0.020], [0.895, 0.017], [0.877, 0.040], [0.014, 0.877], [-0.031, 0.863], [-0.045, 0.852]], kmo: 0.725, bart: 723.5 };
const FA = { load: [[0.885, -0.021], [0.836, 0.016], [0.791, 0.037], [0.011, 0.824], [-0.029, 0.784], [-0.039, 0.757]], uniq: [0.216, 0.301, 0.373, 0.322, 0.385, 0.426],
  chisq: 3.142, p: 0.534, rmsea: 0, rmseaHi: 0.083, tli: 1.005, rmsr: 0.007 };
const COL = { r: [[1, 0.979, 0.687], [0.979, 1, 0.659], [0.687, 0.659, 1]], vif: [26.19, 24.45, 1.91], ci: [1, 4.75, 14.22, 42.45],
  vd: [[0.001, 0.023, 0.161, 0.815], [0.000, 0.000, 0.009, 0.991], [0.001, 0.040, 0.004, 0.955], [0.002, 0.011, 0.955, 0.033]] };
const DIST = { keys: ['Bronze', 'Gold', 'Silver'], d: [[0, 1.800, 0.728], [1.800, 0, 1.136], [0.728, 1.136, 0]], n: [95, 85, 90],
  cz: [[-0.340, -0.405, -0.338, 0.337, 0.227, 0.285], [0.451, 0.401, 0.383, -0.401, -0.385, -0.441], [-0.067, 0.049, -0.005, 0.023, 0.124, 0.116]] };
const GRP = { Bronze: [[1, 0.654, 0.699, 0.053, -0.051, 0.018], [0.654, 1, 0.659, 0.116, 0.025, 0.001]],
  Gold: [[1, 0.709, 0.655, 0.195, 0.115, 0.032], [0.709, 1, 0.683, 0.325, 0.296, 0.163]], Silver: [[1, 0.758, 0.636, 0.077, 0.113, 0.136], [0.758, 1, 0.551, 0.033, 0.084, 0.035]] };

/* a heatmap: violet for positive r, amber for negative, number in the cell */
function heat(x, y, cs, keys, V, o = {}) {
  const n = keys.length, t = o.t ?? 99, at = o.at ?? -9, ck = o.colKeys || keys;
  ck.forEach((k, j) => A(seg(t, at, at + 0.3), () => M(k, x + j * cs + cs / 2, y - 8, { size: o.ks ?? 12, align: 'center', color: C.muted })));
  keys.forEach((k, i) => A(seg(t, at, at + 0.3), () => M(k, x - 8, y + i * cs + cs / 2 + 4, { size: o.ks ?? 12, align: 'right', color: C.muted })));
  keys.forEach((_, i) => ck.forEach((__, j) => {
    const v = V[i][j]; if (o.upper && j < i) return;
    A(seg(t, at + 0.1 + (i + j) * (o.step ?? 0.05), at + 0.4 + (i + j) * (o.step ?? 0.05)), () => {
      const hl = o.hl && o.hl(i, j);
      R(x + j * cs + 1, y + i * cs + 1, cs - 2, cs - 2, { fill: C.panel, stroke: hl ? C.ink : null, lw: 2, r: 3 });
      if (v === null) { M('null', x + j * cs + cs / 2, y + i * cs + cs / 2 + 4, { size: 10.5, color: C.coral, align: 'center' }); return; }
      A(Math.min(1, Math.abs(v) / (o.scale ?? 1)) * 0.85, () => R(x + j * cs + 1, y + i * cs + 1, cs - 2, cs - 2, { fill: v >= 0 ? C.violet : C.amber, r: 3 }));
      if (o.nums !== false) M(o.fmt ? o.fmt(v) : v.toFixed(2), x + j * cs + cs / 2, y + i * cs + cs / 2 + 4, { size: o.fs ?? 11.5, align: 'center', color: Math.abs(v) / (o.scale ?? 1) > 0.5 ? C.bg : C.ink, weight: 600 });
    });
  }));
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  A(seg(t, 0.1, 1.2), () => heat(560, 120, 26, ['', '', '', '', '', ''], COR, { t, at: 0.1, nums: false, step: 0.06 }));
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 360, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('MATRICES', 640, 440, { size: 52, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 2.0, 2.8), () => T('Every field against every field', 640, 486, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where they run ---------- */
function sWhere(t) {
  const SP = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
  SP.forEach((n, i) => A(seg(t, 0.1 + i * 0.06, 0.4 + i * 0.06) * 0.6, () => {
    const x = 64 + i * 164; R(x, 110, 150, 46, { fill: C.panel, stroke: C.rule }); T(n, x + 14, 139, { size: 15, weight: 600, color: C.muted });
    if (i < 6) arrow(x + 150, 133, x + 162, 133, { stroke: C.faint, head: 6 });
  }));
  A(seg(t, 0.8, 1.2), () => {
    R(392, 172, 560, 44, { fill: C.violetS, stroke: C.violet });
    M('"matrices": fold the records that pass the filters, during the scan', 410, 199, { size: 13, color: C.ink });
    arrow(330, 194, 388, 194, { stroke: C.violet }); M('after filters', 230, 199, { size: 12, color: C.muted });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(64, 240, 560, 220, C.violet);
    CAP('NAME A BATTERY ONCE, THEN ASK', 86, 268);
    [['"vectors": [{ "name": "items",', C.ink], ['  "fields": ["s1","s2","s3","v1","v2","v3"] }],', C.ink], ['"matrices": [{ "type": "MAT_CORRELATION",', C.violet], ['  "vector": "items" }]', C.violet]]
      .forEach(([s, c], i) => A(seg(t, 3.0 + i * 0.12, 3.3 + i * 0.12), () => M(s, 86, 302 + i * 30, { size: 13.5, color: c })));
    M('one result per spec, in request order', 86, 436, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(656, 240, 560, 220);
    CAP('WHAT COMES BACK', 678, 268);
    [['Response.Matrices[i].primary', 'the matrix', C.violet], ['  .vectors · .scalars', 'per-member figures, single figures', C.ink], ['  .auxiliary', 'more matrices: pair counts, loadings…', C.ink], ['  .warnings', 'data-quality findings', C.amber]]
      .forEach(([a, b, c], i) => { M(a, 678, 302 + i * 30, { size: 13, color: c }); M(b, 1196, 302 + i * 30, { size: 12, color: C.muted, align: 'right' }); });
    M('arrives at the final flush, never row by row', 678, 436, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.8, 7.2), () => {
    card(64, 480, 1152, 86);
    M('components.matrices[i]: n · n_null · n_listwise_dropped · pairwise min_pair_n / max_pair_n', 86, 512, { size: 13.5, color: C.ink });
    M('our cohort: 300 illustrative survey rows; every figure in this film is a real Pulse result on it', 86, 540, { size: 12.5, color: C.faint });
  });
}

/* ---------- 2. vectors ---------- */
function sVectors(t) {
  CAP('VECTORS · A BATTERY OF NUMERIC FIELDS', 64, 124, { color: C.violet });
  const F = [['"fields": ["s1","s2","s3"]', 'literal names keep your order'], ['"fields": ["s*"]', 'a glob expands in schema order'], ['"pattern": "^v[0-9]$"', 'an unanchored regexp, schema order'], ['"labels": ["Speed", …]', 'one display label per member']];
  F.forEach(([a, b], i) => A(seg(t, 0.3 + i * 0.5, 0.6 + i * 0.5), () => { const y = 168 + i * 44; R(64, y - 26, 620, 38, { fill: C.panel, stroke: C.rule }); M(a, 82, y - 2, { size: 13.5, color: C.ink }); M(b, 670, y - 2, { size: 12, color: C.muted, align: 'right' }); }));
  A(seg(t, 2.8, 3.2), () => {
    card(720, 142, 496, 170, C.teal);
    CAP('MEMBERS', 742, 170, { color: C.teal });
    M('integer and float fields', 742, 202, { size: 14, color: C.ink });
    M('packed_bool with "coerce": "binary"', 742, 232, { size: 14, color: C.ink });
    M('categorical · set · date · datetime · decimal128', 742, 266, { size: 13, color: C.coral });
    M('→ PULSE_VECTOR_MEMBER_TYPE', 742, 292, { size: 12.5, color: C.coral });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(64, 340, 1152, 120);
    M('predict echoes resolved_vectors: { "items": ["s1","s2","s3","v1","v2","v3"] }', 86, 376, { size: 14, color: C.violet });
    M('check the members before you trust a glob or a pattern', 86, 404, { size: 13, color: C.muted });
    M('a vector no slot reads warns PULSE_VECTOR_UNREFERENCED · tests, attributes and groupers can read vectors too', 86, 434, { size: 12.5, color: C.muted });
  });
}

/* ---------- 3. covariance and correlation ---------- */
function sCor(t) {
  CAP('MAT_CORRELATION · six survey items', 64, 124, { color: C.violet });
  heat(110, 170, 56, ITEMS, COR, { t, at: 0.3, hl: t > 2.6 && t < 4.6 ? (i, j) => (i < 3) === (j < 3) && i !== j : null });
  A(seg(t, 2.6, 3.0), () => { M('service', 110 + 84, 520, { size: 12.5, color: C.violet, align: 'center' }); M('value', 110 + 252, 520, { size: 12.5, color: C.violet, align: 'center' }); });
  A(seg(t, 2.6, 3.0), () => {
    card(520, 150, 696, 150, C.violet);
    M('two blocks: service items move together, value items move together', 542, 184, { size: 13.5, color: C.ink, weight: 600 });
    M('across the blocks, r sits near 0', 542, 212, { size: 13, color: C.muted });
    M('"summary": { "top_pairs": 3 } → s1·s2 0.74 · s1·s3 0.70 · s2·s3 0.66', 542, 246, { size: 12.5, color: C.amber });
    M('determinant 0.066 (null unless positive definite)', 542, 276, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(520, 316, 696, 114);
    M('MAT_COVARIANCE: the same grid in the fields\' own units', 542, 348, { size: 13.5, color: C.ink, weight: 600 });
    M('diagonal = variances: ' + COV_DIAG.map(v => v.toFixed(2)).join(' · '), 542, 376, { size: 12.5, color: C.muted });
    M('"ddof": 1 by default, the sample covariance', 542, 404, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.2, 6.6), () => {
    card(520, 446, 696, 96);
    M('"encoding": "upper" sends row r from the diagonal on', 542, 478, { size: 13.5, color: C.ink });
    M('about half the bytes · an undefined cell is null, never 0', 542, 506, { size: 12.5, color: C.muted });
  });
}

/* ---------- 4. missing data ---------- */
function sMissing(t) {
  CAP('MISSING DATA · v3 is blank on 30 rows', 64, 124, { color: C.coral });
  A(seg(t, 0.3, 0.7), () => {
    card(64, 150, 540, 190, C.violet);
    CAP('"missing": "listwise" (default)', 86, 178, { color: C.violet });
    M('a row with any null member is dropped', 86, 212, { size: 13.5, color: C.ink });
    M('every cell: n 270 · n_listwise_dropped 30', 86, 240, { size: 13.5, color: C.amber });
    M('one row set, so the matrix is always positive', 86, 274, { size: 12.5, color: C.muted });
    M('semi-definite · "max_drop_share" warns when too many go', 86, 296, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.2, 2.6), () => {
    card(636, 150, 580, 190, C.teal);
    CAP('"missing": "pairwise"', 658, 178, { color: C.teal });
    M('each cell uses the rows where both are present', 658, 212, { size: 13.5, color: C.ink });
    M('auxiliary.n holds each pair\'s count', 658, 240, { size: 13.5, color: C.amber });
    M('keeps more data, but the grid can stop being', 658, 274, { size: 12.5, color: C.muted });
    M('positive semi-definite (predict: pairwise_psd_risk)', 658, 296, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => heat(760, 390, 26, ITEMS, PAIRN, { t, at: 2.6, scale: 600, fmt: v => String(v), fs: 9, ks: 10, step: 0.02, hl: (i, j) => i === 5 || j === 5 }));
  A(seg(t, 2.8, 3.2), () => M('auxiliary.n', 760, 560, { size: 11.5, color: C.amber }));
  A(seg(t, 4.4, 4.8), () => {
    card(64, 360, 620, 200, C.coral);
    M('a decomposition needs a valid matrix', 86, 392, { size: 13.5, color: C.coral, weight: 600 });
    M('partial correlation · reliability\'s omega · PCA ·', 86, 420, { size: 12.5, color: C.ink });
    M('factor analysis · collinearity', 86, 442, { size: 12.5, color: C.ink });
    M('pairwise and not PSD → PULSE_MATRIX_NOT_PSD, fatal', 86, 474, { size: 12.5, color: C.coral });
    M('"repair": "nearest" projects to the nearest correlation', 86, 504, { size: 12.5, color: C.ink });
    M('matrix (Higham) and warns how far it moved', 86, 526, { size: 12.5, color: C.ink });
  });
}

/* ---------- 5. ranks ---------- */
function sRank(t) {
  CAP('"method": "spearman" or "kendall"', 64, 124, { color: C.violet });
  const pts = [[1, 2], [2, 3], [3, 3.6], [4, 4], [5, 4.3], [6, 4.5], [7, 4.6], [8, 9.5]];
  const X = v => 110 + v * 54, Y = v => 470 - v * 30;
  Ln([[100, 470], [600, 470]], { stroke: C.rule }); Ln([[100, 160], [100, 470]], { stroke: C.rule });
  pts.forEach(([a, b], i) => A(seg(t, 0.3 + i * 0.08, 0.6 + i * 0.08), () => dot(X(a), Y(b), 5, i === 7 ? C.coral : C.teal)));
  A(seg(t, 1.0, 1.4), () => Ln(pts.slice(0, 7).map(([a, b]) => [X(a), Y(b)]), { stroke: C.violet, lw: 2 }));
  A(seg(t, 1.0, 1.4), () => M('monotone, not straight · one outlier', 110, 180, { size: 12.5, color: C.muted }));
  A(seg(t, 1.6, 2.0), () => {
    card(660, 150, 556, 160, C.violet);
    M('Pearson reads values in a straight line', 682, 184, { size: 13.5, color: C.ink });
    M('Spearman ρ and Kendall τ-b read ranks', 682, 212, { size: 13.5, color: C.violet, weight: 600 });
    M('ordinal scales, outliers, monotone curves', 682, 240, { size: 12.5, color: C.muted });
    M('our items: s1·s2 0.74 Pearson, 0.73 Spearman', 682, 276, { size: 12.5, color: C.amber });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(660, 330, 556, 140, C.coral);
    M('buffered and serial: ranks need every row', 682, 362, { size: 13.5, color: C.coral, weight: 600 });
    M('predict: streamable false, row_buffer_bytes', 682, 390, { size: 12.5, color: C.ink });
    M('frequency weights only; a probability weight', 682, 418, { size: 12.5, color: C.ink });
    M('is refused PULSE_WEIGHT_UNSUPPORTED', 682, 442, { size: 12.5, color: C.ink });
  });
}

/* ---------- 6. partial correlation ---------- */
function sPartial(t) {
  CAP('MAT_PARTIAL_CORRELATION · each pair, the others held fixed', 64, 124, { color: C.violet });
  const hl = (i, j) => (i === 0 && j === 1) || (i === 1 && j === 0);
  A(seg(t, 0.2, 0.6), () => { M('correlation', 110, 156, { size: 12.5, color: C.muted }); heat(110, 190, 44, ITEMS, COR, { t, at: 0.2, hl, step: 0.02, fs: 10.5 }); });
  A(seg(t, 1.6, 2.0), () => { M('partial correlation', 520, 156, { size: 12.5, color: C.violet }); heat(520, 190, 44, ITEMS, PCOR, { t, at: 1.6, hl, step: 0.02, fs: 10.5 }); });
  A(seg(t, 3.0, 3.4), () => {
    card(840, 180, 376, 200, C.violet);
    M('s1 · s2', 862, 214, { size: 14, color: C.ink, weight: 600 });
    M('0.74 raw → 0.52 partial', 862, 244, { size: 15, color: C.amber, weight: 600 });
    M('part of their link runs', 862, 276, { size: 12.5, color: C.muted });
    M('through s3', 862, 298, { size: 12.5, color: C.muted });
    M('the cross-block cells stay near 0', 862, 340, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(64, 490, 1152, 76);
    M('"control": "all" (default) or a field list · collinear fields → PULSE_MATRIX_SINGULAR with dependent_fields · no p-values', 86, 532, { size: 13, color: C.ink });
  });
}

/* ---------- 7. reliability ---------- */
function sRel(t) {
  CAP('MAT_RELIABILITY · do four items measure one scale?', 64, 124, { color: C.violet });
  const keys = ['s1', 's2', 's3', 'r4'], fixed = t > 3.6;
  A(seg(t, 0.2, 0.6), () => heat(110, 190, 60, keys, fixed ? REL.r : REL_RAW.r, { t, at: 0.2, step: 0.03 }));
  A(seg(t, 0.2, 0.6), () => M(fixed ? 'r4 reversed: x′ = 1 + 7 − x' : 'r4 is reverse-keyed: "disagree" means good', 110, 160, { size: 12.5, color: fixed ? C.teal : C.amber }));
  A(seg(t, 1.4, 1.8) * (1 - seg(t, 3.4, 3.6)), () => {
    card(420, 180, 380, 150, C.coral);
    M('alpha ' + REL_RAW.alpha.toFixed(2), 442, 220, { size: 26, weight: 700, color: C.coral });
    M('item_total_r for r4: ' + REL_RAW.itr[3].toFixed(2), 442, 258, { size: 13, color: C.ink });
    M('a low or negative alpha usually means', 442, 288, { size: 12.5, color: C.muted });
    M('an item was not reversed', 442, 308, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(420, 180, 380, 150, C.teal);
    M('alpha ' + REL.alpha.toFixed(2) + ' · omega ' + REL.omega.toFixed(2), 442, 220, { size: 22, weight: 700, color: C.teal });
    M('mean inter-item r ' + REL.mir.toFixed(2), 442, 258, { size: 13, color: C.ink });
    M('"reverse": ["r4"], "scale_min": 1, "scale_max": 7', 442, 300, { size: 11.5, color: C.muted });
  });
  A(seg(t, 5.2, 5.6), () => {
    card(840, 150, 376, 230);
    CAP('PER ITEM', 862, 178);
    M('item', 862, 206, { size: 12, color: C.muted }); M('item-total r', 1000, 206, { size: 12, color: C.muted, align: 'right' }); M('alpha if deleted', 1196, 206, { size: 12, color: C.muted, align: 'right' });
    keys.forEach((k, i) => { const y = 238 + i * 30; M(k, 862, y, { size: 13.5, color: C.teal }); M(REL.itr[i].toFixed(2), 1000, y, { size: 13.5, align: 'right' }); M(REL.aid[i].toFixed(2), 1196, y, { size: 13.5, align: 'right', color: C.amber }); });
    M('all below alpha 0.89: keep all four', 862, 364, { size: 11.5, color: C.muted });
  });
  A(seg(t, 6.6, 7.0), () => {
    card(64, 470, 1152, 96);
    M('the reverse range is required, never guessed: a value outside it is PROCESSING_CONFIG', 86, 504, { size: 13, color: C.ink });
    M('omega comes from a one-factor fit; it is null with a warning on two items or a Heywood fit, while alpha always computes', 86, 534, { size: 12.5, color: C.muted });
  });
}

/* ---------- 8. PCA ---------- */
function sPCA(t) {
  CAP('MAT_PCA · how many dimensions carry the variance?', 64, 124, { color: C.violet });
  const X = i => 120 + i * 70, Y = v => 440 - v * 100;
  Ln([[100, 440], [540, 440]], { stroke: C.rule });
  A(seg(t, 0.8, 1.2), () => { Ln([[100, Y(1)], [540, Y(1)]], { stroke: C.amber, dash: [5, 4] }); M('Kaiser: keep λ > 1', 540, Y(1) - 8, { size: 12, color: C.amber, align: 'right' }); });
  PCA.eig.forEach((v, i) => A(seg(t, 0.2 + i * 0.1, 0.5 + i * 0.1), () => {
    const h = (440 - Y(v)) * eo(seg(t, 0.2 + i * 0.1, 0.8 + i * 0.1));
    R(X(i), 440 - h, 44, h, { fill: i < 2 ? C.violet : C.panel2, stroke: i < 2 ? null : C.faint, r: 3 });
    M(v.toFixed(2), X(i) + 22, 440 - h - 8, { size: 12, align: 'center' }); M('PC' + (i + 1), X(i) + 22, 460, { size: 11.5, align: 'center', color: C.muted });
  }));
  A(seg(t, 1.6, 2.0), () => M('2 kept · 40% + 37% = 77% of the variance', 120, 496, { size: 13, color: C.violet }));
  A(seg(t, 2.8, 3.2), () => {
    M('loadings', 640, 156, { size: 12.5, color: C.muted });
    heat(680, 190, 54, ITEMS, PCA.load, { t, at: 2.8, colKeys: ['PC1', 'PC2'], step: 0.03 });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(840, 150, 376, 190, C.violet);
    M('KMO ' + PCA.kmo.toFixed(2) + ': factorable', 862, 184, { size: 13.5, color: C.ink, weight: 600 });
    M('Bartlett χ² ' + PCA.bart.toFixed(0) + ' · df 15', 862, 212, { size: 13, color: C.ink });
    M('"rotation": "varimax" sharpens', 862, 250, { size: 12.5, color: C.amber });
    M('the pattern: s1 now 0.91 / −0.02', 862, 272, { size: 12.5, color: C.amber });
    M('signs are free: −PC1 is the same', 862, 308, { size: 12.5, color: C.muted });
    M('component', 862, 328, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.0, 6.4), () => {
    card(64, 520, 1152, 46);
    M('PCA summarizes variance; it is not a model of hidden causes. That is factor analysis.', 86, 548, { size: 13, color: C.ink });
  });
}

/* ---------- 9. factor analysis ---------- */
function sFactor(t) {
  CAP('MAT_FACTOR · which hidden qualities do the items reflect?', 64, 124, { color: C.violet });
  const fx = [300, 300], fy = [230, 430], ix = 560;
  ['F1 service', 'F2 value'].forEach((f, k) => A(seg(t, 0.3, 0.7), () => { ring(fx[k], fy[k], 44, C.violet, 2.5); T(f, fx[k], fy[k] + 5, { size: 14, weight: 600, align: 'center' }); }));
  ITEMS.forEach((it, i) => A(seg(t, 0.6 + i * 0.1, 0.9 + i * 0.1), () => {
    const y = 160 + i * 60, k = i < 3 ? 0 : 1, l = FA.load[i][k];
    R(ix, y - 20, 70, 40, { fill: C.panel, stroke: C.teal }); M(it, ix + 35, y + 5, { size: 14, align: 'center', color: C.teal });
    A(0.3 + 0.7 * l, () => arrow(fx[k] + 44, fy[k], ix - 2, y, { stroke: C.violet, lw: 1 + 4 * l, head: 8 }));
    M(l.toFixed(2), lerp(fx[k] + 44, ix, 0.62), lerp(fy[k], y, 0.62) - 6, { size: 11.5, color: C.amber });
    A(seg(t, 2.4, 2.8), () => { M('ψ ' + FA.uniq[i].toFixed(2), ix + 84, y + 5, { size: 12, color: C.muted }); });
  }));
  A(seg(t, 2.4, 2.8), () => M('uniqueness: what the factors miss', 644, 140, { size: 11.5, color: C.muted }));
  A(seg(t, 3.6, 4.0), () => {
    card(840, 150, 376, 230, C.violet);
    M('"factors": 2, "extraction": "ml",', 862, 182, { size: 12, color: C.muted }); M('"rotation": "varimax"', 862, 202, { size: 12, color: C.muted });
    M('likelihood χ² ' + FA.chisq.toFixed(2) + ' · p ' + FA.p.toFixed(2), 862, 238, { size: 13.5, color: C.ink, weight: 600 });
    M('RMSEA ' + FA.rmsea.toFixed(2) + ' (upper ' + FA.rmseaHi.toFixed(2) + ') · TLI ' + FA.tli.toFixed(2), 862, 266, { size: 13, color: C.teal });
    M('rmsr ' + FA.rmsr.toFixed(3) + ': two factors fit well', 862, 294, { size: 13, color: C.teal });
    M('minres · principal axis · ml', 862, 332, { size: 12, color: C.faint });
    M('varimax · promax · oblimin', 862, 354, { size: 12, color: C.faint });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(840, 396, 376, 130, C.coral);
    M('a uniqueness at or below 0', 862, 428, { size: 13, color: C.coral, weight: 600 });
    M('→ PULSE_MATRIX_HEYWOOD', 862, 452, { size: 12.5, color: C.ink });
    M('too many factors for the items', 862, 480, { size: 13, color: C.coral, weight: 600 });
    M('→ PULSE_MATRIX_NOT_IDENTIFIED', 862, 504, { size: 12.5, color: C.ink });
  });
}

/* ---------- 10. collinearity ---------- */
function sCol(t) {
  CAP('MAT_COLLINEARITY · are these predictors too alike to fit together?', 64, 124, { color: C.violet });
  const keys = ['age', 'tenure', 'income'];
  heat(150, 190, 70, keys, COL.r, { t, at: 0.3, hl: (i, j) => i + j === 1 });
  keys.forEach((k, i) => A(seg(t, 1.8 + i * 0.3, 2.1 + i * 0.3), () => {
    const y = 190 + i * 70, w = COL.vif[i] / 30 * 300;
    R(500, y + 18, w, 34, { fill: COL.vif[i] > 10 ? C.coral : C.teal, r: 3 });
    M('VIF ' + COL.vif[i].toFixed(1), 500 + w + 10, y + 40, { size: 13.5, color: COL.vif[i] > 10 ? C.coral : C.teal });
  }));
  A(seg(t, 1.8, 2.2), () => { [5, 10].forEach(v => { const x = 500 + v / 30 * 300; Ln([[x, 180], [x, 410]], { stroke: C.faint, dash: [3, 4] }); M(String(v), x, 428, { size: 11, align: 'center', color: C.faint }); }); M('rules of thumb, not limits', 560, 448, { size: 11.5, color: C.faint }); });
  A(seg(t, 3.6, 4.0), () => {
    card(880, 150, 336, 170, C.violet);
    M('age · tenure r 0.98', 902, 184, { size: 14, color: C.ink, weight: 600 });
    M('tenure is almost age minus 22', 902, 210, { size: 12.5, color: C.muted });
    M('condition number ' + COL.ci[3].toFixed(1), 902, 248, { size: 13.5, color: C.coral });
    M('Belsley indices: ' + COL.ci.map(v => v.toFixed(1)).join(' · '), 902, 276, { size: 11.5, color: C.muted });
    M('largest index carries age 0.99,', 902, 296, { size: 11.5, color: C.muted }); M('tenure 0.96', 902, 312, { size: 11.5, color: C.muted });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(64, 476, 1152, 90, C.coral);
    M('exactly dependent predictors → PULSE_MATRIX_SINGULAR with rank, condition_number and dependent_fields', 86, 510, { size: 13, color: C.coral });
    M('drop or combine the named fields; a repair cannot fix a real dependency', 86, 538, { size: 13, color: C.ink });
  });
}

/* ---------- 11. distance ---------- */
function sDist(t) {
  CAP('MAT_DISTANCE · how far apart are the segments\' centres?', 64, 124, { color: C.violet });
  const pos = { Bronze: [150, 450], Silver: [255, 349], Gold: [476, 298] }, col = { Bronze: C.amber, Silver: C.muted, Gold: C.violet };
  DIST.keys.forEach((k, i) => A(seg(t, 0.3 + i * 0.2, 0.7 + i * 0.2), () => { const [x, y] = pos[k]; dot(x, y, 10 + DIST.n[i] / 12, col[k]); M(k + ' · n ' + DIST.n[i], x + (k === 'Silver' ? -22 : 22), y + (k === 'Silver' ? -22 : 5), { align: k === 'Silver' ? 'right' : 'left', size: 13, color: col[k] }); }));
  A(seg(t, 1.4, 1.8), () => [['Bronze', 'Silver', 0.728, -44, -6], ['Silver', 'Gold', 1.136, -10, -14], ['Bronze', 'Gold', 1.800, 10, 26]].forEach(([a, b, d, ox, oy]) => {
    const [x1, y1] = pos[a], [x2, y2] = pos[b]; Ln([[x1, y1], [x2, y2]], { stroke: C.faint, dash: [4, 4] }); M(d.toFixed(2), (x1 + x2) / 2 + ox, (y1 + y2) / 2 + oy, { size: 13, color: C.ink });
  }));
  A(seg(t, 1.4, 1.8), () => M('a sketch: the real centres live in six dimensions', 120, 500, { size: 11.5, color: C.faint }));
  A(seg(t, 2.6, 3.0), () => { M('standardized centroids', 640, 156, { size: 12.5, color: C.muted }); heat(720, 186, 62, DIST.keys, DIST.cz, { t, at: 2.6, colKeys: ITEMS, scale: 0.6, step: 0.02, fs: 10.5 }); });
  A(seg(t, 2.8, 3.2), () => M('Gold rates service higher and value lower', 720, 400, { size: 12.5, color: C.amber }));
  A(seg(t, 4.4, 4.8), () => {
    card(640, 424, 576, 142);
    M('"between": any grouper, an embedder\'s own included', 662, 456, { size: 13, color: C.ink });
    M('"metric": euclidean · sqeuclidean · manhattan · chebyshev ·', 662, 484, { size: 12.5, color: C.muted });
    M('cosine · mahalanobis (pooled within-segment covariance)', 662, 506, { size: 12.5, color: C.muted });
    M('"standardize": true z-scores first · centres only, no p-values', 662, 538, { size: 12.5, color: C.muted });
  });
}

/* ---------- 12. per group ---------- */
function sGroup(t) {
  CAP('WITH "groups": ONE MATRIX PER BUCKET', 64, 124, { color: C.violet });
  const B = [['Bronze', C.amber], ['Gold', C.violet], ['Silver', C.muted]];
  B.forEach(([k, c], b) => A(seg(t, 0.3 + b * 0.4, 0.7 + b * 0.4), () => {
    const x = 120 + b * 380, rows = GRP[k];
    M(k, x, 168, { size: 15, color: c, weight: 600 });
    M('group_key ["' + k + '"]', x + 300, 168, { size: 11.5, color: C.muted, align: 'right' });
    heat(x, 200, 48, ['s1', 's2'], rows, { t, at: 0.3 + b * 0.4, colKeys: ITEMS, step: 0.02, fs: 10, upper: true });
  }));
  A(seg(t, 1.8, 2.2), () => M('the first two rows of each, upper encoding', 120, 320, { size: 12, color: C.faint }));
  A(seg(t, 2.6, 3.0), () => {
    card(64, 350, 1152, 110, C.violet);
    M('each bucket equals the ungrouped matrix over exactly its rows', 86, 384, { size: 13.5, color: C.ink, weight: 600 });
    M('Gold: s2 · v1 0.33, s2 · v2 0.30 · Bronze and Silver near 0: compare buckets as separate answers', 86, 412, { size: 13, color: C.amber });
    M('same order as Response.data · a thin bucket comes back with nulls and PULSE_MATRIX_INSUFFICIENT_N', 86, 440, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.4, 4.8), () => {
    card(64, 476, 1152, 90);
    M('predict sizes the run first: bucket_basis · estimated_buckets · estimated_cells · estimated_bytes', 86, 510, { size: 13, color: C.ink });
    M('a range or date grouper is "unknown": the estimates are left out, never guessed', 86, 538, { size: 12.5, color: C.muted });
  });
}

/* ---------- 13. no p-values ---------- */
function sNoP(t) {
  CAP('A MATRIX DESCRIBES · A TEST DECIDES', 64, 124, { color: C.amber });
  A(seg(t, 0.3, 0.7), () => {
    card(64, 150, 560, 210, C.amber);
    M('matrices carry figures, not p-values', 86, 184, { size: 14, color: C.amber, weight: 600 });
    M('15 cells in a six-member grid: some will look strong by luck', 86, 214, { size: 13, color: C.ink });
    M('nothing corrects across the cells', 86, 240, { size: 13, color: C.ink });
    M('need a p for one pair? TEST_PEARSON_R on it', 86, 280, { size: 13, color: C.teal });
    M('treat the grid as descriptive', 86, 306, { size: 13, color: C.muted });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 150, 560, 210, C.violet);
    CAP('VECTORS ELSEWHERE · TODAY', 678, 178, { color: C.violet });
    M('tests on a whole profile', 678, 210, { size: 13, color: C.ink });
    chips(['TEST_HOTELLING_T2', 'TEST_MANOVA', 'TEST_BOX_M', 'TEST_BARTLETT_SPHERICITY', 'TEST_MARDIA'].map(s => [s, C.violet]), 678, 222, 520, { size: 11.5 });
    M('a score per row', 678, 300, { size: 13, color: C.ink });
    chips(['ATTR_MAHALANOBIS', 'ATTR_PC_SCORE', 'ATTR_FACTOR_SCORE', 'GROUP_KMEANS'].map(s => [s, C.teal]), 678, 312, 520, { size: 11.5 });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 380, 1152, 100);
    M('coefficient covariance of a fitted model is not a matrix slot:', 86, 414, { size: 13, color: C.ink });
    M('set "vcov": true on the regression', 86, 442, { size: 13, color: C.amber });
  });
}

/* ---------- 14. cost and paths ---------- */
function sCost(t) {
  CAP('PREDICT KNOWS THE COST BEFORE A ROW IS READ', 64, 124, { color: C.teal });
  const P = [['MAT_CORRELATION · pairwise · upper', [['shape', '[6, 6]'], ['accumulator_bytes', '1208'], ['streamable', 'true'], ['pairwise_psd_risk', 'true']], C.teal],
    ['MAT_CORRELATION · spearman', [['shape', '[6, 6]'], ['row_buffer_bytes', '16800'], ['streamable', 'false'], ['pairwise_psd_risk', 'false']], C.coral]];
  P.forEach(([h, L, col], k) => A(seg(t, 0.3 + k * 1.4, 0.7 + k * 1.4), () => {
    const x = 64 + k * 590; card(x, 150, 562, 200, col);
    CAP(h, x + 22, 178, { color: col });
    L.forEach(([a, b], i) => { M(a, x + 22, 214 + i * 30, { size: 13.5, color: C.muted }); M(b, x + 540, 214 + i * 30, { size: 13.5, align: 'right', color: C.ink }); });
  }));
  A(seg(t, 3.2, 3.6), () => {
    card(64, 370, 1152, 196);
    M('Pearson and covariance co-moments stream and merge in fixed blocks of 4,096 records', 86, 404, { size: 13.5, color: C.ink });
    M('serial, parallel-decode and sharded runs give bit-identical matrices on one cohort file', 86, 432, { size: 13, color: C.teal });
    M('a multi-shard archive matches its single-file twin within rounding', 86, 458, { size: 13, color: C.muted });
    M('refused: matrices with joins (PULSE_MATRIX_UNSUPPORTED_SOURCE) · matrices with a crosstab (PULSE_MATRIX_HOST_CONFLICT)', 86, 498, { size: 12.5, color: C.coral });
    M('weights: frequency and probability fold in; a weight-0 row counts in n and adds no mass', 86, 530, { size: 12.5, color: C.muted });
  });
}

/* ---------- 15. recap ---------- */
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('TODAY', 64, 124, { color: C.violet });
    [['GRIDS', 'MAT_COVARIANCE · MAT_CORRELATION · MAT_PARTIAL_CORRELATION'], ['SCALES AND STRUCTURE', 'MAT_RELIABILITY · MAT_PCA · MAT_FACTOR'], ['CHECKS AND SEGMENTS', 'MAT_COLLINEARITY · MAT_DISTANCE'],
     ['KNOBS', 'missing · repair · method · encoding · weight · groups']].forEach(([h, ops], k) => A(seg(t, 0.2 + k * 0.4, 0.6 + k * 0.4), () => {
      const y = 150 + k * 54; M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, k === 3 ? C.amber : C.violet]), 300, y, 916, { size: 12 });
    }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 400, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 428, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 452, { size: 14.5 });
      R(650, 400, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('built in today', 668, 428, { size: 14, color: C.amber, weight: 600 }); T('your own groupers can still drive MAT_DISTANCE', 668, 452, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('MATRICES', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('check the members and the n before you read a cell', 640, 430, { size: 15, align: 'center' });
    M('next: overlays', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[4.587, 5.248, 4.864, 8.085, 9.152, 5.419, 7.147, 4.501, 3.435, 7.488, 6.037, 4.629, 6.016, 5.611, 8.661, 2.411, 5.44, 5.419, 5.12, 6.336, 4.971, 5.333, 7.744, 5.141, 3.648, 6.72, 3.733, 6.741, 4.971, 7.36, 5.099, 4.693, 5.931, 3.904, 5.781, 4.416, 5.333, 2.731, 6.229, 4.075, 5.205, 4.736, 3.179, 5.931, 4.949, 5.696, 4.288, 4.587, 5.355, 1.984, 7.979, 8.981, 9.792, 4.715, 1.152]/*END*/;
PulseFilm.mount({
  series: 'PULSE · MATRICES',
  narr: NARR,
  scenes: [
    { name: 'Pulse Matrices', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse matrices. Every field against every field, taken apart in depth.', true]] },
    { name: 'Where they run', dur: 8.4, draw: sWhere, caps: [
      [0, 'Matrices fold the records that pass the filters, during the same scan as everything else.'],
      [2.8, 'You name a battery of numeric fields once as a vector, then ask for a matrix over it.'],
      [5.0, 'Each result carries the matrix, extra figures, and any data-quality warnings. It arrives at the end of the run, never row by row.'],
      [6.8, 'Its components count the rows used and dropped. Our cohort is three hundred illustrative survey rows, and every figure here is a real Pulse result.']] },
    { name: 'Vectors', dur: 6.4, draw: sVectors, caps: [
      [0, 'A vector lists its members by name, by glob, or by pattern, with optional display labels.'],
      [2.8, 'Members are numeric. Yes-or-no fields join when coerced to zero and one. Categories and dates are refused.'],
      [4.6, 'Predict echoes the resolved members, so you can check a glob before you trust it.']] },
    { name: 'Correlation', dur: 7.8, draw: sCor, caps: [
      [0, 'The correlation matrix puts every member against every other.'],
      [2.6, 'Here two blocks stand out: the service items move together, and so do the value items. Top pairs lists the strongest cells.'],
      [4.6, 'The covariance matrix is the same grid in the fields\' own units, with variances on the diagonal.'],
      [6.2, 'Upper encoding sends half the grid. An undefined cell is null, never zero.']] },
    { name: 'Missing data', dur: 6.4, draw: sMissing, caps: [
      [0, 'One item is blank on thirty rows. Listwise, the default, drops those rows from every cell.'],
      [2.2, 'Pairwise lets each cell use every row where both members are present, and reports each pair\'s count.'],
      [4.4, 'But a pairwise grid can stop being a valid correlation matrix. Decompositions then refuse it, unless you ask for the nearest valid repair.']] },
    { name: 'Ranks', dur: 5.6, draw: sRank, caps: [
      [0, 'Pearson reads values along a straight line.'],
      [1.6, 'Spearman and Kendall read ranks instead, which suits ordinal scales, outliers and curves.'],
      [3.6, 'Ranks need every row, so these run buffered and serially, and take frequency weights only.']] },
    { name: 'Partial correlation', dur: 6.4, draw: sPartial, caps: [
      [0, 'Partial correlation asks what is left of each link once the other members are held fixed.'],
      [3.0, 'S1 and s2 drop from point seven four to point five two: part of their link runs through s3.', 'S one and S two drop from point seven four to point five two. Part of their link runs through S three.'],
      [4.6, 'You can choose which fields to control for. Collinear fields are refused as singular.']] },
    { name: 'Reliability', dur: 8.4, draw: sRel, caps: [
      [0, 'Reliability asks whether several items measure one scale. Here r4 is reverse-keyed.', 'Reliability asks whether several items measure one scale. Here R four is reverse-keyed.'],
      [1.4, 'Left as it is, alpha collapses to point one nine. A low or negative alpha usually means an item was not reversed.'],
      [3.6, 'Reverse it on its one-to-seven range, and alpha and omega both reach point eight nine.'],
      [5.2, 'Per item, dropping any one would lower alpha, so all four stay.'],
      [6.6, 'The range is required and never guessed. Omega can come back null with a warning, while alpha always computes.']] },
    { name: 'PCA', dur: 7.6, draw: sPCA, caps: [
      [0, 'Principal components ask how many dimensions carry the variance.'],
      [1.6, 'Two eigenvalues sit above one, so Kaiser\'s rule keeps two components, with seventy-seven percent of the variance.'],
      [2.8, 'The loadings show service items on the first component and value items on the second.'],
      [4.4, 'KMO and Bartlett say the battery is worth factoring. Varimax rotation sharpens the pattern, and signs are free.'],
      [6.0, 'PCA summarizes variance. A model of hidden causes is factor analysis.']] },
    { name: 'Factor analysis', dur: 7.2, draw: sFactor, caps: [
      [0, 'Factor analysis models each item as the echo of a few hidden qualities.'],
      [2.4, 'The loadings say how strongly each item reflects its factor, and the uniqueness is what the factors miss.'],
      [3.6, 'Maximum likelihood adds fit figures. Here two factors fit well.'],
      [5.4, 'A uniqueness at or below zero, or too many factors for the items, comes back with a warning.']] },
    { name: 'Collinearity', dur: 7.2, draw: sCol, caps: [
      [0, 'Collinearity checks whether candidate predictors are too alike to fit together.'],
      [1.8, 'Age and tenure correlate at point nine eight, so their variance inflation factors pass twenty.'],
      [3.6, 'Belsley\'s condition indices point to the same pair.'],
      [5.4, 'Exactly dependent predictors are refused as singular, with the fields named. Drop or combine them.']] },
    { name: 'Distance', dur: 6.6, draw: sDist, caps: [
      [0, 'Distance measures how far apart the centres of a grouper\'s buckets lie.'],
      [2.6, 'Standardized, Gold rates service higher and value lower, so it sits furthest from Bronze.'],
      [4.4, 'Any grouper can split the rows, including an embedder\'s own, and you choose the metric.']] },
    { name: 'Per group', dur: 6.4, draw: sGroup, caps: [
      [0, 'Add groups, and every matrix comes back once per bucket.'],
      [2.6, 'Each bucket equals the ungrouped matrix over exactly its rows. Compare them as separate answers.'],
      [4.4, 'Predict estimates the buckets and bytes first, and leaves the estimate out when it cannot know.']] },
    { name: 'No p-values', dur: 6.6, draw: sNoP, caps: [
      [0, 'A matrix describes. It carries figures, not p-values, and nothing corrects across its cells.'],
      [2.6, 'Vectors also feed tests on whole profiles, and scores for every row.'],
      [4.8, 'The coefficient covariance of a fitted model lives on the regression, not here.']] },
    { name: 'Cost and paths', dur: 6.4, draw: sCost, caps: [
      [0, 'Predict reports each matrix\'s shape, memory and streamability before any row is read.'],
      [1.7, 'A rank method buffers every row.'],
      [3.2, 'Streaming matrices merge in fixed blocks, so serial, parallel and sharded runs agree. Joins and crosstabs are refused.']] },
    { name: 'The toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the toolkit today: grids, scales and structure, checks and segments, with knobs for missing data, repair, ranks, encoding, weights and groups.'],
      [3.4, 'More are added over time, and the manifest always shows what your instance offers. Matrix operators are built in, but your own groupers can drive distance.'],
      [6.4, 'Remember: check the members and the n before you read a cell. Next up, overlays.'],
      [9.0, '', 'Pulse matrices.', true]] },
  ],
});
})();
