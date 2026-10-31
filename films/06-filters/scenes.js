/* Pulse Filters: film 6 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts; narration says more filters are
 * added over time and the manifest is the authority. Every count on screen is copied from a recorded
 * alpha.33 run in data/ (see data/README.md); each scene names the run it quotes. */
(() => {
const { C, MONO } = PulseFilm;
const { clamp, seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, arrow, chips, measure } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });

/* ---------- a ten-member cohort with every kind of null (data/f.csv) ---------- */
const DICT = ['travel', 'tech', 'sport', 'food'];            // set dictionary, bit i ↔ entry i (data/f.inspect.json)
const ROWS = [
  { id: 1, region: 'North', age: 34, opted: true, joined: '2023-03-14', set: ['travel', 'tech'] },
  { id: 2, region: 'South', age: 17, opted: false, joined: '2024-01-09', set: ['sport'] },
  { id: 3, region: 'East', age: null, opted: true, joined: '2022-11-02', set: ['food'] },
  { id: 4, region: 'West', age: 29, opted: null, joined: '2023-07-21', set: ['travel', 'food'] },
  { id: 5, region: null, age: 71, opted: true, joined: '2021-05-30', set: ['food'] },
  { id: 6, region: 'South', age: 38, opted: false, joined: '2023-09-05', set: ['tech'] },
  { id: 7, region: 'East', age: 52, opted: true, joined: '2022-02-17', set: null },
  { id: 8, region: 'West', age: 24, opted: true, joined: '2024-04-11', set: ['sport', 'tech'] },
  { id: 9, region: 'North', age: 41, opted: false, joined: '2023-12-01', set: ['travel'] },
  { id: 10, region: 'South', age: 63, opted: true, joined: '2022-06-24', set: [] },
];
const mask = s => s == null ? null : s.reduce((m, l) => m | (1 << DICT.indexOf(l)), 0);
const fmtv = (r, k) => {
  const v = r[k];
  if (v == null) return 'null';
  if (k === 'opted') return v ? 'true' : 'false';
  if (k === 'set') return v.length ? v.join(', ') : '{ }';
  return String(v);
};
const COLS = [['id', '#', 40], ['region', 'region', 90], ['age', 'age', 56], ['opted', 'opted_in', 86], ['joined', 'joined', 112], ['set', 'interests', 150]];
const X0 = 64, Y0 = 150, rowY = i => Y0 + 42 + i * 32, TW = COLS.reduce((a, c) => a + c[2], 0);

/* Animate one filter over the cohort. verdict(r) → { keep, isNull }, where isNull means the filter's input
 * field was null on entry. n_null_input counts every such record, kept or dropped (filter_pass.go). */
function filterDemo(t, verdict, o = {}) {
  const at = o.at ?? 1.0, step = o.step ?? 0.24, hi = o.hi || [];
  let x = X0;
  COLS.forEach(([k, l, w]) => { T(l, x + 8, Y0, { size: 14, weight: 600, color: hi.includes(k) ? C.amber : C.ink }); x += w; });
  Ln([[X0, Y0 + 14], [X0 + TW, Y0 + 14]]);
  let nin = 0, nout = 0, nnull = 0;
  ROWS.forEach((r, i) => {
    const y = rowY(i), s = at + i * step, done = t >= s + 0.15;
    const v = verdict(r);
    if (done) { nin++; if (v.keep) nout++; if (v.isNull) nnull++; }
    const fade = done && !v.keep ? 0.45 + 0.55 * (1 - seg(t, s + 0.3, s + 0.9)) : 1;
    if (t >= s && t < s + 0.4) R(X0 - 6, y - 21, TW + 12, 30, { fill: C.panel2, stroke: C.teal, r: 3 });
    else if (done) R(X0 - 6, y - 21, TW + 12, 30, { fill: v.keep ? C.tealS : C.coralS, r: 3 });
    A(fade, () => {
      let cx = X0;
      COLS.forEach(([k, l, w]) => { const s2 = fmtv(r, k); M(s2, cx + 8, y, { size: 13.5, color: s2 === 'null' ? C.coral : hi.includes(k) ? C.amber : C.ink }); cx += w; });
    });
    if (done) A(seg(t, s + 0.15, s + 0.4), () => {
      const lbl = v.keep ? 'keep' : 'drop';
      R(X0 + TW + 14, y - 18, 56, 24, { fill: v.keep ? C.tealS : C.coralS, stroke: v.keep ? C.teal : C.coral, r: 12 });
      M(lbl, X0 + TW + 42, y - 2, { size: 12, align: 'center', color: v.keep ? C.teal : C.coral });
      if (v.isNull) M('null', X0 + TW + 78, y - 2, { size: 11.5, color: C.coral });
    });
  });
  return { nin, nout, nnull };
}
function counters(x, y, c, o = {}) {
  [['n_in', c.nin, C.ink], ['n_out', c.nout, C.teal], ['n_null_input', c.nnull, C.coral]].forEach(([k, v, col], j) => {
    const cx = x + j * (o.gap ?? 150);
    M(k, cx, y, { size: 12 }); T(String(v), cx, y + 40, { size: 32, weight: 700, color: col, stretch: 'expanded' });
  });
}
function opCard(y, name, line, color, extra = []) {
  card(760, y, 456, 76 + extra.length * 24, color);
  M(name, 780, y + 30, { size: 14, color, weight: 600 }); M(line, 780, y + 56, { size: 13.5, color: C.ink });
  extra.forEach((e, i) => M(e, 780, y + 82 + i * 24, { size: 12.5 }));
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  for (let i = 0; i < 10; i++) {
    const keep = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0][i];
    const u = eo(seg(t, 0.2 + i * 0.07, 0.8 + i * 0.07)), drop = keep ? 0 : eo(seg(t, 1.0 + i * 0.05, 1.6 + i * 0.05));
    A(u * (1 - drop * 0.85), () => R(420 + i * 46, 360 + drop * 60, 38, 22, { fill: keep ? C.tealS : C.coralS, stroke: keep ? C.teal : C.coral, r: 3 }));
  }
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 290, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('FILTERS', 640, 500, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.coral });
  });
  A(seg(t, 2.0, 2.8), () => T('Which records reach the rest of the request, in depth', 640, 548, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where filters run ---------- */
const SPINE = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
function sWhere(t) {
  A(seg(t, 0.1, 0.4), () => M('the default slot order', 64, 92, { size: 12 }));
  SPINE.forEach((n, i) => {
    const x = 64 + i * 164, on = i === 1;
    A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08) * (on ? 1 : 0.55), () => {
      R(x, 110, 150, 52, { fill: on ? C.coralS : C.panel, stroke: on ? C.coral : C.rule, lw: on ? 2 : 1.2 });
      T(n, x + 14, 142, { size: 15.5, weight: 600, color: on ? C.ink : C.muted });
      if (i < 6) arrow(x + 150, 136, x + 162, 136, { stroke: C.faint, head: 6 });
    });
  });
  A(seg(t, 1.0, 1.4), () => {
    arrow(140, 172, 260, 200, { stroke: C.teal, head: 7 }); M('feature columns: readable', 64, 222, { size: 12.5, color: C.teal });
    Ln([[392, 172], [300, 200]], { stroke: C.coral, lw: 1.4, dash: [4, 4] }); M('attribute labels: no · one exception, ATTR_PREVIOUS_STATE in FILTER_EXPRESSION', 320, 222, { size: 12.5, color: C.coral });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(64, 250, 600, 220, C.coral);
    const L = [['"filterers": [', C.muted], ['  { "type": "FILTER_INCLUDE", "field": "region",', C.ink], ['    "values": ["North", "South"] },', C.amber], ['  { "type": "FILTER_RANGE", "field": "age",', C.ink], ['    "values": ["18", "65"] }', C.amber], [']', C.muted]];
    L.forEach(([s, c], i) => A(seg(t, 2.8 + i * 0.12, 3.1 + i * 0.12), () => M(s, 86, 288 + i * 30, { size: 14, color: c })));
  });
  A(seg(t, 4.4, 4.8), () => {
    card(700, 250, 516, 220);
    CAP('VALUES ARE STRINGS', 722, 280);
    M('categorical → resolved through the dictionary', 722, 314, { size: 13, color: C.ink });
    M('numeric    → parsed as a number', 722, 340, { size: 13, color: C.ink });
    M('an unknown label is refused before any row is read:', 722, 380, { size: 12.5 });
    M('PROCESSING_CONFIG · the request fails, no rows', 722, 404, { size: 13, color: C.coral });   // data/unk.out.json
    M('no column is added · a filter only keeps or drops', 722, 444, { size: 12.5 });
  });
}

/* ---------- 2. chain and counters ---------- */
function stage(t, x, at, name, c) {
  A(seg(t, at, at + 0.4), () => {
    R(x, 210, 300, 200, { fill: C.panel, stroke: C.coral });
    M(name[0], x + 18, 240, { size: 13, color: C.coral, weight: 600 }); M(name[1], x + 18, 262, { size: 12.5, color: C.ink });
    const u = seg(t, at + 0.3, at + 1.3);
    [['n_in', c[0], C.ink], ['n_out', c[1], C.teal], ['n_null_input', c[2], C.coral]].forEach(([k, v, col], j) => {
      M(k, x + 18, 300 + j * 36, { size: 12 }); M(String(Math.round(v * u)), x + 282, 300 + j * 36, { size: 16, color: col, align: 'right', weight: 600 });
    });
  });
}
function sChain(t) {
  CAP('FILTERS RUN IN DECLARED ORDER · EACH SEES ONLY WHAT THE LAST ONE KEPT', 64, 140);
  const A1 = [['FILTER_NULL age', 'is_not_null'], ['FILTER_RANGE age', '18 to 65'], ['FILTER_INCLUDE region', 'North, South']];
  const C1 = [[1000, 959, 41], [959, 643, 0], [643, 304, 19]];   // data/chain.out.json, on data/k.csv
  A1.forEach((n, i) => { stage(t, 64 + i * 390, 0.4 + i * 1.0, n, C1[i]); if (i < 2) A(seg(t, 1.0 + i * 1.0, 1.3 + i * 1.0), () => arrow(64 + i * 390 + 300, 310, 64 + i * 390 + 386, 310, { stroke: C.teal, head: 8, lw: 2 })); });
  A(seg(t, 3.6, 4.0), () => { M('1,000 records in → 304 through. Every filter reports its own counts.', 64, 450, { size: 14, color: C.ink }); });
  A(seg(t, 5.2, 5.6), () => {
    R(64, 480, 1152, 64, { fill: C.panel2, stroke: C.amber });
    M('swap the first two:', 86, 508, { size: 13, color: C.amber });
    M('FILTER_RANGE then sees 1,000 · drops the 41 null ages itself → n_null_input 41', 260, 508, { size: 13, color: C.ink });
    M('the 304 survivors are identical; only the per-filter counts move', 86, 532, { size: 12.5 });   // data/swap.out.json
  });
}

/* ---------- 3. include / exclude (data/inc.out.json, data/exc.out.json) ---------- */
function sMembership(t) {
  const flip = t >= 5.0;
  const lt = flip ? t - 5.0 + 0.6 : t;
  const c = filterDemo(lt, flip ? r => ({ keep: r.region == null || !['North', 'South'].includes(r.region), isNull: r.region == null }) : r => ({ keep: r.region != null && ['North', 'South'].includes(r.region), isNull: r.region == null }), { hi: ['region'], at: 1.0, step: 0.22 });
  opCard(150, flip ? 'FILTER_EXCLUDE region' : 'FILTER_INCLUDE region', 'values ["North", "South"]', flip ? C.amber : C.coral, [flip ? 'a block-list: drop the listed values' : 'an allow-list: keep the listed values', 'any type except set_*: use the set filters']);
  counters(780, 330, c);
  A(seg(lt, 3.6, 4.0), () => {
    R(760, 430, 456, 56, { fill: flip ? C.tealS : C.coralS, stroke: flip ? C.teal : C.coral });
    M(flip ? 'null region (#5) PASSES an exclude · counted' : 'null region (#5) is DROPPED by an include', 780, 464, { size: 13.5, color: C.ink });
  });
}

/* ---------- 4. range (data/rng.out.json) ---------- */
function sRange(t) {
  const c = filterDemo(t, r => ({ keep: r.age != null && r.age >= 18 && r.age <= 65, isNull: r.age == null }), { hi: ['age'], at: 0.8, step: 0.2 });
  opCard(150, 'FILTER_RANGE age', 'values ["18", "65"] · low ≤ x ≤ high', C.coral, ['both ends inclusive · null dropped']);
  counters(780, 296, c);
  A(seg(t, 3.4, 3.8), () => {
    const nx = v => lerp(780, 1196, v / 80);
    Ln([[780, 420], [1196, 420]], { stroke: C.rule, lw: 2 });
    R(nx(18), 410, nx(65) - nx(18), 20, { fill: C.tealS, stroke: C.teal, r: 3 });
    [18, 65].forEach(v => { dot(nx(v), 420, 6, C.teal); M(String(v), nx(v), 448, { size: 12.5, align: 'center', color: C.teal }); });
    M('kept', (nx(18) + nx(65)) / 2, 404, { size: 12, align: 'center', color: C.teal });
  });
  A(seg(t, 5.2, 5.6), () => {
    card(760, 468, 456, 78);
    M('a date is matched as its epoch-day number:', 780, 496, { size: 12.5 }); M('pass "19723", not "2024-01-01"', 780, 520, { size: 13.5, color: C.ink });
    M('open intervals → FILTER_EXPRESSION', 1196, 520, { size: 12, align: 'right', color: C.amber });
  });
}

/* ---------- 5. date ranges (data/dr.out.json; Berlin: data/berlin, utc, rowtz .out.json) ---------- */
function sDates(t) {
  CAP('FILTER_DATE_RANGES joined · params.ranges', 64, 140, { color: C.coral });
  A(seg(t, 0.3, 0.7), () => {
    card(64, 160, 560, 168, C.coral);
    const L = [['"params": { "ranges": [', C.muted], ['  { "label": "spring", "start": "2023-03-01",', C.ink], ['    "end": "2023-05-31" },', C.ink], ['  { "label": "since-2024", "start": "2024-01-01",', C.ink], ['    "end": null } ] }', C.amber]];
    L.forEach(([s, c], i) => M(s, 86, 196 + i * 28, { size: 13.5, color: c }));
  });
  A(seg(t, 1.4, 1.8), () => {
    card(660, 160, 556, 168);
    M('inclusive · a null bound is open-ended', 682, 196, { size: 13, color: C.ink });
    M('or name a registered RangeTable instead', 682, 222, { size: 13, color: C.ink });
    M('ranges XOR table · overlap or duplicate label → refused', 682, 256, { size: 12.5 });
    M('the label is validated, but adds no column', 682, 282, { size: 12.5 });
    M('null date, or null tz_field zone cell → dropped, counted', 682, 308, { size: 12.5, color: C.coral });
  });
  // the zone example: a UTC instant that is already tomorrow in Berlin
  A(seg(t, 4.0, 4.4), () => {
    CAP('A DATETIME FLOORS TO ITS LOCAL DAY · tz Europe/Berlin', 64, 380, { color: C.amber });
    const dx = d => 64 + d * 230;
    ['Feb 27', 'Feb 28', 'Mar 1', 'Mar 2', 'Mar 3'].forEach((d, i) => { R(dx(i), 400, 222, 56, { fill: i >= 2 ? C.tealS : C.panel, stroke: i >= 2 ? C.teal : C.rule }); M(d + ' (Berlin)', dx(i) + 12, 434, { size: 13, color: i >= 2 ? C.teal : C.muted }); });
    M('range start 2026-03-01', dx(2) + 4, 478, { size: 12.5, color: C.teal });
  });
  A(seg(t, 5.2, 5.6), () => {
    const x = 64 + 2 * 230 + 0.02 * 230;
    dot(x, 428, 8, C.amber);
    R(x - 260, 488, 352, 52, { fill: C.amberS, stroke: C.amber });
    M('2026-02-28T23:30Z = Mar 1, 00:30 in Berlin', x - 248, 512, { size: 12.5, color: C.ink }); M('→ kept', x - 248, 532, { size: 12.5, color: C.teal });
  });
  A(seg(t, 7.4, 7.8), () => {
    R(700, 488, 516, 52, { fill: C.panel, stroke: C.rule });
    M('no zone: UTC day, Feb 28 → dropped', 716, 512, { size: 12.5, color: C.coral });
    M('tz_field: each row\'s own zone · a null zone is counted', 716, 532, { size: 12.5 });
  });
}

/* ---------- 6. booleans and nulls (data/tru, fal, fals, nul .out.json) ---------- */
function sBool(t) {
  const phase = t < 4.6 ? 0 : t < 8.2 ? 1 : 2;
  const lt = phase === 0 ? t : phase === 1 ? t - 4.6 + 0.6 : t - 8.2 + 0.6;
  const V = [
    r => ({ keep: r.opted === true, isNull: r.opted == null }),
    r => ({ keep: r.opted === false || r.opted == null, isNull: r.opted == null }),   // kept, and still counted
    r => ({ keep: r.age == null, isNull: r.age == null }),   // is_null: n_null_input mirrors n_out
  ][phase];
  const c = filterDemo(lt, V, { hi: [phase === 2 ? 'age' : 'opted'], at: 1.0, step: 0.18 });
  if (phase === 0) opCard(150, 'FILTER_TRUE opted_in', 'strict (default): packed_bool, raw 1', C.coral, ['values ["truthy"]: any scalar type, JS-style truth', 'null dropped in both modes']);
  if (phase === 1) opCard(150, 'FILTER_FALSE opted_in · ["truthy"]', 'keeps false, 0, NaN, "" and null', C.amber, ['strict mode would DROP the null (#4)', 'truthy: null is falsy, kept · still n_null_input 1']);
  if (phase === 2) opCard(150, 'FILTER_NULL age · ["is_null"]', 'reads the null bitmap, nothing else', C.violet, ['NaN or an empty set is NOT null', '"is_not_null" first, then a value filter']);
  counters(780, 330, c);
}

/* ---------- 7. sets (data/set_any, set_all, set_none, set_equals .out.json) ---------- */
const SETOPS = [
  ['FILTER_SET_CONTAINS_ANY', 'row & query ≠ 0', (m, q) => (m & q) !== 0, false],
  ['FILTER_SET_CONTAINS_ALL', 'row & query = query', (m, q) => (m & q) === q, false],
  ['FILTER_SET_CONTAINS_NONE', 'row & query = 0', (m, q) => (m & q) === 0, true],
  ['FILTER_SET_EQUALS', 'row = query', (m, q) => m === q, false]];
function bits(x, y, m, o = {}) {
  DICT.forEach((d, i) => {
    const on = m != null && (m >> i) & 1;
    R(x + i * 26, y, 22, 22, { fill: m == null ? C.coralS : on ? (o.col || C.tealS) : C.panel, stroke: m == null ? C.coral : on ? (o.stroke || C.teal) : C.rule, r: 3 });
    if (m != null) M(on ? '1' : '0', x + i * 26 + 11, y + 16, { size: 12, align: 'center', color: on ? C.ink : C.faint });
  });
}
function sSets(t) {
  const Q = mask(['travel', 'tech']);
  CAP('interests · bit i ↔ dictionary entry i', 64, 130);
  M('0 travel · 1 tech · 2 sport · 3 food', 64, 152, { size: 12 });
  DICT.forEach((d, i) => M(String(i), 300 + i * 26 + 11, 162, { size: 11, align: 'center', color: C.muted }));
  M('query {travel, tech}', 64, 186, { size: 13, color: C.amber }); bits(300, 170, Q, { col: C.amberS, stroke: C.amber });
  ROWS.forEach((r, i) => {
    const y = 214 + i * 32, m = mask(r.set);
    A(seg(t, 0.4 + i * 0.05, 0.7 + i * 0.05), () => { M('#' + r.id, 64, y + 16, { size: 13, color: C.teal }); M(fmtv(r, 'set'), 104, y + 16, { size: 13, color: r.set == null ? C.coral : C.ink }); bits(300, y, m); });
  });
  // the four ops as verdict columns
  SETOPS.forEach(([name, rule, fn, nullKeep], k) => {
    const x = 440 + k * 196, a = seg(t, 1.6 + k * 1.6, 2.0 + k * 1.6);
    A(a, () => {
      M(name.replace('FILTER_SET_', ''), x, 162, { size: 11.5, color: C.coral, weight: 600 }); M(rule, x, 186, { size: 12, color: C.ink });
      ROWS.forEach((r, i) => {
        const m = mask(r.set), keep = m == null ? nullKeep : fn(m, Q), y = 214 + i * 32;
        A(seg(t, 2.0 + k * 1.6 + i * 0.06, 2.3 + k * 1.6 + i * 0.06), () => { R(x, y, 64, 22, { fill: keep ? C.tealS : C.coralS, stroke: keep ? C.teal : C.coral, r: 11 }); M(keep ? 'keep' : 'drop', x + 32, y + 15, { size: 11.5, align: 'center', color: keep ? C.teal : C.coral }); });
      });
    });
  });
  A(seg(t, 8.6, 9.0), () => { M('one bitwise test per row · null set (#7): only NONE keeps it, all four count it · empty set (#10) is a value, not null', 64, 556, { size: 12.5, color: C.ink }); });
}

/* ---------- 8. expressions (data/expr.out.json; the typo: data/bad.predict.json, bad.out.json) ---------- */
function sExpr(t) {
  const c = filterDemo(t, r => ({ keep: r.age != null && r.set != null && r.age >= 30 && r.set.includes('travel'), isNull: false }), { hi: ['age', 'set'], at: 2.4, step: 0.22 });
  A(seg(t, 0.3, 0.7), () => {
    R(760, 150, 456, 70, { fill: C.panel, stroke: C.coral });
    M('FILTER_EXPRESSION', 780, 178, { size: 14, color: C.coral, weight: 600 }); M('age >= 30 and "travel" in interests', 780, 204, { size: 14, color: C.ink });
  });
  A(seg(t, 1.2, 1.6), () => {
    card(760, 232, 456, 132);
    M('categorical → its label, a string', 780, 260, { size: 12.5, color: C.ink }); M('set_*       → a list of labels', 780, 284, { size: 12.5, color: C.ink });
    M('names no field, so n_null_input stays 0', 780, 308, { size: 12.5 });
  });
  A(seg(t, 2.4, 2.8), () => {
    M('compiled once · a typo fails before any row:', 780, 334, { size: 12.5 });
    M('PULSE_FORMULA_COMPILE_ERROR · predict and run', 780, 354, { size: 12.5, color: C.coral });
  });
  counters(780, 392, c, { gap: 150 });
  A(seg(t, 5.8, 6.2), () => {
    R(760, 462, 456, 96, { fill: C.coralS, stroke: C.coral });
    M('a null binds nil', 780, 488, { size: 13, color: C.coral, weight: 600 });
    M('== → false   != → true   >  → unknown: row dropped', 780, 512, { size: 12.5, color: C.ink });
    M('guard with  age ?? 0   or   age == nil ? … : …', 780, 538, { size: 12.5, color: C.ink });
  });
}

/* ---------- 8b. what an expression can read: params, calendar helpers, a previous state ---------- */
function exCol(t, at, x, head, color, lines) {
  A(seg(t, at, at + 0.4), () => {
    R(x, 132, 368, 344, { fill: C.panel, stroke: color });
    M(head, x + 18, 162, { size: 13, color, weight: 600 });
    lines.forEach(([s, col, size], i) => A(seg(t, at + 0.3 + i * 0.12, at + 0.6 + i * 0.12), () => M(s, x + 18, 196 + i * 26, { size: size || 12.5, color: col || C.muted })));
  });
}
function sExprMore(t) {
  // data/par.out.json: 6 of 10 kept, n_null_input 0
  exCol(t, 0.3, 64, 'PARAMS', C.amber, [
    ['"params": { "min_age": 30 }', C.amber, 13], ['FILTER_EXPRESSION', C.coral], ['  age >= params.min_age', C.ink, 13], ['', 0],
    ['n_in 10 · n_out 6', C.teal], ['null age (#3) → nil → dropped', C.coral], ['', 0],
    ['change the value,', C.ink], ['never the expression text', C.ink], ['an undeclared name is refused', 0]]);
  // data/cal.out.json: #5 joined Sunday 2021-05-30; data/badday.predict.json: the datetime guard
  exCol(t, 3.0, 456, 'CALENDAR HELPERS', C.teal, [
    ['weekday · month_index', C.ink, 13], ['date_trunc · to_day', C.ink, 13], ['a date reads as epoch days', 0], ['', 0],
    ['weekday(joined) >= 6', C.ink, 13], ['n_out 1 · #5 joined on a Sunday', C.teal], ['ISO weekday: Monday = 1', 0], ['', 0],
    ['a datetime needs to_day() first:', 0], ['weekday(at) → refused at compile', C.coral], ['PULSE_FORMULA_COMPILE_ERROR', C.coral]]);
  // data/prev.out.json: 12 rows in, subjects a and e kept (trial → paid)
  exCol(t, 6.6, 848, 'A PREVIOUS STATE', C.violet, [
    ['ATTR_PREVIOUS_STATE plan → prev', C.violet], ['runs over every record,', C.ink], ['before the filters', C.ink], ['', 0],
    ['prev == "trial" and plan == "paid"', C.ink, 13], ['n_in 12 · n_out 2 (a, e)', C.teal], ['', 0],
    ['the only attribute a filter reads', C.ink], ['FILTER_EXPRESSION only,', 0], ['by state name', 0]]);
}

/* ---------- 9. null scorecard ---------- */
const SCORE = [['FILTER_INCLUDE', 'drop'], ['FILTER_EXCLUDE', 'keep'], ['FILTER_RANGE', 'drop'], ['FILTER_DATE_RANGES', 'drop'], ['FILTER_TRUE (both modes)', 'drop'],
  ['FILTER_FALSE strict', 'drop'], ['FILTER_FALSE truthy', 'keep'], ['FILTER_NULL is_null', 'keep'], ['FILTER_NULL is_not_null', 'drop'], ['SET_CONTAINS_ANY · ALL · EQUALS', 'drop'],
  ['SET_CONTAINS_NONE', 'keep'], ['FILTER_EXPRESSION', 'depends']];
function sScore(t) {
  CAP('WHAT HAPPENS TO A NULL ROW', 64, 140, { color: C.coral });
  SCORE.forEach(([n, v], i) => {
    const col = i % 2, row = Math.floor(i / 2), x = 64 + col * 584, y = 164 + row * 62;
    A(seg(t, 0.4 + i * 0.22, 0.7 + i * 0.22), () => {
      R(x, y, 568, 52, { fill: C.panel, stroke: C.rule });
      M(n, x + 18, y + 32, { size: 13.5, color: C.ink });
      const c = v === 'keep' ? C.teal : v === 'drop' ? C.coral : C.amber, s = v === 'keep' ? C.tealS : v === 'drop' ? C.coralS : C.amberS;
      R(x + 440, y + 12, 110, 28, { fill: s, stroke: c, r: 14 }); M(v, x + 495, y + 31, { size: 13, align: 'center', color: c });
    });
  });
  A(seg(t, 4.0, 4.4), () => M('kept or dropped, every null input is counted in that filter\'s n_null_input · FILTER_EXPRESSION names no field: 0', 64, 552, { size: 13, color: C.ink }));
}

/* ---------- 10. fast paths ---------- */
function sFast(t) {
  const items = [
    ['row-local', 'Every filter decides from one row, so filters stream and never hold the cohort.', C.teal],
    ['mergeable counters', 'n_in, n_out and n_null_input add up across shards and workers.', C.teal],
    ['one bitwise test', 'Set filters resolve their labels to a mask once, then test each row with a single operation.', C.amber],
    ['compiled once', 'An expression is parsed and type-checked before the first row, never per row.', C.amber],
    ['parent-group precompute', 'On a grouped cohort, a filter over one group\'s fields is answered once per dictionary entry, then looked up per row.', C.violet]];
  items.forEach(([h, d, c], i) => A(seg(t, 0.4 + i * 0.9, 0.8 + i * 0.9), () => {
    const y = 140 + i * 82;
    R(64, y, 1152, 70, { fill: C.panel, stroke: c });
    M(h, 86, y + 30, { size: 14, color: c, weight: 600 }); T(d, 86, y + 54, { size: 15 });
  }));
}

/* ---------- 11. recap ---------- */
const OPS = [['FILTER_INCLUDE', 'allow-list'], ['FILTER_EXCLUDE', 'block-list'], ['FILTER_RANGE', 'inclusive bounds'], ['FILTER_DATE_RANGES', 'labelled date spans'],
  ['FILTER_TRUE', 'true or truthy'], ['FILTER_FALSE', 'false or falsy'], ['FILTER_NULL', 'null or not'], ['FILTER_EXPRESSION', 'any predicate'],
  ['FILTER_SET_CONTAINS_ANY', 'picked one of'], ['FILTER_SET_CONTAINS_ALL', 'picked all of'], ['FILTER_SET_CONTAINS_NONE', 'picked none of'], ['FILTER_SET_EQUALS', 'picked exactly']];
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('FILTERS TODAY', 64, 130, { color: C.coral });
    OPS.forEach(([op, d], i) => A(seg(t, 0.2 + i * 0.08, 0.5 + i * 0.08), () => { const x = 64 + (i % 4) * 290, y = 148 + Math.floor(i / 4) * 76; R(x, y, 278, 64, { fill: C.panel, stroke: C.coral }); M(op, x + 14, y + 27, { size: 12, color: C.coral, weight: 600 }); T(d, x + 14, y + 50, { size: 14.5 }); }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 386, 566, 72, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 416, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 440, { size: 14.5 });
      R(650, 386, 566, 72, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 416, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 440, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('FILTERS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.coral });
    M('know what each filter does with a null', 640, 430, { size: 15, align: 'center' });
    M('next: attributes', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[5.035, 16.149, 8.256, 8.939, 5.632, 8.235, 6.763, 5.547, 3.093, 6.805, 5.803, 7.979, 5.035, 6.443, 8.405, 11.925, 8.576, 10.539, 8.32, 8.576, 6.08, 7.957, 8.171, 9.749, 6.955, 8.661, 7.381, 6.485, 8.299, 9.045, 8.512, 7.019, 6.72, 10.603, 5.717, 7.509, 4.075, 1.067]/*END*/;
PulseFilm.mount({
  series: 'PULSE · FILTERS',
  title: 'Pulse Filters',
  narr: NARR,
  scenes: [
    { name: 'Pulse Filters', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse filters. Which records reach the rest of the request, taken apart in depth.', true]] },
    { name: 'Where filters run', dur: 6.6, draw: sWhere, caps: [
      [0, 'By default, filters run second, right after features. They read source fields and feature columns. Attributes come later, so their labels are out of reach, with one exception: ATTR_PREVIOUS_STATE runs before the filters, and FILTER_EXPRESSION can read it.',
      'By default, filters run second, right after features. They read source fields and feature columns. Attributes come later, so their labels are out of reach, with one exception: the previous-state attribute runs before the filters, and an expression filter can read it.'],
      [2.6, 'Each filter names a type, a field and its values. Values are always strings: labels for categories, numbers for numeric fields.'],
      [4.4, 'An unknown label is refused before a single row is read, and the request fails. A filter adds no column. It only keeps or drops.']] },
    { name: 'Chains and counts', dur: 7, draw: sChain, caps: [
      [0, 'Filters run in the order you list them. Each one sees only the records the previous filter kept.'],
      [3.6, 'Every filter reports three counts: what it saw, what it let through, and how many arrived with the field null, whether it kept them or dropped them.'],
      [5.2, 'Reorder them and the survivors stay the same, but the counts move, because each filter now sees a different stream.']] },
    { name: 'Include and exclude', dur: 10.4, draw: sMembership, caps: [
      [0, 'Include is an allow-list. A record stays only if its value is one of the values you name.'],
      [3.6, 'A null region is not on the list, so include drops it.'],
      [5.0, 'Exclude is a block-list, and here\'s the surprise: a null isn\'t on the block-list either, so exclude lets it through.'],
      [8.0, 'It still counts as a null input. That count covers every null the filter saw, kept or dropped.']] },
    { name: 'Ranges', dur: 7, draw: sRange, caps: [
      [0, 'A range filter keeps values between a low and a high bound. Both ends are inclusive, so eighteen and sixty-five both stay.'],
      [3.4, 'A null age has no position on the line, so it\'s dropped and counted as a null input.'],
      [5.2, 'Dates are matched as day numbers since nineteen seventy. For an open-ended range, use an expression instead.']] },
    { name: 'Date ranges', dur: 10, draw: sDates, caps: [
      [0, 'Date ranges keep records whose date falls inside any labelled span. Spans are inclusive, and a missing end means open-ended.'],
      [1.4, 'Write the spans inline, or name a range table registered with the instance. Overlapping spans or duplicate labels are refused. A null date is dropped, and counted as a null input.'],
      [4.0, 'A datetime is first floored to its local day. Eleven-thirty at night in UTC is already the first of March in Berlin, so it\'s kept.'],
      [7.4, 'With no zone set, the day is UTC\'s, so the same instant is still February and dropped. A per-row zone field works too, and a row with a null zone is dropped and counted.']] },
    { name: 'True, false and null', dur: 11.6, draw: sBool, caps: [
      [0, 'True keeps records whose flag is set. By default it\'s strict, and only works on boolean fields. Truthy mode works on any scalar type.'],
      [4.6, 'False in truthy mode keeps false, zero, empty and null. Strict mode would drop that null instead. Kept or dropped, the null is counted.'],
      [8.2, 'The null filter reads only the null bitmap. Not-a-number, or an empty set, is a value, not a null.']] },
    { name: 'Multi-select sets', dur: 9.4, draw: sSets, caps: [
      [0, 'Multi-select fields are stored as bitmasks: one bit per option. The set filters compare each row\'s mask with a query mask.'],
      [1.6, 'Contains any keeps rows that share at least one option. Contains all needs every option. Contains none needs no overlap at all.'],
      [6.4, 'Equals needs exactly the same selection. A null set is dropped by all of them except contains none, and an empty set is a real answer, not a null.']] },
    { name: 'Expressions', dur: 7.4, draw: sExpr, caps: [
      [0, 'When no single filter fits, write an expression. Categories read as their labels, and sets read as lists of labels.'],
      [2.4, 'The expression is compiled once, so a typo fails before any row is read, with PULSE_FORMULA_COMPILE_ERROR, at predict and at the run alike.',
        'The expression is compiled once, so a typo fails before any row is read, with a formula compile error, at predict and at the run alike.'],
      [5.8, 'Careful with nulls. A null compared with greater-than gives an unknown answer, and the row is dropped. Guard with a default.']] },
    { name: 'What expressions read', dur: 9.6, draw: sExprMore, caps: [
      [0, 'Pass values as params, and read them as params dot name. Change the value, never the expression text.'],
      [3.0, 'Calendar helpers read dates as days. A datetime needs to_day first, or the compile refuses it.',
        'Calendar helpers, like weekday and month index, read dates as days. A datetime needs to-day first, or the compile refuses it.'],
      [6.6, 'And one attribute is readable: ATTR_PREVIOUS_STATE runs before the filters, so an expression can keep the subjects who went from trial to paid.',
        'And one attribute is readable: the previous-state attribute runs before the filters, so an expression can keep the subjects who went from trial to paid.']] },
    { name: 'The null scorecard', dur: 6, draw: sScore, caps: [
      [0, 'Here is the whole picture. Most filters drop a null, but exclude, contains none, false in truthy mode and the is-null check all keep it.'],
      [4.0, 'Kept or dropped, every null a filter sees lands in its n_null_input count, so you can always see where the nulls went.',
        'Kept or dropped, every null a filter sees lands in its null input count, so you can always see where the nulls went.']] },
    { name: 'Built to be fast', dur: 5.6, draw: sFast, caps: [
      [0, 'Filters are built to be cheap. Each decides from one row, so they stream, and their counts add up across shards.'],
      [2.2, 'Set filters are a single bitwise test. Expressions compile once. On grouped cohorts, a filter can be answered once per dictionary entry, instead of once per row.']] },
    { name: 'The filter toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'That\'s the filter toolkit today: membership, ranges, dates, flags, nulls, sets and expressions.'],
      [3.4, 'More filters are added over time, and embedders can register their own. The manifest always shows what your instance offers.'],
      [6.4, 'Remember: know what each filter does with a null. Next up, attributes.'],
      [9.0, '', 'Pulse filters.', true]] },
  ],
});
})();
