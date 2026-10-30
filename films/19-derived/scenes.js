/* Pulse: Derived Cohorts — film 19 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: no catalog counts, lists labelled "today"; the narration says
 * operators are added over time, points to the manifest and mentions Options.Extensions.
 * Colour roles: teal records and execution, amber no-execute reads (predict, recommend, inspect, the manifest),
 * violet derived output (materialized columns and cohorts), coral refusals and nulls.
 * The cohorts are illustrative (data/generate.js, seed 19). Every figure, code and key on a result card is copied from
 * a recorded alpha.33 run in data/ (see data/README.md); the comment beside each constant names the run. */
(() => {
const { C } = PulseFilm;
const { seg, eo, R, T, M, CAP, Ln, A, dot, arrow, chips } = PulseFilm.h;
const card = (x, y, w, h, stroke, fill) => R(x, y, w, h, { fill: fill || C.panel, stroke: stroke || C.rule });
const fade = (t, a, d = 0.35) => seg(t, a, a + d);
/* lines of mono text: [text, colour?, size?] */
const lines = (L, x, y, lh, o = {}) => L.forEach(([s, c, sz], i) => A(o.t == null ? 1 : fade(o.t, o.at + i * (o.step ?? 0.1)), () => M(s, x, y + i * lh, { size: sz || o.size || 13, color: c || o.color || C.ink })));
/* a titled card of mono lines */
function box(t, at, x, y, w, h, col, title, L, o = {}) {
  A(fade(t, at), () => {
    card(x, y, w, h, col, o.fill);
    CAP(title, x + 18, y + 28, { color: col });
    lines(L, x + 18, y + 56, o.lh || 22, { t, at: at + 0.15, size: o.size || 13, step: o.step });
  });
}
/* a table: cols [[header, width, align?]], rows of cells; cell(r, c, v) may return a colour */
function tbl(t, at, x, y, cols, rows, o = {}) {
  const lh = o.lh || 26, sz = o.size || 13;
  A(fade(t, at), () => {
    let cx = x; cols.forEach(([h, w, al]) => { CAP(h, al === 'right' ? cx + w - 8 : cx, y, { color: o.hc || C.muted, align: al || 'left' }); cx += w; });
    Ln([[x, y + 9], [cx, y + 9]], { stroke: C.rule });
  });
  rows.forEach((r, i) => A(fade(t, at + 0.15 + i * (o.step ?? 0.08)), () => {
    let cx = x;
    r.forEach((v, j) => {
      const [, w, al] = cols[j], s = v == null ? 'null' : String(v);
      const col = v == null ? C.coral : (o.cell && o.cell(i, j, v)) || C.ink;
      M(s, al === 'right' ? cx + w - 8 : cx, y + 32 + i * lh, { size: sz, color: col, align: al || 'left' });
      cx += w;
    });
  }));
}
/* a refusal card */
function refusal(t, at, x, y, w, code, L) {
  A(fade(t, at), () => {
    card(x, y, w, 40 + L.length * 22 + 14, C.coral);
    M(code, x + 18, y + 30, { size: 13.5, color: C.coral, weight: 600 });
    lines(L.map(s => [s, C.ink, 12.5]), x + 18, y + 56, 22);
  });
}

/* ---------- recorded figures ---------- */
const RN_ERR = ['SERVICE_VALIDATION', 'filter references unknown field: rank'];                       // rnfilter.out.json
const MAT = { target: 'wd.pulse', records: 48, derived: ['log_rev', 'prev_promo', 'rank', 'rev_lag1'] }; // mat.out.json
const SLOTS = ['cohort', 'label', 'features', 'filterers', 'attributes', 'windows', 'sort', 'weight', 'time_zone', 'output', 'disable_components'];   // pulse api materialize --help
/* wd.rows.csv, store S1 in source order: week, revenue, log_rev, prev_promo, rank, rev_lag1 */
const S1 = [['01-05', 122.4, '4.815', null, 8, null], ['01-12', 132.1, '4.891', 'No', 5, 122.4], ['01-19', 127.6, '4.857', 'Yes', 7, 132.1],
  ['01-26', 143.1, '4.971', 'No', 4, 127.6], ['02-02', 128.7, '4.865', 'Yes', 6, 143.1], ['02-09', 151.7, '5.028', 'No', 2, 128.7],
  ['02-16', 165.4, '5.114', 'No', 1, 151.7], ['02-23', 151.5, '5.027', 'Yes', 3, 165.4]];
const WD_COLS = [   // wd.inspect.json, the four derived fields
  ['log_rev', 'f64 · nullable', 'FEAT_LOG of revenue — derived from w.pulse'],
  ['prev_promo', 'categorical_u8 · nullable', 'ATTR_PREVIOUS_STATE of promo — derived from w.pulse'],
  ['rank', 'f64 · nullable', 'WIN_ROW_NUMBER (partition store; order revenue desc) — derived from w.pulse'],
  ['rev_lag1', 'f64 · nullable', 'WIN_LAG of revenue (partition store; order week) — derived from w.pulse']];
const PROMO_DICT = 'No · Yes · Y · Unsure';                                                           // wd.inspect.json prev_promo dictionary
const TOP = [['S1', 2, 158.55, '5.071'], ['S2', 2, 95.75, '4.572'], ['S3', 2, 129.5, '4.871'], ['S4', 2, 98.75, '4.600'], ['S5', 2, 145.45, '4.987'], ['S6', 2, 107.55, '4.687']];   // top.out.json
const TOP_ROWS = [12, 48];                                                                            // top.out.json metadata filtered_rows, total_rows
/* shape.predict.json columns: name, type, from */
const SHAPE = [['store', 'categorical_u8', 'store'], ['week', 'date', 'week'], ['rev', 'decimal128 (6, 1)', 'revenue'], ['band', 'categorical_u8 · low mid high', 'revenue'],
  ['promo_yn', 'categorical_u8 · Yes No', 'promo'], ['rank', 'u8', 'rank (derived)']];
const RISKS = [['rev', 'f64 → decimal128(6,1): finite, at most 1 fractional digits, |v| < 1e5'],   // shape.predict.json risks
  ['band', 'f64 → categorical_u8 bucket: every value must be a number'], ['rank', 'f64 → u8: integral, 0 ≤ v ≤ 255']];
const WS_S1 = [['S1', '2026-01-05', '122.4', 'mid', 'No', 8], ['S1', '2026-01-12', '132.1', 'high', 'Yes', 5], ['S1', '2026-01-19', '127.6', 'mid', 'No', 7]];   // ws.rows.csv
const CASTFAIL = ['column revenue · row 0 · value 122.4', 'from f64 to u16 · reason fractional · nothing was written'];    // castfail.out.json
const CASTNULL = ['column revenue · count 41 · first_row 0', 'f64 → u16, written null (on_cast_error: null)'];              // castnull.out.json
const PROMO_N = [['Yes', 25, 'Yes 17 + Y 8'], ['No', 19, 'No 19'], [null, 4, 'Unsure 4']];            // ws.rows.csv promo_yn; w.csv promo
const BAND_N = [['low', 'end 90', 12], ['mid', 'start 90 · end 130', 25], ['high', 'start 130', 10], [null, 'a null revenue', 1]];   // ws.rows.csv band
const RECODE_BAD = ['label "Yess" · path output.columns[1].recode.map', 'suggestion "Yes"'];          // recodebad.out.json
const SHARD_PLAN = 'kind shard_archive · max_records 10 · max_shards 5 · elide_constants true';      // shard.predict.json container
const SHARDS = [['part-00001.pulse', 10], ['part-00002.pulse', 6]], SHARD_REC = 16, ELIDED = ['region', 'format'];   // shard.out.json, nm.inspect.json
const GROUP = { key: 'store', members: 'region · format · opened', delta: -77 };                      // grp.out.json, grpdecl.out.json
const NOT_INH = 'member "format" is recoded, so its members are written as row fields';               // grpre.out.json
const REFUSE = [['PULSE_MATERIALIZE_SLOT_UNSUPPORTED', 'slot groups: only features, filterers, attributes, windows, sort,', 'weight and time_zone keep one row per source record'],   // slot.out.json
  ['PULSE_MATERIALIZE_NO_DERIVED', 'there is no derived column to append', ''],                                                   // noderiv.out.json
  ['SERVICE_VALIDATION', 'reason target_exists · target wd.pulse', 'set Overwrite to replace it']];                              // exists.out.json
const FIT = { coef: '31.84', n: 47 };                                                                 // rs2.out.json log_value coefficient, n_obs
const STAGE0 = [['North', 'S1', 1122.5], ['North', 'S2', 654.9], ['North', 'S3', 865.7], ['South', 'S4', 658.4], ['South', 'S5', 1046.2], ['South', 'S6', 799]];   // chain.out.json stages[0]
const STAGE1 = [['North', '881.03', 1122.5], ['South', '834.53', 1046.2]];                            // chain.out.json stages[1]
const S0C = { records: 48, n: 47, nnull: 1 }, S1C = { records: 6 };                                   // chain.out.json components.run, aggregations[0]
const MERGE_AGGS = ['AGG_AVERAGE', 'AGG_COUNT', 'AGG_DISTINCT_COUNT', 'AGG_MAX', 'AGG_MIN', 'AGG_SUM', 'AGG_STDDEV', 'AGG_VARIANCE'];   // manifest process_chain.mergeable_aggregators (a selection)
const CHAIN_ERR = ['stage_index 0 · stage_name per_store', 'windows, features, tests, post-tests and regressions are excluded'];   // chainwin.out.json
const CHAIN_OV = ['OVERLAY_INDEX_VS_STAGE', 'OVERLAY_DELTA_VS_STAGE'];                                // manifest process_chain.overlay_kinds
const JOIN = [['Ada', 1122.5, 5200], ['Ben', 654.9, 2400], ['Cleo', 865.7, 4800], ['Dev', 658.4, 2100], ['Eve', 1046.2, 5600]];   // join.out.json
const JOIN_ROWS = 40;                                                                                 // join.out.json metadata total_rows
const JOINF = ['store_no u64 ↔ store_no f64 · reason u64_float_key'];                                 // joinf.out.json, joinf.predict.json
const TOP4 = { written: 4, shards: [['part-00001.pulse', 1], ['part-00002.pulse', 3]] };              // nmtop.filter.json, nmtop.inspect.json
const FLAT = { written: 4 };                                                                          // nmflat.filter.json flattened true
const TX = [[1, 'Fri 6 Feb 15:00Z', 'Fri', 'Fri'], [2, 'Sat 7 Feb 18:00Z', 'Sat', 'Sat'], [3, 'Sun 8 Feb 23:30Z', 'Sun', 'Sun'],
  [4, 'Mon 9 Feb 03:00Z', 'Mon', 'Sun'], [5, 'Mon 9 Feb 14:00Z', 'Mon', 'Mon'], [6, 'Sun 8 Feb 04:00Z', 'Sun', 'Sat']];   // tx.csv; kept rows in txw_utc.rows.csv, txw_ny.rows.csv
const TXN = { utc: 3, ny: 4 };                                                                        // txutc.filter.json, txny.filter.json written_records

/* ---------- 0. title ---------- */
function sTitle(t) {
  A(fade(t, 0, 0.5), () => { card(300, 230, 260, 120, C.teal); M('w.pulse', 430, 282, { size: 20, color: C.teal, align: 'center', weight: 600 }); M('48 weekly rows', 430, 312, { size: 13, align: 'center' }); });
  A(fade(t, 0.5, 0.5), () => arrow(570, 290, 700, 290, { stroke: C.violet, lw: 2 }));
  A(fade(t, 0.9, 0.5), () => { card(720, 230, 260, 120, C.violet); M('wd.pulse', 850, 282, { size: 20, color: C.violet, align: 'center', weight: 600 }); M('+ rank · log_rev · …', 850, 312, { size: 13, align: 'center' }); });
  A(fade(t, 1.5, 0.6), () => T('Write a derived column once, read it everywhere', 640, 430, { size: 24, align: 'center', color: C.muted }));
}

/* ---------- 1. a column lives in its request ---------- */
function sLives(t) {
  A(fade(t, 0.1), () => {
    card(64, 112, 560, 300, C.teal);
    CAP('ONE REQUEST', 86, 142, { color: C.teal });
    [['features', 'log of revenue'], ['attributes', 'previous promo'], ['windows', 'rank per store']].forEach(([s, d], i) => {
      R(86, 162 + i * 58, 516, 46, { fill: C.panel2, stroke: C.violet });
      M(s, 104, 190 + i * 58, { size: 13.5, color: C.violet, weight: 600 }); M(d, 584, 190 + i * 58, { size: 13, align: 'right' });
    });
    M('derived columns: visible only inside this request', 86, 380, { size: 13, color: C.violet });
  });
  A(fade(t, 3.0), () => {
    card(656, 112, 560, 300, C.coral);
    CAP('THESE READ COHORT FIELDS', 678, 142, { color: C.coral });
    chips([['filters', C.coral], ['groupers', C.coral], ['joins', C.coral], ['tests', C.coral]], 678, 162, 510);
    M('filter on rank in the same request:', 678, 238, { size: 13 });
    M(RN_ERR[0], 678, 270, { size: 14, color: C.coral, weight: 600 });
    M(RN_ERR[1], 678, 296, { size: 13.5, color: C.ink });
  });
  A(fade(t, 6.2), () => {
    card(64, 440, 1152, 120, C.violet);
    CAP('MATERIALIZE', 86, 470, { color: C.violet });
    T('Writes the derived columns as ordinary fields of a NEW cohort.', 86, 506, { size: 19 });
    M('the next request names that cohort and reads them like any stored field', 86, 538, { size: 13.5 });
  });
}

/* ---------- 2. step one: materialize ---------- */
function sMat(t) {
  box(t, 0.1, 64, 112, 640, 278, C.teal, 'MAT.JSON · ONLY DERIVED SLOTS AND FILTERS', [
    ['"cohort":     {"filename": "w.pulse"}'],
    ['"features":   FEAT_LOG revenue → log_rev', C.violet],
    ['"attributes": ATTR_PREVIOUS_STATE promo → prev_promo', C.violet],
    ['               subject store · order week', C.muted],
    ['"windows":    WIN_ROW_NUMBER → rank', C.violet],
    ['               partition store · order revenue desc', C.muted],
    ['              WIN_LAG revenue → rev_lag1', C.violet],
    ['               partition store · order week', C.muted]], { lh: 26 });
  A(fade(t, 0.8), () => {
    card(736, 112, 480, 278, C.rule);
    CAP('SLOTS MATERIALIZE ACCEPTS', 758, 142);
    chips(SLOTS.map(s => [s, s === 'output' ? C.violet : C.teal]), 758, 162, 440, { t, at: 0.9, step: 0.05 });
  });
  A(fade(t, 3.6), () => {
    card(64, 410, 640, 160, C.teal);
    CAP('CLI · LIBRARY · MCP: ONE BODY', 86, 440, { color: C.teal });
    M('pulse api materialize -r mat.json -o wd.pulse', 86, 476, { size: 14.5, color: C.ink, weight: 600 });
    M('library   Pulse.Materialize', 86, 510, { size: 13 });
    M('MCP       pulse_materialize  {request, out}', 86, 536, { size: 13 });
  });
  A(fade(t, 6.6), () => {
    card(736, 410, 480, 160, C.violet, C.violetS);
    CAP('RESULT', 758, 440, { color: C.violet });
    M('target   ' + MAT.target, 758, 476, { size: 14, color: C.ink });
    M('records  ' + MAT.records, 758, 502, { size: 14, color: C.ink });
    M('derived_columns', 758, 532, { size: 12.5, color: C.muted });
    M(MAT.derived.join(' · '), 758, 554, { size: 13.5, color: C.violet, weight: 600 });
  });
}

/* ---------- 3. what the new cohort holds ---------- */
function sHolds(t) {
  const cols = [['week', 84], ['revenue', 110, 'right'], ['log_rev', 100, 'right'], ['prev_promo', 120, 'right'], ['rank', 70, 'right'], ['rev_lag1', 100, 'right']];
  A(fade(t, 0.05), () => { CAP('WD.PULSE · STORE S1 · SOURCE ORDER', 64, 124, { color: C.violet }); });
  tbl(t, 0.2, 64, 156, cols, S1, { lh: 25, cell: (i, j) => j <= 1 ? C.teal : C.violet });
  A(fade(t, 0.3), () => { Ln([[64 + 194, 146], [64 + 194, 368]], { stroke: C.faint, dash: [3, 4] }); M('source fields', 64, 392, { size: 12, color: C.teal }); M('derived, appended', 270, 392, { size: 12, color: C.violet }); });
  A(fade(t, 3.4), () => {
    card(680, 112, 536, 300, C.violet);
    CAP('ONE NULLABLE COLUMN PER DERIVED OUTPUT', 700, 142, { color: C.violet });
    WD_COLS.forEach(([n, ty, d], i) => {
      M(n, 700, 178 + i * 60, { size: 13.5, color: C.violet, weight: 600 }); M(ty, 1196, 178 + i * 60, { size: 12, align: 'right' });
      M(d, 700, 200 + i * 60, { size: 10.5, color: C.muted });
    });
  });
  A(fade(t, 6.8), () => {
    card(64, 424, 1152, 132, C.violet, C.violetS);
    CAP('THE EXCEPTION', 86, 454, { color: C.violet });
    M('prev_promo keeps the state field\'s type and dictionary: categorical_u8 · ' + PROMO_DICT, 86, 488, { size: 13.5, color: C.ink });
    M('first week of a store: null (nothing before it), in rev_lag1 too', 86, 520, { size: 13, color: C.coral });
  });
}

/* ---------- 4. step two: filter on it ---------- */
function sTop(t) {
  box(t, 0.1, 64, 112, 540, 200, C.teal, 'TOP.JSON · ON THE NEW COHORT', [
    ['"cohort":       {"filename": "wd.pulse"}'],
    ['"filterers":    FILTER_RANGE rank 1 … 2', C.teal],
    ['"groups":       GROUP_CATEGORY store'],
    ['"aggregations": AGG_COUNT revenue → weeks'],
    ['                AGG_AVERAGE revenue, log_rev']]);
  A(fade(t, 0.6), () => {
    card(64, 330, 540, 110, C.rule);
    CAP('WINDOW, THEN FILTER', 86, 360);
    M('materialize   window → rank, written as a field', 86, 392, { size: 13, color: C.violet });
    M('process       filter rank, on wd.pulse', 86, 418, { size: 13, color: C.teal });
  });
  A(fade(t, 3.4), () => { card(636, 112, 580, 330, C.teal); CAP('THE TWO BEST WEEKS IN EVERY STORE', 658, 142, { color: C.teal }); });
  tbl(t, 3.5, 658, 176, [['store', 110], ['weeks', 100, 'right'], ['avg revenue', 170, 'right'], ['avg log_rev', 150, 'right']], TOP, { lh: 34, size: 14, cell: (i, j) => j === 3 ? C.violet : null });
  A(fade(t, 4.4), () => M(`filtered_rows ${TOP_ROWS[0]} of total_rows ${TOP_ROWS[1]}`, 658, 422, { size: 13, color: C.muted }));
  A(fade(t, 5.2), () => {
    card(64, 462, 1152, 96, C.violet, C.violetS);
    T('rank and log_rev are stored fields now: filters, groupers and joins read them like any other.', 86, 516, { size: 17.5 });
  });
}

/* ---------- 5. predict first ---------- */
function sPredict(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 70, C.amber); M('pulse api materialize -r mat.json --predict', 86, 154, { size: 16, color: C.amber, weight: 600 }); M('header + schema only · nothing written', 1196, 154, { size: 13, align: 'right' }); });
  box(t, 0.6, 64, 204, 560, 350, C.amber, 'MAT.PREDICT.JSON', [
    ['valid  true', C.amber],
    ['columns  the exact schema the run writes:'],
    ['  store_no · store · region · format', C.teal],
    ['  opened · week · revenue · visits · promo', C.teal],
    ['  log_rev · prev_promo · rank · rev_lag1', C.violet],
    ['derived_columns  4, in output order'],
    ['risks  []'],
    ['container  kind file · elide_constants false']], { lh: 34 });
  A(fade(t, 3.4), () => {
    card(656, 204, 560, 350, C.rule);
    CAP('WHAT PREDICT ADDS', 678, 234);
    lines([['risks', C.amber, 14], ['  each value-dependent check the run could fail,', C.ink], ['  with the run\'s code and the column\'s path', C.ink], ['', C.ink],
      ['static refusals', C.coral, 14], ['  raised here with the same code and details', C.ink], ['  the run would give', C.ink]], 678, 274, 30, { t, at: 3.5 });
  });
}

/* ---------- 6. the output schema ---------- */
function sOutput(t) {
  A(fade(t, 0.05), () => CAP('OUTPUT · SINCE ALPHA.32', 64, 124, { color: C.violet }));
  A(fade(t, 0.2), () => {
    card(64, 140, 520, 196, C.violet);
    lines([['"output": {"columns": [ … ]}', C.violet, 14], ['  or {"exclude": [ … ]}, never both', C.muted], ['', C.ink],
      ['each entry  from · as · description · nullable', C.ink], ['            type · on_cast_error · recode · bucket', C.ink]], 86, 176, 28);
  });
  A(fade(t, 3.6), () => { card(616, 112, 600, 252, C.amber); CAP('SHAPE.PREDICT.JSON · COLUMNS IN LIST ORDER', 638, 142, { color: C.amber }); });
  tbl(t, 3.7, 638, 172, [['name', 110], ['type', 290], ['from', 170]], SHAPE, { lh: 28, cell: (i, j) => j === 0 ? C.violet : j === 2 ? C.teal : null });
  A(fade(t, 4.8), () => { card(64, 352, 520, 160, C.violet, C.violetS); CAP('WS.ROWS.CSV · WRITTEN', 86, 382, { color: C.violet }); });
  tbl(t, 4.9, 86, 412, [['store', 56], ['week', 110], ['rev', 66], ['band', 60], ['promo_yn', 96], ['rank', 50, 'right']], WS_S1, { lh: 24, size: 12.5 });
  A(fade(t, 7.0), () => {
    card(616, 386, 600, 126, C.teal);
    CAP('PROJECTION RUNS LAST', 638, 416, { color: C.teal });
    M('filters, sort, weight and derived slots run first,', 638, 450, { size: 13.5, color: C.ink });
    M('so they may read a column the output drops', 638, 476, { size: 13.5, color: C.ink });
  });
}

/* ---------- 7. exact casts ---------- */
function sCasts(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 154, C.amber); CAP('SHAPE.PREDICT.JSON · RISKS · CODE PULSE_MATERIALIZE_CAST_FAILED', 86, 142, { color: C.amber }); });
  RISKS.forEach(([c, ch], i) => A(fade(t, 0.3 + i * 0.2), () => { M(c, 86, 178 + i * 28, { size: 13.5, color: C.violet, weight: 600 }); M(ch, 200, 178 + i * 28, { size: 13, color: C.ink }); }));
  A(fade(t, 3.6), () => {
    card(64, 290, 560, 60, C.rule); M('{"from": "revenue", "type": "u16"}', 86, 326, { size: 14, color: C.ink });
  });
  refusal(t, 3.9, 64, 364, 560, 'PULSE_MATERIALIZE_CAST_FAILED', CASTFAIL);
  A(fade(t, 7.2), () => {
    card(656, 290, 560, 60, C.rule); M('… "type": "u16", "on_cast_error": "null"}', 678, 326, { size: 14, color: C.ink });
  });
  A(fade(t, 7.5), () => {
    card(656, 364, 560, 98, C.amber);
    M('warning  PULSE_MATERIALIZE_CAST_NULLED', 678, 394, { size: 13.5, color: C.amber, weight: 600 });
    lines(CASTNULL.map(s => [s, C.ink, 12.5]), 678, 420, 22);
  });
  A(fade(t, 8.2), () => M('once per column · the column must be nullable', 678, 490, { size: 12.5, color: C.muted }));
}

/* ---------- 8. recode and bucket ---------- */
function sRecode(t) {
  A(fade(t, 0.1), () => {
    card(64, 112, 560, 300, C.violet);
    CAP('RECODE · A DICTIONARY REWRITE', 86, 142, { color: C.violet });
    M('"map": {"Y": "Yes", "Unsure": null}', 86, 176, { size: 13.5, color: C.ink });
    M('"order": ["Yes", "No"]', 86, 200, { size: 13.5, color: C.ink });
  });
  PROMO_N.forEach(([lab, n, src], i) => A(fade(t, 0.8 + i * 0.3), () => {
    const y = 250 + i * 50;
    M(src, 86, y, { size: 13.5, color: C.teal }); arrow(260, y - 5, 330, y - 5, { stroke: C.faint });
    M(lab == null ? 'null' : lab, 350, y, { size: 14, color: lab == null ? C.coral : C.violet, weight: 600 }); M(String(n), 600, y, { size: 14, align: 'right' });
  }));
  A(fade(t, 3.6), () => {
    card(656, 112, 560, 300, C.violet);
    CAP('BUCKET · NUMBERS INTO LABELLED RANGES', 678, 142, { color: C.violet });
    M('revenue → band · start in, end out', 678, 176, { size: 13.5, color: C.ink });
  });
  BAND_N.forEach(([lab, rg, n], i) => A(fade(t, 3.8 + i * 0.25), () => {
    const y = 220 + i * 46;
    M(lab == null ? 'null' : lab, 678, y, { size: 14, color: lab == null ? C.coral : C.violet, weight: 600 }); M(rg, 770, y, { size: 13 }); M(String(n), 1192, y, { size: 14, align: 'right' });
  }));
  A(fade(t, 4.6), () => M('rows written per label · ws.rows.csv', 678, 396, { size: 12, color: C.muted }));
  refusal(t, 7.0, 64, 432, 1152, 'PULSE_MATERIALIZE_RECODE_UNKNOWN_LABEL · before anything is read', RECODE_BAD);
}

/* ---------- 9. shards and constants ---------- */
function sShards(t) {
  box(t, 0.1, 64, 112, 560, 170, C.teal, 'SHARD.JSON', [
    ['"filterers": region North · format Mall'],
    ['"windows":   WIN_ROW_NUMBER → rank', C.violet],
    ['"output": {"shards": {"max_records": 10},', C.violet],
    ['           "elide_constants": true}', C.violet]]);
  A(fade(t, 0.8), () => { card(656, 112, 560, 170, C.amber); CAP('PREDICT · CONTAINER', 678, 142, { color: C.amber }); M(SHARD_PLAN.split(' · ').slice(0, 2).join(' · '), 678, 182, { size: 13.5, color: C.ink }); M(SHARD_PLAN.split(' · ').slice(2).join(' · '), 678, 208, { size: 13.5, color: C.ink }); M('max_shards: if every record passed the filters', 678, 246, { size: 12.5, color: C.muted }); });
  A(fade(t, 3.6), () => { CAP('NM.PULSE · A SHARD ARCHIVE · ' + SHARD_REC + ' RECORDS', 64, 316, { color: C.violet }); });
  SHARDS.forEach(([n, r], i) => A(fade(t, 3.8 + i * 0.4), () => {
    const w = r * 50; R(64, 334 + i * 56, w, 40, { fill: C.violetS, stroke: C.violet }); M(n, 80, 360 + i * 56, { size: 13, color: C.ink }); M(r + ' rows', 64 + w + 14, 360 + i * 56, { size: 13.5, color: C.violet });
  }));
  A(fade(t, 7.0), () => {
    card(656, 316, 560, 130, C.violet, C.violetS);
    CAP('ELIDED_CONSTANTS', 678, 346, { color: C.violet });
    M(ELIDED.join(' · '), 678, 382, { size: 17, color: C.violet, weight: 600 });
    M('one value on every written row: stored once, decoded as before', 678, 418, { size: 12.5, color: C.ink });
  });
  A(fade(t, 7.6), () => M('decided by a full pass over the written rows, across the whole archive', 64, 476, { size: 13, color: C.muted }));
}

/* ---------- 10. parent groups ---------- */
function sGroups(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 70, C.teal); M('wg.pulse · parent group  key ' + GROUP.key + ' → ' + GROUP.members, 86, 154, { size: 14.5, color: C.teal, weight: 600 }); });
  const rows = [
    [0.4, 'output.exclude visits, promo', 'inherited · admitted', C.violet, 'every member written unchanged'],
    [3.8, 'output.columns · recode format', 'PULSE_MATERIALIZE_GROUP_NOT_INHERITED', C.coral, NOT_INH],
    [6.8, '… + output.groups [{key store, members …}]', 'declared · admitted', C.violet, 'byte_delta ' + GROUP.delta + ' · regrouped over the written names']];
  rows.forEach(([at, req, v, col, why], i) => A(fade(t, at), () => {
    const y = 206 + i * 116;
    card(64, y, 1152, 100, col);
    M(req, 86, y + 36, { size: 13.5, color: C.ink }); M(v, 1194, y + 36, { size: 13.5, color: col, weight: 600, align: 'right' });
    M(why, 86, y + 72, { size: 12.5, color: C.muted });
  }));
}

/* ---------- 11. what materialize refuses ---------- */
function sRefuse(t) {
  A(fade(t, 0.1), () => { CAP('REFUSED BEFORE ANYTHING IS WRITTEN · THE WRITE IS ATOMIC', 64, 124, { color: C.coral }); });
  REFUSE.forEach(([code, a, b], i) => refusal(t, [0.4, 3.4, 5.0][i], 64, 144 + i * 136, 1152, code, b ? [a, b] : [a]));
}

/* ---------- 12. recommend drafts the step ---------- */
function sRec(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 70, C.amber); M('pulse recommend --intent distribution_shape --cohort w.pulse --field revenue', 86, 146, { size: 14.5, color: C.amber, weight: 600 }); M('draft FEAT_LOG · bound · steps', 86, 170, { size: 12.5 }); });
  box(t, 3.4, 64, 200, 560, 230, C.amber, 'STEPS[0] · PULSE_MATERIALIZE', [
    ['{"request": {"features": [', C.ink], ['    FEAT_LOG revenue → log_value]},', C.violet], [' "out": "<out>"}', C.ink], ['placeholders  out', C.muted]], { lh: 26 });
  box(t, 4.4, 656, 200, 560, 230, C.amber, 'STEPS[1] · PULSE_PROCESS', [
    ['{"cohort": {"filename": "<out>"},', C.ink], [' "regressions": [REG_OLS', C.ink], ['    predictors ["log_value"]', C.violet], ['    target "<target>"]}', C.ink], ['placeholders  out · target', C.muted]], { lh: 26 });
  A(fade(t, 6.8), () => {
    card(64, 450, 1152, 100, C.teal);
    CAP('FILLED: OUT wl.pulse · TARGET visits · RUN IN ORDER', 86, 480, { color: C.teal });
    M(`REG_OLS  log_value ${FIT.coef}  ·  n_obs ${FIT.n}`, 86, 520, { size: 16, color: C.ink, weight: 600 });
  });
}

/* ---------- 13. process chain ---------- */
function sChain(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 60, C.teal); M('pulse api process-chain -r chain.json   ·   stage N+1 reads stage N\'s output rows', 86, 148, { size: 14, color: C.teal, weight: 600 }); });
  A(fade(t, 0.6), () => { card(64, 190, 500, 330, C.teal); CAP('STAGE 0 · PER_STORE · w.pulse', 86, 220, { color: C.teal }); M('groups region, store · AGG_SUM revenue → store_rev', 86, 246, { size: 12, color: C.muted }); });
  tbl(t, 3.6, 86, 274, [['region', 120], ['store', 100], ['store_rev', 140, 'right']], STAGE0, { lh: 26, cell: (i, j) => j === 0 ? C.teal : j === 1 ? C.teal : null });
  A(fade(t, 4.4), () => M(`components  records ${S0C.records} · store_rev n ${S0C.n}, n_null ${S0C.nnull}`, 86, 502, { size: 12, color: C.muted }));
  A(fade(t, 4.0), () => {
    arrow(574, 330, 652, 330, { stroke: C.faint, lw: 2 });

  });
  A(fade(t, 7.0), () => { card(664, 190, 552, 330, C.teal); CAP('STAGE 1 · PER_REGION · stage 0\'s rows', 686, 220, { color: C.teal }); M('groups region · AGG_AVERAGE, AGG_MAX store_rev', 686, 246, { size: 12, color: C.muted }); });
  tbl(t, 7.2, 686, 274, [['region', 130], ['avg_store', 150, 'right'], ['best_store', 150, 'right']], STAGE1, { lh: 30, size: 14 });
  A(fade(t, 7.8), () => M(`components  records ${S1C.records}`, 686, 502, { size: 12, color: C.muted }));
  A(fade(t, 4.2), () => { card(686, 380, 508, 76, C.violet, C.violetS); CAP('THE BRIDGE BETWEEN STAGES', 704, 406, { color: C.violet }); M('group keys → categorical_u32 · aggregates → f64', 704, 436, { size: 13, color: C.ink }); });
}

/* ---------- 14. a chain stays mergeable ---------- */
function sGate(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 120, C.amber); CAP('MANIFEST · PROCESS_CHAIN · MERGEABLE AGGREGATORS TODAY', 86, 142, { color: C.amber }); });
  A(fade(t, 0.3), () => chips([...MERGE_AGGS.map(s => [s, C.amber]), ['+ more', null]], 86, 160, 1100, { t, at: 0.3, step: 0.05 }));
  A(fade(t, 0.9), () => M('also mergeable_groupers · row_local_attributes · rejection_rules', 86, 218, { size: 12, color: C.muted }));
  refusal(t, 3.4, 64, 252, 760, 'PULSE_CHAIN_NOT_MERGEABLE', CHAIN_ERR);
  A(fade(t, 5.4), () => {
    card(850, 252, 366, 112, C.violet);
    CAP('A WINDOW?', 870, 282, { color: C.violet });
    M('materialize first,', 870, 314, { size: 14, color: C.violet }); M('then run the next step there', 870, 340, { size: 13 });
  });
  A(fade(t, 7.0), () => {
    card(64, 384, 1152, 172, C.rule);
    CAP('ACROSS STAGES', 86, 414);
    M('joins: stage 0 only (a later stage: PULSE_CHAIN_STAGE_JOIN)', 86, 448, { size: 13.5, color: C.ink });
    M('overlays: per stage, or whole-chain comparing two stages · kinds today', 86, 480, { size: 13.5, color: C.ink });
    M(CHAIN_OV.join(' · '), 86, 512, { size: 13.5, color: C.amber, weight: 600 });
  });
}

/* ---------- 15. joins ---------- */
function sJoin(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 60, C.teal); M('"joins": [{"right": "st.pulse", "kind": "inner", "as": "st_", "on": [{store_no ↔ store_no}]}]', 86, 148, { size: 13.5, color: C.teal, weight: 600 }); });
  A(fade(t, 3.6), () => {
    card(64, 194, 320, 120, C.teal); CAP('LEFT · PROBE · STREAMS', 84, 222, { color: C.teal }); M('w.pulse · 48 weeks', 84, 256, { size: 14, color: C.ink }); M('store_no  u64', 84, 284, { size: 13 });
    card(64, 330, 320, 120, C.amber); CAP('RIGHT · BUILD · IN MEMORY', 84, 358, { color: C.amber }); M('st.pulse · 5 stores', 84, 392, { size: 14, color: C.ink }); M('store_no  u32 → st_store_no …', 84, 420, { size: 13 });
    arrow(394, 390, 452, 330, { stroke: C.faint }); arrow(394, 254, 452, 310, { stroke: C.faint });
  });
  A(fade(t, 3.9), () => { card(464, 194, 752, 316, C.violet); CAP('GROUPED BY st_manager', 486, 222, { color: C.violet }); });
  tbl(t, 4.1, 486, 254, [['st_manager', 180], ['revenue', 180, 'right'], ['st_sqft', 160, 'right']], JOIN, { lh: 32, size: 14 });
  A(fade(t, 7.2), () => {
    M(`joined rows ${JOIN_ROWS} of 48 · S6 has no store row, so its weeks reach no group`, 486, 476, { size: 13, color: C.coral });
    M('u64 ↔ u32: one unsigned-integer family, accepted', 64, 486, { size: 12.5, color: C.teal });
  });
}

/* ---------- 16. join limits ---------- */
function sJoinLim(t) {
  refusal(t, 0.1, 64, 112, 1152, 'PULSE_JOIN_TYPE_MISMATCH · process and predict alike', JOINF);
  A(fade(t, 0.6), () => M('a u64 key compares on its exact stored word; a float has no exact integer above 2^53', 86, 214, { size: 12.5, color: C.muted }));
  A(fade(t, 3.6), () => {
    card(64, 240, 560, 150, C.amber);
    CAP('PREDICT · BOTH SCHEMAS, NO RECORDS', 86, 270, { color: C.amber });
    M('joinf.predict.json  valid false', 86, 306, { size: 13.5, color: C.ink }); M('same code, same details', 86, 332, { size: 13 });
    M('set keys refused too: reason set_key', 86, 362, { size: 13, color: C.coral });
  });
  refusal(t, 4.4, 656, 240, 560, 'PULSE_JOIN_KIND_NOT_IMPLEMENTED', ['kind left · only inner is implemented in v1']);
  refusal(t, 7.0, 656, 346, 560, 'PULSE_JOIN_FIELD_COLLISION', ['field store_no · as "" · set as to prefix the right side']);
  A(fade(t, 7.6), () => {
    card(64, 452, 1152, 100, C.amber);
    CAP('MANIFEST · JOIN', 86, 482, { color: C.amber });
    M('max_joins_per_request 1 · kinds inner · spill_bytes 0 · limitations', 86, 516, { size: 13.5, color: C.ink });
  });
}

/* ---------- 17. filter to file ---------- */
function sFtf(t) {
  A(fade(t, 0.1), () => { card(64, 112, 1152, 60, C.teal); M('pulse cohort filter -i IN -o OUT --filter EXPR [--flatten] [--time-zone ZONE]', 86, 148, { size: 14, color: C.teal, weight: 600 }); });
  A(fade(t, 3.4), () => {
    card(64, 190, 560, 196, C.violet);
    CAP('NM.PULSE --filter \'rank <= 2\'', 86, 220, { color: C.violet });
    M(`written_records ${TOP4.written} · per-shard layout kept`, 86, 254, { size: 13.5, color: C.ink });
    TOP4.shards.forEach(([n, r], i) => { R(86, 270 + i * 34, 40 + r * 40, 26, { fill: C.violetS, stroke: C.violet }); M(n + ' · ' + r, 86 + 52 + r * 40, 288 + i * 34, { size: 12.5 }); });
    M(`--flatten → one single file · written_records ${FLAT.written}`, 86, 362, { size: 13.5, color: C.violet, weight: 600 });
  });
  A(fade(t, 7.2), () => { card(656, 190, 560, 290, C.teal); CAP('weekday(to_day(at)) >= 6 · TX.PULSE', 678, 220, { color: C.teal }); });
  tbl(t, 7.4, 678, 252, [['receipt', 80], ['at', 200], ['UTC', 90], ['New York', 110]], TX, { lh: 30, size: 13,
    cell: (i, j, v) => j >= 2 && (v === 'Sat' || v === 'Sun') ? C.violet : (i === 3 && j === 3 ? C.violet : null) });
  A(fade(t, 8.4), () => M(`weekend kept  UTC ${TXN.utc} · New York ${TXN.ny}`, 678, 464, { size: 14, color: C.violet, weight: 600 }));
  A(fade(t, 9.4), () => {
    card(64, 404, 560, 76, C.coral);
    M('--time-zone Mars/Olympus', 86, 434, { size: 13.5, color: C.ink }); M('PULSE_TIMEZONE_UNKNOWN · nothing written', 86, 460, { size: 13.5, color: C.coral, weight: 600 });
  });
  A(fade(t, 10.4), () => {
    card(64, 500, 1152, 64, C.rule);
    M('library  FilterToFileWithRequest, no OutputName: {source-hash}_{predicate-hash}.pulse, reused if present', 86, 538, { size: 13, color: C.muted });
  });
}

/* ---------- 18. recap ---------- */
const TOOLS = [['materialize', 'a later request reads a derived column', C.violet], ['output', 'reshape the written cohort', C.violet],
  ['process chain', 'aggregate, then aggregate the aggregates', C.teal], ['joins', 'columns from a second cohort, shared key', C.teal],
  ['filter to file', 'a subset as its own cohort', C.teal], ['recommend', 'drafts the materialize step for you', C.amber]];
function sRecap(t) {
  const end = seg(t, 9.0, 9.6);
  A(1 - end, () => {
    CAP('WHICH TOOL, WHEN', 64, 124, { color: C.violet });
    TOOLS.forEach(([n, d, col], i) => A(fade(t, 0.2 + i * 0.25), () => { const x = 64 + (i % 3) * 388, y = 144 + Math.floor(i / 3) * 104; R(x, y, 372, 88, { fill: C.panel, stroke: col }); M(n, x + 16, y + 32, { size: 14, color: col, weight: 600 }); T(d, x + 16, y + 62, { size: 15 }); }));
    A(fade(t, 3.6), () => {
      R(64, 372, 566, 80, { fill: C.panel, stroke: C.teal, dash: [6, 5] }); M('+ more operators over time', 82, 402, { size: 14, color: C.teal, weight: 600 }); T('the manifest lists what your instance offers', 82, 430, { size: 15 });
      R(650, 372, 566, 80, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ your own, through Options.Extensions', 668, 402, { size: 14, color: C.amber, weight: 600 }); T('a chain admits one only when declared Mergeable', 668, 430, { size: 15 });
    });
  });
  A(seg(t, 9.6, 10.2), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('DERIVED COHORTS', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('write the column once, then read it everywhere', 640, 430, { size: 15, align: 'center' });
    M('next: weights and raking', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

const NARR = /*NARR*/[4.715, 6.976, 8.363, 7.019, 8.576, 6.656, 5.909, 5.781, 5.632, 6.208, 7.573, 6.123, 8.043, 5.099, 5.952, 6.72, 5.803, 3.648, 8.533, 6.229, 5.845, 6.037, 5.248, 5.141, 4.181, 6.272, 4.331, 4.949, 2.987, 6.485, 4.587, 5.163, 6.592, 3.563, 6.208, 7.467, 5.781, 5.205, 5.483, 6.656, 6.507, 5.675, 8.085, 6.037, 6.741, 6.016, 5.739, 5.76, 8.235, 6.997, 9.707, 7.467, 4.203, 1.643]/*END*/;
PulseFilm.mount({
  series: 'PULSE · DERIVED COHORTS',
  title: 'Pulse: Derived Cohorts',
  narr: NARR,
  scenes: [
    { name: 'Pulse: Derived Cohorts', dur: 4, draw: sTitle, caps: [
      [0, '', 'Derived cohorts. Write a derived column once, and read it like any other field.', true]] },
    { name: 'A column lives in its request', dur: 9, draw: sLives, caps: [
      [0, 'A derived column, from a feature, an attribute or a window, exists only inside the request that computes it.'],
      [3.0, 'Filters, groupers, joins and tests read cohort fields. A filter on a rank from the same request is refused: unknown field.'],
      [6.2, 'Materialize writes the derived columns as ordinary fields of a new cohort, and the next request reads them there.']] },
    { name: 'Step one: materialize', dur: 10, draw: sMat, caps: [
      [0, 'Step one carries only derived slots and filters: a log of revenue, the previous promo, a rank per store, and last week\'s revenue.'],
      [3.6, 'pulse api materialize writes it to a new path. The library and the MCP tool take the same body.',
        'Pulse A P I materialize writes it to a new path. The library and the M C P tool take the same body.'],
      [6.6, 'It wrote wd.pulse: 48 records, with the derived columns in pipeline order.',
        'It wrote w d dot pulse: forty-eight records, with the derived columns in pipeline order.']] },
    { name: 'What the new cohort holds', dur: 10, draw: sHolds, caps: [
      [0, 'One row per filter-passing source record, in source order. The source fields come first, verbatim.'],
      [3.4, 'Then one nullable f64 per derived column, each with a generated description.',
        'Then one nullable sixty-four-bit float per derived column, each with a generated description.'],
      [6.8, 'A previous-state column is the exception: it keeps its state field\'s categorical type and dictionary.']] },
    { name: 'Step two: filter on it', dur: 8, draw: sTop, caps: [
      [0, 'Step two points the next request at the new cohort. Rank is a stored field now, so a range filter can keep ranks one and two.'],
      [3.4, 'That is the window-then-filter workflow the windows film pointed to: the two best weeks in every store.']] },
    { name: 'Predict first', dur: 7, draw: sPredict, caps: [
      [0, 'Add --predict and nothing is written. Pulse reads the header and schema, and returns the exact columns the run would write.',
        'Add dash dash predict, and nothing is written. Pulse reads the header and schema, and returns the exact columns the run would write.'],
      [3.4, 'It also lists the risks, and raises every static refusal with the run\'s own code.']] },
    { name: 'The output schema', dur: 10, draw: sOutput, caps: [
      [0, 'Since alpha.32, an output block lays out the written cohort: a columns list, or exclude.',
        'Since alpha thirty-two, an output block lays out the written cohort: a columns list, or exclude.'],
      [3.6, 'Each entry reads a source field or a derived label, and can rename, describe, retype, recode or bucket it.'],
      [7.0, 'Projection runs last, so filters, sort and the derived slots can still read a dropped column.']] },
    { name: 'Exact casts', dur: 10, draw: sCasts, caps: [
      [0, 'Every cast is exact or it fails, and predict lists the checks.'],
      [3.6, 'Cast revenue to a u16, and the run stops at row 0: 122.4 is fractional. Nothing is written.',
        'Cast revenue to a sixteen-bit integer, and the run stops at row zero: one twenty-two point four is fractional. Nothing is written.'],
      [7.2, 'With on_cast_error null, those cells are written null, with one warning: 41 values nulled.',
        'With on cast error set to null, those cells are written null, with one warning: forty-one values nulled.']] },
    { name: 'Recode and bucket', dur: 10, draw: sRecode, caps: [
      [0, 'Recode rewrites a categorical\'s dictionary: Y merges into Yes, and Unsure becomes null.'],
      [3.6, 'Bucket writes a number as labelled ranges, start included, end excluded. The missing week stays null.'],
      [7.0, 'A map key the dictionary does not hold is refused, and Pulse suggests the label you meant.']] },
    { name: 'Shards and constants', dur: 10, draw: sShards, caps: [
      [0, 'Container keys shape the file. shards writes a shard archive, cut in output order.',
        'Container keys shape the file. Shards writes a shard archive, cut in output order.'],
      [3.6, 'Here, two shards, of ten rows and six. Predict planned at most five.'],
      [7.0, 'elide_constants stores a column with one value on every row just once: here, region and format.',
        'Elide constants stores a column with one value on every row just once: here, region and format.']] },
    { name: 'Parent groups', dur: 10, draw: sGroups, caps: [
      [0, 'Parent groups survive an output block when every member is written unchanged.'],
      [3.8, 'Recode the format, and the group is not inherited. Its members become row fields.'],
      [6.8, 'Declare output.groups, and the group is admitted again.', 'Declare output groups, and the group is admitted again.']] },
    { name: 'What materialize refuses', dur: 7, draw: sRefuse, caps: [
      [0, 'Materialize refuses before it writes. A groups slot is refused: it would not keep one row per record.'],
      [3.4, 'So is a request with nothing derived, and an existing path without overwrite.']] },
    { name: 'Recommend drafts the step', dur: 10, draw: sRec, caps: [
      [0, 'Recommend knows this recipe. Its log feature draft for revenue comes with steps.'],
      [3.4, 'First, pulse_materialize writes log_value to a new cohort. Then pulse_process fits a regression on it.',
        'First, the materialize tool writes log value to a new cohort. Then the process tool fits a regression on it.'],
      [6.8, 'Filled in and run, log_value comes back as a predictor.', 'Filled in and run, log value comes back as a predictor.']] },
    { name: 'Process chain', dur: 10, draw: sChain, caps: [
      [0, 'A process chain aggregates, then aggregates the aggregates. Each stage reads the last one\'s rows.'],
      [3.6, 'Stage zero sums revenue per store. Group keys become categorical columns, and aggregates f64s.',
        'Stage zero sums revenue per store. Group keys become categorical columns, and aggregates sixty-four-bit floats.'],
      [7.0, 'Stage one averages the store totals per region. Each stage reports its own components.']] },
    { name: 'A chain stays mergeable', dur: 10, draw: sGate, caps: [
      [0, 'Every stage passes a mergeable-only gate. The manifest lists what it admits today.'],
      [3.4, 'Windows, features, tests and regressions are refused. For a window, materialize first.'],
      [7.0, 'Only stage zero may join. Whole-chain overlays compare two stages, today as an index or a delta.']] },
    { name: 'Joins', dur: 10, draw: sJoin, caps: [
      [0, 'A join adds columns from a second cohort that shares a key: today, one inner hash join per request.'],
      [3.6, 'The store table is built in memory, the weeks stream past it, and as prefixes its columns.',
        'The store table is built in memory, the weeks stream past it, and the as prefix marks its columns.'],
      [7.2, 'Store S6 has no row, so its weeks drop: 40 of 48 joined. A 64-bit key pairs with a 32-bit one.',
        'Store S six has no row, so its weeks drop: forty of forty-eight joined. A sixty-four-bit key pairs with a thirty-two-bit one.']] },
    { name: 'Join limits', dur: 10, draw: sJoinLim, caps: [
      [0, 'A 64-bit key against a float key is refused: a float cannot hold every large integer.',
        'A sixty-four-bit key against a float key is refused: a float cannot hold every large integer.'],
      [3.6, 'Predict raises the same code from the schemas alone. Set keys are refused, and other kinds are reserved.'],
      [7.0, 'Without a prefix, the two store_no columns collide. The manifest\'s join block states the limits.',
        'Without a prefix, the two store number columns collide. The manifest\'s join block states the limits.']] },
    { name: 'Filter to file', dur: 12, draw: sFtf, caps: [
      [0, 'Filter to file writes the records that pass a predicate as a new cohort: pulse cohort filter.'],
      [3.4, 'Filtered on its rank, the North archive keeps its shard layout. --flatten writes one file.',
        'Filtered on its rank, the North archive keeps its shard layout. Dash dash flatten writes one file.'],
      [7.2, 'to_day reads the zone given by --time-zone, else UTC. Weekend receipts: 3 in UTC, 4 in New York.',
        'To-day reads the zone given by the time zone flag, else U T C. Weekend receipts: three in U T C, four in New York.'],
      [9.4, 'An unknown zone writes nothing. In the library, FilterToFileWithRequest can also name the file by hash.',
        'An unknown zone writes nothing. In the library, filter to file with request can also name the file by hash.']] },
    { name: 'Which tool, when', dur: 10.2, draw: sRecap, caps: [
      [0, 'Materialize to read a derived column later. A chain to aggregate aggregates. A join for another cohort\'s columns. Filter to file for a subset.'],
      [3.6, 'Pulse adds operators over time, and the manifest lists yours. Embedders add their own through Options.Extensions.',
        'Pulse adds operators over time, and the manifest lists yours. Embedders add their own through options dot extensions.'],
      [7.0, 'Write the column once, then read it everywhere. Next up, weights and raking.'],
      [9.6, '', 'Pulse. Derived cohorts.', true]] },
  ],
});
})();
