/* Pulse Windows: film 7 of the Pulse Anatomy series. Follows SERIES-RULES.md.
 * Operator rules mirror internal/processing windows (checked against a real run): nulls sort last in both
 * directions, rows keep their input order, delta keeps a zero prior, pct change nulls it, running and moving
 * aggregates skip nulls, EWMA emits null on a null row but keeps its state. */
(() => {
const { C } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, ring, arrow } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const fv = v => v == null ? 'null' : (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));

/* ---------- monthly sales, two regions ---------- */
const NORTH = [12, 0, 30, null, 48, 48];
const SOUTH = [20, 26, 26, 31, 29, 35];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
/* input order as stored (rows are never reordered by a window) */
const ROWS = [['North', 3], ['South', 1], ['North', 1], ['South', 4], ['North', 2], ['North', 4], ['South', 2], ['North', 6], ['South', 3], ['North', 5], ['South', 6], ['South', 5]]
  .map(([r, m]) => ({ region: r, month: m, sales: (r === 'North' ? NORTH : SOUTH)[m - 1] }));

/* window math on one ordered partition */
const lag = (a, k, def = null) => a.map((_, i) => i - k < 0 ? def : a[i - k]);
const lead = (a, k, def = null) => a.map((_, i) => i + k >= a.length ? def : a[i + k]);
const delta = (a, p = 1) => a.map((v, i) => i < p || v == null || a[i - p] == null ? null : v - a[i - p]);
const pct = (a, p = 1) => a.map((v, i) => i < p || v == null || a[i - p] == null || a[i - p] === 0 ? null : (v - a[i - p]) / a[i - p]);
const framed = (a, pre, fol, f) => a.map((_, i) => { const lo = pre == null ? 0 : Math.max(0, i - pre), hi = fol == null ? a.length - 1 : Math.min(a.length - 1, i + fol); const s = a.slice(lo, hi + 1).filter(v => v != null); return s.length ? f(s) : null; });
const ssum = s => s.reduce((x, y) => x + y, 0);
const savg = s => ssum(s) / s.length;
const ewma = (a, al) => { let st = null; return a.map(v => { if (v == null) return null; st = st == null ? v : al * v + (1 - al) * st; return st; }); };

/* bars for one partition; vals may hold nulls */
function bars(t, x, y, w, h, vals, o = {}) {
  const n = vals.length, bw = w / n, mx = o.max ?? 60;
  Ln([[x, y + h], [x + w, y + h]], { stroke: C.rule });
  vals.forEach((v, i) => {
    const bx = x + i * bw + bw * 0.18, ww = bw * 0.64, a = seg(t, (o.at ?? 0) + i * 0.06, (o.at ?? 0) + 0.35 + i * 0.06);
    A(a, () => {
      if (v == null) { R(bx, y + h - 26, ww, 26, { stroke: C.coral, dash: [4, 4], r: 3 }); M('null', bx + ww / 2, y + h - 8, { size: 11.5, color: C.coral, align: 'center' }); }
      else { const bh = Math.max(2, v / mx * h); R(bx, y + h - bh, ww, bh, { fill: o.hi && o.hi(i) ? C.tealS : C.panel2, stroke: o.hi && o.hi(i) ? C.teal : C.faint, r: 3 }); M(fv(v), bx + ww / 2, y + h - bh - 8, { size: 12, color: C.ink, align: 'center' }); }
      if (o.labels !== false) M(MON[i], bx + ww / 2, y + h + 20, { size: 12, align: 'center' });
    });
  });
  return i => x + i * bw + bw / 2;
}
/* a derived row of values under a chart */
function outRow(t, x, w, y, vals, lab, col, at) {
  const bw = w / vals.length;
  A(seg(t, at, at + 0.3), () => M(lab, x - 14, y, { size: 12.5, color: col, align: 'right', weight: 600 }));
  vals.forEach((v, i) => A(seg(t, at + 0.1 + i * 0.08, at + 0.4 + i * 0.08), () => M(fv(v), x + i * bw + bw / 2, y, { size: 13.5, color: v == null ? C.coral : col, align: 'center' })));
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  const vals = [18, 26, 22, 34, 30, 42, 38, 46];
  vals.forEach((v, i) => A(seg(t, 0.1 + i * 0.05, 0.4 + i * 0.05), () => R(456 + i * 46, 400 - v * 2, 30, v * 2, { fill: C.tealS, stroke: C.teal, r: 2, lw: 1 })));
  const u = eio(seg(t, 0.8, 2.0)), fx = lerp(450, 450 + 46 * 5, u);
  A(seg(t, 0.7, 1.0), () => R(fx, 296, 46 * 3, 112, { stroke: C.violet, lw: 2, r: 6 }));
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 260, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('WINDOWS', 640, 470, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 2.0, 2.8), () => T('One value per row, read from its neighbours', 640, 518, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where windows run ---------- */
const SPINE = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
function sWhere(t) {
  SPINE.forEach((n, i) => {
    const x = 64 + i * 164, on = i === 5;
    A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08) * (on ? 1 : 0.55), () => {
      R(x, 110, 150, 52, { fill: on ? C.violetS : C.panel, stroke: on ? C.violet : C.rule, lw: on ? 2 : 1.2 });
      T(n, x + 14, 142, { size: 15.5, weight: 600, color: on ? C.ink : C.muted });
      if (i < 6) arrow(x + 150, 136, x + 162, 136, { stroke: C.faint, head: 6 });
    });
  });
  A(seg(t, 0.9, 1.3), () => {
    M('after aggregation: one row per group, or per record', 884, 186, { size: 12.5, color: C.violet, align: 'center' });
  });
  A(seg(t, 2.4, 2.8), () => {
    card(64, 214, 600, 210, C.violet);
    CAP('THE SLOT', 86, 242);
    const L = [['"windows": [ {', C.muted], ['  "type": "WIN_LAG", "field": "sales",', C.ink], ['  "partition_by": ["region"],', C.teal], ['  "order_by": [{ "field": "month" }],', C.amber], ['  "params": { "offset": 1 }', C.ink], ['} ]', C.muted]];
    L.forEach(([s, c], i) => A(seg(t, 2.6 + i * 0.12, 2.9 + i * 0.12), () => M(s, 86, 272 + i * 23, { size: 13.5, color: c })));
  });
  A(seg(t, 4.6, 5.0), () => {
    card(690, 214, 526, 210);
    CAP('WHAT IT ADDS', 712, 242);
    M('one new column on every row', 712, 274, { size: 13.5, color: C.ink });
    M('no label → WIN_LAG_sales', 712, 300, { size: 13, color: C.muted });
    M('every row stays · nothing collapses', 712, 334, { size: 13.5, color: C.ink });
    M('a label already in use: SERVICE_VALIDATION', 712, 368, { size: 12.5, color: C.coral });
    M('not weightable · no components', 712, 400, { size: 12.5, color: C.muted });
  });
  A(seg(t, 6.4, 6.8), () => {
    card(64, 448, 1152, 120, C.coral);
    CAP('ALWAYS BUFFERED', 86, 478, { color: C.coral });
    M('a window needs its partition sorted, so any window turns streaming off: predict marks the request not streamable', 86, 508, { size: 13.5, color: C.ink });
    M('windows that share a partition and an order share one sort', 86, 536, { size: 13, color: C.muted });
  });
}

/* ---------- 2. partition, order, frame ---------- */
function sAxes(t) {
  CAP('THE THREE AXES EVERY WINDOW SHARES', 64, 124, { color: C.violet });
  // stage 1: rows as stored; stage 2: carved by region; stage 3: sorted by month
  const carve = eio(seg(t, 1.6, 2.6)), sort = eio(seg(t, 3.4, 4.6));
  const posOf = r => { const part = r.region === 'North' ? 0 : 1; const rank = r.month - 1; const stored = ROWS.indexOf(r); return { carvedIdx: ROWS.filter(q => q.region === r.region).indexOf(r), part, rank, stored }; };
  ROWS.forEach((r, k) => {
    const p = posOf(r);
    const x0 = 64 + p.stored * 96, y0 = 170;
    const x1 = 240 + lerp(p.carvedIdx, p.rank, sort) * 150, y1 = 236 + p.part * 120;
    const x = lerp(x0, x1, carve), y = lerp(y0, y1, carve), col = r.region === 'North' ? C.teal : C.amber;
    A(seg(t, 0.2 + k * 0.04, 0.5 + k * 0.04), () => {
      R(x, y, 86, 52, { fill: C.panel, stroke: col, r: 4 });
      M(r.region + ' · ' + MON[r.month - 1], x + 8, y + 20, { size: 11, color: C.muted });
      T(fv(r.sales), x + 8, y + 42, { size: 16, weight: 700, color: r.sales == null ? C.coral : C.ink });
    });
  });
  A(seg(t, 0.4, 0.8) * (1 - carve), () => M('rows as stored', 64, 252, { size: 12.5 }));
  A(seg(t, 1.8, 2.4), () => { CAP('PARTITION · North', 64, 230 + 30, { color: C.teal }); CAP('PARTITION · South', 64, 350 + 30, { color: C.amber }); });
  A(seg(t, 3.6, 4.2), () => M('ORDER BY month →', 240, 222, { size: 12.5, color: C.amber, weight: 600 }));
  // frame
  const fi = Math.floor(lerp(0, 5.99, seg(t, 5.4, 8.2)));
  A(seg(t, 5.2, 5.6), () => {
    const lo = Math.max(0, fi - 2), x = 240 + lo * 150 - 8, w = (fi - lo + 1) * 150 - 48;
    R(x, 226, w, 72, { stroke: C.violet, lw: 2.2, r: 8 });
    M('frame: 2 preceding → current row', x, 316, { size: 12.5, color: C.violet });
  });
  A(seg(t, 5.2, 5.6), () => M('partitions never mix · the order sets the scan · the frame bounds what a row may read', 64, 560, { size: 13, color: C.ink }));
}

/* ---------- 3. order rules ---------- */
function sOrder(t) {
  CAP('ORDER RULES', 64, 124, { color: C.amber });
  const vals = [30, null, 48, 12, 0];
  const asc = [0, 3, 2, 1].map(i => i); // placeholder (unused)
  const sorted = (desc) => { const nn = vals.filter(v => v != null).sort((a, b) => desc ? b - a : a - b); return [...nn, ...vals.filter(v => v == null)]; };
  [['ascending', false, 0.3], ['descending', true, 2.0]].forEach(([lab, d, at], k) => A(seg(t, at, at + 0.4), () => {
    const y = 170 + k * 110;
    M(lab, 64, y + 30, { size: 13.5, color: C.amber });
    sorted(d).forEach((v, i) => A(seg(t, at + 0.2 + i * 0.08, at + 0.5 + i * 0.08), () => { R(220 + i * 110, y, 96, 48, { fill: C.panel, stroke: v == null ? C.coral : C.rule, r: 4 }); T(fv(v), 268 + i * 110, y + 31, { size: 17, weight: 700, align: 'center', color: v == null ? C.coral : C.ink }); }));
  }));
  A(seg(t, 3.2, 3.6), () => M('nulls last both ways · descending reverses the non-null values only', 220, 410, { size: 13, color: C.coral }));
  A(seg(t, 4.4, 4.8), () => {
    card(64, 440, 1152, 128, C.violet);
    CAP('THE RESPONSE KEEPS INPUT ORDER', 86, 470, { color: C.violet });
    M('order_by is the scan order inside a partition, not the order rows come back in', 86, 500, { size: 13.5, color: C.ink });
    M('want them sorted? add "sort" to the request: it runs last', 86, 528, { size: 13.5, color: C.teal });
    M('ordering by a weekday name sorts alphabetically: order by a date instead', 86, 554, { size: 12.5, color: C.muted });
  });
}

/* ---------- 4. lag and lead ---------- */
function sLag(t) {
  CAP('PARTITION North · ORDER BY month', 64, 124, { color: C.teal });
  const X = bars(t, 220, 150, 900, 220, NORTH);
  const sh = eio(seg(t, 1.2, 2.2));
  outRow(t, 220, 900, 430, lag(NORTH, 1), 'WIN_LAG', C.violet, 1.0);
  A(seg(t, 1.0, 1.4), () => NORTH.forEach((v, i) => { if (i < 5) arrow(X(i), 440, lerp(X(i), X(i + 1), sh) - 4, 440 - 18 * sh * 0, { stroke: C.violetS, head: 0 }); }));
  outRow(t, 220, 900, 480, lead(NORTH, 1), 'WIN_LEAD', C.violet, 3.0);
  outRow(t, 220, 900, 530, lag(NORTH, 1, 0), 'lag, default 0', C.amber, 5.0);
  A(seg(t, 1.6, 2.0), () => M('the row before', 1140, 430, { size: 12, color: C.muted }));
  A(seg(t, 3.4, 3.8), () => M('the row after', 1140, 480, { size: 12, color: C.muted }));
  A(seg(t, 5.4, 5.8), () => M('at the edge', 1140, 530, { size: 12, color: C.muted }));
  A(seg(t, 2.0, 2.4), () => M('a missing value carries through as null', 220, 584, { size: 12.5, color: C.coral }));
}

/* ---------- 5. change ---------- */
function sChange(t) {
  CAP('WIN_DELTA · WIN_PCT_CHANGE · against the row before', 64, 124, { color: C.violet });
  bars(t, 220, 150, 900, 220, NORTH, { hi: i => i === 1 || i === 2 });
  outRow(t, 220, 900, 430, delta(NORTH), 'WIN_DELTA', C.violet, 0.8);
  outRow(t, 220, 900, 470, pct(NORTH), 'WIN_PCT_CHANGE', C.violet, 2.4);
  A(seg(t, 4.0, 4.4), () => {
    card(64, 500, 560, 80, C.teal);
    M('Feb → Mar: 0 → 30', 86, 528, { size: 13.5, color: C.teal, weight: 600 });
    M('delta 30, a real change · pct change null: no ÷ 0', 86, 556, { size: 13, color: C.ink });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(656, 500, 560, 80, C.amber);
    M('delta reads in the field\'s units', 678, 528, { size: 13.5, color: C.amber, weight: 600 });
    M('pct change is a fraction: 0.05 means 5%', 678, 556, { size: 13, color: C.ink });
  });
}

/* ---------- 6. running ---------- */
function sRunning(t) {
  CAP('RUNNING · frame { preceding: null, following: 0 } = everything so far', 64, 124, { color: C.violet });
  const X = bars(t, 220, 150, 900, 220, NORTH, { hi: i => i <= Math.floor(lerp(0, 5.99, seg(t, 1.0, 4.0))) });
  const fi = Math.floor(lerp(0, 5.99, seg(t, 1.0, 4.0)));
  A(seg(t, 0.8, 1.2), () => { R(220, 140, (fi + 1) * 150, 246, { stroke: C.violet, lw: 2, r: 8 }); });
  const rs = framed(NORTH, null, 0, ssum), ra = framed(NORTH, null, 0, savg);
  outRow(t, 220, 900, 430, rs, 'WIN_RUNNING_SUM', C.violet, 1.2);
  outRow(t, 220, 900, 470, ra, 'WIN_RUNNING_AVG', C.violet, 3.0);
  A(seg(t, 4.6, 5.0), () => {
    card(64, 500, 1152, 80, C.coral);
    M('April is null: skipped, not counted as 0', 86, 528, { size: 13.5, color: C.coral, weight: 600 });
    M('the running sum holds at 42 · the running average divides by the 3 values that exist', 86, 556, { size: 13, color: C.ink });
  });
}

/* ---------- 7. moving ---------- */
function sMoving(t) {
  CAP('WIN_MOVING_AVG · a bounded frame on both sides', 64, 124, { color: C.violet });
  const fi = Math.floor(lerp(0, 5.99, seg(t, 0.8, 4.0)));
  bars(t, 220, 150, 900, 220, SOUTH, { hi: i => i >= fi - 2 && i <= fi });
  A(seg(t, 0.6, 1.0), () => { const lo = Math.max(0, fi - 2); R(220 + lo * 150, 140, (fi - lo + 1) * 150, 246, { stroke: C.violet, lw: 2, r: 8 }); });
  outRow(t, 220, 900, 430, framed(SOUTH, 2, 0, savg), 'trailing 3', C.violet, 1.0);
  outRow(t, 220, 900, 470, framed(SOUTH, 1, 1, savg), 'centred 3', C.amber, 3.2);
  A(seg(t, 1.4, 1.8), () => M('2 before', 1140, 430, { size: 12, color: C.muted }));
  A(seg(t, 3.6, 4.0), () => M('1 each side', 1140, 470, { size: 12, color: C.muted }));
  A(seg(t, 4.8, 5.2), () => {
    card(64, 500, 1152, 80, C.coral);
    M('an open end: predict refuses it (PULSE_WINDOW_INVALID). That is a running average', 86, 528, { size: 13.5, color: C.coral, weight: 600 });
    M('near the start the frame is shorter: Jan averages one value, Feb two', 86, 556, { size: 13, color: C.ink });
  });
}

/* ---------- 8. ewma ---------- */
function sEwma(t) {
  CAP('WIN_EWMA · s = α·x + (1 − α)·s_prev', 64, 124, { color: C.violet });
  const X = bars(t, 220, 150, 900, 220, NORTH);
  const e = ewma(NORTH, 0.5);
  A(seg(t, 1.6, 2.6), () => {
    const pts = e.map((v, i) => [X(i), v == null ? null : 370 - v / 60 * 220]);
    let prev = null; pts.forEach(p => { if (p[1] == null) return; if (prev) Ln([prev, p], { stroke: C.violet, lw: 2.5 }); prev = p; });
    pts.forEach(p => { if (p[1] != null) dot(p[0], p[1], 5, C.violet); });
  });
  outRow(t, 220, 900, 430, e, 'α = 0.5', C.violet, 1.0);
  A(seg(t, 3.2, 3.6), () => {
    card(64, 470, 560, 110, C.violet);
    M('alpha or decay, exactly one', 86, 498, { size: 13.5, color: C.violet, weight: 600 });
    M('high alpha follows the latest value', 86, 526, { size: 13, color: C.ink });
    M('decay 0.7 is alpha 0.3 (adstock)', 86, 552, { size: 13, color: C.muted });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(656, 470, 560, 110, C.coral);
    M('a null row emits null', 678, 498, { size: 13.5, color: C.coral, weight: 600 });
    M('but the smoothing state carries on to May', 678, 526, { size: 13, color: C.ink });
    M('it seeds from the first non-null value', 678, 552, { size: 13, color: C.muted });
  });
}

/* ---------- 9. ranking ---------- */
function sRank(t) {
  CAP('RANKING · ORDER BY sales DESC · no field, the order is the input', 64, 124, { color: C.violet });
  const order = NORTH.map((v, i) => ({ v, m: MON[i] }));
  const nn = order.filter(o => o.v != null).sort((a, b) => b.v - a.v), sorted = [...nn, ...order.filter(o => o.v == null)];
  const rn = sorted.map((_, i) => i + 1);
  const rk = sorted.map((o, i) => { if (o.v == null) return i + 1; return sorted.findIndex(q => q.v === o.v) + 1; });
  const dr = (() => { let d = 0, last; return sorted.map(o => { if (o.v !== last) { d++; last = o.v; } return d; }); })();
  const cols = [['month', 64], ['sales', 230], ['WIN_ROW_NUMBER', 400], ['WIN_RANK', 640], ['WIN_DENSE_RANK', 860]];
  cols.forEach(([h, x], j) => A(seg(t, j < 2 ? 0.2 : [0, 0, 1.2, 2.6, 4.0][j], (j < 2 ? 0.2 : [0, 0, 1.2, 2.6, 4.0][j]) + 0.4), () => T(h, x, 162, { size: 14, weight: 600, color: j < 2 ? C.ink : C.violet })));
  Ln([[64, 174], [1100, 174]]);
  sorted.forEach((o, i) => {
    const y = 206 + i * 40, tie = o.v === 48;
    A(seg(t, 0.3 + i * 0.08, 0.6 + i * 0.08), () => { if (tie) R(54, y - 26, 1060, 36, { fill: C.violetS, r: 4 }); M(o.m, 64, y, { size: 14, color: C.teal }); M(fv(o.v), 230, y, { size: 14, color: o.v == null ? C.coral : C.ink }); });
    A(seg(t, 1.4 + i * 0.08, 1.7 + i * 0.08), () => M(String(rn[i]), 400, y, { size: 15, weight: 600 }));
    A(seg(t, 2.8 + i * 0.08, 3.1 + i * 0.08), () => M(String(rk[i]), 640, y, { size: 15, weight: 600 }));
    A(seg(t, 4.2 + i * 0.08, 4.5 + i * 0.08), () => M(String(dr[i]), 860, y, { size: 15, weight: 600 }));
  });
  A(seg(t, 1.8, 2.2), () => M('never ties', 400, 470, { size: 12, color: C.muted }));
  A(seg(t, 3.2, 3.6), () => M('ties share · then skip', 640, 470, { size: 12, color: C.muted }));
  A(seg(t, 4.6, 5.0), () => M('ties share · no gap', 860, 470, { size: 12, color: C.muted }));
  A(seg(t, 5.6, 6.0), () => M('the null sorts last and still gets a rank · a tie needs every order_by key equal', 64, 540, { size: 13, color: C.coral }));
}

/* ---------- 10. over aggregated rows ---------- */
function sAgg(t) {
  CAP('GROUPS + AGGREGATIONS FIRST, THEN WINDOWS OVER THE RESULT ROWS', 64, 124, { color: C.violet });
  const tot = NORTH.map((v, i) => (v ?? 0) + SOUTH[i]);
  A(seg(t, 0.3, 0.7), () => {
    card(64, 150, 420, 200, C.teal);
    const L = [['"groups": [{ "field": "month" }],', C.ink], ['"aggregations": [{ "type": "AGG_SUM",', C.ink], ['   "field": "sales", "label": "total" }],', C.ink], ['"windows": [{ "type": "WIN_RUNNING_SUM",', C.violet], ['   "field": "total", "label": "cum", … }]', C.violet]];
    L.forEach(([s, c], i) => M(s, 84, 186 + i * 30, { size: 12.5, color: c }));
  });
  bars(t, 540, 150, 640, 200, tot, { max: 90, at: 1.4 });
  outRow(t, 540, 640, 410, tot, 'total', C.teal, 1.6);
  outRow(t, 540, 640, 450, framed(tot, null, 0, ssum), 'cum', C.violet, 2.8);
  outRow(t, 540, 640, 490, pct(tot), 'chg', C.violet, 4.0);
  A(seg(t, 5.2, 5.6), () => M('the window reads the aggregate\'s label, one row per month: a cumulative total and month-on-month change', 64, 560, { size: 13, color: C.ink }));
}

/* ---------- 11. top N ---------- */
function sTopN(t) {
  CAP('TOP 2 PER REGION · filters run before windows', 64, 124, { color: C.coral });
  const st = [['materialize', 'WIN_ROW_NUMBER by region, sales desc → a new cohort with an rn column', C.violet], ['process', 'FILTER_RANGE rn in [1, 2] on that new cohort', C.teal]];
  A(seg(t, 0.3, 0.7), () => {
    card(64, 150, 1152, 90, C.coral);
    M('one request cannot filter on a window: its filters ran before the window existed', 86, 186, { size: 14, color: C.ink });
    M('so write the column first: materialize stores it as an ordinary field in a new cohort', 86, 214, { size: 13.5, color: C.teal });
  });
  st.forEach(([h, d, col], i) => A(seg(t, 2.2 + i * 1.4, 2.6 + i * 1.4), () => {
    const y = 270 + i * 110;
    R(64, y, 1152, 90, { fill: C.panel, stroke: col });
    M(h, 86, y + 34, { size: 13, color: col, weight: 600 }); M(d, 220, y + 34, { size: 13.5, color: C.ink });
    if (i === 0) arrow(640, y + 90, 640, y + 108, { stroke: C.faint });
  }));
  A(seg(t, 5.0, 5.4), () => {
    const keep = [['North', 'May 48', 'Jun 48'], ['South', 'Jun 35', 'Apr 31']];
    keep.forEach((k, i) => { M(k[0], 86, 528 + i * 26, { size: 13.5, color: i ? C.amber : C.teal }); M(k[1] + ' · ' + k[2], 200, 528 + i * 26, { size: 13.5, color: C.ink }); });
  });
}

/* ---------- 12. recap ---------- */
const OPS = [['WIN_LAG', 'a value from rows before'], ['WIN_LEAD', 'a value from rows after'], ['WIN_DELTA', 'change, in the field\'s units'], ['WIN_PCT_CHANGE', 'change, as a fraction'],
  ['WIN_RUNNING_SUM', 'total so far'], ['WIN_RUNNING_AVG', 'average so far'], ['WIN_MOVING_AVG', 'average of a bounded frame'], ['WIN_EWMA', 'exponential smoothing'],
  ['WIN_ROW_NUMBER', 'position, never tied'], ['WIN_RANK', 'rank, gaps after ties'], ['WIN_DENSE_RANK', 'rank, no gaps']];
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('WINDOWS TODAY', 64, 124, { color: C.violet });
    OPS.forEach(([op, d], i) => A(seg(t, 0.2 + i * 0.06, 0.5 + i * 0.06), () => { const x = 64 + (i % 4) * 290, y = 138 + Math.floor(i / 4) * 64; R(x, y, 278, 54, { fill: C.panel, stroke: C.violet }); M(op, x + 14, y + 23, { size: 12, color: C.violet, weight: 600 }); T(d, x + 14, y + 44, { size: 14 }); }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 348, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 376, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 400, { size: 14.5 });
      R(650, 348, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 376, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 400, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('WINDOWS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('check the partition and the order before the number', 640, 430, { size: 15, align: 'center' });
    M('next: tests and regressions', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[5.077, 7.019, 4.928, 7.893, 8.213, 4.203, 6.699, 3.989, 5.077, 6.72, 8.043, 6.101, 1.579, 3.947, 4.16, 6.187, 8.341, 4.437, 6.443, 7.723, 4.437, 3.221, 7.125, 6.763, 6.059, 4.672, 5.909, 2.816, 2.56, 3.243, 2.368, 4.373, 3.392, 4.608, 5.205, 8.384, 2.411, 6.101, 7.424, 6.016, 1.024]/*END*/;
PulseFilm.mount({
  series: 'PULSE · WINDOWS',
  narr: NARR,
  scenes: [
    { name: 'Pulse Windows', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse windows. One value per row, read from its neighbours, taken apart in depth.', true]] },
    { name: 'Where windows run', dur: 8, draw: sWhere, caps: [
      [0, 'Windows run sixth, after aggregation. They see one row per group, or one row per record when nothing was grouped.'],
      [2.4, 'Each window names a type and a field, a partition and an order, plus its own parameters.'],
      [4.6, 'It adds one new column to every row and collapses nothing. Without a label, the column is the type and the field joined together.'],
      [6.4, 'A window needs its partition sorted, so any window turns streaming off. Windows that share a partition and an order share one sort.']] },
    { name: 'Partition, order, frame', dur: 8.6, draw: sAxes, caps: [
      [0, 'Every window shares three ideas. Here are twelve rows, as they\'re stored.'],
      [1.6, 'Partition carves them into independent slices, here by region. A window never reads across a partition.'],
      [3.4, 'Order sorts each slice. That order is the direction the window scans.'],
      [5.2, 'And the frame bounds which rows the current row may read, such as the two before it and itself.']] },
    { name: 'Order rules', dur: 6.4, draw: sOrder, caps: [
      [0, 'Nulls always sort last, whichever direction you choose. Descending reverses only the values that exist.', 'Nulls always sort last, whichever direction you choose. Descending reverses only the values that exist.'],
      [4.4, 'The order is the scan order, not the response order. Rows come back as they went in, so add a sort to the request if you need them ordered.']] },
    { name: 'Lag and lead', dur: 6.4, draw: sLag, caps: [
      [0, 'Lag reads a value from earlier in the partition, by an offset you choose. A null carries straight through.'],
      [3.0, 'Lead reads forward instead.'],
      [5.0, 'At the edge there is no neighbour, so you get null, or a default you set.']] },
    { name: 'Change', dur: 6.8, draw: sChange, caps: [
      [0, 'Delta subtracts the earlier value, so it reads in the field\'s own units.'],
      [2.4, 'Percent change divides by it instead, giving a fraction. If either side is null, both return null.'],
      [4.0, 'From February to March, sales went from zero to thirty. Delta says thirty. Percent change says null, because it won\'t divide by zero.'],
      [5.6, 'Use points when the metric is already a rate, and the fraction when the base matters.']] },
    { name: 'Running totals', dur: 6.2, draw: sRunning, caps: [
      [0, 'Running sum and running average read everything so far: a frame with no start, ending at the current row.'],
      [4.6, 'April is null. It\'s skipped, not counted as zero. The total holds, and the average divides by the values that exist.']] },
    { name: 'Moving averages', dur: 6.4, draw: sMoving, caps: [
      [0, 'A moving average reads a frame bounded on both sides, like the last three months.'],
      [3.2, 'Shift the frame and it centres on the current month instead.'],
      [4.8, 'Leave one end open and predict refuses it, because that\'s a running average. Near the start, the frame is simply shorter.']] },
    { name: 'Exponential smoothing', dur: 6.4, draw: sEwma, caps: [
      [0, 'An exponentially weighted moving average blends each value with everything before it, weighting recent values more.'],
      [3.2, 'Set either alpha or decay, never both. A higher alpha follows the latest value more closely.'],
      [4.8, 'A null row returns null, but the smoothing carries on to the next real value.']] },
    { name: 'Ranking', dur: 7, draw: sRank, caps: [
      [0, 'Ranking windows read no field. The order is their whole input, here sales from highest to lowest.'],
      [1.2, 'Row number counts one, two, three, and never ties.'],
      [2.6, 'Rank lets ties share a place, then skips ahead.'],
      [4.0, 'Dense rank lets ties share a place, with no gap after.'],
      [5.6, 'The null sorts last and still gets a rank.']] },
    { name: 'Over aggregated rows', dur: 6.4, draw: sAgg, caps: [
      [0, 'Because windows run after aggregation, they can work on the result rows.'],
      [1.4, 'Group by month, sum the sales, then window over the totals.'],
      [2.8, 'That gives a cumulative total and a month-on-month change in a single request.']] },
    { name: 'Top N per group', dur: 6.4, draw: sTopN, caps: [
      [0, 'One request can\'t filter on a window, because its filters ran before the window existed.'],
      [2.2, 'So write the column first. Materialize stores the row number as an ordinary field in a new cohort, and the next request filters on it.'],
      [5.0, 'That keeps the top two months in every region.']] },
    { name: 'The window toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the window toolkit today: offsets, changes, running and moving aggregates, smoothing and ranks.'],
      [3.4, 'More windows are added over time, and embedders can register their own. The manifest always shows what your instance offers.'],
      [6.4, 'Remember: check the partition and the order before you read the number. Next up, tests and regressions.'],
      [9.0, '', 'Pulse windows.', true]] },
  ],
});
})();
