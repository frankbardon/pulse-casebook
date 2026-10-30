/* Pulse Crosstabs: film 15 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts, operators listed as "today".
 * The cohort is an illustrative 600-respondent, two-wave brand tracker (data/generate.js, seed 15). Brand is
 * asked only of the respondents aware of the category. Every figure on a result card is copied from a
 * recorded alpha.33 run in data/ (see data/README.md); the comment beside each constant names the run.
 * Overlays are film 16: this film shows pairwise letters once, as the way to compare cells, and stops there. */
(() => {
const { C } = PulseFilm;
const { seg, eo, R, T, M, CAP, Ln, A, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });

const REG = ['East', 'North', 'South', 'West'], BR = ['Acorn', 'Birch', 'Cedar'], WV = ['W1', 'W2'];
const XA = [[22, 30, 41], [65, 37, 32], [33, 41, 27], [32, 37, 23]], RMA = [93, 134, 101, 92], CMA = [152, 145, 123], GA = 420;   // a
const TOTN = [142, 190, 143, 125], TOTS = [0.2367, 0.3167, 0.2383, 0.2083], TOTG = 600;                                          // tot
const COL = [[0.1447, 0.2069, 0.3333], [0.4276, 0.2552, 0.2602], [0.2171, 0.2828, 0.2195], [0.2105, 0.2552, 0.187]];            // ac
const ROW = [[0.2366, 0.3226, 0.4409], [0.4851, 0.2761, 0.2388], [0.3267, 0.4059, 0.2673], [0.3478, 0.4022, 0.25]];             // nr
const TTL = [[0.0524, 0.0714, 0.0976], [0.1548, 0.0881, 0.0762], [0.0786, 0.0976, 0.0643], [0.0762, 0.0881, 0.0548]];           // nt
const MEAN = [[6.6094, 7.2048], [6.2154, 6.4545], [6.1071, 6.2656]], MRM = [6.9456, 6.3451, 6.1917], MCM = [6.3189, 6.6786], MG = 6.5159;  // m
const NW = [[0.2105, 0.4211, 0.3684, 0.2545, 0.2545, 0.4909], [0.4677, 0.2581, 0.2742, 0.5, 0.2917, 0.2083],
  [0.2745, 0.4118, 0.3137, 0.38, 0.4, 0.22], [0.359, 0.3846, 0.2564, 0.3396, 0.4151, 0.2453]];                                  // nw
const NL = [[0.0421, 0.0842, 0.0737, 0.0609, 0.0609, 0.1174], [0.1526, 0.0842, 0.0895, 0.1565, 0.0913, 0.0652],
  [0.0737, 0.1105, 0.0842, 0.0826, 0.087, 0.0478], [0.0737, 0.0789, 0.0526, 0.0783, 0.0957, 0.0565]];                           // nl
const CBASE = [[65, 87], [68, 77], [57, 66]], CMB = [190, 230], CGB = 420, CMM = [6.3189, 6.6786], CGM = 6.5159;               // cells
const WCOL = [[0.1392, 0.2064, 0.3511], [0.4382, 0.2537, 0.2716], [0.2148, 0.282, 0.2072], [0.2078, 0.2579, 0.17]];             // w
const WRM = [93.42, 133.386, 97.484, 88.351], WCM = [143.463, 145.484, 123.694], WG = 412.641, WNEFF = 383.5;                  // w (n_eff 383.54)
const XW = [[6.3854, 6.6834], [6.4971, 6.9696], [6.1797, 6.4248], [6.1591, 6.7264]], XRM = [6.5341, 6.7136, 6.2987, 6.4481];    // aux
const XCM = [6.3298, 6.7184], XG = 6.5183, XBASE = [139, 186, 138, 123], XCB = [293, 293], XGB = 586, XNULL = [3, 4, 5, 2];     // aux
const INT = ['Unlikely', 'Maybe', 'Likely'], LAB = [[0.3633, 0.32], [0.38, 0.3833], [0.2567, 0.2967]], LRM = [205, 229, 166];   // lab, laba
const SIG = [[0.2366, 0.4851, 0.3267, 0.3478], [0.3226, 0.2761, 0.4059, 0.4022], [0.4409, 0.2388, 0.2673, 0.25]];               // sig
const LET = ['A', 'B', 'C', 'D'], ABOVE = [[[], ['A', 'C', 'D'], [], []], [[], [], ['B'], ['B']], [['B', 'C', 'D'], [], [], []]]; // sig letters
const PCOUNT = 18;                                                                                                               // sig.predict p_values.total

const pct = v => Math.round(v * 100) + '%';
const f2 = v => v.toFixed(2);

/* A crosstab grid. rows/cols: key labels. V: cells. o: { rm, cm, g, fmt, mfmt, at, t, hi: [[i, j, colour]], hiRow, hiCol, cw, ch, fs } */
function xt(x, y, rows, cols, V, o = {}) {
  const t = o.t ?? 99, at = o.at ?? -9, cw = o.cw ?? 104, ch = o.ch ?? 46, fs = o.fs ?? 18;
  const fmt = o.fmt || String, mfmt = o.mfmt || String, nc = cols.length;
  A(seg(t, at, at + 0.3), () => {
    cols.forEach((k, j) => M(k, x + j * cw + cw / 2, y - 12, { size: 12.5, align: 'center', color: C.muted }));
    rows.forEach((k, i) => M(k, x - 12, y + i * ch + ch / 2 + 5, { size: 13, align: 'right', color: C.teal }));
    if (o.rm) M(o.rmLabel || 'row margin', x + nc * cw + 12 + cw / 2, y - 12, { size: 12, align: 'center', color: C.violet });
    if (o.cm) M(o.cmLabel || 'col margin', x - 12, y + rows.length * ch + 12 + ch / 2 + 5, { size: 12, align: 'right', color: C.violet });
  });
  const hi = (i, j) => (o.hi || []).find(h => h[0] === i && h[1] === j);
  rows.forEach((_, i) => cols.forEach((__, j) => A(seg(t, at + 0.1 + (i + j) * 0.05, at + 0.4 + (i + j) * 0.05), () => {
    const h = hi(i, j);
    R(x + j * cw + 2, y + i * ch + 2, cw - 4, ch - 4, { fill: h ? h[3] || C.panel2 : C.panel, stroke: h ? h[2] : C.rule, lw: h ? 2 : 1.3 });
    T(fmt(V[i][j]), x + j * cw + cw / 2, y + i * ch + ch / 2 + 6, { size: fs, weight: 700, align: 'center' });
  })));
  const ma = seg(t, at + 0.5, at + 0.8);
  if (o.rm) A(ma, () => o.rm.forEach((v, i) => {
    const h = hi(i, 'r');
    R(x + nc * cw + 14, y + i * ch + 2, cw - 4, ch - 4, { fill: C.violetS, stroke: h ? h[2] : C.violet, lw: h ? 2.2 : 1.1 });
    T(mfmt(v), x + nc * cw + 12 + cw / 2, y + i * ch + ch / 2 + 6, { size: fs - 1, weight: 600, align: 'center' });
  }));
  if (o.cm) A(ma, () => o.cm.forEach((v, j) => {
    const h = hi('c', j);
    R(x + j * cw + 2, y + rows.length * ch + 14, cw - 4, ch - 4, { fill: C.violetS, stroke: h ? h[2] : C.violet, lw: h ? 2.2 : 1.1 });
    T(mfmt(v), x + j * cw + cw / 2, y + rows.length * ch + 12 + ch / 2 + 6, { size: fs - 1, weight: 600, align: 'center' });
  }));
  if (o.g != null) A(ma, () => {
    const gx = x + nc * cw + 14, gy = y + rows.length * ch + 14, h = hi('g', 'g');
    R(gx, gy, cw - 4, ch - 4, { fill: C.violetS, stroke: h ? h[2] : C.ink, lw: 1.8 });
    T(mfmt(o.g), gx + (cw - 4) / 2, gy + ch / 2 + 4, { size: fs - 1, weight: 700, align: 'center' });
  });
}
/* request JSON lines, coloured per role */
function code(lines, x, y, t, at, o = {}) {
  lines.forEach(([s, c], i) => A(seg(t, at + i * 0.12, at + 0.3 + i * 0.12), () => M(s, x, y + i * (o.lh ?? 24), { size: o.size ?? 14, color: c || C.ink })));
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  const x0 = 520, y0 = 220, cw = 64, ch = 40;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A(seg(t, 0.1 + (i + j) * 0.08, 0.4 + (i + j) * 0.08), () => R(x0 + j * cw, y0 + i * ch, cw - 4, ch - 4, { fill: C.panel, stroke: C.teal }));
  A(seg(t, 0.8, 1.2), () => {
    for (let i = 0; i < 3; i++) R(x0 + 3 * cw + 8, y0 + i * ch, cw - 4, ch - 4, { fill: C.violetS, stroke: C.violet });
    for (let j = 0; j < 3; j++) R(x0 + j * cw, y0 + 3 * ch + 8, cw - 4, ch - 4, { fill: C.violetS, stroke: C.violet });
    R(x0 + 3 * cw + 8, y0 + 3 * ch + 8, cw - 4, ch - 4, { fill: C.violetS, stroke: C.ink });
  });
  A(seg(t, 1.2, 1.7), () => T('Rows by columns, with the margins around them', 640, 470, { size: 24, align: 'center', color: C.muted }));
}

/* ---------- 1. one cell, two axes (a) ---------- */
function sShape(t) {
  CAP('REQUEST.CROSSTAB · data/a.json', 64, 124, { color: C.teal });
  card(64, 140, 470, 236, C.teal);
  code([['"crosstab": {', C.ink], ['  "rows":    [ GROUP_CATEGORY region ],', C.teal], ['  "columns": [ GROUP_CATEGORY brand ],', C.teal],
    ['  "cell":    { AGG_COUNT id, "label": "n" },', C.violet], ['  "margins": { rows, columns, grand } }', C.violet]], 84, 178, t, 0.2, { lh: 34 });
  A(seg(t, 1.6, 2.0), () => M('any grouper on either axis · several nest', 84, 360, { size: 12.5, color: C.muted }));
  xt(700, 176, REG, BR, XA, { t, at: 2.4, rm: RMA, cm: CMA, g: GA, cw: 100, ch: 48 });
  A(seg(t, 4.2, 4.6), () => {
    card(64, 400, 470, 170);
    CAP('THE RESPONSE', 84, 428);
    M('Response.Crosstab.Matrix', 84, 460, { size: 14, color: C.ink });
    M('row_keys · column_keys · cells', 84, 488, { size: 13, color: C.muted });
    M('row_margins · column_margins · grand_total', 84, 512, { size: 13, color: C.violet });
    M('Response.Components.Crosstab: counts per cell', 84, 546, { size: 12.5, color: C.amber });
  });
}

/* ---------- 2. not with groups (g) ---------- */
function sGroups(t) {
  CAP('ONE OR THE OTHER · data/g.json', 64, 124, { color: C.coral });
  card(64, 140, 560, 220, C.coral);
  code([['{ "groups":       [ GROUP_CATEGORY wave ],', C.muted], ['  "aggregations": [ AGG_COUNT id ],', C.muted], ['  "crosstab":     { rows region · columns brand', C.teal], ['                   cell AGG_COUNT id } }', C.teal]], 84, 180, t, 0.2, { lh: 32 });
  A(seg(t, 1.4, 1.8), () => {
    R(84, 304, 520, 36, { fill: C.coralS, stroke: C.coral });
    M('✕ PULSE_CROSSTAB_CONFLICTS_WITH_GROUPS', 100, 328, { size: 14, color: C.coral, weight: 600 });
  });
  A(seg(t, 1.8, 2.2), () => {
    card(656, 140, 560, 220);
    CAP('WHICH TO REACH FOR', 678, 168);
    [['one figure per key, no totals', 'groups + aggregations', C.muted], ['margins, row % or column %', 'crosstab', C.teal], ['several figures per cell', 'crosstab cells', C.violet], ['compare cells statistically', 'crosstab + overlays', C.amber]]
      .forEach(([a, b, c], i) => { M(a, 678, 206 + i * 38, { size: 13.5, color: C.ink }); M(b, 1196, 206 + i * 38, { size: 13.5, color: c, align: 'right' }); });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 386, 1152, 120);
    M('a crosstab replaces groups and aggregations; it does not sit beside them', 86, 424, { size: 14, color: C.ink });
    M('tests, post-tests and regressions still run beside it, on the raw rows', 86, 456, { size: 13, color: C.muted });
    M('the message: "crosstab cannot coexist with top-level groups or aggregations on the same request"', 86, 486, { size: 12, color: C.faint });
  });
}

/* ---------- 3. who counts (a, tot) ---------- */
function sAsked(t) {
  CAP('A RECORD REACHES A MARGIN ONLY IF IT REACHED A CELL · data/a.json, data/tot.json', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 360, 150);
    T('600', 84, 200, { size: 40, weight: 800 }); M('respondents in the cohort', 180, 194, { size: 13, color: C.muted });
    T('420', 84, 262, { size: 40, weight: 800, color: C.teal }); M('aware, so asked about brand', 180, 250, { size: 13, color: C.teal }); M('180 have no brand: null', 180, 272, { size: 13, color: C.coral });
  });
  const hi = [[0, 'r', C.coral], ['g', 'g', C.coral]];
  xt(620, 176, REG, BR, XA, { t, at: 0.8, rm: RMA, cm: CMA, g: GA, cw: 100, ch: 48, hi: seg(t, 1.8, 2.0) > 0 ? hi : [] });
  A(seg(t, 1.8, 2.2), () => {
    card(64, 316, 360, 150, C.coral);
    CAP('EAST', 84, 344, { color: C.coral });
    M('142 respondents', 84, 374, { size: 14, color: C.ink }); M('49 not asked: no cell, so no margin', 84, 400, { size: 13, color: C.coral });
    M('row margin 93 · grand total 420', 84, 432, { size: 14, color: C.violet });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 486, 1152, 84, C.violet);
    M('normalize: column → East is 14% of Acorn users: 22 of Acorn\'s 152', 86, 520, { size: 14, color: C.ink });
    M('a column percent is a share of those asked · null, empty and include-excluded keys move no denominator', 86, 548, { size: 12.5, color: C.muted });
  });
}

/* ---------- 4. margins from raw rows (m) ---------- */
function sRaw(t) {
  CAP('AGG_AVERAGE score · rows brand · columns wave · data/m.json', 64, 124, { color: C.violet });
  xt(170, 186, BR, WV, MEAN, { t, at: 0.2, rm: MRM, cm: MCM, g: MG, fmt: f2, mfmt: f2, cw: 120, ch: 52, hi: seg(t, 1.6, 1.8) > 0 ? [[0, 'r', C.amber]] : [] });
  A(seg(t, 1.6, 2.0), () => {
    card(640, 160, 576, 176, C.amber);
    CAP('ACORN, BOTH WAVES', 662, 188, { color: C.amber });
    M('average of its two cells: (6.61 + 7.20) / 2 = 6.91', 662, 222, { size: 14, color: C.faint });
    M('the row margin, from Acorn\'s raw rows: 6.95', 662, 252, { size: 15, color: C.violet, weight: 600 });
    M('the waves hold different numbers of Acorn users', 662, 286, { size: 13, color: C.muted });
    M('(65 in W1, 87 in W2), so the cells do not average to it', 662, 308, { size: 13, color: C.muted });
  });
  A(seg(t, 3.4, 3.8), () => {
    card(640, 356, 576, 214);
    CAP('THE MANIFEST CLASSIFIES EACH CELL AGGREGATOR', 662, 384);
    [['summable', 'cells add up to the margin: counts, sums'], ['mean-reducible', 'averages, ratios, weighted means'], ['independent', 'own margin accumulator: distinct counts'], ['recompute', 'a raw-row rescan: medians, percentiles']]
      .forEach(([a, b], i) => { M(a, 662, 420 + i * 34, { size: 13.5, color: C.violet }); M(b, 840, 420 + i * 34, { size: 12.5, color: C.muted }); });
    M('crosstab section · "today"; more aggregators are added over time', 662, 556, { size: 11.5, color: C.faint });
  });
  A(seg(t, 3.4, 3.8), () => M('distinct-count margins are the union: a respondent in two rows counts once', 64, 548, { size: 12.5, color: C.muted }));
}

/* ---------- 5. normalize (ac, nr, nt) ---------- */
function sNorm(t) {
  CAP('"normalize": none · row · column · total · data/ac.json, nr.json, nt.json', 64, 124, { color: C.violet });
  const P = [['column', COL, 'of each brand\'s users', 1.0], ['row', ROW, 'of each region\'s brand users', 2.6], ['total', TTL, 'of everyone asked', 4.2]];
  P.forEach(([k, V, d, at], n) => {
    const x = 120 + n * 380, y = 232;
    A(seg(t, at - 0.4, at), () => { M('"' + k + '"', x + 108, 156, { size: 15, color: C.violet, weight: 600, align: 'center' }); M(d, x + 108, 176, { size: 12, color: C.muted, align: 'center' }); });
    xt(x, y, REG, BR, V, { t, at, fmt: pct, cw: 72, ch: 44, fs: 15, hi: [[1, 0, C.violet]] });
  });
  A(seg(t, 1.4, 1.8), () => M('North is 43% of Acorn users', 228, 438, { size: 13, color: C.ink, align: 'center' }));
  A(seg(t, 3.0, 3.4), () => M('49% of North picks Acorn', 608, 438, { size: 13, color: C.ink, align: 'center' }));
  A(seg(t, 4.6, 5.0), () => M('North Acorn is 15% of all 420', 988, 438, { size: 13, color: C.ink, align: 'center' }));
  A(seg(t, 5.6, 6.0), () => {
    card(64, 462, 1152, 106);
    M('each cell ÷ the matching margin · it needs no "margins" flag', 86, 492, { size: 14, color: C.ink });
    M('a zero margin leaves the cell present: false; no zero is invented', 86, 520, { size: 13, color: C.coral });
    M('matrix.normalize_applied echoes the direction', 86, 546, { size: 12.5, color: C.amber });
  });
}

/* ---------- 6. nested axes (nw, nl) ---------- */
function sNested(t) {
  CAP('COLUMNS = [ wave, brand ] · data/nw.json, data/nl.json', 64, 124, { color: C.teal });
  const cols = ['Acorn', 'Birch', 'Cedar', 'Acorn', 'Birch', 'Cedar'], x = 300, cw = 82;
  const which = seg(t, 3.0, 3.4) > 0 ? 1 : 0, V = which ? NL : NW;
  A(seg(t, 0.2, 0.5), () => {
    R(x + 2, 150, cw * 3 - 4, 24, { fill: C.tealS, stroke: C.teal }); M('W1', x + cw * 1.5, 167, { size: 13, color: C.teal, align: 'center' });
    R(x + cw * 3 + 2, 150, cw * 3 - 4, 24, { fill: C.tealS, stroke: C.teal }); M('W2', x + cw * 4.5, 167, { size: 13, color: C.teal, align: 'center' });
  });
  xt(x, 204, REG, cols, V, { t, at: which ? 3.2 : 0.4, fmt: pct, cw, ch: 44, fs: 15, hi: which ? [[1, 0, C.violet], [1, 3, C.violet]] : [[0, 2, C.violet], [0, 5, C.violet]] });
  A(seg(t, 1.2, 1.6) * (1 - seg(t, 3.0, 3.2)), () => {
    card(64, 420, 1152, 150, C.violet);
    M('"normalize": "row", "normalize_within": 0', 86, 454, { size: 15, color: C.violet, weight: 600 });
    M('fixes the first column grouper, wave, in the denominator: each region\'s brand shares sum to 1 within a wave', 86, 486, { size: 13, color: C.ink });
    M('East\'s Cedar share: 37% in W1 → 49% in W2', 86, 520, { size: 14, color: C.ink });
    M('within reads the opposite axis; out of range is PULSE_CROSSTAB_NORMALIZE_WITHIN_OUT_OF_RANGE', 86, 550, { size: 12, color: C.muted });
  });
  A(seg(t, 3.2, 3.6), () => {
    card(64, 420, 1152, 150, C.violet);
    M('"normalize": "column", "normalize_level": 0', 86, 454, { size: 15, color: C.violet, weight: 600 });
    M('rolls the same axis up: cells sharing the first column grouper sum to 1, so each is a share of its whole wave', 86, 486, { size: 13, color: C.ink });
    M('North Acorn: 15% of wave 1 · 16% of wave 2', 86, 520, { size: 14, color: C.ink });
    M('both compose · neither combines with "total"', 86, 550, { size: 12, color: C.muted });
  });
}

/* ---------- 7. the Total column (tot) ---------- */
function sTotal(t) {
  CAP('NO "columns" · data/tot.json', 64, 124, { color: C.teal });
  card(64, 146, 520, 150, C.teal);
  code([['"crosstab": {', C.ink], ['  "rows": [ GROUP_CATEGORY region ],', C.teal], ['  "cell": { AGG_COUNT id }, "normalize": "column" }', C.violet]], 84, 186, t, 0.2, { lh: 32 });
  xt(800, 186, REG, ['Total'], TOTS.map(v => [v]), { t, at: 1.2, fmt: pct, rm: TOTN, cm: [TOTG], g: TOTG, rmLabel: 'records', cw: 120, ch: 50 });
  A(seg(t, 1.6, 2.0), () => {
    card(64, 316, 520, 160);
    CAP('ONE IMPLICIT COLUMN', 84, 344);
    M('column_keys [["Total"]] · header type TOTAL', 84, 376, { size: 13.5, color: C.amber });
    M('every record whose row key resolved: all 600', 84, 406, { size: 13.5, color: C.ink });
    M('its column percent sums to 1 · North is 32%', 84, 436, { size: 13.5, color: C.ink });
  });
  A(seg(t, 3.4, 3.8), () => {
    card(64, 496, 1152, 72);
    M('row-scope comparisons compare the rows · the Total column gets no letter · column-axis level and within are out of range', 86, 538, { size: 12.5, color: C.muted });
  });
}

/* ---------- 8. several measures (cells) ---------- */
function sCells(t) {
  CAP('"cells": several measures, one stub row each · data/cells.json', 64, 124, { color: C.violet });
  card(64, 146, 470, 150, C.violet);
  code([['"cells": [', C.ink], ['  { AGG_COUNT id, "label": "base" },', C.violet], ['  { AGG_AVERAGE score, "label": "mean_score" } ]', C.violet]], 84, 186, t, 0.2, { lh: 32 });
  const x = 760, y = 176, cw = 120, ch = 40;
  A(seg(t, 0.8, 1.1), () => { WV.forEach((w, j) => M(w, x + j * cw + cw / 2, y - 12, { size: 12.5, color: C.muted, align: 'center' })); M('_measure', x - 12, y - 12, { size: 11.5, color: C.amber, align: 'right' }); });
  BR.forEach((b, i) => {
    const yy = y + i * ch * 2 + i * 8;
    A(seg(t, 0.9 + i * 0.15, 1.2 + i * 0.15), () => {
      M(b, x - 120, yy + ch + 5, { size: 13, color: C.teal, align: 'right' });
      [['base', CBASE[i], String], ['mean_score', MEAN[i], f2]].forEach(([lab, V, f], m) => {
        M(lab, x - 12, yy + m * ch + ch / 2 + 5, { size: 11.5, color: C.amber, align: 'right' });
        V.forEach((v, j) => { R(x + j * cw + 2, yy + m * ch + 2, cw - 4, ch - 4, { fill: C.panel, stroke: C.rule }); T(f(v), x + j * cw + cw / 2, yy + m * ch + ch / 2 + 6, { size: 16, weight: 700, align: 'center' }); });
      });
    });
  });
  A(seg(t, 1.8, 2.2), () => {
    card(64, 316, 470, 120);
    M('row r, measure m sits at row r × M + m', 84, 350, { size: 13.5, color: C.ink });
    M('row_header.fields ends with _measure', 84, 378, { size: 13, color: C.amber });
    M('matrix.cell_labels names each row\'s measure', 84, 404, { size: 13, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 456, 1152, 112, C.violet);
    CAP('EACH MEASURE RUNS AS ITS OWN ONE-CELL CROSSTAB · COLUMN MARGINS MOVE TO matrix.measures[m]', 86, 484, { color: C.violet });
    M('base: 190 · 230 · grand 420', 86, 518, { size: 15, color: C.ink }); M('mean_score: 6.32 · 6.68 · grand 6.52', 520, 518, { size: 15, color: C.ink });
    M('nothing is pooled across measures · only pairwise overlays run on a multi-measure table', 86, 550, { size: 12.5, color: C.muted });
  });
}

/* ---------- 9. weighted bases (w) ---------- */
function sWeight(t) {
  CAP('"weight": { "field": "wt" } · normalize column · data/ac.json against data/w.json', 64, 124, { color: C.teal });
  xt(150, 186, REG, BR, COL, { t, at: 0.3, fmt: pct, rm: RMA, cm: CMA, g: GA, cw: 76, ch: 44, fs: 15, hi: [[1, 0, C.muted]] });
  xt(690, 186, REG, BR, WCOL, { t, at: 1.4, fmt: pct, rm: WRM, cm: WCM, g: WG, mfmt: v => v.toFixed(1), cw: 76, ch: 44, fs: 15, hi: [[1, 0, C.violet]] });
  A(seg(t, 0.3, 0.6), () => M('unweighted', 300, 152, { size: 13, color: C.muted, align: 'center' }));
  A(seg(t, 1.4, 1.7), () => M('weighted', 840, 152, { size: 13, color: C.violet, align: 'center' }));
  A(seg(t, 2.4, 2.8), () => {
    card(64, 470, 560, 98, C.violet);
    M('cells, margins and shares from the weighted rows', 86, 502, { size: 13.5, color: C.ink });
    M('North of Acorn: 43% → 44% · grand total 420 → 412.6', 86, 530, { size: 13.5, color: C.violet });
    M('a share is weighted ÷ weighted', 86, 556, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.0, 4.4), () => {
    card(656, 470, 560, 98, C.amber);
    M('components keep the raw counts', 678, 502, { size: 13.5, color: C.ink });
    M('grand_total_count 420 · sum_weights 412.6 · n_eff 383.5', 678, 530, { size: 13.5, color: C.amber });
    M('probability weights add n_eff, the Kish effective size', 678, 556, { size: 12.5, color: C.muted });
  });
}

/* ---------- 10. auxiliary margins (aux) ---------- */
function sAux(t) {
  CAP('"margin_aggregations": a second figure on the margins only · data/aux.json', 64, 124, { color: C.violet });
  card(64, 146, 560, 132, C.violet);
  code([['"weight": { "field": "wt" },', C.teal], ['"cell": { AGG_AVERAGE score, "label": "wmean" },', C.violet], ['"margin_aggregations": [ { AGG_COUNT id,', C.violet], ['    "label": "base", "weight": null } ]', C.amber]], 84, 176, t, 0.2, { lh: 28 });
  xt(760, 176, REG, WV, XW, { t, at: 1.0, fmt: f2, mfmt: f2, rm: XRM, cm: XCM, g: XG, cw: 100, ch: 40, fs: 16, rmLabel: 'wmean', hi: seg(t, 3.6, 3.8) > 0 ? [[0, 'r', C.coral]] : [] });
  A(seg(t, 1.8, 2.2), () => XBASE.forEach((b, i) => M('base ' + b, 1100, 176 + i * 40 + 25, { size: 12.5, color: C.amber })));
  A(seg(t, 1.8, 2.2), () => {
    card(64, 296, 560, 96, C.amber);
    M('an unweighted base beside a weighted mean, in one scan', 86, 328, { size: 13.5, color: C.ink });
    M('predict: margin_aggregations[0] · AGG_COUNT · opted_out', 86, 356, { size: 13, color: C.amber });
    M('the cell weight: applied, source request', 86, 380, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 412, 1152, 156, C.coral);
    CAP('THE ADMISSION RULE · EAST', 86, 440, { color: C.coral });
    M('142 respondents · 3 skipped the score', 86, 470, { size: 14, color: C.ink });
    M('auxiliary base 139: it sees only the records that reached a cell, minus a null cell field', 86, 498, { size: 13.5, color: C.amber });
    M('the cell\'s own margin keeps those 3, as n_null 3 beside n 139', 86, 524, { size: 13.5, color: C.violet });
    M('so an auxiliary n is not a cohort count · no margin displayed → PULSE_CROSSTAB_MARGIN_AGG_UNOBSERVED', 86, 552, { size: 12.5, color: C.muted });
  });
}

/* ---------- 11. matrix or long (long) ---------- */
function sLong(t) {
  CAP('"shape": "matrix" (default) or "long" · data/long.json', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 420, 200, C.teal);
    CAP('MATRIX', 84, 174, { color: C.teal });
    M('Response.Crosstab.Matrix', 84, 206, { size: 14, color: C.ink });
    M('a grid: keys, cells, margins', 84, 234, { size: 13, color: C.muted });
    M('what overlays read', 84, 262, { size: 13, color: C.muted });
  });
  const L = [['{ "brand": "Acorn", "n": 22, "region": "East" }', C.ink], ['{ "brand": "Birch", "n": 30, "region": "East" }', C.ink], ['…', C.faint],
    ['{ "_margin": "row", "n": 93, "region": "East" }', C.violet], ['…', C.faint], ['{ "_margin": "column", "brand": "Acorn", "n": 152 }', C.violet], ['…', C.faint], ['{ "_margin": "grand", "n": 420 }', C.violet]];
  A(seg(t, 1.4, 1.8), () => { card(520, 146, 696, 300, C.violet); CAP('LONG · Response.Data · one row per cell, then the margins', 542, 174, { color: C.violet }); });
  code(L, 542, 208, t, 1.6, { lh: 28 });
  A(seg(t, 3.2, 3.6), () => {
    card(64, 466, 1152, 102);
    M('margin rows are tagged _margin: row · column · grand, or <axis>_at_<depth> on a nested axis', 86, 502, { size: 13.5, color: C.ink });
    M('labels augment needs long: a matrix key has no sibling column', 86, 532, { size: 12.5, color: C.muted });
  });
}

/* ---------- 12. fused or buffered (a.predict, q.predict) ---------- */
function sFuse(t) {
  CAP('HOW THE GRID IS BUILT · predict · data/a.predict.json, data/q.predict.json', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 64, C.amber);
    M('streamable: false · "crosstab shape=matrix requires buffered reshape" · "crosstab margins require buffered recompute"', 86, 184, { size: 13, color: C.amber });
  });
  A(seg(t, 1.4, 1.8), () => {
    card(64, 230, 560, 230, C.teal);
    CAP('FUSED · region × brand, AGG_COUNT', 86, 258, { color: C.teal });
    M('crosstab_fusable: true', 86, 292, { size: 15, color: C.teal, weight: 600 });
    M('one decode pass into per-cell and', 86, 326, { size: 13, color: C.ink });
    M('per-margin state: memory O(cells + margins)', 86, 348, { size: 13, color: C.ink });
    M('needs, in short: a mergeable cell and auxiliaries,', 86, 384, { size: 12.5, color: C.muted });
    M('axes that key one record at a time, and no joins,', 86, 406, { size: 12.5, color: C.muted });
    M('windows, tests, regressions or expression filters', 86, 428, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.0, 3.4), () => {
    card(656, 230, 560, 230, C.coral);
    CAP('BUFFERED · GROUP_QUANTILE score × wave', 678, 258, { color: C.coral });
    M('crosstab_fusable: false', 678, 292, { size: 15, color: C.coral, weight: 600 });
    M('crosstab_fusion_reasons:', 678, 326, { size: 13, color: C.ink });
    M('"non-streamable grouper on row axis', 678, 348, { size: 13, color: C.amber });
    M('(GROUP_QUANTILE)"', 678, 370, { size: 13, color: C.amber });
    M('a quantile axis fits over the whole filtered set first', 678, 406, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(64, 480, 1152, 88);
    M('identical output on both paths · nothing in the response says which ran · overlays never stop a fuse', 86, 516, { size: 13.5, color: C.ink });
    M('too many cells for max_crosstab_cells → PULSE_LIMIT_EXCEEDED; predict flags it as possible', 86, 546, { size: 12.5, color: C.muted });
  });
}

/* ---------- 13. display labels (lab, laba) ---------- */
function sLabels(t) {
  CAP('"labels": [ { "field": "intent", "table": "intent_names", "mode": … } ] · data/lab.json, laba.json', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 420, 130);
    CAP('THE COHORT STORES CODES', 84, 174);
    M('intent: "1" · "2" · "3"', 84, 206, { size: 14, color: C.ink });
    M('labels/intent_names.json:', 84, 236, { size: 12.5, color: C.amber });
    M('1 Unlikely · 2 Maybe · 3 Likely', 84, 258, { size: 12.5, color: C.amber });
  });
  const rep = seg(t, 1.6, 1.7) > 0 && seg(t, 3.6, 3.7) === 0;
  xt(720, 176, rep ? INT : ['1', '2', '3'], WV, LAB, { t, at: 0.6, fmt: pct, rm: LRM, cm: [300, 300], g: 600, cw: 110, ch: 46, rmLabel: 'n' });
  A(seg(t, 1.6, 2.0), () => {
    card(64, 296, 420, 130, C.teal);
    CAP('"mode": "replace"', 84, 324, { color: C.teal });
    M('row_keys → the labels', 84, 356, { size: 13.5, color: C.ink });
    M('Likely: 26% in W1 → 30% in W2', 84, 384, { size: 13.5, color: C.ink });
    M('filters, sorts and formulas still see "3"', 84, 410, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 446, 1152, 122, C.coral);
    CAP('"mode": "augment" on a matrix axis', 86, 474, { color: C.coral });
    M('⚠ PULSE_LABEL_NOT_APPLIED · reason augment_on_matrix_axis · the keys stay 1, 2, 3', 86, 506, { size: 13.5, color: C.coral });
    M('an axis key has no sibling column: use "replace", or shape "long"', 86, 534, { size: 13, color: C.muted });
    M('tables: Options.Extensions.LabelTables, or a folder of JSON via PULSE_LABEL_TABLES_DIR', 86, 558, { size: 12, color: C.faint });
  });
}

/* ---------- 14. significance letters (sig) ---------- */
function sLetters(t) {
  CAP('OVERLAY_PAIRWISE_PROP_Z · scope column · "letters": {} · brand × region, column shares · data/sig.json', 64, 124, { color: C.violet });
  const x0 = 200, y0 = 196, cw = 120, ch = 66;
  A(seg(t, 0.2, 0.6), () => {
    REG.forEach((r, j) => { M(r, x0 + j * cw + cw / 2 - 8, y0 - 14, { size: 12.5, align: 'center', color: C.muted }); A(seg(t, 1.4, 1.8), () => M(LET[j], x0 + j * cw + cw / 2 + 28, y0 - 14, { size: 13, align: 'center', color: C.amber, weight: 600 })); });
    BR.forEach((b, i) => M(b, x0 - 12, y0 + i * ch + ch / 2 + 5, { size: 13, align: 'right', color: C.teal }));
  });
  BR.forEach((_, i) => REG.forEach((__, j) => A(seg(t, 0.3 + (i + j) * 0.05, 0.6 + (i + j) * 0.05), () => {
    const x = x0 + j * cw, y = y0 + i * ch, ab = ABOVE[i][j], on = ab.length && seg(t, 1.8, 2.0) > 0;
    R(x + 3, y + 3, cw - 6, ch - 6, { fill: C.panel, stroke: on ? C.violet : C.rule, r: 4, lw: on ? 2 : 1.3 });
    T(pct(SIG[i][j]), x + cw / 2, y + ch / 2 + 7, { size: 19, weight: 700, align: 'center' });
    if (ab.length) A(seg(t, 1.8, 2.2), () => M(ab.join(''), x + cw - 10, y + 22, { size: 12.5, color: C.amber, weight: 600, align: 'right' }));
  })));
  A(seg(t, 1.8, 2.2), () => {
    card(740, 160, 476, 196, C.amber);
    CAP('EACH CELL: THE REGIONS IT BEATS AT p < 0.05', 762, 188, { color: C.amber });
    M('Acorn: North beats East, South and West', 762, 224, { size: 13.5, color: C.ink });
    M('Birch: South and West beat North', 762, 252, { size: 13.5, color: C.ink });
    M('Cedar: East beats North, South and West', 762, 280, { size: 13.5, color: C.ink });
    M('the primary layer stays raw two-sided p-values', 762, 320, { size: 12.5, color: C.muted });
  });
  A(seg(t, 3.4, 3.8), () => {
    card(64, 420, 1152, 148);
    M('predict counts ' + PCOUNT + ' uncorrected p-values here: 6 pairs of regions × 3 brands', 86, 456, { size: 14, color: C.ink });
    M('PULSE_ADVISORY_MANY_TESTS · suggested: "multiplicity": { "method": "holm" }', 86, 486, { size: 13.5, color: C.amber });
    M('the crosstab and its components are untouched: overlays are read-only layers', 86, 518, { size: 13, color: C.muted });
    M('next: overlays, film 16', 86, 550, { size: 13, color: C.faint });
  });
}

/* ---------- 15. recap ---------- */
function sRecap(t) {
  CAP('THE CROSSTAB, TODAY', 64, 124, { color: C.teal });
  const items = [['rows × columns', C.teal], ['one cell or several', C.violet], ['margins from raw rows', C.violet], ['% of those asked', C.coral],
    ['normalize · level · within', C.violet], ['the Total column', C.teal], ['auxiliary bases', C.amber], ['weighted bases', C.teal], ['matrix or long', C.ink],
    ['fused or buffered', C.amber], ['display labels', C.amber], ['letters from overlays', C.violet]];
  chips(items, 64, 150, 1152, { t, at: 0.3, step: 0.12, size: 15, h: 34 });
  A(seg(t, 3.2, 3.6), () => {
    card(64, 300, 560, 196);
    CAP('ANY GROUPER · ANY CELL AGGREGATOR', 86, 328);
    M('the manifest\'s crosstab section lists how each', 86, 362, { size: 13.5, color: C.ink });
    M('aggregator margins, and the rules that refuse', 86, 386, { size: 13.5, color: C.ink });
    M('more operators are added over time', 86, 420, { size: 13.5, color: C.muted });
    M('your instance\'s manifest lists what it offers', 86, 444, { size: 13.5, color: C.muted });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(656, 300, 560, 196, C.amber);
    CAP('Options.Extensions', 678, 328, { color: C.amber });
    M('Groupers and Aggregators: your own', 678, 362, { size: 13.5, color: C.ink });
    M('operators run on either axis or in a cell', 678, 386, { size: 13.5, color: C.ink });
    M('LabelTables: your own display labels', 678, 420, { size: 13.5, color: C.ink });
  });
  A(seg(t, 7.4, 7.8), () => T('A record reaches a margin only if it reached a cell.', 640, 548, { size: 20, weight: 600, align: 'center', color: C.violet }));
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[2.709, 5.077, 10.923, 8.043, 8.405, 8.021, 4.224, 7.403, 9.088, 5.504, 5.312, 11.392, 8.427, 3.264, 3.435, 3.52, 4.224, 6.891, 2.56, 11.051, 7.744, 3.157, 9.557, 4.843, 6.421, 5.632, 14.059, 4.224, 4.779, 8.853, 5.035, 6.123, 8.107, 15.445, 6.037, 5.184, 4.181, 4.565, 11.435, 7.104, 4.267, 5.12, 8.341, 8.064, 4.096, 10.176, 5.909, 11.819, 8.981, 6.421, 3.925, 1.216]/*END*/;
PulseFilm.mount({
  series: 'PULSE · CROSSTABS',
  title: 'Pulse Crosstabs',
  narr: NARR,
  scenes: [
    { name: 'Pulse Crosstabs', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Rows by columns, with the margins around them.', true]] },
    { name: 'One cell, two axes', dur: 6.2, draw: sShape, caps: [
      [0, 'A crosstab pivots one cell aggregation across rows and columns of groupers.'],
      [1.6, 'Any grouper can sit on either axis, and several on one axis nest. Here, region runs down the side, and the brand each respondent uses most runs across the top.'],
      [4.2, 'Pulse returns the matrix with its row margins, column margins and grand total, and the counts behind each cell in the components.']] },
    { name: 'Not with groups', dur: 5.6, draw: sGroups, caps: [
      [0, 'A crosstab replaces groups and aggregations. Put both on one request, and it is refused with PULSE_CROSSTAB_CONFLICTS_WITH_GROUPS.',
          'A crosstab replaces groups and aggregations. Put both on one request, and it is refused as a crosstab that conflicts with groups.'],
      [1.8, 'So pick by what the table needs: one figure per key, margins and shares, several figures per cell, or a test between cells.'],
      [3.6, 'Tests and regressions can still run beside a crosstab, on the raw rows.']] },
    { name: 'Who counts', dur: 5.6, draw: sAsked, caps: [
      [0, 'This survey has 600 respondents, but only the 420 aware of the category were asked which brand they use.',
          'This survey has six hundred respondents, but only the four hundred and twenty aware of the category were asked which brand they use.'],
      [1.8, 'The rest have a region and no brand. They reach no cell, so they reach no margin: the East row counts 93 of its 142.',
          'The rest have a region and no brand. They reach no cell, so they reach no margin. The East row counts ninety-three of its hundred and forty-two.'],
      [3.6, 'So a column percent is a share of those asked: East is 14% of Acorn users.',
          'So a column percent is a share of those asked. East is fourteen percent of Acorn users.']] },
    { name: 'Margins from raw rows', dur: 5.4, draw: sRaw, caps: [
      [0, 'Margins are recomputed from the raw rows of each margin, not added up from the cells.'],
      [1.6, 'Acorn\'s mean score across both waves is 6.95, not the 6.91 you get by averaging its two cells, because the waves hold different numbers of Acorn users.',
          'Acorn\'s mean score across both waves is six point nine five, not the six point nine one you get by averaging its two cells, because the waves hold different numbers of Acorn users.'],
      [3.4, 'So means, medians and percentiles get true margins. The manifest classifies each cell aggregator by how its margin is found.']] },
    { name: 'Normalize', dur: 7.4, draw: sNorm, caps: [
      [0, 'Normalize divides each cell by its matching margin.'],
      [1.0, 'By column, North is 43% of Acorn users.', 'By column, North is forty-three percent of Acorn users.'],
      [2.6, 'By row, 49% of North\'s brand users pick Acorn.', 'By row, forty-nine percent of North\'s brand users pick Acorn.'],
      [4.2, 'By total, North and Acorn together are 15% of everyone asked.', 'By total, North and Acorn together are fifteen percent of everyone asked.'],
      [5.6, 'It needs no margin flag. A zero margin leaves the cell marked not present, rather than inventing a zero.']] },
    { name: 'Nested axes', dur: 5.4, draw: sNested, caps: [
      [0, 'Here the columns nest: wave, then brand.'],
      [1.2, 'Normalize by row with normalize_within zero, and each region\'s brand shares sum to one within each wave. East\'s Cedar share rises from 37% to 49%.',
          'Normalize by row, within the first column grouper, and each region\'s brand shares sum to one within each wave. East\'s Cedar share rises from thirty-seven to forty-nine percent.'],
      [3.2, 'Normalize_level rolls up the same axis instead: by column at level zero, each cell is a share of its whole wave.',
          'Normalize level rolls up the same axis instead. By column, at level zero, each cell is a share of its whole wave.']] },
    { name: 'The Total column', dur: 5.2, draw: sTotal, caps: [
      [0, 'Leave the columns out, and Pulse adds one Total column.'],
      [1.6, 'It holds every record whose row key resolved, so all 600 respondents land, and its column percent sums to one. North is 32%.',
          'It holds every record whose row key resolved, so all six hundred respondents land, and its column percent sums to one. North is thirty-two percent.'],
      [3.4, 'Comparisons then run between the rows, and the Total column itself gets no letter.']] },
    { name: 'Several measures', dur: 5.4, draw: sCells, caps: [
      [0, 'One table can stack several measures. List them in cells, and each becomes a stub row under every row key.'],
      [1.8, 'Here, a base count and a mean score for each brand, read against the same waves in one scan.'],
      [3.6, 'Each measure runs exactly as its own one-cell crosstab would. Its column margins move to the measures block: a base of 190 and 230, and a mean of 6.32 and 6.68.',
          'Each measure runs exactly as its own one-cell crosstab would. Its column margins move to the measures block: a base of a hundred and ninety and two hundred and thirty, and a mean of six point three two and six point six eight.']] },
    { name: 'Weighted bases', dur: 5.6, draw: sWeight, caps: [
      [0, 'Set a request weight, and the crosstab is recomputed from the weighted rows.'],
      [1.4, 'Cells, margins and shares all move together, and a share is weighted over weighted.'],
      [2.4, 'Weighted, North is 44% of Acorn users, and the grand total reads 412.6 instead of 420.',
          'Weighted, North is forty-four percent of Acorn users, and the grand total reads four hundred and twelve point six, instead of four hundred and twenty.'],
      [4.0, 'The components keep the raw counts beside the sum of weights and the effective sample size.']] },
    { name: 'Auxiliary bases', dur: 5.6, draw: sAux, caps: [
      [0, 'Margin aggregations add a second figure to the margins only, never to a cell, in the same scan.'],
      [1.8, 'The classic use is an unweighted base beside a weighted mean. The base opts out with weight null, and predict lists it as opted out.'],
      [3.6, 'An auxiliary sees only the records that reached a cell, and it drops a null cell field. East has 142 respondents, three skipped the score, so its base is 139. The cell\'s own margin counts those three as nulls.',
          'An auxiliary sees only the records that reached a cell, and it drops a null cell field. East has a hundred and forty-two respondents, and three skipped the score, so its base is a hundred and thirty-nine. The cell\'s own margin counts those three as nulls.']] },
    { name: 'Matrix or long', dur: 5, draw: sLong, caps: [
      [0, 'The default shape is a matrix: a grid of keys, cells and margins, and the shape overlays read.'],
      [1.4, 'Ask for long, and you get one row per cell in the response data, followed by the margins.'],
      [3.2, 'Each margin row is tagged as a row, column or grand margin.']] },
    { name: 'Fused or buffered', dur: 6.4, draw: sFuse, caps: [
      [0, 'A crosstab\'s output is always buffered. What varies is how the grid is built.'],
      [1.4, 'When the cell is mergeable and every axis keys one record at a time, Pulse fuses: one decode pass into per-cell and per-margin state. Predict reports crosstab fusable, true.'],
      [3.0, 'A quantile axis must see the whole filtered set before it can bucket anyone, so predict reports false, and says why.'],
      [4.6, 'Both paths give identical output, and overlays never stop a fuse.']] },
    { name: 'Display labels', dur: 5.6, draw: sLabels, caps: [
      [0, 'Survey cohorts often store codes. Here, purchase intent is 1, 2 or 3.', 'Survey cohorts often store codes. Here, purchase intent is one, two or three.'],
      [1.6, 'A label binding in replace mode rewrites the axis keys from a label table at output time. Filters and sorts still see the codes.'],
      [3.6, 'Augment mode adds a sibling column, and a matrix axis has none, so Pulse keeps the codes and warns PULSE_LABEL_NOT_APPLIED.',
          'Augment mode adds a sibling column, and a matrix axis has none, so Pulse keeps the codes and warns that the label was not applied.']] },
    { name: 'Significance letters', dur: 5.4, draw: sLetters, caps: [
      [0, 'To compare cells, add a pairwise overlay. Each region gets a letter.'],
      [1.8, 'Ask for letters, and each cell lists the regions it beats at five percent. North leads on Acorn, East on Cedar, and South and West both beat North on Birch.'],
      [3.4, 'Predict counts 18 raw p-values here and suggests a correction. Overlays are film 16.',
          'Predict counts eighteen raw p-values here, and suggests a correction. Overlays are film sixteen.']] },
    { name: 'The crosstab', dur: 9.6, draw: sRecap, caps: [
      [0, 'That\'s the crosstab today: rows by columns, one cell or several, margins from raw rows, normalize, the Total column, auxiliary and weighted bases, two shapes, labels and letters.'],
      [3.2, 'Any grouper and any cell aggregator can be used. Pulse adds more over time, and your instance\'s manifest lists them, with how each one margins.'],
      [5.4, 'Embedders can register their own groupers, aggregators and label tables through Options.Extensions.', 'Embedders can register their own groupers, aggregators and label tables, through options dot extensions.'],
      [7.4, 'And remember: a record reaches a margin only if it reached a cell.'],
      [9.2, '', 'Pulse crosstabs.', true]] },
  ],
});
})();
