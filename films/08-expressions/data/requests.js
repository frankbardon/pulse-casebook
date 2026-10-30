/* Writes every request in this folder (node requests.js .). Run by build.sh; the outputs are captured beside each request. */
const fs = require('fs'), path = require('path');
const D = process.argv[2];
const C = { filename: 'e.pulse' };
const byId = (forms, extra = {}) => ({ cohort: C, ...extra,
  attributes: forms.map(([label, expression]) => ({ type: 'ATTR_FORMULA', label, expression })),
  groups: [{ type: 'GROUP_CATEGORY', field: 'id' }],
  aggregations: forms.map(([label]) => ({ type: 'AGG_MAX', field: label, label })) });
const filt = (expression, extra = {}) => ({ cohort: C, ...extra,
  filterers: [{ type: 'FILTER_EXPRESSION', expression }],
  groups: [{ type: 'GROUP_CATEGORY', field: 'id' }], aggregations: [{ type: 'AGG_COUNT', field: 'id', label: 'n' }] });
const R = {
  bind: byId([['north', 'region == "North"'], ['has_tech', '"tech" in tags'], ['markup', 'price / cost'], ['day', 'order_day'], ['score0', 'score ?? 0']]),
  bind_bad: byId([['bad', 'region + 1']]),
  nul_eq: filt('score == 3'),
  nul_ne: filt('score != 3'),
  nul_gt: filt('score > 2'),
  nul_guard: filt('score == nil || score > 2'),
  nul_tern: byId([['s', 'score == nil ? -1 : score']]),
  ops: byId([['in_ne', 'region in ["North", "East"] ? 1 : 0'], ['mod', 'week % 4'], ['negmod', '-7.5 % 2'], ['per0', 'spend / 0'], ['big', 'spend ** 2']]),
  sets: byId([['pop', 'popcount(tags)'], ['jac', 'jaccard(tags, ["travel", "tech"])'], ['inter', 'len(set_intersect(tags, ["travel", "food"]))'], ['all', 'has_all(tags, "travel", "tech")'], ['none', 'has_none(tags, "sport")']]),
  vec: byId([['mean', 'vmean([q1, q2, q3])'], ['cnt', 'vcount([q1, q2, q3])'], ['sd', 'vsd([q1, q2, q3])'], ['top', 'argmax([q1, q2, q3])'], ['zmax', 'vmax(vzscore([q1, q2, q3]))'], ['gap', 'dist([q1, q2, q3], [5, 5, 5])']]),
  maths: byId([['fourier', 'sin(2 * pi() * week / 52)'], ['sat', 'hill(spend, 100, 2)'], ['logs', 'log1p(spend)'], ['root', 'sqrt(-1)'], ['sq', 'pow(score ?? 0, 2)']]),
  dec_eq: filt('price + cost == 0.30'),
  dec_feq: filt('float(price) + float(cost) == 0.30'),
  dec_round: byId([['markup', 'price / cost'], ['rd', 'round(price / 5)'], ['rf', 'round(float(price) / 5)']]),
  dec_mod: byId([['m', 'price % 2']]),
  dec_str: byId([['m', 'price + region']]),
  dec_zero: byId([['m', 'price / (cost - cost)']]),
  cal_utc: byId([['wd', 'weekday(to_day(created_at))'], ['day', 'to_day(created_at)'], ['months', 'month_index(order_day) - month_index(signup_day)'], ['wk', 'date_trunc("week", order_day)']]),
  cal_ny: byId([['wd', 'weekday(to_day(created_at))'], ['day', 'to_day(created_at)']], { time_zone: 'America/New_York' }),
  cal_bare: byId([['wd', 'weekday(created_at)']]),
  par: { cohort: C, params: { budget: 1000, min_score: 3 },
    filterers: [{ type: 'FILTER_EXPRESSION', expression: '(score ?? 0) >= params.min_score' }],
    attributes: [{ type: 'ATTR_FORMULA', label: 'alloc', expression: 'spend * params.budget / total(spend)' }],
    groups: [{ type: 'GROUP_CATEGORY', field: 'id' }], aggregations: [{ type: 'AGG_MAX', field: 'alloc', label: 'alloc' }, { type: 'AGG_SUM', field: 'alloc', label: 'sum' }] },
  par_sum: { cohort: C, params: { budget: 1000, min_score: 3 }, filterers: [{ type: 'FILTER_EXPRESSION', expression: '(score ?? 0) >= params.min_score' }], attributes: [{ type: 'ATTR_FORMULA', label: 'alloc', expression: 'spend * params.budget / total(spend)' }], aggregations: [{ type: 'AGG_SUM', field: 'alloc', label: 'sum' }] },
  par_undecl: filt('score >= params.min_scor', { params: { min_score: 3 } }),
  total_site: filt('spend > total(spend) / 6'),
  lookup: byId([['fx', 'lookup("fx", region)']]),
  nonbool: filt('week + 1'),
};
for (const [k, v] of Object.entries(R)) fs.writeFileSync(path.join(D, k + '.json'), JSON.stringify(v, null, 1) + '\n');

