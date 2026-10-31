/* Pulse Groupers: film 9 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts; narration says more groupers are
 * added over time, the manifest is the authority and embedders register their own through
 * Options.Extensions. Every figure on screen is copied from a recorded alpha.33 run in data/
 * (see data/README.md); each block names the run it quotes. */
(() => {
const { C } = PulseFilm;
const { seg, eo, eio, lerp, R, T, M, CAP, Ln, A, dot, arrow } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const REGIONS = ['East', 'North', 'South', 'West'];
const RCOL = { East: C.teal, North: C.teal, South: C.teal, West: C.teal };   // regions are records: one role colour
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------- recorded runs ---------- */
const NONE = { orders: 300, avg: '36.16' };                                  // data/none.out.json
const ONE = { East: 61, North: 95, South: 80, West: 54 };                     // data/one.out.json
const FLOOR = { total_n: 290, n_null: 10, eastOrders: 61, eastN: 57, eastNull: 4 };   // data/one.out.json components
const DEFAULTS = [                                                            // data/defaults.predict.json defaults_applied
  ['spend', 'f64', 'GROUP_RANGE', 'numeric default · interval 10'],
  ['plan', 'categorical_u8', 'GROUP_CATEGORY', 'categorical default'],
  ['ts', 'datetime', 'GROUP_DATE', 'datetime default · by day'],
  ['channels', 'set_u8', 'GROUP_SET_PER_ELEMENT', 'set default'],
];
const BANDS = [                                                               // data/range, rounded, nranges, quant .out.json
  { op: 'GROUP_RANGE', sub: 'interval 40 · keyed low-high', rows: [['0-40', 189], ['40-80', 78], ['80-120', 19], ['120-160', 2]] },
  { op: 'GROUP_ROUNDED', sub: 'interval 40 · keyed by the floor', rows: [['0', 189], ['40', 78], ['80', 19], ['120', 2]] },
  { op: 'GROUP_NUMERIC_RANGES', sub: 'uneven named bands, [start, end)', rows: [['small', 139, '< 25'], ['mid', 105, '25 – 60'], ['large', 44, '≥ 60']] },
  { op: 'GROUP_QUANTILE', sub: 'interval 4 · equal counts', rows: [['Q1', 72, '11.08 – 18.73'], ['Q2', 72, '18.74 – 25.37'], ['Q3', 72, '25.48 – 47.87'], ['Q4', 72, '48.02 – 122.81']] },
];
const DOW_UTC = [38, 39, 37, 34, 41, 62, 49];                                 // data/dow.out.json
const DOW_LOCAL = [47, 30, 39, 31, 47, 57, 49];                               // data/dowlocal.out.json
const DRANGES = [['promo', 75, '23 – 29 Mar'], ['launch', 72, '9 – 15 Mar'], ['unmatched', 153, 'every other day']];   // data/dranges.out.json
const PEREL = [['app', 123], ['store', 74], ['web', 196]];                    // data/perel.out.json
const SETVAL = [['""', 14], ['app', 43], ['app|store', 14], ['app|store|web', 20], ['app|web', 46], ['store', 22], ['store|web', 18], ['web', 112]];   // data/setval.out.json
const SET_NULL = 11, SET_EMPTY = 14;                                          // data/setval.out.json components
const COMBO = {                                                               // data/combo.out.json: [orders, avg spend]
  East: { Basic: [33, '20.36'], Plus: [18, '41.88'], Pro: [9, '91.38'] },
  North: { Basic: [52, '19.17'], Plus: [27, '44.58'], Pro: [15, '89.77'] },
  South: { Basic: [38, '18.88'], Plus: [27, '44.82'], Pro: [12, '83.06'] },
  West: { Basic: [32, '18.03'], Plus: [22, '46.84'] },
};
const COMBO_NULL = { region: 10, plan: 5, held: 285 };                        // data/combo.out.json components
const FANOUT = { Basic: [66, 39, 106], Plus: [44, 30, 61], Pro: [12, 5, 25] };   // data/fanout.out.json: app, store, web
const INCLUDE = [['West', 54], ['North', 95]], INC_NULL = 151;                // data/include.out.json
const WINFIRST = [['first', 87, '34.88'], ['repeat', 213, '36.70']];          // data/winfirst.out.json

/* JSON lines: [text, colour] */
const code = (t, x, y, L, at, o = {}) => L.forEach(([s, c], i) => A(seg(t, at + i * 0.1, at + 0.3 + i * 0.1), () => M(s, x, y + i * (o.lh ?? 24), { size: o.size ?? 13, color: c })));
/* horizontal count bars: rows [label, count, note?] */
function hbars(t, x, y, w, rows, o = {}) {
  const mx = o.max ?? Math.max(...rows.map(r => r[1])), lh = o.lh ?? 34, lw = o.labelW ?? 110;
  rows.forEach(([k, v, note], i) => A(seg(t, (o.at ?? 0) + i * 0.08, (o.at ?? 0) + 0.35 + i * 0.08), () => {
    const yy = y + i * lh, bw = Math.max(3, (w - lw - 60 - (o.noteW ?? 0)) * v / mx * eo(seg(t, (o.at ?? 0) + i * 0.08, (o.at ?? 0) + 0.6 + i * 0.08)));
    M(k, x, yy + 16, { size: o.size ?? 13, color: o.keyColor ?? C.ink });
    R(x + lw, yy + 2, bw, lh - 12, { fill: o.fill ?? C.tealS, stroke: o.stroke ?? C.teal, r: 3 });
    M(String(v), x + lw + bw + 8, yy + 16, { size: 13, color: C.ink, weight: 600 });
    if (note) M(note, x + w, yy + 16, { size: 11.5, color: C.muted, align: 'right' });
  }));
}
/* vertical bars, one per weekday */
function wbars(t, x, y, w, h, vals, o = {}) {
  const bw = w / vals.length, mx = o.max ?? 70;
  Ln([[x, y + h], [x + w, y + h]], { stroke: C.rule });
  vals.forEach((v, i) => A(seg(t, (o.at ?? 0) + i * 0.06, (o.at ?? 0) + 0.35 + i * 0.06), () => {
    const bx = x + i * bw + bw * 0.16, ww = bw * 0.68, bh = v / mx * h * eo(seg(t, (o.at ?? 0) + i * 0.06, (o.at ?? 0) + 0.6 + i * 0.06));
    const hi = o.hi && o.hi(i);
    R(bx, y + h - bh, ww, bh, { fill: hi ? (o.hiFill ?? C.tealS) : C.panel2, stroke: hi ? (o.hiStroke ?? C.teal) : C.faint, r: 3 });
    M(String(v), bx + ww / 2, y + h - bh - 8, { size: 12.5, color: C.ink, align: 'center' });
    M(DAYS[i], bx + ww / 2, y + h + 18, { size: 12, align: 'center', color: i === 0 ? C.amber : C.muted });
  }));
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  // records fall into four buckets
  for (let k = 0; k < 28; k++) {
    const b = k % 4, u = eio(seg(t, 0.1 + k * 0.035, 0.9 + k * 0.035));
    const x0 = 420 + ((k * 37) % 440), y0 = 300, x1 = 470 + b * 112 + ((k >> 2) % 4) * 14, y1 = lerp(300, 392 - Math.floor(k / 16) * 12, u);
    A(seg(t, 0.1 + k * 0.035, 0.3 + k * 0.035), () => dot(lerp(x0, x1, u), y1, 4.5, RCOL[REGIONS[b]]));
  }
  REGIONS.forEach((r, b) => A(seg(t, 0.2, 0.6), () => { Ln([[456 + b * 112, 340], [456 + b * 112, 404], [548 + b * 112, 404], [548 + b * 112, 340]], { stroke: C.faint, lw: 1.5 }); }));
  A(seg(t, 1.2, 2.0), () => {
    T('PULSE', 640, 250, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('GROUPERS', 640, 476, { size: 50, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
  });
  A(seg(t, 2.0, 2.8), () => T('Records in, one row per key out', 640, 524, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. where groupers run (data/none.out.json, data/one.out.json) ---------- */
const SPINE = ['Features', 'Filters', 'Attributes', 'Groups', 'Aggregations', 'Windows', 'Sort'];
function sSlot(t) {
  SPINE.forEach((n, i) => {
    const x = 64 + i * 164, on = i === 3;
    A(seg(t, 0.1 + i * 0.08, 0.4 + i * 0.08) * (on ? 1 : 0.55), () => {
      R(x, 110, 150, 52, { fill: on ? C.tealS : C.panel, stroke: on ? C.teal : C.rule, lw: on ? 2 : 1.2 });
      T(n, x + 14, 142, { size: 15.5, weight: 600, color: on ? C.ink : C.muted });
      if (i < 6) arrow(x + 150, 136, x + 162, 136, { stroke: C.faint, head: 6 });
    });
  });
  A(seg(t, 0.9, 1.3), () => M('by default: after attributes, so a derived column can be a key · aggregations fold inside each bucket', 640, 190, { size: 12.5, color: C.teal, align: 'center' }));
  A(seg(t, 2.2, 2.6), () => {
    card(64, 214, 560, 200, C.teal);
    CAP('ONE ENTRY', 86, 242, { color: C.teal });
    code(t, 86, 274, [['"groups": [ {', C.muted], ['  "type": "GROUP_CATEGORY",', C.ink], ['  "field": "region",', C.teal], ['  "interval"?, "params"?, "include"?', C.amber], ['} ]', C.muted]], 2.4);
  });
  A(seg(t, 4.2, 4.6), () => {
    card(656, 214, 560, 200);
    CAP('THE OUTPUT ROW', 678, 242);
    M('each row carries its key under the field name', 678, 274, { size: 13.5, color: C.ink });
    M('{ "region": "East", "orders": 61, … }', 678, 304, { size: 13.5, color: C.teal });
    M('"groups": [] → one bucket for the whole cohort', 678, 348, { size: 13, color: C.muted });
    M('orders 300 · avg_spend ' + NONE.avg, 678, 376, { size: 14, color: C.ink, weight: 600 });
  });
  A(seg(t, 6.4, 6.8), () => {
    card(64, 434, 1152, 150, C.teal);
    CAP('GROUP_CATEGORY region · one row per region', 86, 462, { color: C.teal });
    REGIONS.forEach((r, i) => A(seg(t, 6.6 + i * 0.12, 6.9 + i * 0.12), () => {
      const x = 86 + i * 280, w = 250 * ONE[r] / 95;
      M(r, x, 498, { size: 13.5, color: RCOL[r], weight: 600 });
      R(x, 510, w * eo(seg(t, 6.6 + i * 0.12, 7.3 + i * 0.12)), 22, { fill: C.tealS, stroke: RCOL[r], r: 3 });
      M(String(ONE[r]) + ' orders', x, 560, { size: 13, color: C.ink });
    }));
  });
}

/* ---------- 2. smart defaults (data/defaults.predict.json) ---------- */
function sDefaults(t) {
  CAP('SMART DEFAULTS · "field" WITHOUT "type"', 64, 124, { color: C.amber });
  A(seg(t, 0.3, 0.7), () => {
    card(64, 146, 360, 200, C.amber);
    code(t, 86, 180, [['"groups": [', C.muted], ['  { "field": "spend" },', C.ink], ['  { "field": "plan" },', C.ink], ['  { "field": "ts" },', C.ink], ['  { "field": "channels" } ]', C.ink]], 0.5, { lh: 30 });
  });
  DEFAULTS.forEach(([f, ty, op, why], i) => A(seg(t, 2.0 + i * 0.5, 2.4 + i * 0.5), () => {
    const y = 160 + i * 46;
    M(ty, 470, y + 16, { size: 13, color: C.muted });
    arrow(620, y + 11, 660, y + 11, { stroke: C.faint });
    R(672, y - 6, 280, 34, { fill: C.panel2, stroke: C.teal, r: 4 });
    M(op, 686, y + 16, { size: 13, color: C.teal, weight: 600 });
    M(why, 972, y + 16, { size: 12, color: C.muted });
  }));
  A(seg(t, 5.6, 6.0), () => {
    card(64, 380, 1152, 196, C.amber);
    CAP('PREDICT · defaults_applied', 86, 410, { color: C.amber });
    const L = DEFAULTS.map(([f, ty, op, why]) => `{ "field": "${f}", "type": "${op}", "reason": "${ty} → ${op} (rule: ${why.split(' · ')[0]})" }`);
    L.forEach((s, i) => A(seg(t, 5.8 + i * 0.12, 6.1 + i * 0.12), () => M(s, 86, 442 + i * 24, { size: 12.5, color: C.ink })));
    A(seg(t, 6.6, 7.0), () => M('an explicit type always wins · predict reports each filled slot and its rule, before anything runs', 86, 552, { size: 13, color: C.amber }));
  });
}

/* ---------- 3. number bands (data/range, rounded, nranges, quant .out.json) ---------- */
function sNumbers(t) {
  CAP('NUMBERS IN BANDS · spend, 288 orders with a value', 64, 124, { color: C.teal });
  const at = [0.2, 2.4, 4.4, 6.6];
  BANDS.forEach((b, j) => A(seg(t, at[j], at[j] + 0.4), () => {
    const x = 64 + j * 291, w = 279;
    card(x, 146, w, 300, j === 3 ? C.violet : C.teal);
    M(b.op, x + 16, 176, { size: 13, color: j === 3 ? C.violet : C.teal, weight: 600 });
    M(b.sub, x + 16, 198, { size: 11.5, color: C.muted });
    Ln([[x + 16, 212], [x + w - 16, 212]]);
    b.rows.forEach(([k, v, note], i) => A(seg(t, at[j] + 0.3 + i * 0.1, at[j] + 0.6 + i * 0.1), () => {
      const y = 244 + i * 44;
      M(k, x + 16, y, { size: 14, color: C.ink, weight: 600 });
      T(String(v), x + 150, y + 1, { size: 18, weight: 700, align: 'right' });
      if (note) M(note, x + w - 16, y, { size: 11, color: C.muted, align: 'right' });
    }));
  }));
  A(seg(t, 1.0, 1.4), () => M('[low, high): the upper edge belongs to the next band · rows come out in numeric order', 64, 476, { size: 12.5, color: C.muted }));
  A(seg(t, 5.0, 5.4), () => M('supplied order · a value outside every range lands in "unmatched", last', 64, 502, { size: 12.5, color: C.muted }));
  A(seg(t, 7.4, 7.8), () => {
    card(64, 520, 1152, 64, C.violet);
    M('equal counts by rank: GROUP_QUANTILE needs the whole sorted input, so it buffers · rows come out Q1, Q2 … (D1 … D10, never D1, D10, D2)', 86, 558, { size: 13, color: C.ink });
  });
}

/* ---------- 4. calendar (data/dow.out.json, data/dranges.out.json) ---------- */
function sCalendar(t) {
  CAP('GROUP_DATE · params.component', 64, 124, { color: C.teal });
  ['hour', 'hour_of_day', 'day', 'day_of_week', 'week', 'month', 'quarter', 'year'].forEach((c, i) => A(seg(t, 0.3 + i * 0.08, 0.6 + i * 0.08), () => {
    const x = 64 + i * 144, on = c === 'day_of_week' && seg(t, 2.2, 2.4) > 0;
    R(x, 140, 134, 30, { fill: on ? C.tealS : C.panel, stroke: on ? C.teal : C.rule, r: 15 });
    M(c, x + 67, 160, { size: 12.5, color: on ? C.teal : C.muted, align: 'center' });
  }));
  A(seg(t, 2.2, 2.6), () => {
    card(64, 192, 560, 300, C.teal);
    CAP('day_of_week · orders', 86, 222, { color: C.teal });
    wbars(t, 96, 250, 500, 180, DOW_UTC, { at: 2.4, hi: i => i === 5 });
    M('Monday first, in every output', 86, 478, { size: 13, color: C.amber });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(656, 192, 560, 300, C.violet);
    CAP('GROUP_DATE_RANGES · named periods', 678, 222, { color: C.violet });
    code(t, 678, 252, [['"ranges": [', C.muted], ['  { "label": "promo",  "start": "2026-03-23", … },', C.ink], ['  { "label": "launch", "start": "2026-03-09", … } ]', C.ink]], 4.8, { size: 12, lh: 22 });
    hbars(t, 678, 336, 510, DRANGES, { at: 5.4, max: 153, labelW: 100, noteW: 120, fill: C.violetS, stroke: C.violet });
    A(seg(t, 6.2, 6.6), () => M('supplied order · unmatched last', 678, 478, { size: 13, color: C.violet }));
  });
  A(seg(t, 7.0, 7.4), () => M('keys are calendar labels: 2026-03, 2024-Q1, 2026-W09, Monday, 09 · week_start and fiscal_offset move the boundaries', 64, 530, { size: 12.5, color: C.muted }));
}

/* ---------- 5. multi-select (data/perel.out.json, data/setval.out.json) ---------- */
function sSets(t) {
  CAP('A MULTI-SELECT · channels: web, app, store', 64, 124, { color: C.teal });
  A(seg(t, 1.6, 2.0), () => {
    card(64, 146, 560, 250, C.teal);
    M('GROUP_SET_PER_ELEMENT · one bucket per option', 86, 176, { size: 13, color: C.teal, weight: 600 });
    hbars(t, 86, 200, 510, PEREL, { at: 1.8, max: 196, labelW: 80, lh: 40 });
    A(seg(t, 3.2, 3.6), () => {
      M('123 + 74 + 196 = 393 > the orders: an order', 86, 342, { size: 13, color: C.ink });
      M('that ticked web and app counts in both · correct', 86, 366, { size: 13, color: C.ink });
    });
  });
  A(seg(t, 4.6, 5.0), () => {
    card(656, 146, 560, 250, C.violet);
    M('GROUP_SET_VALUE · one bucket per exact combination', 678, 176, { size: 13, color: C.violet, weight: 600 });
    SETVAL.forEach(([k, v], i) => A(seg(t, 4.8 + i * 0.08, 5.1 + i * 0.08), () => {
      const col = i < 4 ? 0 : 1, row = i % 4, x = 678 + col * 268, y = 216 + row * 40;
      const empty = k === '""';
      R(x, y - 18, 252, 30, { fill: empty ? C.amberS : C.panel2, stroke: empty ? C.amber : C.rule, r: 4 });
      M(k, x + 10, y + 2, { size: 12.5, color: empty ? C.amber : C.ink });
      M(String(v), x + 240, y + 2, { size: 13, color: C.ink, weight: 600, align: 'right' });
    }));
    A(seg(t, 5.8, 6.2), () => M('key: the sorted labels joined with |', 678, 376, { size: 12, color: C.muted }));
  });
  A(seg(t, 6.8, 7.2), () => {
    card(64, 416, 560, 160, C.amber);
    CAP('TICKED NOTHING · "|"', 86, 446, { color: C.amber });
    M('a real answer: the combination grouper keeps it', 86, 476, { size: 13, color: C.ink });
    M('as the empty key · n_empty_mask ' + SET_EMPTY, 86, 500, { size: 13, color: C.amber });
    M('the per-option grouper skips it', 86, 530, { size: 13, color: C.ink });
    M('neither counts it as null', 86, 554, { size: 13, color: C.muted });
  });
  A(seg(t, 8.4, 8.8), () => {
    card(656, 416, 560, 160, C.coral);
    CAP('LEFT BLANK · null', 678, 446, { color: C.coral });
    M('no answer at all: no bucket', 678, 476, { size: 13, color: C.ink });
    M('GROUP_SET_VALUE components: n_null ' + SET_NULL, 678, 500, { size: 13, color: C.coral });
    M('skipped and blank stay apart, so the', 678, 530, { size: 13, color: C.ink });
    M('denominators stay honest', 678, 554, { size: 13, color: C.muted });
  });
}

/* ---------- 6. composite keys (data/combo.out.json) ---------- */
const PLANS = ['Basic', 'Plus', 'Pro'];
function sCombo(t) {
  CAP('TWO GROUPERS · the key is a tuple (region, plan)', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 460, 132, C.teal);
    code(t, 86, 180, [['"groups": [', C.muted], ['  { "type": "GROUP_CATEGORY", "field": "region" },', C.teal], ['  { "type": "GROUP_CATEGORY", "field": "plan" } ]', C.amber]], 0.4, { size: 12, lh: 28 });
  });
  // grid of observed combinations
  A(seg(t, 1.8, 2.2), () => {
    PLANS.forEach((p, j) => M(p, 160 + j * 120, 316, { size: 13, color: C.amber, align: 'center', weight: 600 }));
    REGIONS.forEach((r, i) => {
      const y = 330 + i * 60;
      M(r, 64, y + 34, { size: 13, color: C.teal, weight: 600 });
      PLANS.forEach((p, j) => A(seg(t, 2.0 + (i * 3 + j) * 0.05, 2.3 + (i * 3 + j) * 0.05), () => {
        const x = 110 + j * 120, v = COMBO[r][p];
        if (!v) { R(x, y, 100, 50, { stroke: C.coral, dash: [4, 4], r: 4 }); M('never seen', x + 50, y + 30, { size: 11.5, color: C.coral, align: 'center' }); return; }
        R(x, y, 100, 50, { fill: C.panel2, stroke: C.rule, r: 4 });
        T(String(v[0]), x + 50, y + 32, { size: 18, weight: 700, align: 'center' });
      }));
    });
  });
  // the rows as they come back
  A(seg(t, 4.0, 4.4), () => {
    card(560, 146, 656, 434);
    CAP('Data · 11 rows, outer → inner', 582, 174);
    ['region', 'plan', 'orders', 'avg_spend'].forEach((h, j) => M(h, 582 + [0, 140, 300, 440][j], 202, { size: 12, color: C.muted }));
    let k = 0;
    REGIONS.forEach(r => PLANS.forEach(p => {
      const v = COMBO[r][p]; if (!v) return;
      const i = k++, y = 232 + i * 31;
      A(seg(t, 4.2 + i * 0.07, 4.5 + i * 0.07), () => {
        M(r, 582, y, { size: 13, color: C.teal }); M(p, 722, y, { size: 13, color: C.amber });
        M(String(v[0]), 882, y, { size: 13, color: C.ink, weight: 600 }); M(v[1], 1022, y, { size: 13, color: C.ink });
      });
    }));
  });
}
function sNulls(t) {
  CAP('A NULL AT ANY KEY DROPS THE RECORD', 64, 124, { color: C.coral });
  // 300 orders as a bar, split into held / no region / no plan
  const W = 1100, x = 90, y = 190, held = COMBO_NULL.held, nr = COMBO_NULL.region, np = COMBO_NULL.plan;
  A(seg(t, 0.2, 0.6), () => { M('300 orders', x, y - 14, { size: 13, color: C.ink }); });
  const u = eo(seg(t, 0.3, 1.2));
  A(seg(t, 0.3, 0.6), () => R(x, y, W * u, 44, { fill: C.panel2, stroke: C.rule, r: 4 }));
  const sp = eio(seg(t, 1.6, 2.6));
  A(sp, () => {
    R(x, y, W * held / 300, 44, { fill: C.tealS, stroke: C.teal, r: 4 });
    R(x + W * held / 300 + 6, y, W * nr / 300, 44, { fill: C.coralS, stroke: C.coral, r: 4 });
    R(x + W * (held + nr) / 300 + 12, y, W * np / 300, 44, { fill: C.coralS, stroke: C.coral, dash: [4, 3], r: 4 });
    M(held + ' reach a row', x + 14, y + 28, { size: 14, color: C.ink, weight: 600 });
    M('no region ' + nr + ' · no plan ' + np + ' → no row', x + W, y + 74, { size: 12.5, color: C.coral, align: 'right' });
  });
  A(seg(t, 3.0, 3.4), () => {
    card(64, 326, 560, 200, C.coral);
    CAP('COMPONENTS · one entry per grouper', 86, 356, { color: C.coral });
    M('region  total_n 290 · n_null ' + nr, 86, 392, { size: 14, color: C.ink });
    M('plan    total_n 295 · n_null ' + np, 86, 422, { size: 14, color: C.ink });
    M('each grouper counts a null once,', 86, 462, { size: 13, color: C.muted });
    M('exactly as it would alone (region alone: n_null 10)', 86, 486, { size: 13, color: C.muted });   // data/one.out.json
  });
  A(seg(t, 5.0, 5.4), () => {
    card(656, 326, 560, 200, C.teal);
    CAP('THE ROWS', 678, 356, { color: C.teal });
    M('one row per OBSERVED combination', 678, 392, { size: 14, color: C.ink });
    M('never an empty one: no West × Pro row', 678, 422, { size: 13.5, color: C.ink });
    M('every row carries every key column', 678, 462, { size: 13, color: C.muted });
    M('components: group_key ["East", "Basic"]', 678, 486, { size: 13, color: C.teal });
  });
}

/* ---------- 7. fan-out and limits (data/fanout, dupkey, limit .out.json, limit.predict.json) ---------- */
function sFan(t) {
  CAP('FAN-OUT MULTIPLIES · plan × channel option', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 210, C.teal);
    ['app', 'store', 'web'].forEach((c, j) => M(c, 260 + j * 120, 178, { size: 12.5, color: C.muted, align: 'center' }));
    PLANS.forEach((p, i) => A(seg(t, 0.4 + i * 0.15, 0.7 + i * 0.15), () => {
      const y = 196 + i * 50;
      M(p, 86, y + 26, { size: 13.5, color: C.amber, weight: 600 });
      FANOUT[p].forEach((v, j) => { R(210 + j * 120, y, 100, 38, { fill: C.panel2, stroke: C.rule, r: 4 }); T(String(v), 260 + j * 120, y + 26, { size: 17, weight: 700, align: 'center' }); });
    }));
  });
  A(seg(t, 1.6, 2.0), () => M('an order lands once per ticked option, inside its plan', 64, 380, { size: 13, color: C.ink }));
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 210, C.coral);
    CAP('TWO ENTRIES, ONE KEY COLUMN', 678, 176, { color: C.coral });
    M('"groups": [ region, region ]', 678, 210, { size: 13, color: C.ink });
    M('SERVICE_VALIDATION', 678, 250, { size: 15, color: C.coral, weight: 600 });
    M('group[1] field region collides with', 678, 282, { size: 12.5, color: C.muted });
    M('group[0] field region', 678, 304, { size: 12.5, color: C.muted });
  });
  A(seg(t, 4.2, 4.6), () => {
    card(64, 404, 560, 172, C.amber);
    CAP('PREDICT · limit_findings', 86, 434, { color: C.amber });
    M('max_groups configured 8', 86, 466, { size: 13.5, color: C.ink });
    M('estimated 12 = 4 regions × 3 plans', 86, 494, { size: 14, color: C.amber, weight: 600 });
    M('a product: an upper bound · grade "possible"', 86, 522, { size: 13, color: C.muted });
    M('nothing runs yet', 86, 550, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.8, 6.2), () => {
    card(656, 404, 560, 172, C.coral);
    CAP('THE RUN · observed groups', 678, 434, { color: C.coral });
    M('PULSE_LIMIT_EXCEEDED', 678, 470, { size: 15, color: C.coral, weight: 600 });
    M('observed 9, configured 8', 678, 500, { size: 13.5, color: C.ink });
    M('the run counts the groups it really meets,', 678, 530, { size: 12.5, color: C.muted });
    M('and refuses once they pass the limit', 678, 552, { size: 12.5, color: C.muted });
  });
}

/* ---------- 8. fit (skill: op-group-quantile, op-group-kmeans) ---------- */
function sFit(t) {
  CAP('DATA-FITTED GROUPERS IN A COMPOSITE · params.fit', 64, 124, { color: C.violet });
  const opts = [['"global"', 'the default', 'cut once over every filtered record, whatever its position: the same bands in every outer bucket', C.violet],
    ['"within"', 'opt in', 'refit inside each bucket of the groupers before it: quartiles of spend within each region', C.amber]];
  opts.forEach(([k, d, s, col], i) => A(seg(t, 0.4 + i * 2.2, 0.8 + i * 2.2), () => {
    const y = 156 + i * 150;
    card(64, y, 1152, 126, col);
    M(k, 86, y + 40, { size: 16, color: col, weight: 600 }); M(d, 220, y + 40, { size: 13, color: C.muted });
    T(s, 86, y + 84, { size: 16 });
  }));
  A(seg(t, 4.8, 5.2), () => M('GROUP_QUANTILE and GROUP_KMEANS take it · outermost, "within" has nothing to refit inside, so it changes nothing', 64, 488, { size: 13, color: C.ink }));
}

/* ---------- 9. include (data/include.out.json) ---------- */
function sInclude(t) {
  CAP('include · AN ALLOW-LIST THAT ALSO SETS THE ORDER', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 120, C.teal);
    code(t, 86, 186, [['{ "type": "GROUP_CATEGORY", "field": "region",', C.ink], ['  "include": ["West", "North"] }', C.amber]], 0.4, { lh: 30 });
  });
  A(seg(t, 1.6, 2.0), () => {
    card(656, 146, 560, 120, C.teal);
    CAP('Data · listed order, not alphabetical', 678, 174, { color: C.teal });
    INCLUDE.forEach(([r, v], i) => A(seg(t, 1.8 + i * 0.25, 2.1 + i * 0.25), () => {
      M(String(i + 1) + '.', 678, 212 + i * 30, { size: 13, color: C.muted });
      M(r, 708, 212 + i * 30, { size: 14, color: RCOL[r], weight: 600 }); M(String(v) + ' orders', 820, 212 + i * 30, { size: 14, color: C.ink });
    }));
  });
  A(seg(t, 3.4, 3.8), () => {
    card(64, 292, 1152, 96, C.coral);
    M('every other record is skipped on the null path: components n_null ' + INC_NULL + ', the 10 blanks plus East and South', 86, 330, { size: 13.5, color: C.ink });
    M('a listed key with no records still drops: include never makes an empty row', 86, 360, { size: 13, color: C.muted });
  });
  A(seg(t, 5.4, 5.8), () => {
    CAP('include WORKS TODAY ON', 64, 426, { color: C.amber });
    ['GROUP_CATEGORY', 'GROUP_DATE', 'GROUP_DATE_RANGES', 'GROUP_SET_VALUE', 'GROUP_SET_PER_ELEMENT'].forEach((g, i) => A(seg(t, 5.6 + i * 0.1, 5.9 + i * 0.1), () => {
      const x = 64 + i * 232; R(x, 442, 220, 34, { fill: C.panel2, stroke: C.amber, r: 17 }); M(g, x + 110, 464, { size: 12, color: C.amber, align: 'center' });
    }));
    A(seg(t, 6.4, 6.8), () => M('number bands, quantiles and clusters do not take it: filter the values first', 64, 512, { size: 13, color: C.muted }));
  });
}

/* ---------- 10. components (data/one.out.json) ---------- */
function sFloor(t) {
  CAP('COMPONENTS · THE UNIVERSAL FLOOR', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 260, C.amber);
    M('GROUP_CATEGORY region', 86, 178, { size: 13, color: C.teal, weight: 600 });
    M('300 records after the filters', 86, 214, { size: 13.5, color: C.ink });
    const u = eo(seg(t, 0.6, 1.6));
    R(86, 232, 500 * u, 30, { fill: C.panel2, stroke: C.rule, r: 3 });
    A(seg(t, 1.4, 1.8), () => {
      R(86, 232, 500 * FLOOR.total_n / 300, 30, { fill: C.amberS, stroke: C.amber, r: 3 });
      R(86 + 500 * FLOOR.total_n / 300 + 4, 232, 500 * FLOOR.n_null / 300 - 4, 30, { fill: C.coralS, stroke: C.coral, r: 3 });
    });
    A(seg(t, 1.8, 2.2), () => {
      M('total_n ' + FLOOR.total_n, 86, 300, { size: 15, color: C.amber, weight: 600 }); M('records placed in a bucket', 260, 300, { size: 13, color: C.muted });
      M('n_null ' + FLOOR.n_null, 86, 332, { size: 15, color: C.coral, weight: 600 }); M('records on the null / skip path', 260, 332, { size: 13, color: C.muted });
      M('+ the grouper\'s own keys: dict_size, buckets', 86, 376, { size: 12.5, color: C.muted });
    });
  });
  A(seg(t, 3.4, 3.8), () => {
    card(656, 146, 560, 260, C.violet);
    M('AGG_AVERAGE spend, inside East', 678, 178, { size: 13, color: C.violet, weight: 600 });
    M(FLOOR.eastOrders + ' orders in the bucket', 678, 214, { size: 13.5, color: C.ink });
    const u = eo(seg(t, 3.8, 4.6));
    R(678, 232, 500 * u, 30, { fill: C.panel2, stroke: C.rule, r: 3 });
    A(seg(t, 4.4, 4.8), () => {
      R(678, 232, 500 * FLOOR.eastN / 61, 30, { fill: C.violetS, stroke: C.violet, r: 3 });
      R(678 + 500 * FLOOR.eastN / 61 + 4, 232, 500 * FLOOR.eastNull / 61 - 4, 30, { fill: C.coralS, stroke: C.coral, r: 3 });
    });
    A(seg(t, 4.8, 5.2), () => {
      M('n ' + FLOOR.eastN, 678, 300, { size: 15, color: C.violet, weight: 600 }); M('non-null values it used', 790, 300, { size: 13, color: C.muted });
      M('n_null ' + FLOOR.eastNull, 678, 332, { size: 15, color: C.coral, weight: 600 }); M('orders with no spend', 790, 332, { size: 13, color: C.muted });
    });
  });
  A(seg(t, 6.2, 6.6), () => {
    card(64, 430, 1152, 120, C.amber);
    M('a grouper counts RECORDS: every post-filter record, placed or not', 86, 470, { size: 14, color: C.ink });
    M('an aggregation counts VALUES: only the non-null ones it folded', 86, 504, { size: 14, color: C.ink });
  });
}

/* ---------- 11. what follows the composite rows (skills: grouper-design, overlay-system) ---------- */
function sFollow(t) {
  CAP('WHAT FOLLOWS THE COMPOSITE ROWS', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 300, 220, C.teal);
    CAP('THE ROWS', 86, 176, { color: C.teal });
    [['East', 'Basic'], ['East', 'Plus'], ['East', 'Pro'], ['North', 'Basic'], ['…', '']].forEach(([a, b], i) => { M(a, 86, 212 + i * 30, { size: 13, color: C.teal }); M(b, 180, 212 + i * 30, { size: 13, color: C.amber }); });
  });
  const items = [['sort · return', 'order and trim the composite rows', C.ink], ['windows', 'by default, run over the grouped rows', C.violet], ['post_tests · grouped matrices', 'post-tests read the composite rows · each bucket gets its own matrix', C.violet]];
  items.forEach(([h, d, col], i) => A(seg(t, 0.8 + i * 0.3, 1.1 + i * 0.3), () => {
    const y = 146 + i * 76;
    arrow(370, 256, 404, y + 32, { stroke: C.faint });
    R(412, y, 804, 64, { fill: C.panel, stroke: C.rule }); M(h, 432, y + 28, { size: 13.5, color: col, weight: 600 }); M(d, 432, y + 50, { size: 12.5, color: C.muted });
  }));
  A(seg(t, 3.2, 3.6), () => {
    card(64, 392, 560, 184, C.violet);
    CAP('TIER-1 TESTS · ONCE PER GROUP', 86, 422, { color: C.violet });
    M('a test beside groups runs inside each bucket', 86, 456, { size: 13.5, color: C.ink });
    M('each result names its group_key tuple', 86, 484, { size: 13.5, color: C.ink });
    M('the tests film shows it', 86, 540, { size: 12.5, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(656, 392, 560, 184, C.violet);
    CAP('SERIES OVERLAYS · ONCE PER PARTITION', 678, 422, { color: C.violet });
    M('partition: the leading keys (all but the last)', 678, 456, { size: 13.5, color: C.ink });
    M('so put the date grouper last', 678, 484, { size: 13.5, color: C.amber });
    M('year over year needs exactly one date grouper', 678, 516, { size: 13, color: C.ink });
    M('a series never crosses a segment', 678, 544, { size: 12.5, color: C.muted });
  });
}

/* ---------- 12. windows first (data/winfirst.out.json, winfirst.predict.json) ---------- */
function sWinFirst(t) {
  CAP('A GROUPER CAN KEY ON A WINDOW LABEL', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 640, 250, C.violet);
    code(t, 86, 180, [['"windows": [{ "type": "WIN_ROW_NUMBER", "label": "visit",', C.violet], ['   "partition_by": ["customer"],', C.violet], ['   "order_by": [{ "field": "ts" }, { "field": "id" }] }],', C.violet],
      ['"groups": [{ "type": "GROUP_NUMERIC_RANGES", "field": "visit",', C.teal], ['   "params": { "ranges": [', C.teal], ['     { "label": "first",  "start": 1, "end": 2 },', C.teal], ['     { "label": "repeat", "start": 2 } ] } }]', C.teal]], 0.4, { size: 12, lh: 28 });
  });
  // schematic: one customer's orders numbered in time order
  A(seg(t, 1.4, 1.8), () => {
    card(736, 146, 480, 250);
    CAP('SCHEMATIC · ONE CUSTOMER, IN TIME ORDER', 756, 176);
    Ln([[776, 270], [1180, 270]], { stroke: C.faint });
    [0, 1, 2, 3].forEach(i => A(seg(t, 1.8 + i * 0.3, 2.1 + i * 0.3), () => {
      const x = 810 + i * 110; dot(x, 270, 9, i === 0 ? C.teal : C.violet);
      M('visit ' + (i + 1), x, 304, { size: 12.5, color: C.ink, align: 'center' });
    }));
    A(seg(t, 3.0, 3.4), () => { M('first', 810, 240, { size: 12.5, color: C.teal, align: 'center' }); M('repeat', 1030, 240, { size: 12.5, color: C.violet, align: 'center' }); });
    A(seg(t, 3.0, 3.4), () => M('the number restarts for every customer', 756, 360, { size: 12.5, color: C.muted }));
  });
  A(seg(t, 3.6, 4.0), () => {
    card(64, 420, 640, 156, C.teal);
    CAP('RESULT · one row per range', 86, 450, { color: C.teal });
    ['visit', 'orders', 'avg_spend'].forEach((h, j) => M(h, 86 + [0, 160, 320][j], 480, { size: 12, color: C.muted }));
    WINFIRST.forEach(([k, n, a], i) => A(seg(t, 3.8 + i * 0.2, 4.1 + i * 0.2), () => {
      const y = 512 + i * 32; M(k, 86, y, { size: 14, color: i ? C.violet : C.teal, weight: 600 }); M(String(n), 246, y, { size: 14, color: C.ink }); M(a, 406, y, { size: 14, color: C.ink });
    }));
  });
  A(seg(t, 5.8, 6.2), () => {
    card(736, 420, 480, 156, C.amber);
    CAP('PREDICT · post_window', 756, 450, { color: C.amber });
    M('windows_first: true', 756, 484, { size: 14, color: C.amber, weight: 600 });
    M('window_labels: ["visit"]', 756, 512, { size: 13, color: C.ink });
    M('the windows run over the filtered records,', 756, 540, { size: 12.5, color: C.muted });
    M('then the grouper reads visit like a column', 756, 562, { size: 12.5, color: C.muted });
  });
}

/* ---------- 13. time zones (data/dow.out.json, data/dowlocal.out.json) ---------- */
function sZones(t) {
  CAP('DATETIMES ARE STORED AS UTC · BUCKETS READ A LOCAL CALENDAR', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 300);
    CAP('day_of_week · read in UTC', 86, 176);
    wbars(t, 96, 206, 500, 180, DOW_UTC, { at: 0.4, hi: i => i === 0, hiFill: C.panel2, hiStroke: C.muted });
  });
  A(seg(t, 2.2, 2.6), () => {
    card(656, 146, 560, 300, C.teal);
    CAP('"tz_field": "zone" · each store\'s own calendar', 678, 176, { color: C.teal });
    wbars(t, 688, 206, 500, 180, DOW_LOCAL, { at: 2.4, hi: i => i === 0 });
  });
  A(seg(t, 3.6, 4.0), () => M('Monday: 38 orders in UTC · 47 on the stores\' local calendars · the same 300 instants', 64, 476, { size: 13.5, color: C.ink }));
  A(seg(t, 5.0, 5.4), () => {
    card(64, 496, 1152, 82, C.amber);
    M('slot "tz" for one zone · slot "tz_field" for a zone per row · request "time_zone" and "time_zone_field" for every slot', 86, 528, { size: 13, color: C.ink });
    M('a null zone cell gives the row no local day: no bucket, counted in n_null, never a UTC fallback', 86, 556, { size: 13, color: C.coral });
  });
}

/* ---------- 14. recap ---------- */
const OPS = [['GROUP_CATEGORY', 'one bucket per value'], ['GROUP_RANGE', 'fixed-width bands, "low-high"'], ['GROUP_ROUNDED', 'fixed width, keyed by the floor'], ['GROUP_NUMERIC_RANGES', 'uneven named bands'],
  ['GROUP_QUANTILE', 'equal-count bands, Q1 … Qn'], ['GROUP_DATE', 'calendar parts, hour to year'], ['GROUP_DATE_RANGES', 'named periods'], ['GROUP_KMEANS', 'k-means clusters, largest first'],
  ['GROUP_SET_PER_ELEMENT', 'a multi-select, per option'], ['GROUP_SET_VALUE', 'a multi-select, per combination']];
function sRecap(t) {
  const end = seg(t, 8.4, 9.2);
  A(1 - end, () => {
    CAP('GROUPERS TODAY', 64, 124, { color: C.teal });
    OPS.forEach(([op, d], i) => A(seg(t, 0.2 + i * 0.07, 0.5 + i * 0.07), () => { const x = 64 + (i % 4) * 290, y = 140 + Math.floor(i / 4) * 66; R(x, y, 278, 56, { fill: C.panel, stroke: C.teal }); M(op, x + 14, y + 23, { size: 12, color: C.teal, weight: 600 }); T(d, x + 14, y + 45, { size: 14 }); }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 400, 566, 66, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 428, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 452, { size: 14.5 });
      R(650, 400, 566, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own', 668, 428, { size: 14, color: C.amber, weight: 600 }); T('registered through Options.Extensions, treated like built-ins', 668, 452, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('GROUPERS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
    M('check what a key dropped before you read the rows', 640, 430, { size: 15, align: 'center' });
    M('next: aggregators', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[3.328, 8.661, 6.357, 8.939, 3.392, 4.501, 9.899, 8.256, 11.029, 4.117, 8.768, 9.323, 3.947, 5.909, 7.723, 13.781, 6.059, 8.875, 4.523, 4.885, 9.387, 6.144, 3.051, 6.912, 5.781, 7.531, 4.373, 8.576, 7.147, 9.6, 3.989, 4.416, 9.003, 7.317, 8.299, 8.811, 6.016, 8.064, 4.224, 8.832, 8.0, 3.968, 4.075, 7.701, 4.608, 8.981, 6.72, 11.051, 9.301, 4.971, 1.045]/*END*/;
PulseFilm.mount({
  series: 'PULSE · GROUPERS',
  title: 'Pulse Groupers',
  narr: NARR,
  scenes: [
    { name: 'Pulse Groupers', dur: 4, draw: sTitle, caps: [
      [0, '', 'Pulse groupers. How records become the rows of a result.', true]] },
    { name: 'Where groupers run', dur: 8.4, draw: sSlot, caps: [
      [0, 'By default, groupers run fourth, after the attributes, so a derived column can be a key. The aggregations then fold inside each bucket.'],
      [2.2, 'An entry names a type and a field, plus an interval, parameters or an include list where the grouper takes them.'],
      [4.2, 'Each output row carries its key under the field\'s name. Leave groups empty and the whole cohort is one bucket: three hundred orders in a single row.'],
      [6.4, 'Group by region instead, and you get one row per region.']] },
    { name: 'Smart defaults', dur: 7.4, draw: sDefaults, caps: [
      [0, 'Name a field and leave out the type, and Pulse picks the grouper from the field\'s type.'],
      [2.0, 'A number gets fixed-width bands of ten. A category gets one bucket per value. A date or datetime is bucketed by day, and a multi-select by option.'],
      [5.6, 'An explicit type always wins. Predict lists every slot it filled under defaults_applied, with the rule it used, before anything runs.',
        'An explicit type always wins. Predict lists every slot it filled under defaults applied, with the rule it used, before anything runs.']] },
    { name: 'Numbers in bands', dur: 8.2, draw: sNumbers, caps: [
      [0, 'Numbers can be banded several ways today. GROUP_RANGE cuts fixed-width bands, here forty wide, and keys each band low to high. The upper edge belongs to the next band.',
        'Numbers can be banded several ways today. The range grouper cuts fixed-width bands, here forty wide, and keys each band low to high. The upper edge belongs to the next band.'],
      [2.4, 'GROUP_ROUNDED makes the same cut, but keys each band by its floor.', 'The rounded grouper makes the same cut, but keys each band by its floor.'],
      [4.4, 'GROUP_NUMERIC_RANGES takes uneven named bands, in the order you list them. A value outside every range lands in unmatched, last.',
        'The numeric ranges grouper takes uneven named bands, in the order you list them. A value outside every range lands in unmatched, last.'],
      [6.6, 'GROUP_QUANTILE cuts equal-count bands: four quartiles of seventy-two orders. It buffers the whole input, and its rows come out in bucket order.',
        'The quantile grouper cuts equal-count bands: four quartiles of seventy-two orders. It buffers the whole input, and its rows come out in bucket order.']] },
    { name: 'Calendars', dur: 7.8, draw: sCalendar, caps: [
      [0, 'GROUP_DATE buckets by a calendar component, from the hour to the year.', 'The date grouper buckets by a calendar component, from the hour to the year.'],
      [2.2, 'Day of week runs Monday first, in every output. In this cohort, Saturday is the busiest day.'],
      [4.6, 'GROUP_DATE_RANGES takes named periods. Rows keep the order you supplied, and every other day lands in unmatched, last.',
        'The date ranges grouper takes named periods. Rows keep the order you supplied, and every other day lands in unmatched, last.']] },
    { name: 'Multi-selects', dur: 9.4, draw: sSets, caps: [
      [0, 'A multi-select can be read per option or per combination. GROUP_SET_PER_ELEMENT gives one bucket per option. An order that ticked web and app counts in both, so the buckets add up to more than the orders. That is correct.',
        'A multi-select can be read per option or per combination. The per-element grouper gives one bucket per option. An order that ticked web and app counts in both, so the buckets add up to more than the orders. That is correct.'],
      [4.6, 'GROUP_SET_VALUE gives one bucket per exact combination instead, keyed by the sorted labels.',
        'The set value grouper gives one bucket per exact combination instead, keyed by the sorted labels.'],
      [6.8, 'Ticking nothing is a real answer. The combination grouper keeps it as an empty key, and the per-option grouper skips it. Neither counts it as null.'],
      [8.4, 'A blank is different: no answer at all. It gets no bucket and counts in n_null.', 'A blank is different: no answer at all. It gets no bucket and counts as null.']] },
    { name: 'Composite keys', dur: 6.6, draw: sCombo, caps: [
      [0, 'List two groupers, and each row is keyed by both: a tuple of region and plan.'],
      [1.8, 'You get one row per combination that was actually observed. No order in the West bought Pro, so there is no West Pro row: eleven rows, not twelve.'],
      [4.0, 'Rows come out in each grouper\'s own key order, outer to inner, and every row carries both key columns.']] },
    { name: 'Nulls in a composite', dur: 6.6, draw: sNulls, caps: [
      [0, 'A null at any key drops the record from every row.'],
      [1.6, 'Ten orders have no region and five have no plan, so the rows hold two hundred and eighty-five of the three hundred.'],
      [3.0, 'Each grouper still counts its own nulls once, as it would alone, and each group key is the full tuple.']] },
    { name: 'Fan-out and limits', dur: 7.2, draw: sFan, caps: [
      [0, 'Fan-out multiplies. Group by plan, then by channel, and each order lands once per option it ticked, inside its plan.'],
      [2.6, 'Two entries on the same key column are refused, with a validation error.'],
      [4.2, 'Before a run, predict estimates the groups as the product of each grouper\'s estimate: four regions times three plans is twelve, an upper bound.'],
      [5.8, 'The run enforces the limit on the groups it actually meets, and refuses with PULSE_LIMIT_EXCEEDED once they pass it.',
        'The run enforces the limit on the groups it actually meets, and refuses with a limit exceeded error once they pass it.']] },
    { name: 'Fitting inside a composite', dur: 5.6, draw: sFit, caps: [
      [0, 'Quantiles and k-means fit once over every filtered record by default. Set fit to within, and they refit inside each bucket of the groupers before them.']] },
    { name: 'Include', dur: 7.2, draw: sInclude, caps: [
      [0, 'An include list allow-lists keys, and it also fixes their order.'],
      [1.6, 'Ask for West, then North, and that is exactly what comes back, in that order.'],
      [3.4, 'Every other record is skipped on the same path as a null, so n_null reads one hundred and fifty-one. A listed key with no records still drops.',
        'Every other record is skipped on the same path as a null, so the null count reads one hundred and fifty-one. A listed key with no records still drops.'],
      [5.4, 'Today include works on the category, date, date range and multi-select groupers. For number bands, filter the values.']] },
    { name: 'Components', dur: 7, draw: sFloor, caps: [
      [0, 'Every grouper reports the same floor in its components: total_n, the records it placed in a bucket, and n_null, the ones it couldn\'t place.',
        'Every grouper reports the same floor in its components: total n, the records it placed in a bucket, and n null, the ones it couldn\'t place.'],
      [3.4, 'An aggregation counts differently. East has sixty-one orders, but only fifty-seven have a spend, so its average reads fifty-seven values.'],
      [6.2, 'A grouper counts every record after the filters. An aggregation counts only the values it used.']] },
    { name: 'What follows', dur: 6.6, draw: sFollow, caps: [
      [0, 'The composite rows carry through the rest of the request. Sort, return, windows, post-tests and grouped matrices all follow them.'],
      [3.2, 'Tier-one tests run once per group, and each result names its group key.'],
      [5.0, 'Series overlays run once per partition, over the leading keys, so put the date grouper last. Year over year needs exactly one date grouper.']] },
    { name: 'Keying on a window', dur: 7, draw: sWinFirst, caps: [
      [0, 'A grouper can key on a window\'s label too. Here a row number, counted per customer in time order, numbers each customer\'s visits.'],
      [1.4, 'Named ranges on that number split each first visit from the repeats.'],
      [3.6, 'That gives eighty-seven first orders and two hundred and thirteen repeats.'],
      [5.8, 'Because the grouper reads a window label, the windows run first, over the filtered records. Predict reports the plan before the run.']] },
    { name: 'Time zones', dur: 6.8, draw: sZones, caps: [
      [0, 'Datetimes are stored as UTC instants, but their buckets read a calendar.'],
      [2.2, 'Read in UTC, Monday has thirty-eight orders. Read each order on its own store\'s calendar, through a zone field, and Monday has forty-seven.'],
      [5.0, 'A slot or a whole request can set the zone. A row whose zone is null gets no bucket, and counts as null.']] },
    { name: 'The grouper toolkit', dur: 10.2, draw: sRecap, caps: [
      [0, 'Those are the groupers today: categories, number bands, quantiles, calendar parts and named periods, k-means clusters, and a multi-select read per option or per combination.'],
      [3.4, 'More groupers are added over time, and embedders can register their own through Options.Extensions. The manifest always shows what your instance offers.',
        'More groupers are added over time, and embedders can register their own through the extensions option. The manifest always shows what your instance offers.'],
      [6.4, 'Remember: check what each key dropped before you read the rows. Next up, aggregators.'],
      [9.0, '', 'Pulse groupers.', true]] },
  ],
});
})();
