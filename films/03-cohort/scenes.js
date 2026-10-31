/* Pulse: the cohort file. Film 3 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts (field types are listed as "today");
 * narration says more are added over time and the manifest is the authority. Every figure on screen is copied
 * from a recorded alpha.33 run in data/ (see data/README.md); each scene names the run it quotes. The one
 * exception is the pair of plain float sums in "Sums that reproduce", computed by data/generate.js (naive.json). */
(() => {
const { C } = PulseFilm;
const { seg, eo, eio, lerp, R, T, M, CAP, Ln, A, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke) => R(x, y, w, h, { fill: C.panel, stroke: stroke || C.rule });
const pill = (x, y, s, col, o = {}) => {
  const w = PulseFilm.h.measure(s, { font: '"IBM Plex Mono", monospace', size: o.size ?? 12.5 }) + 20;
  R(x, y, w, 26, { fill: o.fill || C.panel2, stroke: col, r: 13 }); M(s, x + 10, y + 17.5, { size: o.size ?? 12.5, color: col });
  return w;
};
/* lines: [text, color?]; each line fades in from `at`, `step` apart */
function code(t, x, y, w, lines, o = {}) {
  const at = o.at ?? 0, step = o.step ?? 0.1, lh = o.lh ?? 24, size = o.size ?? 13;
  A(seg(t, at, at + 0.3), () => card(x, y, w, (o.pad ?? 18) * 2 + lines.length * lh - (lh - size) , o.stroke));
  lines.forEach(([s, col], i) => A(seg(t, at + 0.1 + i * step, at + 0.4 + i * step), () => M(s, x + 18, y + (o.pad ?? 18) + size + i * lh - 2, { size, color: col || C.ink })));
}
const big = (s, x, y, col, o = {}) => T(s, x, y, { size: o.size ?? 30, weight: 700, color: col, stretch: 'expanded', align: o.align });

/* ---------- 0. title ---------- */
function sTitle(t) {
  const cells = 27;
  for (let i = 0; i < cells; i++) {
    const u = eo(seg(t, 0.1 + i * 0.03, 0.6 + i * 0.03));
    const col = i < 2 ? C.amber : i >= 25 ? C.coral : C.teal;
    A(u, () => R(350 + i * 22, 372, 18, 26, { fill: i < 2 ? C.amberS : i >= 25 ? C.coralS : C.tealS, stroke: col, r: 2 }));
  }
  A(seg(t, 1.0, 1.8), () => {
    T('PULSE', 640, 300, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('THE COHORT FILE', 640, 470, { size: 46, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
  });
  A(seg(t, 1.8, 2.6), () => T('What every request reads, how it stores absence, and how it grows', 640, 516, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. two shapes (data/m.head.txt, data/mg.head.txt) ---------- */
function sShapes(t) {
  A(seg(t, 0.2, 0.6), () => {
    CAP('SINGLE FILE · cohort.pulse', 64, 112, { color: C.teal });
    const parts = [['header', 70, C.amber], ['schema', 110, C.amber], ['dictionaries', 140, C.amber], ['records', 236, C.teal]];
    let x = 64; parts.forEach(([n, w, col]) => { R(x, 126, w - 4, 52, { fill: col === C.teal ? C.tealS : C.amberS, stroke: col }); M(n, x + 10, 157, { size: 12.5, color: col }); x += w; });
    M('one schema, then fixed-stride records', 64, 204, { size: 12.5 });
  });
  A(seg(t, 1.2, 1.6), () => {
    CAP('SHARD ARCHIVE · an uncompressed zip', 700, 112, { color: C.teal });
    R(700, 126, 516, 120, { fill: C.panel, stroke: C.teal, dash: [6, 4] });
    R(716, 140, 150, 40, { fill: C.amberS, stroke: C.amber }); M('_schema.pulse', 728, 165, { size: 12.5, color: C.amber });
    ['q1.pulse', 'q2.pulse', 'q3.pulse', 'q4.pulse'].forEach((n, i) => { R(880 + (i % 2) * 164, 140 + Math.floor(i / 2) * 50, 152, 40, { fill: C.tealS, stroke: C.teal }); M(n, 894 + (i % 2) * 164, 165 + Math.floor(i / 2) * 50, { size: 12.5, color: C.teal }); });
    M('a header-only canonical schema + standalone single-file shards', 700, 268, { size: 12 });
  });
  // the nine-byte header, as xxd prints it for data/m.pulse
  A(seg(t, 3.4, 3.8), () => CAP('THE 9-BYTE HEADER · xxd -l 9 m.pulse', 64, 290, { color: C.amber }));
  const HEX = ['50', '55', '4C', '53', '45', '00', '00', '00', '01'], ASC = ['P', 'U', 'L', 'S', 'E', '·', '·', '·', ''];
  HEX.forEach((h, i) => A(seg(t, 3.6 + i * 0.08, 3.9 + i * 0.08), () => {
    const x = 64 + i * 74, last = i === 8;
    R(x, 306, 66, 54, { fill: last ? C.violetS : C.panel2, stroke: last ? C.violet : C.amber });
    T(h, x + 33, 340, { size: 20, weight: 700, align: 'center', font: '"IBM Plex Mono", monospace', color: last ? C.violet : C.ink });
    M(ASC[i], x + 33, 382, { size: 12, align: 'center' });
  }));
  A(seg(t, 4.6, 5.0), () => {
    M('magic: PULSE + three zero bytes', 64, 410, { size: 12.5, color: C.amber });
    M('format byte', 64 + 8 * 74 + 33, 410, { size: 12.5, color: C.violet, align: 'center' });
    card(740, 290, 476, 120);
    M('the first 4 bytes pick the shape:', 760, 320, { size: 12.5 });
    M('PULSE…  → a single file', 760, 350, { size: 13.5, color: C.ink });
    M('PK\\x03\\x04 → a shard archive (zip)', 760, 378, { size: 13.5, color: C.ink });
  });
  A(seg(t, 6.6, 7.0), () => {
    R(64, 440, 560, 150, { fill: C.panel, stroke: C.teal });
    M('format 0x01', 84, 472, { size: 15, color: C.teal, weight: 600 });
    M('header · schema · dictionaries · records', 84, 502, { size: 13, color: C.ink });
    M('what Pulse writes unless the schema needs more', 84, 530, { size: 12.5 });
    M('stays readable forever', 84, 556, { size: 12.5 });
  });
  A(seg(t, 7.6, 8.0), () => {
    R(656, 440, 560, 150, { fill: C.panel, stroke: C.violet });
    M('format 0x02', 676, 472, { size: 15, color: C.violet, weight: 600 });
    M('+ a schema extension block before the records', 676, 502, { size: 13, color: C.ink });
    M('parent groups · vector dimensions', 676, 530, { size: 12.5 });
    M('an older binary refuses it, loudly', 676, 556, { size: 12.5, color: C.coral });   // data/mg.head.txt ends 02
  });
}

/* ---------- 2. field types (data/m.inspect.json) ---------- */
const TYPES = [['u4'], ['u8'], ['u16'], ['u32'], ['u64'], ['f32'], ['f64'], ['decimal128'], ['date'], ['datetime'], ['packed_bool'],
  ['categorical_u8'], ['categorical_u16'], ['categorical_u32'], ['set_u8'], ['set_u16'], ['set_u32'], ['set_u64'], ['set_u128'], ['set_u256'], ['vec_f32'], ['vec_f64']];
const MFIELDS = [['id', 'u16', 0], ['store', 'categorical_u8', 0, '12 entries'], ['region', 'categorical_u8', 0, '4 entries'], ['format', 'categorical_u8', 0, '3 entries'],
  ['sqft', 'u16', 0], ['opened', 'date', 0], ['age', 'u8', 1], ['spend', 'f64', 0], ['interests', 'set_u8', 1, '4 labels'], ['q1', 'u4', 0], ['q2', 'u4', 0], ['q3', 'u4', 1], ['q4', 'u4', 0]];
function sTypes(t) {
  A(seg(t, 0.1, 0.4), () => CAP('FIELD TYPES TODAY · MORE ADDED OVER TIME', 64, 112, { color: C.amber }));
  const fam = s => s.startsWith('vec') ? C.violet : s.startsWith('set') ? C.coral : s.startsWith('cat') ? C.amber : C.teal;
  chips(TYPES.map(([s]) => [s, fam(s)]), 64, 126, 1152, { t, at: 0.3, step: 0.05 });
  A(seg(t, 3.6, 4.0), () => {
    CAP('INFERRED FROM m.csv · cohort inspect', 64, 238, { color: C.teal });
    MFIELDS.forEach(([n, ty, nu, d], i) => A(seg(t, 3.8 + i * 0.07, 4.1 + i * 0.07), () => {
      const y = 266 + i * 25.5;
      M(n, 64, y, { size: 13, color: C.ink }); M(ty, 190, y, { size: 13, color: fam(ty) });
      if (nu) M('nullable', 360, y, { size: 12, color: C.coral });
      if (d) M(d, 450, y, { size: 12 });
    }));
  });
  A(seg(t, 7.0, 7.4), () => {
    card(620, 238, 596, 104, C.amber);
    M('text is always categorical', 640, 268, { size: 14, color: C.amber, weight: 600 });
    M('each record stores a dictionary code; the', 640, 296, { size: 13, color: C.ink });
    M('dictionary is stored once, before the records', 640, 320, { size: 13, color: C.ink });
  });
  A(seg(t, 8.0, 8.4), () => {
    card(620, 358, 596, 128);
    M('date      signed epoch days', 640, 390, { size: 13.5, color: C.ink });
    M('datetime  epoch seconds, UTC', 640, 418, { size: 13.5, color: C.ink });
    M('not interchangeable: a factor of 86,400', 640, 456, { size: 13, color: C.coral });
  });
  A(seg(t, 8.8, 9.2), () => {
    card(620, 502, 596, 84);
    M('your instance\'s list: the manifest\'s cohort_types', 640, 534, { size: 13, color: C.ink });
    M('any one cohort\'s schema: pulse cohort inspect', 640, 562, { size: 13, color: C.ink });
  });
}

/* ---------- 3. null is a bit (data/nul.out.json, emp.out.json, sel.out.json) ---------- */
function sNulls(t) {
  A(seg(t, 0.2, 0.6), () => CAP('ONE m.pulse RECORD · 13 FIELDS, THEN THE NULL BITMAP', 64, 112, { color: C.teal }));
  for (let i = 0; i < 27; i++) A(seg(t, 0.3 + i * 0.03, 0.6 + i * 0.03), () => {
    const bm = i >= 25;
    R(64 + i * 42, 126, 38, 40, { fill: bm ? C.coralS : C.tealS, stroke: bm ? C.coral : C.teal, r: 2 });
  });
  A(seg(t, 1.2, 1.6), () => {
    M('field bytes', 64, 190, { size: 12.5, color: C.teal });
    M('bitmap: ceil(13 / 8) = 2 bytes', 1216, 190, { size: 12.5, color: C.coral, align: 'right' });
    const bits = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];   // field 7 (age) null on this record
    bits.forEach((b, i) => { R(744 + i * 36, 206, 30, 30, { fill: b ? C.coralS : C.panel2, stroke: b ? C.coral : C.rule, r: 2 }); M(String(b), 759 + i * 36, 226, { size: 12.5, align: 'center', color: b ? C.coral : C.muted }); });
    M('bit i = field i · 1 = null', 744, 258, { size: 12 }); M('here: age (field index 6) is null', 744, 278, { size: 12, color: C.coral });
    card(64, 210, 620, 78);
    M('no sentinel values: a zero is a zero, never "missing"', 84, 242, { size: 13.5, color: C.ink });
    M('no nullable field → no bitmap at all', 84, 268, { size: 12.5 });
  });
  A(seg(t, 3.4, 3.8), () => CAP('A MULTI-SELECT CELL HAS THREE STATES · interests on 1,200 members', 64, 330, { color: C.coral }));
  const ST = [['null', '""', 'no answer', 74, C.coral], ['empty', '|', 'answered, chose nothing', 77, C.amber], ['selection', 'travel|tech', 'chose these', 1049, C.teal]];
  ST.forEach(([n, csv, mean, v, col], i) => A(seg(t, 3.7 + i * 0.5, 4.1 + i * 0.5), () => {
    const x = 64 + i * 390;
    R(x, 346, 370, 138, { fill: C.panel, stroke: col });
    M(n, x + 18, 376, { size: 15, color: col, weight: 600 }); M('csv cell: ' + csv, x + 18, 404, { size: 13, color: C.ink }); M(mean, x + 18, 428, { size: 12.5 });
    if (t >= 6.8) A(seg(t, 6.8 + i * 0.2, 7.2 + i * 0.2), () => big(v.toLocaleString('en-US'), x + 350, 470, col, { size: 28, align: 'right' }));
  }));
  A(seg(t, 8.0, 8.4), () => {
    M('74 + 77 + 1,049 = 1,200 · counted by AGG_NULL_COUNT and two expression filters', 64, 520, { size: 12.5 });
    M('json writes the empty set as "|" and also reads [] · arrow and parquet use a zero-length list', 64, 546, { size: 12.5 });
  });
}

/* ---------- 4. inference adapts (data/w.import.json, w.import.txt) ---------- */
const WROWS = [['1', '10', '32'], ['2', '10', '59'], ['3', '4', '20'], ['⋮', '⋮', '⋮'], ['50', '11', '78'], ['⋮', '⋮', '⋮'], ['64', '300', '70'], ['⋮', '⋮', '⋮'], ['71', '8', '']];
function sInfer(t) {
  A(seg(t, 0.2, 0.6), () => {
    CAP('w.csv · 80 ROWS · --sample-rows 50', 64, 112, { color: C.amber });
    ['id', 'visits', 'age'].forEach((h, j) => T(h, 84 + j * 120, 146, { size: 14, weight: 600 }));
    Ln([[64, 158], [460, 158]]);
  });
  WROWS.forEach((r, i) => A(seg(t, 0.4 + i * 0.12, 0.7 + i * 0.12), () => {
    const y = 186 + i * 30, late = i >= 6;
    if (i === 4) { Ln([[64, y + 10], [460, y + 10]], { stroke: C.amber, dash: [5, 4] }); M('end of the inference sample', 470, y + 14, { size: 12, color: C.amber }); }
    r.forEach((v, j) => {
      const hot = (i === 6 && j === 1 && t >= 3.0) || (i === 8 && j === 2 && t >= 6.0);
      if (hot) R(72 + j * 120, y - 19, 92, 28, { fill: C.coralS, stroke: C.coral, r: 3 });
      M(v === '' ? '(blank)' : v, 84 + j * 120, y, { size: 13.5, color: hot ? C.coral : late ? C.ink : C.muted });
    });
  }));
  A(seg(t, 1.6, 2.0), () => {
    card(700, 120, 516, 96);
    M('sample says: visits u4 (0..15) · age never null', 720, 152, { size: 13, color: C.ink });
    M('the default sample is the first 500 rows', 720, 180, { size: 12.5 });
  });
  A(seg(t, 3.0, 3.4), () => {
    R(700, 236, 516, 132, { fill: C.panel, stroke: C.amber });
    M('PULSE_IMPORT_WIDTH_PROMOTED', 720, 266, { size: 13.5, color: C.amber, weight: 600 });
    M('visits: u4 → u16, source row 64', 720, 294, { size: 13.5, color: C.ink });
    M('the narrowest type that holds 300', 720, 320, { size: 12.5 });
    M('rows already read are re-strided · none dropped', 720, 346, { size: 12.5 });
  });
  A(seg(t, 6.0, 6.4), () => {
    R(700, 388, 516, 106, { fill: C.panel, stroke: C.amber });
    M('PULSE_IMPORT_NULL_PROMOTED', 720, 418, { size: 13.5, color: C.amber, weight: 600 });
    M('promoted_fields: ["age"]', 720, 446, { size: 13.5, color: C.ink });
    M('age becomes nullable and the import goes on', 720, 472, { size: 12.5 });
  });
  A(seg(t, 7.4, 7.8), () => { M('Imported 80 rows to w.pulse', 700, 528, { size: 13.5, color: C.teal }); M('final schema: id u8 · visits u16 · age u8 nullable', 700, 554, { size: 12.5 }); });
}

/* ---------- 5. declared schemas are contracts (data/wx, ws, wst .import.json; w.written.txt) ---------- */
function sSchema(t) {
  code(t, 64, 112, 560, [['[', C.muted], ['  {"name": "id",     "type": "u16"},', C.ink], ['  {"name": "visits", "type": "u8"},', C.ink], ['  {"name": "age",    "type": "u8",', C.ink], ['   "nullable": false}', C.amber], [']', C.muted]], { at: 0.2, step: 0.1, size: 13.5, lh: 26 });
  A(seg(t, 0.8, 1.2), () => { M('--schema w.schema.json · fields match columns BY NAME', 64, 330, { size: 12.5, color: C.amber }); M('(descriptions omitted here)', 64, 352, { size: 11.5, color: C.faint }); });
  A(seg(t, 1.6, 2.0), () => {
    R(656, 112, 560, 118, { fill: C.panel, stroke: C.coral });
    M('drop "age" from the schema:', 676, 142, { size: 12.5 });
    M('PULSE_IMPORT_SCHEMA_COLUMN_UNMAPPED', 676, 170, { size: 13.5, color: C.coral, weight: 600 });
    M('refused before a row is read · no file', 676, 198, { size: 12.5 });   // data/wx.import.json, w.written.txt
  });
  A(seg(t, 3.0, 3.4), () => {
    R(656, 246, 560, 170, { fill: C.panel, stroke: C.amber });
    M('declared widths never promote', 676, 276, { size: 12.5 });
    M('row 64 · visits 300 does not fit u8', 676, 304, { size: 13.5, color: C.ink });
    M('row 71 · null age, declared non-nullable', 676, 330, { size: 13.5, color: C.ink });
    M('PULSE_IMPORT_ROWS_DROPPED · 78 imported, 2 dropped', 676, 364, { size: 13.5, color: C.amber, weight: 600 });   // data/ws.import.json
    M('each failed row is listed in row_errors', 676, 392, { size: 12.5 });
  });
  A(seg(t, 6.0, 6.4), () => {
    R(656, 432, 560, 118, { fill: C.coralS, stroke: C.coral });
    M('--strict', 676, 462, { size: 13.5, color: C.coral, weight: 600 });
    M('the partial import is refused · nothing is written', 676, 490, { size: 13.5, color: C.ink });   // data/wst.import.json
    M('exit 1 · no wst.pulse on disk', 676, 518, { size: 12.5 });
  });
  A(seg(t, 7.0, 7.4), () => { card(64, 400, 560, 150); M('inferred', 84, 432, { size: 14, color: C.teal, weight: 600 }); M('adapts: promote width, promote nullability', 84, 458, { size: 13, color: C.ink });
    M('declared', 84, 496, { size: 14, color: C.amber, weight: 600 }); M('a contract: a breach is a row error', 84, 522, { size: 13, color: C.ink }); });
}

/* ---------- 6. parent groups (data/mg.import.json, mg.inspect.json, mg.sizes.txt, rs/rsg.out.json, mb, mn) ---------- */
const MROWS = [['1', 'S10', 'South', 'mall', '9000', '2012-08-13', '32'], ['2', 'S04', 'West', 'mall', '23000', '2018-09-17', '54'], ['3', 'S10', 'South', 'mall', '9000', '2012-08-13', '20'],
  ['4', 'S05', 'North', 'street', '28000', '2012-04-12', '27'], ['5', 'S09', 'North', 'street', '26000', '2017-03-15', '58']];
function sGroups(t) {
  const collapse = eio(seg(t, 3.2, 4.4));
  const cols = [['id', 40], ['store', 62], ['region', 70], ['format', 72], ['sqft', 64], ['opened', 112], ['age', 40]];
  A(seg(t, 0.2, 0.6), () => {
    CAP('m.csv · EVERY ROW REPEATS ITS STORE', 64, 112, { color: C.amber });
    let x = 64; cols.forEach(([h, w], j) => { M(h, x, 140, { size: 12.5, color: j >= 1 && j <= 5 ? C.amber : C.muted }); x += w; });
  });
  MROWS.forEach((r, i) => A(seg(t, 0.4 + i * 0.15, 0.7 + i * 0.15), () => {
    const y = 168 + i * 28; let x = 64;
    if (collapse < 0.5) R(64 + 40 - 6, y - 18, 380 - collapse * 300, 26, { fill: C.amberS, r: 3 });
    r.forEach((v, j) => {
      const member = j >= 2 && j <= 5;
      A(member ? 1 - collapse : 1, () => M(v, x, y, { size: 12.5, color: member ? C.amber : C.ink }));
      if (j === 1 && collapse > 0) A(collapse, () => M('→ index', x + 30, y, { size: 12, color: C.violet }));
      x += cols[j][1];
    });
  }));
  A(seg(t, 3.6, 4.2), () => {
    R(64, 318, 520, 128, { fill: C.panel, stroke: C.violet });
    M('--group store:region,format,sqft,opened', 82, 346, { size: 13, color: C.violet });
    M('dictionary in the schema block · each block once', 82, 374, { size: 12.5, color: C.ink });
    M('S10 · South · mall · 9000 · 2012-08-13', 82, 400, { size: 12, color: C.amber });
    M('S04 · West · mall · 23000 · 2018-09-17 · … 12 entries', 82, 424, { size: 12, color: C.amber });
  });
  A(seg(t, 6.0, 6.4), () => {
    card(620, 112, 596, 214);
    CAP('cohort inspect mg.pulse', 640, 140, { color: C.violet });
    [['format byte', '0x01 → 0x02'], ['entries', '12 stores'], ['ratio', '100 rows per entry'], ['record stride', '27 → 21 bytes'], ['file size', '32,785 → 25,744 bytes']].forEach(([k, v], i) => {
      M(k, 640, 172 + i * 30, { size: 13 }); M(v, 820, 172 + i * 30, { size: 13.5, color: i === 0 ? C.violet : C.ink, weight: 600 });
    });
  });
  A(seg(t, 9.0, 9.4), () => {
    card(620, 342, 596, 104, C.teal);
    M('same request on m.pulse and mg.pulse:', 640, 370, { size: 12.5 });
    M('mall stores → East 197 · North 86 · South 102 · West 95', 640, 396, { size: 13, color: C.ink });   // rs.out.json = rsg.out.json
    M('a filter on group fields runs once per entry, not per row', 640, 424, { size: 12.5, color: C.teal });
  });
  A(seg(t, 11.6, 12.0), () => {
    R(64, 466, 560, 104, { fill: C.coralS, stroke: C.coral });
    M('add age, which varies within a store:', 82, 494, { size: 12.5 });
    M('PULSE_GROUP_MEMBER_NOT_CONSTANT · nothing written', 82, 522, { size: 13, color: C.coral, weight: 600 });   // mb.import.json
    M('field "age" at record 2', 82, 548, { size: 12.5 });
  });
  A(seg(t, 12.6, 13.0), () => {
    R(656, 466, 560, 104, { fill: C.panel, stroke: C.amber });
    M('store:format alone is 2 bytes a row:', 676, 494, { size: 12.5 });
    M('PULSE_GROUP_TOO_NARROW · group dropped', 676, 522, { size: 13, color: C.amber, weight: 600 });   // mn.import.json
    M('no wider than the 4-byte index that would replace it', 676, 548, { size: 12.5 });
  });
}

/* ---------- 7. vector fields (data/mv.import.json, mv.inspect.json, vcor.out.json, vrej.out.json) ---------- */
function sVectors(t) {
  const fold = eio(seg(t, 1.0, 2.2));
  A(seg(t, 0.2, 0.6), () => CAP('--vector sat:q1,q2,q3,q4 --vector-kind sat:scale:1:5', 64, 112, { color: C.violet }));
  ['q1', 'q2', 'q3', 'q4'].forEach((q, i) => {
    const x = lerp(64 + i * 120, 64 + i * 56, fold);
    A(seg(t, 0.3 + i * 0.1, 0.6 + i * 0.1), () => { R(x, 130, lerp(108, 50, fold), 44, { fill: fold > 0.5 ? C.violetS : C.tealS, stroke: fold > 0.5 ? C.violet : C.teal }); M(['3', '1', '3', '2'][i], x + lerp(54, 25, fold), 158, { size: 15, align: 'center', color: C.ink }); if (fold < 0.5) A(1 - fold * 2, () => M(q + ' u4', x + 8, 196, { size: 12 })); });
  });
  A(seg(t, 2.0, 2.4), () => { M('sat · vec_f64 · dim 4 · one field, one row', 64, 200, { size: 13, color: C.violet }); });
  A(seg(t, 2.2, 2.6), () => {
    code(t, 620, 112, 596, [['"vector": {', C.muted], ['  "dim": 4, "kind": "scale",', C.ink], ['  "scale_min": 1, "scale_max": 5,', C.ink], ['  "labels": ["q1", "q2", "q3", "q4"] }', C.ink]], { at: 2.2, step: 0.1, size: 13 });
    M('format 0x02 · stride 55 bytes', 620, 262, { size: 12.5 });
  });
  A(seg(t, 3.6, 4.0), () => {
    R(64, 300, 560, 140, { fill: C.panel, stroke: C.violet });
    M('MAT_CORRELATION { "vector": "sat" }', 82, 330, { size: 13, color: C.violet });
    M('an empty q3 becomes a NaN element: a null member', 82, 360, { size: 12.5, color: C.ink });
    M('n 1,152 · listwise dropped 48', 82, 392, { size: 14, color: C.ink, weight: 600 });   // vcor.out.json components
    M('row keys read sat[1] … sat[4], labelled q1 … q4', 82, 420, { size: 12.5 });
  });
  A(seg(t, 5.0, 5.4), () => {
    R(656, 300, 560, 140, { fill: C.coralS, stroke: C.coral });
    M('AGG_AVERAGE { "field": "sat" }', 676, 330, { size: 13, color: C.ink });
    M('PULSE_VECTOR_FIELD_NOT_SCALAR', 676, 362, { size: 13.5, color: C.coral, weight: 600 });   // vrej.out.json
    M('suggest: AGG_VEC_MEAN', 676, 392, { size: 13, color: C.ink });
    M('no single value to read · the request fails', 676, 420, { size: 12.5 });
  });
}

/* ---------- 8. SPSS in (data/svi.import.json, svi.inspect.json, svm/svn/sve.out.json) ---------- */
function sSpssIn(t) {
  code(t, 64, 112, 420, [['sv.sav', C.amber], ['ID        numeric', C.ink], ['REGION    numeric, labels 1..4', C.ink], ['INCOME    missing: 998, 999', C.coral], ['WEB RADIO TV  0 or 1', C.ink], ['$media = dichotomy set', C.ink], ['  counts WEB RADIO TV = 1', C.ink]], { at: 0.2, step: 0.12, size: 13 });
  A(seg(t, 1.2, 1.6), () => { M('998 = Don\'t know · 999 = Refused', 64, 330, { size: 12.5 }); M('the dictionary is declared, so nothing is inferred', 64, 354, { size: 12.5, color: C.amber }); arrow(492, 220, 548, 220, { stroke: C.teal, head: 8, lw: 2 }); });
  const F = [['id', 'u8', C.teal], ['region', 'categorical_u8  "1" "2" "3" "4"', C.amber], ['income', 'f64 · nullable', C.teal], ['income_missing', 'sysmis · Don\'t know · Refused', C.violet],
    ['web radio tv', 'f64 · constituents kept', C.teal], ['media', 'set_u8 · derived, beside them', C.violet]];
  F.forEach(([n, d, col], i) => A(seg(t, (i === 3 ? 3.0 : i >= 4 ? 6.4 : 1.8) + (i % 3) * 0.12, (i === 3 ? 3.4 : i >= 4 ? 6.8 : 2.2) + (i % 3) * 0.12), () => {
    const y = 136 + i * 34;
    M(n, 564, y, { size: 13.5, color: col, weight: 600 }); M(d, 724, y, { size: 13, color: col === C.violet ? C.violet : C.ink });
  }));
  A(seg(t, 3.6, 4.0), () => {
    R(564, 350, 310, 92, { fill: C.panel, stroke: C.violet });
    M('nulls in income, by reason', 582, 376, { size: 12.5 });
    M('Don\'t know 4 · Refused 4', 582, 410, { size: 14.5, color: C.ink, weight: 600 });   // svm.out.json
  });
  A(seg(t, 7.2, 7.6), () => {
    R(890, 350, 326, 92, { fill: C.panel, stroke: C.coral });
    M('media after the .sav', 908, 376, { size: 12.5 });
    M('null 5 · empty 3', 908, 410, { size: 14.5, color: C.ink, weight: 600 });   // svn.out.json, sve.out.json
  });
  A(seg(t, 9.4, 9.8), () => {
    R(64, 462, 1152, 110, { fill: C.panel, stroke: C.amber, dash: [6, 4] });
    M('svi.pulse.spss.json · the metadata sidecar', 84, 492, { size: 14, color: C.amber, weight: 600 });
    M('value labels · measure levels · missing-value specs · response-set definitions · which columns were derived', 84, 522, { size: 13, color: C.ink });
    M('what the .pulse header cannot hold', 84, 550, { size: 12.5 });
  });
}

/* ---------- 9. SPSS out (data/sv2.export.json, svi.roundtrip.txt) ---------- */
function sSpssOut(t) {
  code(t, 64, 112, 520, [['pulse export spss -i svi.pulse -o sv2.sav', C.teal], ['', C.ink], ['ID REGION INCOME WEB RADIO TV', C.ink], ['INCOME   missing: 998, 999   (restated)', C.amber], ['labels   1=North … · 998=Don\'t know …', C.ink], ['$media=D1 1 5 media WEB RADIO TV', C.ink], ['income_missing, media  → folded away', C.violet]], { at: 0.2, step: 0.12, size: 13 });
  A(seg(t, 3.0, 3.4), () => {
    R(620, 112, 596, 220, { fill: C.panel, stroke: C.teal });
    CAP('IMPORT sv2.sav AGAIN · shasum -a 256', 640, 142, { color: C.teal });
    M('svi.pulse', 640, 180, { size: 13 }); M('c7fb053e…cfac5463', 780, 180, { size: 14, color: C.ink, weight: 600 });
    M('svi2.pulse', 640, 212, { size: 13 }); M('c7fb053e…cfac5463', 780, 212, { size: 14, color: C.ink, weight: 600 });
    big('byte-identical', 640, 280, C.teal, { size: 26 });
    M('the round trip keeps the cohort, not the .sav bytes', 640, 310, { size: 12 });
  });
}

/* ---------- 10. shard archives (data/sales.mismatch.json, sales.create.json, sales.add.json, anc.out.json, rm.json) ---------- */
function sShards(t) {
  A(seg(t, 0.2, 0.6), () => {
    CAP('sales.pulse · 4 QUARTERS × 30,000 PURCHASES = 120,000', 64, 112, { color: C.teal });
    R(64, 126, 560, 132, { fill: C.panel, stroke: C.teal, dash: [6, 4] });
    R(80, 142, 150, 40, { fill: C.amberS, stroke: C.amber }); M('_schema.pulse', 92, 167, { size: 12.5, color: C.amber });
    ['q1', 'q2', 'q3', 'q4'].forEach((q, i) => { const on = !(i === 3 && t >= 6.4 && t < 7.6); A(on ? 1 : 0.25, () => { R(246 + i * 92, 142, 84, 40, { fill: C.tealS, stroke: C.teal }); M(q + '.pulse', 254 + i * 92, 167, { size: 11.5, color: C.teal }); }); M('30,000', 256 + i * 92, 204, { size: 11.5 }); });
    M('id u32 · region categorical_u8 · spend f64', 80, 238, { size: 12.5, color: C.ink });
  });
  A(seg(t, 3.0, 3.4), () => {
    R(656, 112, 560, 146, { fill: C.coralS, stroke: C.coral });
    M('quarters imported on their own:', 676, 140, { size: 12.5 });
    M('q1 id inferred u16 · q3 id inferred u32', 676, 166, { size: 13.5, color: C.ink });
    M('PULSE_SHARD_SCHEMA_MISMATCH · nothing written', 676, 196, { size: 13.5, color: C.coral, weight: 600 });   // sales.mismatch.json
    M('fix: import every quarter with one --schema', 676, 230, { size: 13, color: C.teal });
  });
  A(seg(t, 4.6, 5.0), () => { M('names, types, widths and nullability must match · dictionaries union-merge · set fields may widen', 64, 290, { size: 12.5 }); });
  A(seg(t, 6.4, 6.8), () => {
    code(t, 64, 316, 560, [['pulse shard create sales.pulse -i q1.pulse -i q2.pulse -i q3.pulse', C.ink], ['pulse shard add    sales.pulse q4.pulse', C.teal], ['pulse shard remove sales.pulse q4.pulse', C.coral]], { at: 6.4, step: 0.15, size: 13 });
    code(t, 656, 316, 560, [['"cohort": {"filename": "sales.pulse#q4.pulse"}', C.ink], ['→ one shard as a cohort · n 30,000', C.teal]], { at: 7.0, step: 0.15, size: 13 });   // anc.out.json
  });
  A(seg(t, 9.4, 9.8), () => {
    card(64, 470, 1152, 100, C.amber);
    M('random access, never the whole archive', 84, 500, { size: 14, color: C.amber, weight: 600 });
    M('open, inspect and count read the zip directory and the shard headers · a scan reads one window per shard', 84, 528, { size: 13, color: C.ink });
    M('inspect sales.pulse → 4 shards, 120,000 records', 84, 552, { size: 12.5 });   // sales.inspect.json
  });
}

/* ---------- 11. sums that reproduce (data/naive.json; sum.serial, sum, sumf.serial, sumf .out.json) ---------- */
const SUMS = [['East', '164,821,758.061789'], ['North', '167,353,720.86934'], ['South', '164,164,533.371649'], ['West', '159,978,653.461376']];
function sSums(t) {
  A(seg(t, 0.2, 0.6), () => {
    R(64, 112, 1152, 146, { fill: C.panel, stroke: C.coral });
    CAP('A PLAIN FLOAT SUM · North spend, 29,960 values · computed outside Pulse', 84, 140, { color: C.coral });
    M('front to back', 84, 180, { size: 13 }); M('167,353,720.86933964', 280, 180, { size: 16, color: C.ink, weight: 600 });
    M('back to front', 84, 214, { size: 13 }); M('167,353,720.86934018', 280, 214, { size: 16, color: C.ink, weight: 600 });
    A(seg(t, 1.6, 2.0), () => M('same numbers, different order → different last digits', 700, 198, { size: 13.5, color: C.coral }));
  });
  A(seg(t, 3.6, 4.0), () => CAP('PULSE AGG_SUM spend BY region · binned reproducible sums', 64, 296, { color: C.teal }));
  const RUNS = ['archive · 1 shard worker', 'archive · 4 shard workers', 'flat file · 1 decode worker', 'flat file · 4 decode workers'];
  RUNS.forEach((r, i) => A(seg(t, 3.8 + i * 0.2, 4.1 + i * 0.2), () => {
    const x = 64 + i * 290;
    R(x, 312, 276, 222, { fill: C.panel, stroke: C.teal });
    M(r, x + 14, 338, { size: 12, color: C.teal });
    SUMS.forEach(([g, v], k) => { M(g, x + 14, 374 + k * 38, { size: 12.5 }); M(v, x + 262, 374 + k * 38, { size: 13.5, color: C.ink, align: 'right', weight: k === 1 ? 600 : 400 }); });
  }));
  A(seg(t, 5.4, 5.8), () => M('all four runs: the same bits · bit-identical across workers and shards [alpha.22]', 64, 566, { size: 13.5, color: C.teal }));
}

/* ---------- 12. sidecar indexes (data/idx.build.json, look.out.json, rm.json, look.rm.out.json, readd.json, look.readd.out.json) ---------- */
function sIndex(t) {
  code(t, 64, 112, 620, [['pulse index build -i sales.pulse --key id', C.teal], ['sales.pulse.indexes.json            the manifest', C.amber], ['sales.pulse#q1.pulse.08b72e07b55c3ac0.idx', C.ink], ['sales.pulse#q2.pulse.08b72e07b55c3ac0.idx', C.ink],
    ['sales.pulse#q3.pulse.08b72e07b55c3ac0.idx', C.ink], ['sales.pulse#q4.pulse.08b72e07b55c3ac0.idx', C.ink]], { at: 0.2, step: 0.12, size: 12.5, lh: 24 });
  A(seg(t, 1.2, 1.6), () => { card(720, 112, 496, 100); M('a separate file per shard', 740, 142, { size: 13.5, color: C.ink }); M('the cohort bytes never change', 740, 168, { size: 13.5, color: C.ink }); M('120,000 keys indexed · not on set_* fields', 740, 194, { size: 12 }); });
  A(seg(t, 3.0, 3.4), () => {
    R(720, 228, 496, 106, { fill: C.panel, stroke: C.teal });
    M('pulse api lookup --key id=90001', 740, 256, { size: 13, color: C.teal });
    M('{ id 90001 · region East · spend 11.842206 }', 740, 286, { size: 13.5, color: C.ink, weight: 600 });
    M('hash the key, probe each shard\'s bucket · no scan', 740, 314, { size: 12 });
  });
  A(seg(t, 6.0, 6.4), () => {
    R(64, 350, 560, 120, { fill: C.panel, stroke: C.coral });
    M('shard remove sales.pulse q4.pulse', 84, 378, { size: 13, color: C.coral });
    M('q4\'s sidecar deleted · manifest updated', 84, 406, { size: 12.5, color: C.ink });
    M('lookup id=90001 → PULSE_LOOKUP_NOT_FOUND', 84, 436, { size: 13, color: C.coral, weight: 600 });
  });
  A(seg(t, 7.0, 7.4), () => {
    R(656, 350, 560, 120, { fill: C.panel, stroke: C.teal });
    M('shard add sales.pulse q4.pulse', 676, 378, { size: 13, color: C.teal });
    M('q4\'s sidecar built before the archive changes', 676, 406, { size: 12.5, color: C.ink });
    M('lookup id=90001 → found again', 676, 436, { size: 13, color: C.teal, weight: 600 });
  });
  A(seg(t, 8.0, 8.4), () => M('both warn PULSE_SHARD_INDEXES_UPDATED', 64, 498, { size: 13, color: C.amber }));
  A(seg(t, 9.4, 9.8), () => {
    card(64, 516, 1152, 64, C.coral);
    M('a rewrite that changes the file size → PULSE_INDEX_STALE · refused, never a stale answer · pulse index verify always hashes', 84, 554, { size: 13, color: C.ink });
  });
}

/* ---------- 13. recap ---------- */
function sRecap(t) {
  const TILES = [['header', 'magic + format byte', C.amber], ['field types', 'listed today', C.teal], ['null bitmap', 'a bit, never a sentinel', C.coral], ['import', 'inferred adapts · declared holds', C.amber],
    ['parent groups', 'each block stored once', C.violet], ['vectors', 'a battery in one field', C.violet], ['SPSS', 'codes, reasons, sets, sidecar', C.amber], ['shards + sidecars', 'append, look up, reproduce', C.teal]];
  A(1 - seg(t, 8.6, 9.0), () => {
    TILES.forEach(([n, d, col], i) => A(seg(t, 0.2 + i * 0.12, 0.5 + i * 0.12), () => {
      const x = 64 + (i % 4) * 290, y = 116 + Math.floor(i / 4) * 116;
      R(x, y, 276, 100, { fill: C.panel, stroke: col }); M(n, x + 16, y + 36, { size: 15, color: col, weight: 600 }); M(d, x + 16, y + 66, { size: 12.5, color: C.ink });
    }));
    A(seg(t, 3.4, 3.8), () => {
      R(64, 372, 566, 72, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more over time', 82, 402, { size: 14, color: C.teal, weight: 600 }); T('field types and formats; the manifest lists your instance\'s', 82, 426, { size: 14.5 });
      R(650, 372, 566, 72, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('pulse cohort inspect', 668, 402, { size: 14, color: C.amber, weight: 600 }); T('any one cohort\'s schema, groups and layout, from its header', 668, 426, { size: 14.5 });
    });
  });
  A(seg(t, 9.0, 9.8), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('THE COHORT FILE', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.teal });
    M('declare what you know; let Pulse refuse the rest', 640, 430, { size: 15, align: 'center' });
    M('next: asking before running', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[5.355, 8.661, 9.045, 5.931, 11.051, 10.304, 6.997, 10.219, 8.64, 9.429, 6.72, 9.109, 5.973, 8.576, 9.152, 7.424, 7.104, 8.213, 7.915, 8.149, 8.533, 6.507, 9.109, 10.048, 8.405, 9.557, 7.957, 7.36, 4.373, 6.123, 8.789, 8.192, 8.576, 7.659, 9.323, 8.32, 7.915, 8.533, 7.104, 8.619, 7.979, 4.992, 1.515]/*END*/;
PulseFilm.mount({
  series: 'PULSE · THE COHORT FILE',
  title: 'Pulse: The Cohort File',
  narr: NARR,
  scenes: [
    { name: 'Pulse: The Cohort File', dur: 4, draw: sTitle, caps: [
      [0, '', 'The cohort file. What every Pulse request reads, how it stores absence, and how it grows.', true]] },
    { name: 'Two shapes', dur: 10, draw: sShapes, caps: [
      [0, 'Every request reads a cohort, a .pulse file. It comes in two shapes: a single file, or a shard archive of many single files.',
        'Every request reads a cohort, a dot pulse file. It comes in two shapes: a single file, or a shard archive of many single files.'],
      [3.4, 'A single file opens with a nine-byte header: PULSE, three zero bytes and a format byte. Then come the schema, the dictionaries and the records.'],
      [6.6, 'Format two adds a block for parent groups and vectors. Pulse writes it only when the schema needs it.']] },
    { name: 'Field types', dur: 10, draw: sTypes, caps: [
      [0, 'Every field has a type. Today that means integers of several widths, floats, exact decimals, dates, datetimes, booleans, categoricals, multi-select sets and vectors.'],
      [3.6, 'Import infers them. Here, ids became u16, store and region categoricals, age a nullable u8, and the ratings u4.',
        'Import infers them. Here, ids became sixteen-bit integers, store and region categoricals, age a nullable byte, and the ratings four-bit integers.'],
      [7.0, 'Text is always categorical. More types are added over time, and the manifest lists the ones your instance supports.']] },
    { name: 'Null is a bit', dur: 10, draw: sNulls, caps: [
      [0, 'Absence lives in one place: a null bitmap, one bit per field. Thirteen fields need two bytes. There are no sentinel values, so a zero is always a zero.'],
      [3.4, 'A multi-select cell has three states. Null is no answer. A bare pipe means answered, but nothing chosen. Anything else is a selection.'],
      [6.8, 'Here: 74 null, 77 empty and 1,049 selections. Three different denominators, kept apart in every format.',
        'Here: seventy-four null, seventy-seven empty, and one thousand and forty-nine selections. Three different denominators, kept apart in every format.']] },
    { name: 'Inference adapts', dur: 9, draw: sInfer, caps: [
      [0, 'Inference reads only the first rows: five hundred by default, fifty here. What if a later row disagrees?'],
      [3.0, 'Row 64 holds 300 visits, too big for the u4 the sample chose. Pulse promotes the field to u16, and drops nothing.',
        'Row sixty-four holds three hundred visits, too big for the four-bit type the sample chose. Pulse promotes the field to sixteen bits, and drops nothing.'],
      [6.0, 'Row 71 has no age, so the field becomes nullable, and the import names it as promoted.',
        'Row seventy-one has no age, so the field becomes nullable, and the import names it as promoted.']] },
    { name: 'Declared schemas', dur: 9, draw: sSchema, caps: [
      [0, 'A declared schema matches columns by name, never by position. A column it does not name is refused before a single row is read.'],
      [3.0, 'Declared widths never promote. Rows 64 and 71 break the contract, so 78 rows import, with a warning that two were dropped.',
        'Declared widths never promote. Rows sixty-four and seventy-one break the contract, so seventy-eight rows import, with a warning that two were dropped.'],
      [6.0, 'Add strict, and a partial import fails instead. Nothing is written. Inference adapts; a declared schema is a contract.']] },
    { name: 'Parent groups', dur: 14, draw: sGroups, caps: [
      [0, 'Joined data repeats a parent block on every row: here, each store\'s region, format, size and opening date.'],
      [3.2, 'Declare a parent group keyed by store, and each distinct block is stored once, in the schema. Each row keeps a four-byte index instead.'],
      [6.0, 'The file moves to format two. Twelve stores, a hundred rows per entry: each record shrinks from 27 bytes to 21.',
        'The file moves to format two. Twelve stores, a hundred rows per entry: each record shrinks from twenty-seven bytes to twenty-one.'],
      [9.0, 'Requests still name the member fields, and get the same answers. A filter on group fields alone runs once per store, not once per row.'],
      [11.6, 'And Pulse checks the claim. A member that varies within its key fails the import. A group no wider than its index is dropped, with a warning.']] },
    { name: 'Vector fields', dur: 7, draw: sVectors, caps: [
      [0, 'A battery of columns can fold into one vector field, sat, with its kind, scale and labels in the schema.'],
      [3.6, 'An empty rating becomes a missing element, and the correlation drops those rows. A scalar slot refuses a vector, and names the operator to use.']] },
    { name: 'SPSS in', dur: 12, draw: sSpssIn, caps: [
      [0, 'An SPSS file declares its own dictionary, so nothing is inferred. Here, income codes 998 and 999 mean don\'t know, and refused.',
        'An SPSS file declares its own dictionary, so nothing is inferred. Here, income codes nine nine eight and nine nine nine mean don\'t know, and refused.'],
      [3.0, 'A null bit cannot say why, so income gets a sibling, income_missing, holding the reason. Region holds codes, not labels.',
        'A null bit cannot say why, so income gets a sibling column, income missing, holding the reason. Region holds codes, not labels.'],
      [6.4, 'The media question is a multiple-response set. Pulse keeps its answer columns and adds a set column beside them. Nulls and empty answers stay apart.'],
      [9.4, 'What the header cannot hold, like labels, missing-value rules and set definitions, goes in a metadata sidecar beside the cohort.']] },
    { name: 'SPSS out', dur: 6, draw: sSpssOut, caps: [
      [0, 'Export reads that sidecar back. The new file restates the missing codes and the set, and folds the derived columns away.'],
      [3.0, 'Import it again, and the cohort is byte-identical, down to the same hash.']] },
    { name: 'Shard archives', dur: 12, draw: sShards, caps: [
      [0, 'At scale, a cohort becomes a shard archive. Here, four quarters of thirty thousand purchases.'],
      [3.0, 'Shards must agree. Imported on their own, the quarters inferred different id widths, and the archive refused them. One shared schema fixed it.'],
      [6.4, 'Shard add appends a quarter, and shard remove takes one out. Add a hash and a shard name to the path, and you read one shard on its own.'],
      [9.4, 'Archives are read by random access. Opening and inspecting read only the zip directory and the shard headers, never every record.']] },
    { name: 'Sums that reproduce', dur: 7, draw: sSums, caps: [
      [0, 'Floating-point addition depends on order. Add the same North spends front to back, then back to front, and the last digits differ.'],
      [3.6, 'Pulse uses binned, reproducible sums. Serial or parallel, archive or one flat file, all four runs give the same figures, bit for bit.']] },
    { name: 'Sidecar indexes', dur: 12, draw: sIndex, caps: [
      [0, 'For point lookups, build a sidecar index: a separate file, so the cohort never changes. On an archive, each shard gets its own.'],
      [3.0, 'A lookup hashes the key and probes each shard\'s index, with no scan. Purchase 90,001 is in the fourth quarter.',
        'A lookup hashes the key and probes each shard\'s index, with no scan. Purchase ninety thousand and one is in the fourth quarter.'],
      [6.0, 'Remove that shard and its sidecar goes too, so the lookup finds nothing. Add it back, and the index is extended. Both changes say so.'],
      [9.4, 'If a rewrite changes the file\'s size, the index is stale, and Pulse refuses to use it rather than give an old answer.']] },
    { name: 'The cohort file', dur: 10.2, draw: sRecap, caps: [
      [0, 'That is the cohort file: a header, typed fields, a null bit, import rules, parent groups, vectors, SPSS, shards and sidecars.'],
      [3.4, 'Pulse adds field types and formats over time. The manifest lists what your instance supports, and inspect shows any cohort\'s schema.'],
      [6.4, 'Declare what you know, and let Pulse refuse the rest. Next up, asking before running.'],
      [9.0, '', 'Pulse. The cohort file.', true]] },
  ],
});
})();
