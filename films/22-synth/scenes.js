/* Pulse: synthetic data. Film 22 of the 23-film Pulse Anatomy series. Scenes draw with the PulseFilm kit.
 * Follows SERIES-RULES.md at Pulse v1.0.0-alpha.33: synth distributions are listed as "today", never counted; the
 * narration says more are added over time and that the manifest lists them. (The synthetic-distribution extension
 * category was removed at alpha.20, so Options.Extensions is not offered here.) Every figure, hash, warning and code on
 * screen is copied from a recorded alpha.33 run in data/ (see data/README.md); each scene names the run it quotes.
 * The one computed line is the lag check in "Earlier rows" (32.22 + 0.6 x 81.50), which re-adds two recorded values. */
(() => {
const { C, MONO } = PulseFilm;
const { seg, eo, lerp, R, T, M, CAP, Ln, A, arrow, chips, measure } = PulseFilm.h;
const card = (x, y, w, h, stroke, o = {}) => R(x, y, w, h, { fill: o.fill || C.panel, stroke: stroke || C.rule, dash: o.dash });
const pill = (x, y, s, col, o = {}) => {
  const size = o.size ?? 12.5, w = measure(s, { font: MONO, size }) + 20;
  R(x, y, w, 26, { fill: o.fill || C.panel2, stroke: col, r: 13 }); M(s, x + 10, y + 17.5, { size, color: col });
  return w;
};
/* lines: [text, color?]; each line fades in from `at`, `step` apart */
function code(t, x, y, w, lines, o = {}) {
  const at = o.at ?? 0, step = o.step ?? 0.08, lh = o.lh ?? 22, size = o.size ?? 13, pad = o.pad ?? 16;
  A(seg(t, at, at + 0.3), () => card(x, y, w, pad * 2 + lines.length * lh - (lh - size), o.stroke));
  lines.forEach(([s, col], i) => A(seg(t, at + 0.1 + i * step, at + 0.4 + i * step), () => M(s, x + 18, y + pad + size + i * lh - 2, { size, color: col || C.ink })));
}
const big = (s, x, y, col, o = {}) => T(s, x, y, { size: o.size ?? 30, weight: 700, color: col, stretch: 'expanded', align: o.align });
const box = (x, y, w, h, title, sub, col, o = {}) => {
  R(x, y, w, h, { fill: o.fill || C.panel, stroke: col, dash: o.dash });
  M(title, x + w / 2, y + (sub ? h / 2 - 3 : h / 2 + 5), { size: o.size ?? 13.5, color: col, align: 'center', weight: 600 });
  if (sub) M(sub, x + w / 2, y + h / 2 + 17, { size: 11.5, align: 'center' });
};
const f2 = v => v.toFixed(2), f3 = v => v.toFixed(3), fmt = n => n.toLocaleString('en-US');

/* ---------- recorded figures ---------- */
/* shop.out.json; shop.json fields; shop.head.csv (rounded for display) */
const SHOP = { rows: 2000, rejected: 0 };
const SPEC = [['id', 'u32', 'monotonic_from', 'start 1'], ['region', 'categorical_u8', 'weighted_categorical', 'N .4 · S .3 · E .2 · W .1'],
  ['age', 'f64', 'normal', 'mean 42 · std 12 · min 18 · max 80'], ['spend', 'f64', 'lognormal', 'mu 4 · sigma 0.5'], ['visits', 'u8', 'poisson', 'lambda 3'],
  ['member', 'packed_bool', 'bernoulli', 'p 0.35'], ['joined', 'date', 'uniform_date', '2024-01-01 … 2025-12-31']];
const HEAD = [[1, 'East', 40.63, 29.22, 2, 'false', '2025-11-28'], [2, 'West', 50.60, 42.17, 0, 'false', '2025-04-19'], [3, 'South', 53.24, 34.05, 3, 'false', '2025-07-10'],
  [4, 'East', 53.94, 74.35, 2, 'false', '2025-06-18'], [5, 'North', 60.74, 30.65, 3, 'false', '2024-01-23']];
/* q-shop.out.json, q-shop-region.out.json, q-shop-member.out.json */
const BACK = { age: 42.19, ageMin: 18, ageMax: 80, spend: 62.58, visits: 2.9345, members: 702 };
const REGIONS = [['North', 800, 0.4], ['South', 626, 0.3], ['East', 383, 0.2], ['West', 191, 0.1]];
/* manifest --json: data.synth_distributions, today */
const DISTS = ['uniform', 'normal', 'lognormal', 'exponential', 'poisson', 'pareto', 'bernoulli', 'discrete', 'constant', 'monotonic_from',
  'weighted_categorical', 'uniform_date', 'regex', 'mixture', 'set_bernoulli'];
/* q-r-shop-*.out.json, q-r-cop-*.out.json, q-cop.out.json */
const COP = { indP: -0.013, indS: -0.019, p: 0.552, s: 0.587, spend0: 62.58, spend1: 62.30, age0: 42.19, age1: 41.94 };
/* cons.out.json, q-cons.out.json, consx.out.json */
const CONS = { rejected: 240, n: 2000, spendMin: 30.07, maxId: 2000, xAccepted: 73, xRejected: 10 };
/* rules.out.json, q-rules.out.json */
const RULES = { non: 1268, nonTier: 0, mem: 732, memTier: 732, vip: [146, 77] };
/* q-r-claim-pearson.out.json */
const CLAIM_R = 0.023;
/* lag.head.csv */
const LAG = [[0, 81.50, 81.50], [1, 32.22, 81.12], [2, 31.02, 79.69], [3, 7.37, 55.18], [4, 95.43, 128.54], [5, 40.01, 117.14], [6, 61.14, 131.42], [7, 25.91, 104.76]];
/* members.profile.json */
const PROF = { regions: [['North', 0.399], ['South', 0.308], ['East', 0.185], ['West', 0.108]], ageLevels: 60, spend: [67.47, 38.89, 13.54, 387.99], plan: [0.645, 0.355], rho: 0.452 };
/* topup.fidelity.json */
const FID = [['region', 'TEST_CHISQ', 'χ² 0.51', 0.917, false], ['age', 'TEST_KS', 'D 0.044', 0.539, false], ['spend', 'TEST_KS', 'D 0.162', 5.0e-8, true], ['plan', 'TEST_CHISQ', 'χ² 1.96', 0.161, false]];
const FIDPAIR = { src: 0.452, syn: 0.449, delta: 0.003, n: 500 };
/* shape.fidelity.json, shape.spec.json */
const SHAPE = { means: [55.8, 112.2], weights: [0.79, 0.21], d: 0.070, p: 0.076 };
/* determinism.sha256.txt, determinism.cmp.txt */
const SHA = [['shop.pulse', 'seed 22', '06be60d66da81e9bb177d10f81911422c6fcb6888718da60369a9e69b3af9f44'], ['shop2.pulse', 'seed 22', '06be60d66da81e9bb177d10f81911422c6fcb6888718da60369a9e69b3af9f44'],
  ['shop23.pulse', 'seed 23', 'e182ebffd45e111f73aa746512f963238f8fdc9ac435ce550caef98d64c53be9']];
const PSHA = 'b2ba503d141337a3547d9f380606c4ccf83b81a58e385d4bead5f4177b062651';

/* ---------- 0. title ---------- */
function sTitle(t) {
  for (let i = 0; i < 24; i++) {
    const u = eo(seg(t, 0.1 + i * 0.03, 0.6 + i * 0.03)), gen = i >= 16;
    A(u, () => R(376 + i * 22, 372, 18, 26, { fill: gen ? C.violetS : C.tealS, stroke: gen ? C.violet : C.teal, r: 2 }));
  }
  A(seg(t, 0.6, 1.4), () => {
    T('PULSE', 640, 300, { size: 96, weight: 800, stretch: 'expanded', align: 'center' });
    T('SYNTHETIC DATA', 640, 470, { size: 46, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
  });
  A(seg(t, 1.4, 2.2), () => T('Cohorts Pulse writes for itself, from a spec or from a profile', 640, 516, { size: 20, align: 'center', color: C.muted }));
}

/* ---------- 1. two modes ---------- */
function sModes(t) {
  A(seg(t, 0.2, 0.6), () => {
    CAP('pulse synth · WRITES A .pulse FILE, NOT A RESPONSE', 64, 112, { color: C.teal });
  });
  A(seg(t, 3.2, 3.6), () => {
    CAP('FROM-SCHEMA', 64, 150, { color: C.amber });
    box(64, 164, 230, 70, 'shop.json', 'a hand-written spec', C.amber);
    arrow(300, 199, 380, 199, { stroke: C.faint });
    box(386, 164, 300, 70, 'synth from-schema', '--spec · --seed · --rows', C.teal);
    arrow(692, 199, 772, 199, { stroke: C.faint });
    box(778, 164, 230, 70, 'shop.pulse', 'every row generated', C.violet);
    M('fixtures · demos', 1030, 192, { size: 12.5 });
    M('test seeds', 1030, 214, { size: 12.5 });
  });
  A(seg(t, 6.2, 6.6), () => {
    CAP('FROM-PROFILE', 64, 290, { color: C.amber });
    box(64, 304, 190, 70, 'members.pulse', 'a real cohort', C.teal);
    arrow(260, 339, 300, 339, { stroke: C.faint });
    box(306, 304, 190, 70, 'profile create', 'one scan', C.teal);
    arrow(502, 339, 542, 339, { stroke: C.faint });
    box(548, 304, 190, 70, 'profile.json', 'captured shape', C.amber);
    arrow(744, 339, 784, 339, { stroke: C.faint });
    box(790, 304, 190, 70, 'synth from-profile', '--source · --rows', C.teal, { size: 12.5 });
    arrow(986, 339, 1026, 339, { stroke: C.faint });
    R(1032, 304, 184, 70, { fill: C.panel, stroke: C.violet });
    R(1044, 316, 100, 20, { fill: C.tealS, stroke: C.teal, r: 2 }); R(1148, 316, 56, 20, { fill: C.violetS, stroke: C.violet, r: 2 });
    M('_synthetic 0 · 1', 1124, 360, { size: 11.5, align: 'center', color: C.violet });
    Ln([[159, 374], [159, 392], [1124, 392], [1124, 374]], { stroke: C.faint, dash: [4, 4] });
    M('the source is copied in, tagged; new rows are added', 760, 412, { size: 12, align: 'center' });
  });
  A(seg(t, 8.6, 9.0), () => {
    let x = 64;
    x += pill(x, 470, 'CLI · pulse synth', C.teal) + 10;
    x += pill(x, 470, 'library · Pulse.Synth', C.teal) + 10;
    pill(x, 470, 'MCP · no synth tool', C.coral);
  });
}

/* ---------- 2. a spec (shop.json, shop.out.json, shop.head.csv) ---------- */
function sSpec(t) {
  A(seg(t, 0.1, 0.4), () => CAP('shop.json · "row_count": 2000', 64, 112, { color: C.amber }));
  A(seg(t, 0.2, 0.5), () => card(64, 124, 720, 236, C.amber));
  A(seg(t, 0.3, 0.6), () => ['name', 'type', 'distribution', 'params'].forEach((h, i) => M(h, [84, 184, 324, 504][i], 150, { size: 11.5, color: C.muted })));
  SPEC.forEach(([n, ty, d, p], i) => A(seg(t, 0.4 + i * 0.12, 0.7 + i * 0.12), () => {
    const y = 178 + i * 25, hi = i === 0 && t > 6.4;
    M(n, 84, y, { size: 13, color: hi ? C.violet : C.ink }); M(ty, 184, y, { size: 12.5, color: C.teal }); M(d, 324, y, { size: 12.5, color: hi ? C.violet : C.amber }); M(p, 504, y, { size: 12 });
  }));
  A(seg(t, 3.4, 3.8), () => {
    CAP('ENVELOPE · --seed 22', 820, 112, { color: C.teal });
    card(820, 124, 396, 236, C.teal);
    M('rows_generated', 844, 172, { size: 13 }); big(fmt(SHOP.rows), 1192, 176, C.violet, { align: 'right', size: 30 });
    M('rows_rejected', 844, 232, { size: 13 }); big(String(SHOP.rejected), 1192, 236, C.ink, { align: 'right', size: 30 });
    M('output_path  shop.pulse', 844, 292, { size: 13, color: C.muted });
    M('errors []  warnings []', 844, 324, { size: 13, color: C.muted });
  });
  A(seg(t, 6.4, 6.8), () => {
    CAP('FIRST ROWS · export csv · rounded for display', 64, 398, { color: C.violet });
    card(64, 410, 1152, 176);
    const X = [84, 180, 320, 450, 580, 700, 840];
    ['id', 'region', 'age', 'spend', 'visits', 'member', 'joined'].forEach((h, i) => M(h, X[i], 434, { size: 11.5, color: C.muted }));
    HEAD.forEach((r, k) => r.forEach((v, i) => M(typeof v === 'number' && i !== 0 && i !== 4 ? f2(v) : String(v), X[i], 462 + k * 25, { size: 13, color: i === 0 ? C.violet : C.ink })));
    M('ids count accepted rows:', 1000, 462, { size: 12, color: C.violet }); M('monotonic_from draws', 1000, 486, { size: 12 }); M('no randomness', 1000, 508, { size: 12 });
  });
}

/* ---------- 3. read it back (q-shop, q-shop-region, q-shop-member .out.json) ---------- */
function sBack(t) {
  A(seg(t, 0.1, 0.4), () => CAP('REGION · AGG_COUNT BY region · tick = weight × 2,000', 64, 112, { color: C.teal }));
  REGIONS.forEach(([n, c, w], i) => A(seg(t, 0.3 + i * 0.15, 0.7 + i * 0.15), () => {
    const y = 136 + i * 52, sc = 0.62, bw = c * sc * eo(seg(t, 0.3 + i * 0.15, 1.2 + i * 0.15));
    M(n, 64, y + 24, { size: 13, color: C.ink });
    R(140, y + 4, bw, 30, { fill: C.violetS, stroke: C.violet, r: 2 });
    Ln([[140 + w * 2000 * sc, y - 2], [140 + w * 2000 * sc, y + 40]], { stroke: C.amber, lw: 2 });
    M(fmt(c), 150 + Math.max(c, w * 2000) * sc, y + 24, { size: 13, color: C.violet });
  }));
  A(seg(t, 3.6, 4.0), () => {
    CAP('THE OTHER FIELDS', 760, 112, { color: C.teal });
    card(760, 124, 456, 230, C.teal);
    const rows = [['age', `mean ${f2(BACK.age)}`, `min ${BACK.ageMin} · max ${BACK.ageMax}`, 'clamp 18–80'],
      ['visits', `mean ${f2(BACK.visits)}`, '', 'lambda 3'], ['member', `${BACK.members} of 2,000`, '35.1%', 'p 0.35'], ['spend', `mean ${f2(BACK.spend)}`, '', 'lognormal 4, 0.5']];
    rows.forEach(([n, a, b, tgt], k) => A(seg(t, 3.7 + k * 0.15, 4.0 + k * 0.15), () => {
      const y = 160 + k * 50;
      M(n, 780, y, { size: 13, color: C.ink }); M(a, 870, y, { size: 14, color: C.violet, weight: 600 }); if (b) M(b, 870, y + 20, { size: 12 });
      M(tgt, 1196, y, { size: 12, color: C.amber, align: 'right' });
    }));
  });
  A(seg(t, 6.6, 7.0), () => {
    R(64, 390, 1152, 90, { fill: C.panel, stroke: C.violet, dash: [6, 5] });
    T('Synth draws: a figure lands near its target, not on it.', 86, 428, { size: 18, weight: 600 });
    M('the seed fixes which draws you get', 86, 458, { size: 13, color: C.violet });
  });
}

/* ---------- 4. distributions (manifest synth_distributions, badparam.out.json) ---------- */
function sDists(t) {
  A(seg(t, 0.1, 0.4), () => CAP('SYNTH DISTRIBUTIONS TODAY · MORE ADDED OVER TIME', 64, 112, { color: C.amber }));
  chips(DISTS.map(s => [s, C.amber]), 64, 126, 1152, { t, at: 0.3, step: 0.07 });
  A(seg(t, 2.2, 2.6), () => M('your instance\'s list: the manifest\'s synth_distributions', 64, 216, { size: 12.5 }));
  const RULE = [['discrete', 'values strictly ascending', '+ optional weights'], ['mixture', 'two or more components', 'means · stds · weights'], ['set_bernoulli', 'options registered up front', 'the set\'s dictionary']];
  RULE.forEach(([n, a, b], i) => A(seg(t, 3.6 + i * 0.3, 4.0 + i * 0.3), () => {
    const x = 64 + i * 390;
    card(x, 244, 372, 104, C.amber);
    M(n, x + 18, 274, { size: 14.5, color: C.amber, weight: 600 }); M(a, x + 18, 302, { size: 13, color: C.ink }); M(b, x + 18, 326, { size: 12 });
  }));
  A(seg(t, 6.8, 7.2), () => {
    CAP('badparam.json · THE SPEC IS STRICT', 64, 390, { color: C.coral });
    code(t, 64, 402, 420, [['{"name": "visits", "type": "u8",'], [' "distribution": "poisson",'], [' "params": {"rate": 3}}', C.coral]], { at: 6.8, size: 13 });
    arrow(500, 452, 560, 452, { stroke: C.coral });
    card(576, 402, 640, 120, C.coral);
    M('PULSE_REQUEST_UNKNOWN_FIELD', 596, 432, { size: 14, color: C.coral, weight: 600 });
    M('path  fields[4].params.rate', 596, 460, { size: 13, color: C.ink });
    M('did you mean "lambda"?  valid keys: lambda', 596, 486, { size: 13, color: C.ink });
    M('refused, never ignored', 596, 510, { size: 12 });
  });
}

/* ---------- 5. the copula (q-r-shop-*, q-r-cop-*, q-cop, coppois, copgap .out.json) ---------- */
function sCopula(t) {
  A(seg(t, 0.1, 0.5), () => {
    CAP('shop · NO correlations', 64, 112, { color: C.teal });
    card(64, 124, 340, 120);
    M('age ~ spend', 84, 154, { size: 13 });
    M('Spearman ρ', 84, 188, { size: 13 }); big(f3(COP.indS), 384, 192, C.ink, { align: 'right', size: 24 });
    M('Pearson r', 84, 224, { size: 13 }); big(f3(COP.indP), 384, 228, C.ink, { align: 'right', size: 24 });
  });
  A(seg(t, 3.2, 3.6), () => {
    CAP('cop.json · "correlations": [{"a": "age", "b": "spend", "rho": 0.6}]', 440, 112, { color: C.amber });
    box(440, 136, 230, 92, 'correlated normals', 'u_age, u_spend · Cholesky', C.teal);
    arrow(676, 182, 710, 182, { stroke: C.faint });
    box(716, 136, 220, 92, 'p = Φ(u)', 'a probability in (0, 1)', C.teal);
    arrow(942, 182, 976, 182, { stroke: C.faint });
    R(982, 136, 234, 92, { fill: C.panel, stroke: C.violet });
    M('each field\'s own Q(p)', 1099, 164, { size: 13.5, color: C.violet, align: 'center', weight: 600 });
    M('age: normal', 1099, 190, { size: 12, align: 'center' }); M('spend: lognormal', 1099, 210, { size: 12, align: 'center' });
    M('a Gaussian copula', 440, 252, { size: 12.5, color: C.teal });
  });
  A(seg(t, 7.0, 7.4), () => {
    CAP('cop · rho 0.6', 64, 290, { color: C.violet });
    card(64, 302, 560, 156, C.violet);
    M('Spearman ρ', 84, 342, { size: 13 }); big(f3(COP.s), 380, 348, C.violet, { align: 'right', size: 30 });
    M('Pearson r', 84, 392, { size: 13 }); big(f3(COP.p), 380, 398, C.violet, { align: 'right', size: 30 });
    M('the copula targets rank', 400, 342, { size: 12 }); M('correlation; Pearson\'s r', 400, 362, { size: 12 }); M('runs lower on a lognormal', 400, 382, { size: 12 });
    M('a draw: near 0.6, not on it', 84, 438, { size: 12 });
    CAP('MARGINALS KEPT · AGG_AVERAGE', 660, 290, { color: C.teal });
    card(660, 302, 556, 156, C.teal);
    M('', 680, 330); M('shop', 920, 330, { size: 11.5, align: 'right' }); M('cop', 1060, 330, { size: 11.5, align: 'right' });
    M('spend', 680, 370, { size: 13 }); M(f2(COP.spend0), 920, 370, { size: 16, color: C.ink, align: 'right' }); M(f2(COP.spend1), 1060, 370, { size: 16, color: C.violet, align: 'right' });
    M('age', 680, 410, { size: 13 }); M(f2(COP.age0), 920, 410, { size: 16, color: C.ink, align: 'right' }); M(f2(COP.age1), 1060, 410, { size: 16, color: C.violet, align: 'right' });
    M('each field keeps its own distribution', 680, 442, { size: 12 });
  });
  A(seg(t, 10.2, 10.6), () => {
    card(64, 480, 560, 104, C.coral);
    M('coppois.json · age ~ visits (poisson)', 84, 508, { size: 12.5 });
    M('SERVICE_VALIDATION', 84, 536, { size: 14, color: C.coral, weight: 600 });
    M('"poisson" does not support pairwise correlation', 84, 562, { size: 12.5, color: C.ink });
    card(660, 480, 556, 104, C.coral);
    M('copgap.json · 3 fields, 2 pairs named', 680, 508, { size: 12.5 });
    M('warning · matrix completed by assumption', 680, 536, { size: 13.5, color: C.coral, weight: 600 });
    M('the missing pair is drawn independent (rho = 0)', 680, 562, { size: 12.5, color: C.ink });
  });
}

/* ---------- 6. constraints (cons.out.json, q-cons.out.json, consx.out.json) ---------- */
function sCons(t) {
  A(seg(t, 0.1, 0.4), () => CAP('cons.json · REJECT AND REDRAW', 64, 112, { color: C.amber }));
  code(t, 64, 124, 440, [['"constraints": [', C.muted], ['  {"expr": "spend >= 30"}', C.amber], [']', C.muted]], { at: 0.2 });
  A(seg(t, 0.8, 1.2), () => {
    box(560, 124, 170, 62, 'draw a row', '', C.teal);
    arrow(736, 155, 790, 155, { stroke: C.faint });
    box(796, 124, 170, 62, 'spend >= 30 ?', '', C.amber);
    arrow(972, 155, 1026, 155, { stroke: C.teal }); M('yes', 999, 146, { size: 11.5, align: 'center', color: C.teal });
    box(1032, 124, 184, 62, 'accept · row n', '', C.violet);
    Ln([[881, 186], [881, 220], [645, 220]], { stroke: C.coral }); arrow(645, 220, 645, 192, { stroke: C.coral });
    M('no: redraw at the same row number', 763, 238, { size: 11.5, align: 'center', color: C.coral });
  });
  A(seg(t, 1.6, 2.0), () => {
    card(64, 284, 440, 120, C.teal);
    M('rows_generated', 84, 326, { size: 13 }); big(fmt(SHOP.rows), 484, 330, C.violet, { align: 'right', size: 26 });
    M('rows_rejected', 84, 374, { size: 13 }); big(String(CONS.rejected), 484, 378, C.coral, { align: 'right', size: 26 });
  });
  A(seg(t, 3.4, 3.8), () => {
    CAP('q-cons · READ BACK', 560, 274, { color: C.teal });
    card(560, 284, 656, 120, C.teal);
    [['rows', fmt(CONS.n)], ['lowest spend', f2(CONS.spendMin)], ['highest id', fmt(CONS.maxId)]].forEach(([a, b], i) => {
      const x = 580 + i * 212; M(a, x, 318, { size: 12 }); big(b, x, 360, C.violet, { size: 26 });
    });
    M('no gaps: the counter counts accepted rows', 580, 390, { size: 12 });
  });
  A(seg(t, 6.4, 6.8), () => {
    CAP('consx.json · "max_rejection_rate": 0.1', 64, 440, { color: C.coral });
    card(64, 452, 1152, 112, C.coral);
    M('PULSE_SYNTH_CONSTRAINT_INFEASIBLE', 84, 486, { size: 15, color: C.coral, weight: 600 });
    M(`rejection rate exceeded threshold · ${CONS.xAccepted} accepted, ${CONS.xRejected} rejected · threshold 0.1`, 84, 516, { size: 13, color: C.ink });
    M('no consx.pulse is written', 84, 544, { size: 12.5 });
  });
}

/* ---------- 7. rules (rules.json, rules.out.json, q-rules.out.json, rulesbad.out.json) ---------- */
function sRules(t) {
  A(seg(t, 0.1, 0.4), () => CAP('rules.json · "rules": [ … ]', 64, 112, { color: C.amber }));
  code(t, 64, 124, 560, [
    ['0  {"when": "member == 0", "set_null": ["tier"]}', C.ink],
    ['1  {"set_expr": {"vip": "spend > 100"}}', C.ink],
    ['2  {"when": "age > 90", "set": {"tier": "gold"}}', C.ink]], { at: 0.2, size: 13 });
  A(seg(t, 0.6, 1.0), () => {
    CAP('RULE SLOTS', 660, 112, { color: C.amber });
    [['when', 'which rows (absent: every row)'], ['set', 'writes a literal'], ['set_expr', 'writes an expression'], ['set_null', 'masks a field'], ['null_together', 'nulls a block at once']]
      .forEach(([a, b], i) => { M(a, 660, 146 + i * 22, { size: 13, color: C.amber }); M(b, 800, 146 + i * 22, { size: 12.5 }); });
  });
  A(seg(t, 3.4, 3.8), () => {
    M('run last · declaration order · last write wins', 64, 268, { size: 12.5, color: C.teal });
    CAP('q-rules · AGG_COUNT BY member', 64, 300, { color: C.teal });
    card(64, 312, 560, 132, C.teal);
    ['member', 'rows', 'tier present', 'vip true'].forEach((h, i) => M(h, [84, 210, 330, 480][i], 340, { size: 11.5, color: C.muted }));
    [['0', RULES.non, RULES.nonTier, RULES.vip[0]], ['1', RULES.mem, RULES.memTier, RULES.vip[1]]].forEach(([m, n, tr, v], k) => {
      const y = 374 + k * 34;
      M(m, 84, y, { size: 14, color: C.ink }); M(fmt(n), 210, y, { size: 14, color: C.ink });
      M(fmt(tr), 330, y, { size: 14, color: tr === 0 ? C.coral : C.violet, weight: 600 });
      A(seg(t, 7.0, 7.4), () => M(fmt(v), 480, y, { size: 14, color: C.violet, weight: 600 }));
    });
  });
  A(seg(t, 7.0, 7.4), () => {
    M(`vip: ${RULES.vip[0]} + ${RULES.vip[1]} = ${RULES.vip[0] + RULES.vip[1]} rows`, 660, 340, { size: 13, color: C.violet });
    card(660, 356, 556, 88, C.coral);
    M('warning · rule 2 never fired', 680, 384, { size: 14, color: C.coral, weight: 600 });
    M('when "age > 90" was true on 0 of 2000 generated row(s)', 680, 410, { size: 12.5, color: C.ink });
    M('it reads "age" (f64, normal)', 680, 432, { size: 12 });
  });
  A(seg(t, 10.0, 10.4), () => {
    CAP('rulesbad.json · {"when": "member == 0", "set_null": ["region"]}', 64, 486, { color: C.coral });
    card(64, 498, 1152, 86, C.coral);
    M('PULSE_SYNTH_RULE_FIELD_NOT_NULLABLE', 84, 530, { size: 15, color: C.coral, weight: 600 });
    M('rule 0 · slot set_null · field region · refused at spec parse, before any row is drawn', 84, 560, { size: 13, color: C.ink });
  });
}

/* ---------- 8. who claims a field (claim.json, claim.out.json, q-r-claim-pearson.out.json) ---------- */
function sClaims(t) {
  A(seg(t, 0.1, 0.4), () => CAP('THE CLAIM ORDER · SETTLED ONCE, BEFORE GENERATION', 64, 112, { color: C.amber }));
  const ORDER = ['structural rule', 'linear model', 'shape fit', 'categorical pairs', 'cat-numeric pairs', 'set pairs', 'correlations'];
  let x = 64;
  ORDER.forEach((s, i) => {
    const w = measure(s, { font: MONO, size: 12.5 }) + 22, last = i === ORDER.length - 1, first = i === 0, x0 = x;
    x += w + 22;
    A(seg(t, 0.3 + i * 0.25, 0.7 + i * 0.25), () => {
    const x = x0;
    R(x, 130, w, 30, { fill: C.panel2, stroke: first ? C.violet : last ? C.teal : C.amber, r: 15 });
    M(s, x + 11, 150, { size: 12.5, color: first ? C.violet : last ? C.teal : C.amber });
    if (!last) arrow(x + w + 3, 145, x + w + 17, 145, { stroke: C.faint, head: 5 });
    });
  });
  A(seg(t, 2.4, 2.8), () => M('first claim wins · every later claimant is dropped and reported', 64, 190, { size: 12.5, color: C.ink }));
  A(seg(t, 3.6, 4.0), () => {
    CAP('claim.json', 64, 236, { color: C.amber });
  });
  code(t, 64, 248, 560, [['"correlations": [{"a": "age", "b": "spend", "rho": 0.6}],', C.ink], ['"rules": [{"set_expr": {"spend": "visits * 15 + 10"}}]', C.violet]], { at: 3.7, size: 13 });
  A(seg(t, 4.4, 4.8), () => {
    card(660, 236, 556, 136, C.coral);
    M('warning · conditional relationship conflict', 680, 266, { size: 13.5, color: C.coral, weight: 600 });
    M('field "spend" is already claimed by', 680, 294, { size: 12.5, color: C.ink });
    M('structural rule 0 (set_expr); dropping pairwise', 680, 316, { size: 12.5, color: C.ink });
    M('correlation (excluding this field; remaining', 680, 338, { size: 12.5, color: C.ink });
    M('participants still correlate)', 680, 360, { size: 12.5, color: C.ink });
  });
  A(seg(t, 6.8, 7.2), () => {
    CAP('q-r-claim-pearson · MAT_CORRELATION', 64, 410, { color: C.teal });
    card(64, 422, 560, 110, C.teal);
    M('age ~ spend · Pearson r', 84, 458, { size: 13 }); big(f3(CLAIM_R), 604, 466, C.violet, { align: 'right', size: 32 });
    M('the rule\'s spend, not the copula\'s', 84, 510, { size: 12 });
    R(660, 422, 556, 110, { fill: C.panel, stroke: C.violet, dash: [6, 5] });
    T('Reported, never silently overwritten.', 682, 468, { size: 18, weight: 600 });
    M('a rule with a when, or one reading its own field, claims nothing', 682, 500, { size: 12 });
  });
}

/* ---------- 9. earlier rows (lag.json, lag.head.csv) ---------- */
function sLag(t) {
  A(seg(t, 0.1, 0.4), () => CAP('lag.json · 104 ROWS, ONE A WEEK', 64, 112, { color: C.amber }));
  code(t, 64, 124, 560, [['"rules": [', C.muted], ['  {"set_expr": {"week": "row()"}},', C.ink], ['  {"set_expr": {"stock":', C.ink], ['     "spend + 0.6 * lag(\\"stock\\", 1, 0)"}}', C.violet], [']', C.muted]], { at: 0.2, size: 13 });
  A(seg(t, 3.2, 3.6), () => {
    [['row()', 'the accepted row\'s number, from 0'], ['lag("f", n, d)', 'f, n accepted rows back; d before row n'], ['', 'a lagged null stays null']].forEach(([a, b], i) => {
      M(a, 64, 290 + i * 26, { size: 13, color: C.violet }); M(b, 220, 290 + i * 26, { size: 12.5 });
    });
  });
  A(seg(t, 0.6, 1.0), () => {
    CAP('lag.head.csv · rounded for display', 700, 112, { color: C.violet });
    card(700, 124, 516, 248);
    ['week', 'spend', 'stock'].forEach((h, i) => M(h, [740, 900, 1080][i], 150, { size: 11.5, color: C.muted, align: 'right' }));
  });
  LAG.forEach(([w, s, st], k) => A(seg(t, 0.8 + k * 0.1, 1.1 + k * 0.1), () => {
    const y = 176 + k * 24, hi = k === 1 && t > 7.0;
    M(String(w), 740, y, { size: 13, color: C.ink, align: 'right' }); M(f2(s), 900, y, { size: 13, color: hi ? C.amber : C.ink, align: 'right' });
    M(f2(st), 1080, y, { size: 13, color: hi || (k === 0 && t > 7.0) ? C.violet : C.ink, align: 'right' });
  }));
  A(seg(t, 7.0, 7.4), () => {
    arrow(1100, 172, 1100, 196, { stroke: C.violet, head: 5 }); M('× 0.6', 1110, 188, { size: 11.5, color: C.violet });
    card(64, 396, 1152, 72, C.violet);
    M(`week 1:  ${f2(LAG[1][1])} + 0.6 × ${f2(LAG[0][2])} = ${f2(LAG[1][2])}`, 84, 440, { size: 17, color: C.violet, weight: 600 });
  });
  A(seg(t, 8.6, 9.0), () => {
    let x = 64;
    x += pill(x, 494, 'no randomness drawn', C.teal) + 10;
    x += pill(x, 494, 'rows never shuffled', C.teal) + 10;
    pill(x, 494, 'profile capture ignores lag: write it by hand', C.amber);
  });
}

/* ---------- 10. profile and top-up (members.profile.json, topup.out.json, q-topup.out.json, collide.out.json) ---------- */
function sProfile(t) {
  A(seg(t, 0.1, 0.4), () => {
    CAP('generate.js · seed 22', 64, 112, { color: C.teal });
    box(64, 124, 220, 70, 'members.pulse', '1,000 rows · 4 fields', C.teal);
    arrow(290, 159, 392, 159, { stroke: C.faint });
    M('profile create', 341, 148, { size: 11.5, align: 'center' });
  });
  A(seg(t, 0.6, 1.0), () => {
    CAP('members.profile.json', 400, 112, { color: C.amber });
    card(400, 124, 816, 200, C.amber);
    const rows = [['region', 'categorical', PROF.regions.map(([n, w]) => n + ' ' + w.toFixed(3)).join(' · ')], ['age', 'small integer', `a histogram: ${PROF.ageLevels} levels`],
      ['spend', 'numeric', `mean ${f2(PROF.spend[0])} · std ${f2(PROF.spend[1])} · ${f2(PROF.spend[2])} … ${f2(PROF.spend[3])}`], ['plan', 'categorical', `basic ${PROF.plan[0].toFixed(3)} · plus ${PROF.plan[1].toFixed(3)}`],
      ['pairwise', 'strongest |rho|', `age ~ spend ${f3(PROF.rho)}`]];
    rows.forEach(([a, b, c], i) => A(seg(t, 0.8 + i * 0.25, 1.1 + i * 0.25), () => {
      const y = 158 + i * 34;
      M(a, 420, y, { size: 13, color: C.ink }); M(b, 520, y, { size: 12 }); M(c, 666, y, { size: 13, color: C.amber });
    }));
  });
  A(seg(t, 3.6, 4.0), () => {
    CAP('synth from-profile --source members.pulse --rows 500 → topup.pulse', 64, 362, { color: C.teal });
    const W = 1152, src = W * 1000 / 1500;
    R(64, 376, src * eo(seg(t, 3.6, 4.4)), 50, { fill: C.tealS, stroke: C.teal, r: 3 });
    A(seg(t, 4.2, 4.6), () => R(64 + src + 4, 376, (W - src - 4) * eo(seg(t, 4.2, 5.0)), 50, { fill: C.violetS, stroke: C.violet, r: 3 }));
    A(seg(t, 4.4, 4.8), () => {
      M('1,000 source rows · copied through · _synthetic false', 84, 406, { size: 13, color: C.teal });
      M('500 new · _synthetic true', 64 + src + 20, 406, { size: 13, color: C.violet });
      M('q-topup: AGG_COUNT by _synthetic → 1,000 and 500 · 1,500 rows in all', 64, 450, { size: 12.5 });
    });
  });
  A(seg(t, 7.2, 7.6), () => {
    card(64, 478, 1152, 96, C.coral);
    M('collide · --output members.pulse, the same path as --source', 84, 506, { size: 12.5 });
    M('PULSE_SYNTH_OUTPUT_COLLISION', 84, 534, { size: 15, color: C.coral, weight: 600 });
    M('the source is never opened for write', 84, 560, { size: 12.5, color: C.ink });
  });
}

/* ---------- 11. fidelity report (topup.fidelity.json, shape.fidelity.json, shape.spec.json) ---------- */
function sFidelity(t) {
  A(seg(t, 0.1, 0.4), () => CAP('--fidelity-report topup.fidelity.json · 1,000 source vs 500 synthetic', 64, 112, { color: C.teal }));
  A(seg(t, 0.2, 0.5), () => {
    card(64, 124, 680, 220, C.teal);
    ['field', 'test', 'statistic', 'p', ''].forEach((h, i) => M(h, [84, 184, 344, 494, 620][i], 152, { size: 11.5, color: C.muted }));
  });
  FID.forEach(([f, test, stat, p, rej], k) => A(seg(t, 0.5 + k * 0.2, 0.8 + k * 0.2), () => {
    const y = 186 + k * 34, show = !rej || t > 3.6, col = rej && t > 3.6 ? C.coral : C.ink;
    M(f, 84, y, { size: 13.5, color: col }); M(test, 184, y, { size: 12.5, color: C.muted });
    M(stat, 344, y, { size: 13.5, color: col }); M(p < 0.001 ? p.toExponential(1) : f3(p), 494, y, { size: 13.5, color: col });
    if (show) M(rej ? 'rejects' : 'passes', 620, y, { size: 13, color: rej ? C.coral : C.teal, weight: 600 });
  }));
  A(seg(t, 4.6, 5.0), () => {
    M('spend was rebuilt as a clamped normal; the source is skewed', 84, 330, { size: 12, color: C.coral });
    CAP('pairwise', 64, 380, { color: C.violet });
    card(64, 392, 680, 76, C.violet);
    M('age ~ spend', 84, 436, { size: 13 }); M(`source ${f3(FIDPAIR.src)}`, 234, 436, { size: 14, color: C.ink }); M(`synthetic ${f3(FIDPAIR.syn)}`, 404, 436, { size: 14, color: C.violet, weight: 600 }); M(`delta ${f3(FIDPAIR.delta)}`, 604, 436, { size: 13 });
  });
  A(seg(t, 7.4, 7.8), () => {
    CAP('profile create --fit-shape · shape.fidelity.json', 780, 112, { color: C.amber });
    card(780, 124, 436, 220, C.amber);
    M('spend → mixture', 800, 156, { size: 14, color: C.amber, weight: 600 });
    M(`means ${SHAPE.means[0]} · ${SHAPE.means[1]}`, 800, 184, { size: 12.5 }); M(`weights ${SHAPE.weights[0]} · ${SHAPE.weights[1]}`, 800, 206, { size: 12.5 });
    M('spend · TEST_KS', 800, 248, { size: 12.5, color: C.muted });
    M(`D ${f3(SHAPE.d)}   p ${f3(SHAPE.p)}`, 800, 276, { size: 14, color: C.ink }); M('passes', 1196, 276, { size: 13, color: C.teal, weight: 600, align: 'right' });
    M('no pairwise section in this report', 800, 322, { size: 12, color: C.coral });
  });
  A(seg(t, 8.6, 9.0), () => {
    card(780, 392, 436, 124, C.coral);
    M('warning · conditional relationship conflict', 800, 420, { size: 13, color: C.coral, weight: 600 });
    M('field "spend" is already claimed by', 800, 446, { size: 12, color: C.ink });
    M('captured shape (--fit-shape);', 800, 466, { size: 12, color: C.ink });
    M('dropping pairwise correlation', 800, 486, { size: 12, color: C.ink });
    M('scored only what generation applied', 64, 500, { size: 13, color: C.ink });
  });
}

/* ---------- 12. same seed, same bytes (determinism.sha256.txt, determinism.cmp.txt) ---------- */
function sSeed(t) {
  A(seg(t, 0.1, 0.4), () => CAP('shasum -a 256 · synth from-schema -s shop.json', 64, 112, { color: C.teal }));
  A(seg(t, 0.2, 0.5), () => card(64, 124, 1152, 150));
  SHA.forEach(([f, s, h], k) => A(seg(t, k < 2 ? 0.4 + k * 0.5 : 3.4, k < 2 ? 0.8 + k * 0.5 : 3.8), () => {
    const y = 162 + k * 40, same = k < 2;
    M(f, 84, y, { size: 13.5, color: C.ink }); M(s, 230, y, { size: 13, color: C.amber });
    M(h, 330, y, { size: 13.5, color: same ? C.violet : C.muted });
  }));
  A(seg(t, 1.6, 2.0), () => { M('byte-identical · cmp: no difference', 1196, 202, { size: 12.5, color: C.violet, align: 'right' }); });
  A(seg(t, 3.6, 4.0), () => M('differs at byte 56', 1196, 242, { size: 12.5, align: 'right' }));
  A(seg(t, 4.2, 4.6), () => {
    let x = 64;
    x += pill(x, 296, 'seeds one apart: uncorrelated streams', C.teal) + 10;
    x += pill(x, 296, 'seed 0: a fixed seed, not "random"', C.teal) + 10;
    pill(x, 296, 'rules and lag draw nothing', C.teal);
  });
  A(seg(t, 6.4, 6.8), () => {
    CAP('profile create -i members.pulse --seed 22 · twice', 64, 366, { color: C.amber });
    card(64, 378, 1152, 112, C.amber);
    M('members.profile.json', 84, 414, { size: 13.5, color: C.ink }); M(PSHA, 330, 414, { size: 13.5, color: C.violet });
    M('members.profile2.json', 84, 452, { size: 13.5, color: C.ink }); M(PSHA, 330, 452, { size: 13.5, color: C.violet });
  });
  A(seg(t, 7.6, 8.0), () => {
    R(64, 512, 1152, 70, { fill: C.panel, stroke: C.violet, dash: [6, 5] });
    T('Same spec and seed, same file. Same cohort and seed, same profile.', 86, 554, { size: 18, weight: 600 });
  });
}

/* ---------- 13. how this series' cohorts are made ---------- */
function sSeries(t) {
  A(seg(t, 0.1, 0.4), () => CAP('THE COHORTS IN THIS SERIES', 64, 112, { color: C.teal }));
  A(seg(t, 0.4, 0.8), () => {
    box(64, 130, 300, 74, 'films/NN-<topic>/data/', 'generate.js · a fixed seed', C.teal);
    arrow(370, 167, 420, 167, { stroke: C.faint });
    box(426, 130, 240, 74, 'a .csv cohort', 'committed', C.teal);
    arrow(672, 167, 722, 167, { stroke: C.faint });
    box(728, 130, 200, 74, 'pulse import', 'csv → .pulse', C.teal);
    M('or a small hand-written CSV', 64, 230, { size: 12.5 });
    pill(960, 154, 'not pulse synth', C.coral);
  });
  A(seg(t, 3.4, 3.8), () => {
    card(64, 262, 1152, 88, C.amber);
    M('build/pyrandom.js', 84, 294, { size: 14, color: C.amber, weight: 600 });
    M('a port of Python\'s random module: every generated cohort rebuilds byte for byte', 84, 324, { size: 13, color: C.ink });
  });
  A(seg(t, 6.6, 7.0), () => {
    CAP('SYNTH CAN MAKE THE SAME KIND OF COHORT', 64, 392, { color: C.violet });
    const W = 700, src = W * 1000 / 1500;
    R(64, 406, src, 44, { fill: C.tealS, stroke: C.teal, r: 3 }); R(68 + src, 406, W - src - 4, 44, { fill: C.violetS, stroke: C.violet, r: 3 });
    M('members: generate.js, seed 22', 80, 433, { size: 12.5, color: C.teal }); M('+ 500 from Pulse', 80 + src, 433, { size: 12.5, color: C.violet });
    M('this film', 64, 472, { size: 12 });
    card(800, 406, 416, 80, C.violet);
    M('the brand tracker case study', 820, 436, { size: 13, color: C.ink });
    M('pulse synth from-schema, from a spec', 820, 464, { size: 12.5, color: C.violet });
  });
}

/* ---------- 14. recap ---------- */
function sRecap(t) {
  const end = seg(t, 8.6, 9.4);
  A(1 - end, () => {
    CAP('SYNTH TODAY', 64, 124, { color: C.violet });
    [['TWO MODES', 'from-schema · from-profile · _synthetic · --rows'], ['SHAPE', 'distributions · correlations · the copula'], ['STRUCTURE', 'constraints · rules · row() · lag()'],
     ['CHECKS', 'claims · warnings · refusals · fidelity report'], ['DETERMINISM', 'same spec + seed → same bytes']].forEach(([h, ops], k) => A(seg(t, 0.2 + k * 0.4, 0.6 + k * 0.4), () => {
      const y = 146 + k * 46; M(h, 64, y + 17, { size: 11.5, color: C.muted, weight: 600 }); chips(ops.split(' · ').map(o => [o, k === 3 ? C.coral : k === 4 ? C.violet : k === 1 ? C.amber : C.teal]), 300, y, 916, { size: 12 });
    }));
    A(seg(t, 3.6, 4.0), () => {
      R(64, 400, 1152, 66, { fill: C.panel, stroke: C.coral, dash: [6, 5] }); M('not private', 82, 428, { size: 14, color: C.coral, weight: 600 });
      T('a profile reveals the source\'s distributions: add calibrated noise for sensitive data', 82, 452, { size: 14.5 });
    });
    A(seg(t, 6.6, 7.0), () => {
      R(64, 484, 1152, 66, { fill: C.panel, stroke: C.amber, dash: [6, 5] }); M('+ more distributions over time', 82, 512, { size: 14, color: C.amber, weight: 600 });
      T('the manifest\'s synth_distributions lists what your instance offers', 82, 536, { size: 14.5 });
    });
  });
  A(seg(t, 9.2, 10.0), () => {
    T('PULSE', 640, 300, { size: 92, weight: 800, stretch: 'expanded', align: 'center' });
    T('SYNTHETIC DATA', 640, 372, { size: 44, weight: 800, stretch: 'expanded', align: 'center', color: C.violet });
    M('a spec or a profile in, the same bytes out', 640, 430, { size: 15, align: 'center' });
    M('next: embedding Pulse', 640, 470, { size: 14, align: 'center', color: C.faint });
  });
}

/* ---------- scenes + script ---------- */
const NARR = /*NARR*/[2.795, 6.229, 2.56, 4.117, 5.099, 5.568, 3.883, 4.843, 4.736, 8.171, 3.349, 10.752, 9.408, 5.099, 5.248, 11.968, 11.733, 5.483, 8.085, 6.357, 5.888, 7.595, 7.211, 6.421, 5.76, 7.979, 4.992, 6.891, 4.821, 8.256, 4.885, 3.584, 9.259, 7.509, 5.035, 6.912, 10.987, 8.619, 6.528, 5.291, 3.307, 7.147, 5.333, 10.069, 9.152, 7.616, 7.168, 1.643]/*END*/;
PulseFilm.mount({
  series: 'PULSE · SYNTHETIC DATA',
  title: 'Pulse: Synthetic Data',
  narr: NARR,
  scenes: [
    { name: 'Pulse: Synthetic Data', dur: 2.4, draw: sTitle, caps: [
      [0, '', 'Synthetic data, from a spec or from a profile.', true]] },
    { name: 'Two modes', dur: 10, draw: sModes, caps: [
      [0, 'Pulse can write a cohort as well as read one. pulse synth writes a .pulse file, and it has two modes.',
        'Pulse can write a cohort as well as read one. Pulse synth writes a dot pulse file, and it has two modes.'],
      [3.2, 'From-schema takes a spec you write by hand.', 'From schema takes a spec you write by hand.'],
      [6.2, 'From-profile tops up a real cohort with new rows, each one tagged.', 'From profile tops up a real cohort with new rows, each one tagged.'],
      [8.6, 'Both run from the CLI or the library. There is no MCP tool for synth.',
        'Both run from the command line or the library. There is no M C P tool for synth.']] },
    { name: 'A spec', dur: 9.4, draw: sSpec, caps: [
      [0, 'Here is a spec: 2,000 rows and seven fields, each with a type and a distribution.',
        'Here is a spec: two thousand rows and seven fields, each with a type and a distribution.'],
      [3.4, 'Seed 22: 2,000 rows generated, none rejected.', 'Seed twenty-two: two thousand rows generated, none rejected.'],
      [6.4, 'The ids come from a counter that ignores the random stream: clean primary keys.']] },
    { name: 'Read it back', dur: 9.4, draw: sBack, caps: [
      [0, 'Read the file back with ordinary requests. The regions land near their weights.'],
      [3.6, 'Age stays inside its clamp. Visits average 2.93 against a lambda of 3, and 35 percent of rows are members.',
        'Age stays inside its clamp. Visits average two point nine three against a lambda of three, and thirty-five percent of rows are members.'],
      [6.6, 'Synth draws, so a figure lands near its target, not on it.']] },
    { name: 'Distributions', dur: 10.2, draw: sDists, caps: [
      [0, 'Today\'s distributions include normal, lognormal, Poisson, Bernoulli, categories, dates, regex and mixtures. More are added over time, and the manifest lists them.'],
      [3.6, 'Some carry rules you cannot guess: discrete values ascend, a mixture needs two or more components, and set Bernoulli registers its options up front.'],
      [6.8, 'The spec is strict: rate on a Poisson field is refused, and lambda is suggested.']] },
    { name: 'The copula', dur: 13, draw: sCopula, caps: [
      [0, 'Fields are drawn independently by default: age and spend correlate at about zero.'],
      [3.2, 'A correlations entry names a pair and a rho. Pulse draws correlated normals, turns them into probabilities, and reads each through its field\'s own quantile function: a Gaussian copula.'],
      [7.0, 'Each field keeps its own distribution. The rank correlation lands near 0.59; Pearson\'s r is lower, near 0.55, because spend is lognormal.',
        'Each field keeps its own distribution. The rank correlation lands near zero point five nine; Pearson\'s r is lower, near zero point five five, because spend is lognormal.'],
      [10.2, 'A Poisson field cannot join. And a pair you leave out is drawn independent, with a warning.']] },
    { name: 'Constraints', dur: 9.4, draw: sCons, caps: [
      [0, 'A constraint rejects a row, and the generator redraws it. Requiring spend of at least 30 rejects 240 draws.',
        'A constraint rejects a row, and the generator redraws it. Requiring spend of at least thirty rejects two hundred and forty draws.'],
      [3.4, 'The file still holds 2,000 rows, and the ids have no gaps: the counter counts accepted rows.',
        'The file still holds two thousand rows, and the ids have no gaps: the counter counts accepted rows.'],
      [6.4, 'Cap the rejection rate at ten percent, and the run fails as infeasible. No file is written.']] },
    { name: 'Rules', dur: 13, draw: sRules, caps: [
      [0, 'Rules act on a drawn row. When picks the rows. Set writes a literal, set_expr an expression, and set_null masks a field.',
        'Rules act on a drawn row. When picks the rows. Set writes a literal, set expr an expression, and set null masks a field.'],
      [3.4, 'Rules run last, in order, and the last write wins. Here every non-member loses their tier, and every member keeps one.'],
      [7.0, 'vip is derived from spend. A rule that never fires, here ages over 90, gets a warning.',
        'V I P is derived from spend. A rule that never fires, here ages over ninety, gets a warning.'],
      [10.0, 'Rules are checked before any row is drawn: nulling a field that is not nullable is refused.']] },
    { name: 'Who claims a field', dur: 10, draw: sClaims, caps: [
      [0, 'When relationships name the same field, Pulse settles them once, in a fixed order: rules, models, shapes, pairs, then correlations.'],
      [3.6, 'This rule sets spend on every row, so it claims spend ahead of the copula, with a warning.'],
      [6.8, 'Age and spend now correlate at 0.02. The first claim wins, and every loser is reported.',
        'Age and spend now correlate at zero point zero two. The first claim wins, and every loser is reported.']] },
    { name: 'Earlier rows', dur: 10.4, draw: sLag, caps: [
      [0, 'Rows are generated in order and never shuffled, so a rule can read earlier rows.'],
      [3.2, 'row() gives the row\'s number, and lag reads a field n rows back. Here stock carries 60 percent of last week\'s stock: an adstock.',
        'Row gives the row\'s number, and lag reads a field n rows back. Here stock carries sixty percent of last week\'s stock: an adstock.'],
      [7.0, 'Week one: 32.22, plus 0.6 times 81.50.', 'Week one: thirty-two point two two, plus point six times eighty-one point five.'],
      [8.6, 'Neither draws randomness, and a profile never captures them.']] },
    { name: 'Profile and top-up', dur: 10, draw: sProfile, caps: [
      [0, 'Profile create reads a real cohort: shares for categories, histograms for small integers, moments for the rest, and the strongest correlations.'],
      [3.6, 'From-profile adds 500 rows. The source is copied through, tagged _synthetic false, and the new rows are tagged true.',
        'From profile adds five hundred rows. The source is copied through, tagged synthetic false, and the new rows are tagged true.'],
      [7.2, 'The source is never opened for write. Point the output at it, and the run is refused.']] },
    { name: 'The fidelity report', dur: 11, draw: sFidelity, caps: [
      [0, 'A fidelity report scores the new rows against the source: a KS test for numbers, chi-square for categories.',
        'A fidelity report scores the new rows against the source: a K S test for numbers, chi-square for categories.'],
      [3.6, 'Region, age and plan pass. Spend fails: it was rebuilt as a clamped normal, and the source is skewed. The correlation comes back close, at 0.449.',
        'Region, age and plan pass. Spend fails: it was rebuilt as a clamped normal, and the source is skewed. The correlation comes back close, at zero point four four nine.'],
      [7.4, 'With fit-shape, spend becomes a mixture and passes. But the shape claims spend first, so its correlation is dropped, and reported, not scored.',
        'With fit shape, spend becomes a mixture and passes. But the shape claims spend first, so its correlation is dropped, and reported, not scored.']] },
    { name: 'Same seed, same bytes', dur: 9, draw: sSeed, caps: [
      [0, 'Synth is deterministic. Same spec, same seed: the file is byte-identical, and the hashes match.'],
      [3.4, 'Seed 23 gives a different file. Seed zero is a fixed seed, not a random one.',
        'Seed twenty-three gives a different file. Seed zero is a fixed seed, not a random one.'],
      [6.4, 'Profile capture keeps the same promise, byte for byte.']] },
    { name: 'This series\' cohorts', dur: 10, draw: sSeries, caps: [
      [0, 'The cohorts in this series are not made with synth. They come from seeded generators, or small hand-written CSVs.',
        'The cohorts in this series are not made with synth. They come from seeded generators, or small hand-written C S Vs.'],
      [3.4, 'The generators use a port of Python\'s random module, so each one rebuilds byte for byte.'],
      [6.6, 'Synth can make the same kind of cohort: this film topped up the generator\'s members with 500 rows from Pulse. The brand tracker case study is built with synth.',
        'Synth can make the same kind of cohort: this film topped up the generator\'s members with five hundred rows from Pulse. The brand tracker case study is built with synth.']] },
    { name: 'Synthetic data', dur: 10.2, draw: sRecap, caps: [
      [0, 'That is synth: specs and profiles, distributions and the copula, constraints and rules, earlier rows, fidelity, and the same bytes for the same seed.'],
      [3.6, 'Synth is not private: a profile reveals the source\'s distributions. Add calibrated noise when the source is sensitive.'],
      [6.6, 'More distributions are added over time, and the manifest lists what your instance offers. Next up, embedding Pulse.'],
      [9.2, '', 'Pulse. Synthetic data.', true]] },
  ],
});
})();
