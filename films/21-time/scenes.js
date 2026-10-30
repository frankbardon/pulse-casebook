/* Pulse time zones and panels: film 21 of the 23-film Pulse Anatomy series. Follows SERIES-RULES.md.
 * The cohorts are illustrative (data/generate.js): 219 orders from New York, London and Tokyo stores over one local
 * week, a Berlin meter read every 30 minutes across both 2026 DST changes, six naive wall-clock readings, and a
 * 1,204-row monthly panel of 300 subscribers. Every figure on screen comes from a recorded Pulse v1.0.0-alpha.33 run
 * in data/ (see data/README.md). The epoch-seconds and epoch-day values in scene 1 are computed from a recorded
 * instant. */
(() => {
const { C } = PulseFilm;
const { seg, eo, lerp, R, T, M, CAP, Ln, A, dot, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const pct = v => Math.round(v * 100) + '%';
const f2 = v => v.toFixed(2);
const sg = v => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + Math.abs(v).toFixed(2);

/* manifest.tz.json */
const TZDATA = '2026c';
/* badzone.out.json */
const BADZONE = 'unknown time zone "EST": it is not "UTC" or an IANA Area/Location name';
/* resolve.predict.json: time_zones[] */
const RESOLVE = [['attributes[0]', 'ATTR_DATE_PART', 'America/New_York', 'request'], ['attributes[1]', 'ATTR_DATE_PART', 'null · tz_field "zone"', 'field'], ['groups[0]', 'GROUP_DATE', 'Asia/Tokyo', 'slot']];
/* day_utc / day_ny / day_field .out.json: orders per GROUP_DATE day (null = no such key) */
const DAYS = [['2026-03-15', 'Sun', 1, 4, null], ['2026-03-16', 'Mon', 32, 35, 32], ['2026-03-17', 'Tue', 28, 26, 32], ['2026-03-18', 'Wed', 33, 33, 31], ['2026-03-19', 'Thu', 28, 30, 30],
  ['2026-03-20', 'Fri', 37, 32, 32], ['2026-03-21', 'Sat', 33, 35, 33], ['2026-03-22', 'Sun', 26, 24, 28], ['2026-03-23', 'Mon', 1, null, null]];
const FIELD_NULL = 1;   // day_field: groupers[0].n_null (the order with an empty zone cell)
/* dst_utc / dst_berlin .out.json: readings per day */
const DST = { spring: { utc: 48, berlin: 46 }, fall: { utc: 48, berlin: 50 } };
/* spring.out.json and fall.out.json: GROUP_DATE hour keys in Europe/Berlin (every other hour holds 2 readings) */
const SPRING_HOURS = ['00', '01', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];
const FALL_T02 = 4;
/* spring_utc / spring_day .out.json: FILTER_DATE_RANGES 2026-03-29 to 2026-03-29, n_in 288 */
const RANGE = { n_in: 288, utc: 48, berlin: 46 };
/* w.csv; w_naive / w_rows .export.csv; w_rows.berlin.csv; w_err / w_earlier / w_rows .import.json */
const WROWS = [['w1', 'Europe/Berlin', '2026-03-29T01:30', '03-29T00:30Z', '03-29T01:30+01:00', ''],
  ['w2', 'Europe/Berlin', '2026-03-29T02:30', '03-29T00:30Z', '03-29T01:30+01:00', 'skipped'],
  ['w3', 'Europe/Berlin', '2026-03-29T03:30', '03-29T01:30Z', '03-29T03:30+02:00', ''],
  ['w4', 'Europe/Berlin', '2026-10-25T02:30', '10-25T01:30Z', '10-25T02:30+01:00', 'repeated'],
  ['w5', 'Asia/Tokyo', '2026-03-29T02:30', '03-28T17:30Z', '03-28T18:30+01:00', ''],
  ['w6', 'America/New_York', '2026-03-29T02:30', '03-29T06:30Z', '03-29T08:30+02:00', '']];
const WERR = { code: 'PULSE_IMPORT_DST_NONEXISTENT', row: 2, value: '2026-03-29T02:30:00', zone: 'Europe/Berlin' };
const WEARLIER = { ambiguous: 1, nonexistent: 3 }, WLATER = { ambiguous: 1, nonexistent: 1 };
/* cal.out.json (request time_zone America/New_York) and bare.predict.json */
const CAL = [['1', 'tokyo', '2026-03-15T23:05Z', 1, 7, '2026-03-15'], ['9', 'london', '2026-03-16T08:10Z', 1, 1, '2026-03-16'], ['39', 'ny', '2026-03-17T03:49Z', 1, 1, '2026-03-16']];
/* panel.out.json (AGG_MODE codes, read through p.inspect.json's plan dictionary: trial, basic, churned, pro) */
const PANEL = [['s001', '2026-01', 'trial', null], ['s001', '2026-02', 'trial', 'trial'], ['s001', '2026-03', 'basic', 'trial'], ['s001', '2026-04', 'basic', 'basic'],
  ['s001', '2026-05', 'basic', 'basic'], ['s001', '2026-06', 'basic', 'basic'], ['s002', '2026-01', 'trial', null], ['s002', '2026-02', 'churned', 'trial']];
const PREVC = { n: 904, n_null: 300, n_subjects: 300, n_first: 300, n_gap: 0, n_ambiguous: 0 };
/* june.out.json: FILTER_DATE_RANGES June keeps 178 of 1,204; rows grouped by prev */
const JUNE = { n_in: 1204, n_out: 178, prev: [['basic', 114], ['pro', 61], ['trial', 3]] };
/* trans.out.json: prev (rows) x plan (columns), AGG_COUNT; null = absent cell */
const XCOLS = ['basic', 'churned', 'pro', 'trial'];
const TRANS = [['basic', [297, 43, 37, null]], ['pro', [18, 12, 135, null]], ['trial', [166, 79, 55, 62]]];
/* markov.out.json: transition P (rows and columns basic, pro, trial, churned), parts and warnings */
const MSTATES = ['basic', 'pro', 'trial', 'churned'];
const MP = [[0.7878, 0.0981, 0, 0.1141], [0.1091, 0.8182, 0, 0.0727], [0.4586, 0.1519, 0.1713, 0.2182], [0, 0, 0, 1]];
const MDIST3 = [0.3943, 0.2091, 0.0050, 0.3916];
const MABS = [['basic', 10.04], ['pro', 11.53], ['trial', 8.88]];
/* retention.out.json */
const RET = [['basic', 0.7878, 0.0981, 0.1141, 377], ['pro', 0.8182, 0.1091, 0.0727, 165], ['trial', 0.1713, 0.6105, 0.2182, 362]];
const RETPOOL = { stay: 0.5465, sw: 0.3053, churn: 0.1482, total: 904 };
/* winfirst.out.json: average spend_change per cell; winfirst.predict.json: post_window */
const WF = [['basic', [0.0556, -20.4023, 29.2, null]], ['pro', [-28.7056, -49.9917, -0.0185, null]], ['trial', [20.0735, 0, 49.9655, 0]]];

/* a small table: cols [[head, width, color?]], rows of cells; cells may be [text, color] */
function table(t, at, x, y, cols, rows, o = {}) {
  const rh = o.rh ?? 30, size = o.size ?? 13;
  let cx = x; cols.forEach(([h, w, c]) => { CAP(h, cx, y, { color: c || C.muted }); cx += w; });
  Ln([[x, y + 10], [x + cols.reduce((s, c) => s + c[1], 0), y + 10]], { stroke: C.rule });
  rows.forEach((r, i) => A(seg(t, at + i * (o.step ?? 0.08), at + i * (o.step ?? 0.08) + 0.3), () => {
    let cx2 = x; r.forEach((cell, j) => {
      const [s, c] = Array.isArray(cell) ? cell : [cell, j === 0 ? C.ink : C.muted];
      M(s, cx2, y + 34 + i * rh, { size, color: c }); cx2 += cols[j][1];
    });
  }));
}

/* ---------- 0. title ---------- */
function sTitle(t) {
  const zones = [['New York', -4, C.teal], ['London', 0, C.teal], ['Tokyo', 9, C.teal]];
  // one instant, three wall clocks
  A(seg(t, 0.1, 0.5), () => { R(490, 180, 300, 50, { fill: C.panel, stroke: C.amber }); M('2026-03-17T03:49:00Z', 640, 211, { size: 15, color: C.amber, align: 'center' }); });
  zones.forEach(([n, off, c], i) => A(seg(t, 0.5 + i * 0.2, 0.9 + i * 0.2), () => {
    const x = 300 + i * 340, h = (3 + off + 24) % 24, day = 3 + off < 0 ? 'Mon 16' : 'Tue 17';
    arrow(640, 232, x, 300, { stroke: C.rule });
    R(x - 120, 304, 240, 96, { fill: C.panel2, stroke: c });
    T(n, x, 334, { size: 15, weight: 600, align: 'center' });
    M(day + ' · ' + String(h).padStart(2, '0') + ':49', x, 372, { size: 16, color: C.teal, align: 'center' });
  }));
  A(seg(t, 1.4, 1.9), () => T('One instant, read on each local clock', 640, 480, { size: 22, align: 'center', color: C.muted }));
}

/* ---------- 1. stored as UTC ---------- */
function sStore(t) {
  CAP('STORAGE IS ALWAYS UTC', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 200, C.teal);
    M('datetime', 86, 186, { size: 15, color: C.teal, weight: 600 }); M('whole SECONDS since the epoch', 220, 186, { size: 13, color: C.ink });
    M('2026-03-29T00:30:00Z  →  1774744200', 86, 214, { size: 13, color: C.muted });
    M('date', 86, 262, { size: 15, color: C.teal, weight: 600 }); M('whole DAYS since the epoch', 220, 262, { size: 13, color: C.ink });
    M('2026-03-29  →  20541', 86, 290, { size: 13, color: C.muted });
    M('never interchangeable', 86, 326, { size: 12.5, color: C.coral });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(656, 146, 560, 200, C.amber);
    CAP('A ZONE CHANGES THE READING, NOT THE VALUE', 678, 174, { color: C.amber });
    M('stored', 678, 214, { size: 13 }); M('2026-03-29T00:30:00Z', 800, 214, { size: 14, color: C.ink });
    M('UTC', 678, 254, { size: 13 }); M('00:30 · the 29th', 800, 254, { size: 14, color: C.teal });
    M('Europe/Berlin', 678, 290, { size: 13 }); M('01:30+01:00 · the 29th', 800, 290, { size: 14, color: C.teal });
    M('read: calendar day, wall clock · rendered: export --tz', 678, 326, { size: 12, color: C.muted });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 366, 1152, 200, C.coral);
    CAP('ZONE NAMES', 86, 394);
    M('"UTC" or an IANA Area/Location, such as "Europe/Berlin"', 86, 430, { size: 14, color: C.ink });
    M('from Pulse\'s own embedded tz database, never the host\'s · manifest tzdata_version "' + TZDATA + '"', 86, 458, { size: 12.5, color: C.amber });
    M('"time_zone": "EST"', 86, 500, { size: 13, color: C.ink });
    M('PULSE_TIMEZONE_UNKNOWN', 300, 500, { size: 14, color: C.coral, weight: 600 });
    M(BADZONE, 86, 530, { size: 12, color: C.muted });
  });
}

/* ---------- 2. which zone applies ---------- */
function sResolve(t) {
  CAP('WHICH ZONE A SLOT READS IN · FIRST ONE SET WINS', 64, 124, { color: C.amber });
  const chain = [['slot', 'tz'], ['slot', 'tz_field'], ['request', 'time_zone_field'], ['request', 'time_zone'], ['Options', 'DefaultTimeZone'], ['default', 'UTC']];
  chain.forEach(([a, b], i) => A(seg(t, 0.2 + i * 0.25, 0.5 + i * 0.25), () => {
    const x = 64 + i * 194; R(x, 150, 174, 70, { fill: C.panel2, stroke: i === 5 ? C.rule : C.amber });
    M(a, x + 12, 176, { size: 11.5, color: C.muted }); M(b, x + 12, 204, { size: 13.5, color: C.ink, weight: 600 });
    if (i < 5) arrow(x + 176, 185, x + 192, 185, { stroke: C.faint, head: 5 });
  }));
  A(seg(t, 3.0, 3.4), () => {
    card(64, 244, 1152, 210, C.amber);
    CAP('pulse api predict · time_zones[]', 86, 272, { color: C.amber });
    M('request "time_zone": "America/New_York"', 760, 272, { size: 12, color: C.muted });
    table(t, 3.3, 86, 306, [['slot', 190], ['operator', 220], ['tz', 380, C.teal], ['source', 200, C.amber]],
      RESOLVE.map(([s, op, tz, src]) => [s, op, [tz, C.teal], [src, C.amber]]), { rh: 34, step: 0.25 });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(64, 472, 1152, 94);
    M('a date field is never zoned · tz and tz_field on one slot: PROCESSING_CONFIG', 86, 508, { size: 13, color: C.ink });
    M('slot keys: the features and groupers films · this film: the request-wide time_zone and time_zone_field', 86, 538, { size: 12.5, color: C.muted });
  });
}

/* ---------- 3. one zone, or each row's own ---------- */
function sRowZones(t) {
  CAP('GROUP_DATE day · 219 ORDERS · ONE LOCAL WEEK', 64, 124, { color: C.teal });
  const cols = [[64, 'no zone (UTC days)', 2, 0], [430, '"time_zone": "America/New_York"', 3, 2.8], [796, '"time_zone_field": "zone"', 4, 5.2]];
  A(seg(t, 0.1, 0.4), () => DAYS.forEach(([d, dw], i) => { M(d.slice(5) + ' ' + dw, 64, 196 + i * 38, { size: 13, color: C.muted }); }));
  cols.forEach(([x, head, k, at], ci) => A(seg(t, at, at + 0.4), () => {
    const bx = ci === 0 ? 190 : x;
    CAP(head, bx, 160, { color: ci === 2 ? C.violet : C.teal });
    DAYS.forEach((r, i) => {
      const v = r[k], y = 180 + i * 38;
      if (v == null) { M('—', bx, y + 16, { size: 13, color: C.faint }); return; }
      const w = 220 * v / 40 * eo(seg(t, at + 0.2 + i * 0.05, at + 0.6 + i * 0.05));
      R(bx, y + 2, Math.max(w, 2), 20, { fill: ci === 2 ? C.violetS : C.tealS, stroke: ci === 2 ? C.violet : C.teal, r: 3 });
      M(String(v), bx + w + 8, y + 17, { size: 13, color: C.ink });
    });
  }));
  A(seg(t, 7.2, 7.6), () => {
    R(796, 528, 420, 40, { fill: C.panel, stroke: C.coral, dash: [5, 4] });
    M('empty zone cell → no local day · grouper n_null ' + FIELD_NULL, 812, 553, { size: 12.5, color: C.coral });
  });
}

/* ---------- 4. a DST day ---------- */
function hourStrip(t, at, x, y, keys, dbl, c) {
  keys.forEach((k, i) => A(seg(t, at + i * 0.02, at + i * 0.02 + 0.25), () => {
    const bx = x + i * 46; const two = k === dbl;
    R(bx, y, 42, two ? 64 : 34, { fill: two ? C.violetS : C.tealS, stroke: two ? C.violet : c, r: 3 });
    M(k, bx + 21, y + 22, { size: 12, color: C.ink, align: 'center' });
    if (two) M('×4', bx + 21, y + 52, { size: 12, color: C.violet, align: 'center' });
  }));
}
function sDst(t) {
  CAP('A BERLIN METER · ONE READING EVERY 30 MINUTES', 64, 124, { color: C.teal });
  [['29 March 2026 · 02:00 → 03:00', DST.spring, 0], ['25 October 2026 · 03:00 → 02:00', DST.fall, 1]].forEach(([h, v, i]) => A(seg(t, 0.2 + i * 0.3, 0.6 + i * 0.3), () => {
    const x = 64 + i * 590; card(x, 146, 562, 150, C.teal);
    CAP(h, x + 22, 174, { color: C.muted });
    M('UTC day', x + 22, 216, { size: 14 }); M(String(v.utc), x + 200, 216, { size: 18, color: C.ink, weight: 600 }); M('readings · 24 hours', x + 250, 216, { size: 12.5 });
    A(seg(t, 2.4 + i * 0.4, 2.8 + i * 0.4), () => {
      M('Berlin day', x + 22, 258, { size: 14, color: C.teal }); M(String(v.berlin), x + 200, 258, { size: 18, color: C.violet, weight: 600 });
      M('readings · ' + (v.berlin / 2) + ' hours', x + 250, 258, { size: 12.5, color: C.violet });
    });
  }));
  A(seg(t, 5.0, 5.3), () => {
    CAP('"component": "hour" · keys 2026-03-29T<HH>, Berlin wall clock', 64, 330, { color: C.violet });
    hourStrip(t, 5.1, 64, 344, SPRING_HOURS, null, C.teal);
    R(64 + 2 * 46 - 3, 340, 2, 42, { fill: C.coral });
    M('no T02: the skipped hour has no bucket', 64, 404, { size: 12.5, color: C.coral });
  });
  A(seg(t, 6.2, 6.5), () => {
    CAP('keys 2026-10-25T<HH> · the repeated hour is one bucket', 64, 444, { color: C.violet });
    const keys = []; for (let h = 0; h < 24; h++) keys.push(String(h).padStart(2, '0'));
    hourStrip(t, 6.3, 64, 458, keys, '02', C.teal);
    M('T02 holds ' + FALL_T02 + ' readings: 02:00 to 03:00 happens twice', 210, 548, { size: 12.5, color: C.violet });
  });
}

/* ---------- 5. ranges are local days ---------- */
function sRange(t) {
  CAP('FILTER_DATE_RANGES · { "start": "2026-03-29", "end": "2026-03-29" }', 64, 124, { color: C.teal });
  // a 48-hour axis, 2026-03-28T12Z to 2026-03-30T12Z, 18 px an hour
  const x0 = 100, hx = h => x0 + h * 22.5;   // h: hours from 2026-03-28T12:00Z
  A(seg(t, 0.2, 0.6), () => {
    Ln([[hx(0), 300], [hx(48), 300]], { stroke: C.rule, lw: 2 });
    [[0, '28th 12:00Z'], [12, '29th 00:00Z'], [24, '29th 12:00Z'], [36, '30th 00:00Z'], [48, '30th 12:00Z']].forEach(([h, s]) => { Ln([[hx(h), 294], [hx(h), 306]], { stroke: C.faint }); M(s, hx(h), 326, { size: 11.5, align: 'center' }); });
    for (let i = 0; i < 96; i++) dot(hx(i / 2), 300, 2.2, C.faint);
  });
  A(seg(t, 2.4, 2.8), () => {
    R(hx(12), 196, hx(36) - hx(12), 40, { fill: C.tealS, stroke: C.teal });
    M('no zone: the UTC day · n_out ' + RANGE.utc, hx(12) + 12, 221, { size: 13, color: C.teal });
  });
  A(seg(t, 3.6, 4.0), () => {
    R(hx(11), 248, hx(34) - hx(11), 40, { fill: C.violetS, stroke: C.violet });
    M('"time_zone": "Europe/Berlin" · n_out ' + RANGE.berlin, hx(11) + 12, 273, { size: 13, color: C.violet });
    M('28th 23:00Z (00:00 CET) → 29th 22:00Z (00:00 CEST): 23 hours', hx(11), 352, { size: 12.5, color: C.violet });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 392, 1152, 174, C.teal);
    M('range literals are LOCAL calendar days in the slot\'s zone · n_in ' + RANGE.n_in + ' both times', 86, 430, { size: 14, color: C.ink });
    M('inline ranges or a range table alike: a range table has no zone of its own', 86, 462, { size: 12.5, color: C.muted });
    M('GROUP_DATE_RANGES reads its literals the same way', 86, 490, { size: 12.5, color: C.muted });
    M('the local day [issue #403, fixed at alpha.33] · the filters film shows a per-row zone', 86, 530, { size: 12.5, color: C.amber });
  });
}

/* ---------- 6. import in a source zone ---------- */
function sImport(t) {
  CAP('w.csv · NAIVE WALL CLOCKS, NO OFFSET', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 290);
    table(t, 0.3, 86, 176, [['id', 60], ['zone', 200], ['read_at', 260]], WROWS.map(r => [r[0], r[1], [r[2], r[5] ? C.amber : C.ink]]), { rh: 34 });
    M('pulse import csv: each read as UTC (…02:30:00Z)', 86, 420, { size: 12.5, color: C.muted });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(656, 146, 560, 290, C.coral);
    M('--source-tz Europe/Berlin', 678, 184, { size: 15, color: C.ink, weight: 600 });
    M(WERR.code, 678, 230, { size: 15, color: C.coral, weight: 600 });
    M('row ' + WERR.row + ', column "read_at"', 678, 262, { size: 13, color: C.ink });
    M('local time "' + WERR.value + '"', 678, 288, { size: 13, color: C.ink });
    M('in ' + WERR.zone + ' does not exist: the zone skips it', 678, 314, { size: 13, color: C.ink });
    M('no file written', 678, 356, { size: 13, color: C.coral });
    M('a repeated time: PULSE_IMPORT_DST_AMBIGUOUS', 678, 404, { size: 12, color: C.muted });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(64, 456, 1152, 110, C.amber);
    M('stored as epoch seconds: nothing after the import can recover the source zone', 86, 494, { size: 14, color: C.ink });
    M('a value with its own Z or offset never moves · date columns are never zoned', 86, 526, { size: 12.5, color: C.muted });
    M('a managed import keeps its zone: re-import to change it', 86, 550, { size: 12, color: C.muted });
  });
}

/* ---------- 7. resolve, or read per row ---------- */
function sResolveImport(t) {
  CAP('--dst-policy error | earlier | later', 64, 124, { color: C.amber });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 132, C.amber);
    M('earlier: the offset before the change · later: the one after', 86, 178, { size: 13, color: C.ink });
    M('PULSE_IMPORT_DST_RESOLVED', 86, 214, { size: 14, color: C.amber, weight: 600 });
    A(seg(t, 2.8, 3.2), () => {
      M('--source-tz Europe/Berlin --dst-policy earlier', 86, 244, { size: 12.5, color: C.muted });
      M(WEARLIER.ambiguous + ' ambiguous · ' + WEARLIER.nonexistent + ' nonexistent', 330, 214, { size: 13, color: C.ink });
      M('one file zone reads w5 and w6 as Berlin too', 86, 266, { size: 12.5, color: C.coral });
    });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(656, 146, 560, 132, C.teal);
    M('--source-tz-field zone --dst-policy later', 678, 178, { size: 13.5, color: C.teal, weight: 600 });
    M('each row in its own zone column', 678, 206, { size: 12.5, color: C.ink });
    M('PULSE_IMPORT_DST_RESOLVED · ' + WLATER.ambiguous + ' ambiguous · ' + WLATER.nonexistent + ' nonexistent', 678, 236, { size: 12.5, color: C.amber });
    M('an unknown zone name skips the row (rows_dropped)', 678, 262, { size: 12, color: C.muted });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(64, 296, 1152, 270);
    table(t, 5.5, 86, 324, [['id', 60], ['zone', 200], ['wall clock', 220], ['stored', 200, C.teal], ['export --tz Europe/Berlin', 260, C.violet], ['', 120]],
      WROWS.map(r => [r[0], r[1], r[2], [r[3], C.teal], [7.2 <= t ? r[4] : '', C.violet], [r[5], C.amber]]), { rh: 36, step: 0.1 });
  });
}

/* ---------- 8. calendar parts and formulas ---------- */
function sCal(t) {
  CAP('"time_zone": "America/New_York" · THREE ORDERS', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 210);
    table(t, 0.3, 86, 176, [['id', 60], ['store', 110], ['at', 230], ['ATTR_DATE_PART iso_weekday · tz_field zone', 420, C.teal], ['weekday(to_day(at))', 260, C.violet]],
      CAL.map(([id, st, at, dp, fw]) => [id, st, [at, C.ink], [String(dp) + '  Monday, in the store\'s zone', C.teal],
        [3.0 <= t ? String(fw) + (fw === 7 ? '  Sunday, in New York' : '  Monday, in New York') : '', fw === 7 ? C.coral : C.violet]]), { rh: 40, step: 0.15 });
    M('ISO weekday: Monday = 1 … Sunday = 7', 86, 334, { size: 12, color: C.muted });
  });
  A(seg(t, 3.0, 3.4), () => {
    card(64, 374, 560, 192, C.violet);
    M('to_day(at) reads the request zone only', 86, 410, { size: 14, color: C.violet, weight: 600 });
    M('request time_zone → Options.DefaultTimeZone → UTC', 86, 440, { size: 12.5, color: C.ink });
    M('never a slot tz, never a zone column', 86, 466, { size: 12.5, color: C.ink });
    M('order 1: to_day = 2026-03-15 under New York', 86, 504, { size: 12.5, color: C.muted });
    M('per row: a zoned date feature, then a filter on it', 86, 540, { size: 12, color: C.muted });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(656, 374, 560, 192, C.coral);
    M('weekday(at)', 678, 410, { size: 14, color: C.ink });
    M('PULSE_FORMULA_COMPILE_ERROR', 678, 444, { size: 14, color: C.coral, weight: 600 });
    M('weekday() reads epoch days but "at" is a datetime', 678, 474, { size: 12, color: C.muted });
    M('field (epoch seconds): wrap it in to_day()', 678, 494, { size: 12, color: C.muted });
    M('weekday · month_index · date_trunc: the expressions film', 678, 540, { size: 12, color: C.muted });
  });
}

/* ---------- 9. a long panel ---------- */
function sPanel(t) {
  CAP('p.csv · A LONG PANEL · 300 SUBJECTS × MONTHS', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 560, 420);
    table(t, 0.3, 86, 176, [['subject', 110], ['month', 120], ['plan', 130], ['prev', 150, C.violet]],
      PANEL.map(([s, m, p, pv]) => [s, m, [p, C.ink], [2.8 <= t ? (pv == null ? 'null' : pv) : '', pv == null ? C.coral : C.violet]]), { rh: 40, step: 0.12 });
    M('1,204 rows · first month Jan, Feb or Mar · last after churn', 86, 548, { size: 12, color: C.muted });
  });
  A(seg(t, 2.8, 3.2), () => {
    card(656, 146, 560, 240, C.violet);
    M('ATTR_PREVIOUS_STATE', 678, 182, { size: 15, color: C.violet, weight: 600 });
    M('"field": "plan"            the state', 678, 216, { size: 12.5, color: C.ink });
    M('"subject_field": "subject"', 678, 242, { size: 12.5, color: C.ink });
    M('"order_field": "month"     date or datetime', 678, 268, { size: 12.5, color: C.ink });
    M('"label": "prev"', 678, 294, { size: 12.5, color: C.ink });
    M('output typed as plan: its dictionary, nullable', 678, 330, { size: 12.5, color: C.violet });
    M('ordered by instant · takes no tz', 678, 358, { size: 12, color: C.muted });
  });
  A(seg(t, 5.6, 6.0), () => {
    card(656, 404, 560, 162, C.coral);
    CAP('components', 678, 432);
    [['n_subjects', PREVC.n_subjects], ['n_first', PREVC.n_first], ['n_gap', PREVC.n_gap], ['n_ambiguous', PREVC.n_ambiguous]].forEach(([k, v], i) => {
      M(k, 678 + (i % 2) * 270, 470 + Math.floor(i / 2) * 30, { size: 13 }); M(String(v), 840 + (i % 2) * 270, 470 + Math.floor(i / 2) * 30, { size: 14, color: C.ink, align: 'right' });
    });
    M('first time point: null, never 0', 678, 548, { size: 12.5, color: C.coral });
  });
}

/* ---------- 10. before the filters ---------- */
function sBefore(t) {
  CAP('BY DEFAULT ATTRIBUTES FOLLOW FILTERS · THIS ONE RUNS BEFORE THEM', 64, 124, { color: C.violet });
  const stages = [['ATTR_PREVIOUS_STATE', C.violet, 'every record'], ['FILTER_DATE_RANGES June', C.teal, JUNE.n_in.toLocaleString('en-US') + ' → ' + JUNE.n_out], ['GROUP_CATEGORY prev', C.teal, 'June rows']];
  stages.forEach(([s, c, n], i) => A(seg(t, 0.2 + i * 0.3, 0.6 + i * 0.3), () => {
    const x = 64 + i * 392; R(x, 150, 360, 80, { fill: C.panel2, stroke: c });
    M(s, x + 16, 184, { size: 14, color: c, weight: 600 }); M(n, x + 16, 212, { size: 12.5, color: C.ink });
    if (i < 2) arrow(x + 362, 190, x + 390, 190, { stroke: C.faint });
  }));
  A(seg(t, 2.6, 3.0), () => {
    card(64, 252, 560, 230, C.teal);
    CAP('June rows by their May plan', 86, 280);
    JUNE.prev.forEach(([k, v], i) => {
      const y = 300 + i * 50, w = 360 * v / 120 * eo(seg(t, 2.8 + i * 0.1, 3.3 + i * 0.1));
      M(k, 86, y + 22, { size: 14, color: C.ink }); R(170, y + 6, w, 24, { fill: C.violetS, stroke: C.violet, r: 3 }); M(String(v), 178 + w, y + 24, { size: 14, color: C.ink });
    });
    M('no null: the May rows were filtered out after prev was read', 86, 466, { size: 12, color: C.muted });
  });
  A(seg(t, 3.6, 4.0), () => {
    card(656, 252, 560, 230, C.violet);
    CAP('ATTR_PREVIOUS_STATE components', 678, 280);
    M('n ' + PREVC.n + ' · n_null ' + PREVC.n_null, 678, 320, { size: 15, color: C.ink });
    M('= ' + (PREVC.n + PREVC.n_null).toLocaleString('en-US') + ': every record, not the ' + JUNE.n_out + ' kept', 678, 352, { size: 13, color: C.violet });
    M('a filter keeps each row\'s true previous state', 678, 400, { size: 12.5, color: C.ink });
    M('buffered: no streaming, no fused crosstab', 678, 430, { size: 12, color: C.muted });
  });
  A(seg(t, 4.8, 5.2), () => {
    card(64, 500, 1152, 66, C.amber);
    M('an expression filter can read it by state name: prev == "trial" · the filters film', 86, 540, { size: 13, color: C.ink });
  });
}

/* ---------- 11. from x to ---------- */
function xgrid(t, at, x, y, rows, cols, cell, o = {}) {
  const cw = o.cw ?? 130, rh = o.rh ?? 52;
  cols.forEach((c, j) => CAP(c, x + 140 + j * cw + cw / 2, y, { color: o.cc || C.teal, align: 'center' }));
  rows.forEach(([r, vals], i) => A(seg(t, at + i * 0.15, at + i * 0.15 + 0.35), () => {
    const yy = y + 16 + i * rh; M(r, x, yy + rh / 2 + 4, { size: 14, color: o.rc || C.violet });
    vals.forEach((v, j) => cell(x + 140 + j * cw, yy, cw - 8, rh - 8, v, i, j));
  }));
}
function sTrans(t) {
  CAP('crosstab · rows prev × columns plan · AGG_COUNT', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 760, 300, C.teal);
    T('to →', 800, 176, { size: 13, color: C.muted, align: 'right' }); T('from ↓', 86, 176, { size: 13, color: C.muted });
    xgrid(t, 0.4, 86, 196, TRANS, XCOLS, (x, y, w, h, v, i, j) => {
      if (v == null) { R(x, y, w, h, { stroke: C.rule, dash: [3, 3] }); M('—', x + w / 2, y + h / 2 + 5, { align: 'center', color: C.faint }); return; }
      const stay = TRANS[i][0] === XCOLS[j];
      R(x, y, w, h, { fill: stay ? C.tealS : C.panel2, stroke: XCOLS[j] === 'churned' ? C.coral : stay ? C.teal : C.rule });
      M(String(v), x + w / 2, y + h / 2 + 5, { size: 15, color: C.ink, align: 'center' });
    });
  });
  A(seg(t, 2.6, 3.0), () => {
    card(848, 146, 368, 300, C.amber);
    M('904 transitions', 870, 186, { size: 16, color: C.ink, weight: 600 });
    M('first months: prev is null,', 870, 222, { size: 12.5, color: C.muted }); M('so they reach no cell', 870, 244, { size: 12.5, color: C.muted });
    M('churned: a column only', 870, 290, { size: 13, color: C.coral }); M('nobody is observed after', 870, 314, { size: 12.5, color: C.muted }); M('leaving, so no churned row', 870, 336, { size: 12.5, color: C.muted });
    M('no pre-pivot: the long panel', 870, 384, { size: 12.5, color: C.ink }); M('is the host', 870, 406, { size: 12.5, color: C.ink });
  });
}

/* ---------- 12. a Markov chain ---------- */
function sMarkov(t) {
  CAP('OVERLAY_MARKOV · scope matrix · "absorbing": ["churned"] · "steps": [3] · "initial": {"trial": 1}', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 640, 290, C.violet);
    CAP('transition P · each row sums to 1', 86, 172, { color: C.violet });
    xgrid(t, 0.4, 86, 196, MSTATES.map((s, i) => [s, MP[i]]), MSTATES, (x, y, w, h, v, i, j) => {
      const syn = i === 3;
      R(x, y, w, h, { fill: lerp(0, 1, v) > 0.5 ? C.violetS : C.panel2, stroke: syn ? C.coral : (i === j ? C.violet : C.rule), dash: syn ? [4, 3] : [] });
      M(v === 0 ? '0' : f2(v), x + w / 2, y + h / 2 + 5, { size: 14, color: v ? C.ink : C.faint, align: 'center' });
    }, { cw: 118, rh: 52, cc: C.violet, rc: C.violet });
  });
  A(seg(t, 3.0, 3.4), () => {
    card(728, 146, 488, 290, C.coral);
    CAP('warnings', 750, 172);
    M('PULSE_OVERLAY_REF_ZERO', 750, 208, { size: 13.5, color: C.coral, weight: 600 });
    M('unit row added for column-only churned', 750, 232, { size: 12.5, color: C.ink });
    M('PULSE_OVERLAY_MARKOV_NOT_ERGODIC', 750, 276, { size: 13.5, color: C.coral, weight: 600 });
    M('reducible (3 communicating classes):', 750, 300, { size: 12.5, color: C.ink });
    M('steady_state omitted', 750, 322, { size: 12.5, color: C.ink });
    M('a column-only state not listed as absorbing', 750, 372, { size: 12, color: C.muted });
    M('is PULSE_OVERLAY_MATRIX_NOT_SQUARE', 750, 394, { size: 12, color: C.muted });
  });
  A(seg(t, 6.0, 6.4), () => {
    card(64, 454, 640, 112, C.violet);
    CAP('distribution_3 · three months from trial', 86, 480, { color: C.violet });
    MSTATES.forEach((s, i) => { M(s, 86 + i * 150, 512, { size: 12.5 }); M(pct(MDIST3[i]), 86 + i * 150, 542, { size: 17, color: i === 3 ? C.coral : C.ink, weight: 600 }); });
  });
  A(seg(t, 6.6, 7.0), () => {
    card(728, 454, 488, 112, C.violet);
    CAP('absorption_time · months to churn', 750, 480, { color: C.violet });
    MABS.forEach(([s, v], i) => { M(s, 750 + i * 150, 512, { size: 12.5 }); M(v.toFixed(1), 750 + i * 150, 542, { size: 17, color: C.ink, weight: 600 }); });
  });
}

/* ---------- 13. retention ---------- */
function sRetention(t) {
  CAP('OVERLAY_RETENTION · scope row · "absorbing": ["churned"] · SAME HOST', 64, 124, { color: C.violet });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 300, C.violet);
    [['stay', C.teal], ['switch', C.amber], ['churn', C.coral]].forEach(([k, c], i) => { R(760 + i * 140, 164, 14, 14, { fill: c }); M(k, 780 + i * 140, 176, { size: 12.5, color: c }); });
    RET.forEach(([s, st, sw, ch, n], i) => {
      const y = 204 + i * 76, u = eo(seg(t, 0.5 + i * 0.25, 1.2 + i * 0.25)), W = 760 * u, x = 210;
      M(s, 86, y + 26, { size: 15, color: C.ink }); M('from_total ' + n, 86, y + 48, { size: 11.5 });
      let cx = x; [[st, C.tealS, C.teal], [sw, C.amberS, C.amber], [ch, C.coralS, C.coral]].forEach(([v, f, c]) => {
        const w = W * v; R(cx, y + 6, w, 34, { fill: f, stroke: c, r: 2 }); if (w > 50) M(pct(v), cx + 8, y + 28, { size: 13, color: C.ink }); cx += w;
      });
    });
  });
  A(seg(t, 5.0, 5.4), () => {
    card(64, 464, 1152, 102, C.violet);
    CAP('layer summary · pooled over ' + RETPOOL.total + ' transitions', 86, 492, { color: C.violet });
    [['stay', RETPOOL.stay, C.teal], ['switch', RETPOOL.sw, C.amber], ['churn', RETPOOL.churn, C.coral]].forEach(([k, v, c], i) => { M(k, 86 + i * 200, 534, { size: 13 }); M(pct(v), 160 + i * 200, 536, { size: 18, color: c, weight: 600 }); });
    M('per row: stay + switch + churn = 1', 760, 524, { size: 12, color: C.muted }); M('stay: the column whose key names the row', 760, 546, { size: 12, color: C.muted });
  });
}

/* ---------- 14. windows first ---------- */
function sWinFirst(t) {
  CAP('WIN_DELTA spend → spend_change · partition_by subject · order_by month', 64, 124, { color: C.teal });
  A(seg(t, 0.2, 0.6), () => {
    card(64, 146, 1152, 92, C.teal);
    const st = [['records', C.teal], ['windows: spend_change per row', C.teal], ['crosstab prev × plan', C.violet], ['cell AGG_AVERAGE spend_change', C.violet]];
    st.forEach(([s, c], i) => A(seg(t, (i < 2 ? 0.3 : 2.8) + i * 0.15, (i < 2 ? 0.6 : 3.1) + i * 0.15), () => {
      const x = 86 + i * 282; R(x, 168, 250, 46, { fill: C.panel2, stroke: c }); M(s, x + 12, 196, { size: 12.5, color: C.ink });
      if (i > 0) arrow(x - 30, 191, x - 2, 191, { stroke: C.faint, head: 5 });
    }));
  });
  A(seg(t, 2.8, 3.2), () => {
    card(856, 256, 360, 190, C.amber);
    CAP('pulse api predict · post_window', 878, 284, { color: C.amber });
    M('windows_first   true', 878, 320, { size: 13, color: C.ink });
    M('window_labels   ["spend_change"]', 878, 346, { size: 13, color: C.ink });
    M('buffered, never the fused crosstab', 878, 392, { size: 12, color: C.muted });
    M('by default windows run after groups', 878, 416, { size: 12, color: C.muted });
  });
  A(seg(t, 3.4, 3.8), () => {
    card(64, 256, 772, 310, C.violet);
    CAP('average change in spend since last month · from ↓ to →', 86, 284, { color: C.violet });
    xgrid(t, 3.5, 86, 316, WF, XCOLS, (x, y, w, h, v, i, j) => {
      if (v == null) { R(x, y, w, h, { stroke: C.rule, dash: [3, 3] }); M('—', x + w / 2, y + h / 2 + 5, { align: 'center', color: C.faint }); return; }
      const hot = (i === 2 && j === 2) || (i === 1 && j === 0);
      R(x, y, w, h, { fill: hot ? C.violetS : C.panel2, stroke: hot ? C.violet : C.rule });
      M(sg(v), x + w / 2, y + h / 2 + 5, { size: 14, color: v < -0.005 ? C.coral : C.ink, align: 'center' });
    }, { cw: 140, rh: 58, cc: C.teal, rc: C.violet });
  });
  A(seg(t, 5.4, 5.8), () => {
    card(856, 464, 360, 102);
    M('a subject\'s first month: no delta', 878, 500, { size: 12, color: C.muted });
    M('frames and partitions: the windows film', 878, 530, { size: 12, color: C.muted });
  });
}

/* ---------- 15. recap ---------- */
function sRecap(t) {
  CAP('TIME IN PULSE · TODAY', 64, 124, { color: C.teal });
  const items = [['UTC instants', C.teal], ['time_zone', C.teal], ['time_zone_field', C.teal], ['slot tz · tz_field', C.teal], ['local days', C.teal], ['DST: 23 and 25 hours', C.violet],
    ['FILTER_DATE_RANGES local day', C.teal], ['--source-tz · --source-tz-field', C.amber], ['--dst-policy', C.amber], ['export --tz', C.amber], ['to_day · weekday', C.violet],
    ['ATTR_PREVIOUS_STATE', C.violet], ['OVERLAY_MARKOV', C.violet], ['OVERLAY_RETENTION', C.violet], ['windows-first lags', C.teal], ['+ more', null]];
  chips(items, 64, 150, 1152, { t, at: 0.2, step: 0.12, size: 14, h: 34, gap: 10 });
  A(seg(t, 3.4, 3.8), () => {
    card(64, 330, 1152, 120, C.amber);
    M('more are added over time · the manifest lists what your instance offers, with its tzdata_version', 86, 372, { size: 14, color: C.ink });
    M('embedders register their own groupers, attributes and windows through Options.Extensions', 86, 408, { size: 13, color: C.amber });
  });
  A(seg(t, 6.4, 6.8), () => { card(64, 470, 1152, 96, C.teal); M('next · synthetic data: cohorts like these, generated from a spec', 86, 526, { size: 15, color: C.teal }); });
}

const NARR = /*NARR*/[2.389, 8.405, 7.893, 8.768, 8.299, 9.195, 8.491, 7.445, 6.485, 7.296, 5.867, 8.149, 7.04, 7.488, 9.301, 6.272, 9.6, 9.259, 8.896, 8.064, 7.253, 8.171, 8.875, 8.363, 7.659, 8.405, 8.32, 8.427, 7.808, 8.427, 6.507, 8.683, 9.216, 9.877, 10.005, 6.421, 7.381, 5.803, 7.552, 7.872, 7.808, 9.003, 10.816, 4.224, 1.472]/*END*/;
PulseFilm.mount({
  series: 'PULSE · TIME',
  title: 'Pulse time zones and panels',
  narr: NARR,
  scenes: [
    { name: 'Time zones and panels', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Every row, read in its own local time.', true]] },
    { name: 'Stored as UTC', dur: 7.6, draw: sStore, caps: [
      [0, 'Pulse stores every instant in UTC. A datetime is whole seconds since the epoch; a date is whole days. The two never mix.',
        'Pulse stores every instant in U T C. A datetime is whole seconds since the epoch; a date is whole days. The two never mix.'],
      [2.6, 'A zone changes only how an instant is read or exported. Half past midnight UTC is half past one in Berlin.',
        'A zone changes only how an instant is read or exported. Half past midnight U T C is half past one in Berlin.'],
      [5.0, 'Zones are UTC or IANA names, from Pulse\'s own tz database. EST is refused with PULSE_TIMEZONE_UNKNOWN.',
        'Zones are U T C or I A N A names, from Pulse\'s own time zone database. E S T is refused as an unknown time zone.']] },
    { name: 'Which zone applies', dur: 8.0, draw: sResolve, caps: [
      [0, 'A slot takes the first zone set: its own tz or tz_field, then the request\'s, then the instance default, then UTC.',
        'A slot takes the first zone set: its own T Z or T Z field, then the request\'s, then the instance default, then U T C.'],
      [3.0, 'Predict reports what each slot resolved, and where from. Here the request says New York, one slot reads a zone column, and the grouper names Tokyo.'],
      ] },
    { name: 'One zone, or each row\'s own', dur: 9.4, draw: sRowZones, caps: [
      [0, 'Our orders come from stores in New York, London and Tokyo, over one local week. By day with no zone, the days are UTC days.',
        'Our orders come from stores in New York, London and Tokyo, over one local week. By day with no zone, the days are U T C days.'],
      [2.8, 'Set time_zone to New York, and every row is read on a New York calendar. Tokyo\'s early-morning orders slide back a day.',
        'Set the time zone to New York, and every row is read on a New York calendar. Tokyo\'s early-morning orders slide back a day.'],
      [5.2, 'time_zone_field reads each row in its own store\'s zone: exactly Monday to Sunday, local everywhere.',
        'The time zone field reads each row in its own store\'s zone: exactly Monday to Sunday, local everywhere.'],
      [7.2, 'One order has no zone. It gets no local day at all, never a UTC fallback, and the grouper counts it as null.',
        'One order has no zone. It gets no local day at all, never a U T C fallback, and the grouper counts it as null.']] },
    { name: 'A DST day', dur: 8.0, draw: sDst, caps: [
      [0, 'A Berlin meter reports every half hour. In UTC, every day holds forty-eight readings.',
        'A Berlin meter reports every half hour. In U T C, every day holds forty-eight readings.'],
      [2.4, 'In Berlin, the 29th of March has twenty-three hours: forty-six readings. The 25th of October has twenty-five: fifty.',
        'In Berlin, the twenty-ninth of March has twenty-three hours: forty-six readings. The twenty-fifth of October has twenty-five: fifty.'],
      [5.0, 'By the hour, the skipped hour in March has no bucket. In October, the repeated hour is one bucket, with four readings.']] },
    { name: 'Ranges are local days', dur: 7.0, draw: sRange, caps: [
      [0, 'FILTER_DATE_RANGES matches the local calendar day too. One range: the 29th of March, as both start and end.',
        'A date ranges filter matches the local calendar day too. One range: the twenty-ninth of March, as both start and end.'],
      [2.4, 'With no zone it keeps the UTC day: forty-eight readings. With time_zone Berlin it keeps Berlin\'s twenty-three-hour day: forty-six.',
        'With no zone it keeps the U T C day: forty-eight readings. With the time zone set to Berlin, it keeps Berlin\'s twenty-three-hour day: forty-six.'],
      [4.8, 'Range literals are always local days in the slot\'s zone, and date-range groupers read them the same way.']] },
    { name: 'Import in a source zone', dur: 8.0, draw: sImport, caps: [
      [0, 'Zones matter on the way in, too. This logger wrote naive wall-clock times, with no offset. Imported as they are, each is read as UTC.',
        'Zones matter on the way in, too. This logger wrote naive wall-clock times, with no offset. Imported as they are, each is read as U T C.'],
      [2.8, 'Name their zone with --source-tz. Berlin skips half past two on the 29th of March, so the import is refused, and no file is written.',
        'Name their zone with the source T Z flag. Berlin skips half past two on the twenty-ninth of March, so the import is refused, and no file is written.']] },
    { name: 'Resolve, or read per row', dur: 9.0, draw: sResolveImport, caps: [
      [0, 'A DST policy resolves it: earlier takes the offset before the change, later the one after. A warning counts every value it resolved.',
        'A D S T policy resolves it: earlier takes the offset before the change, later the one after. A warning counts every value it resolved.'],
      [2.8, 'Under earlier, it counts three skipped times, not one: a single file zone reads the Tokyo and New York rows as Berlin too.'],
      [5.0, '--source-tz-field reads each row\'s own zone column. Tokyo and New York land on their true instants.',
        'The source T Z field flag reads each row\'s own zone column. Tokyo and New York land on their true instants.'],
      [7.2, 'Export with --tz renders the stored instants on a Berlin clock, offsets included. The stored values never change.',
        'Export with the T Z flag renders the stored instants on a Berlin clock, offsets included. The stored values never change.']] },
    { name: 'Calendar parts and formulas', dur: 8.4, draw: sCal, caps: [
      [0, 'Calendar parts follow the zone too. An ISO weekday with tz_field reads each order in its store\'s zone: all three were placed on a Monday.',
        'Calendar parts follow the zone too. An I S O weekday with a T Z field reads each order in its store\'s zone: all three were placed on a Monday.'],
      [3.0, 'A formula\'s to_day reads only the request zone, never a zone column. Under New York, the Tokyo order falls on Sunday.',
        'A formula\'s to day function reads only the request zone, never a zone column. Under New York, the Tokyo order falls on Sunday.'],
      [5.6, 'A bare datetime in weekday is refused at compile: wrap it in to_day. The expressions film covers the calendar helpers.',
        'A bare datetime in weekday is refused at compile: wrap it in to day. The expressions film covers the calendar helpers.']] },
    { name: 'A long panel', dur: 8.4, draw: sPanel, caps: [
      [0, 'Now, panels. Three hundred subscribers, one row per subject per month from January to June, on trial, basic, pro or churned.'],
      [2.8, 'ATTR_PREVIOUS_STATE gives each row the plan its subject held at the previous time point, typed as the plan, with the same dictionary.',
        'The previous state attribute gives each row the plan its subject held at the previous time point, typed as the plan, with the same dictionary.'],
      [5.6, 'A subject\'s first month has nothing before it, so it is null, never zero. Rows are ordered by instant, and this attribute takes no zone.']] },
    { name: 'Before the filters', dur: 7.0, draw: sBefore, caps: [
      [0, 'This attribute runs over the whole cohort before the filters. Keep only June, and every June row still knows its May plan.'],
      [2.6, 'Of the June rows, a hundred and fourteen were basic in May, sixty-one pro, and three still on trial. Its components count every record.']] },
    { name: 'From × to', dur: 6.0, draw: sTrans, caps: [
      [0, 'Crosstab the previous plan against the plan, and the long panel becomes a transition table, with no pivot.'],
      [2.6, 'First months reach no cell, so nine hundred and four transitions remain. Churned is only a column: nobody is observed after leaving.']] },
    { name: 'A Markov chain', dur: 9.0, draw: sMarkov, caps: [
      [0, 'OVERLAY_MARKOV turns the table into a transition matrix, each row summing to one. A trial moves to basic forty-six percent of the time.',
        'The Markov overlay turns the table into a transition matrix, each row summing to one. A trial moves to basic forty-six percent of the time.'],
      [3.0, 'Churned is listed as absorbing, so Pulse adds its unit row with a warning. The chain has no single long run, so the steady state is left out, with a warning too.'],
      [6.0, 'Three months after a trial, thirty-nine percent are basic and as many churned. Expected time to churn: about nine months from trial, eleven and a half from pro.']] },
    { name: 'Retention', dur: 7.0, draw: sRetention, caps: [
      [0, 'OVERLAY_RETENTION reads the same table per starting state: the share that stayed, switched, or churned.',
        'The retention overlay reads the same table per starting state: the share that stayed, switched, or churned.'],
      [2.6, 'Pro keeps eighty-two percent a month, basic seventy-nine. Trial keeps seventeen percent: sixty-one percent switch plan.'],
      [5.0, 'Each row adds to one. Across all nine hundred and four transitions, fifty-five percent stayed.']] },
    { name: 'Windows first', dur: 8.0, draw: sWinFirst, caps: [
      [0, 'Lags over a panel are windows. A delta of spend per subject, ordered by month, gives each row its change since last month.'],
      [2.8, 'A crosstab cell reads that window label, so the windows run first, over the records, before the cells. Predict reports the plan.'],
      [5.4, 'Trial to pro adds about fifty a month; pro to basic drops about twenty-nine. The windows film covers frames and partitions.']] },
    { name: 'The toolkit', dur: 10.0, draw: sRecap, caps: [
      [0, 'That\'s time in Pulse today: UTC instants, request and row zones, local days through DST, source zones on import, and panels.',
        'That\'s time in Pulse today: U T C instants, request and row zones, local days through D S T, source zones on import, and panels.'],
      [3.4, 'More are added over time, and the manifest lists what your instance offers. Embedders can register their own groupers, attributes and windows through Options.Extensions.',
        'More are added over time, and the manifest lists what your instance offers. Embedders can register their own groupers, attributes and windows through options dot extensions.'],
      [6.4, 'Next, synthetic data: cohorts like these, generated from a spec.'],
      [9.0, '', 'Pulse, in local time.', true]] },
  ],
});
})();
