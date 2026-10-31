// Writes film 18's request files (Compose: fit, bind and optimize). Run by build.sh before the requests run.
// m.pulse: film 17's linear cohort. h.pulse: the same spend with saturating (Hill) sales.
const fs = require('fs');
const out = (name, obj) => fs.writeFileSync(name + '.json', JSON.stringify(obj, null, 1) + '\n');

const north = { type: 'ATTR_FORMULA', label: 'north', expression: 'market == "north" ? 1 : 0' };
const lag = (field, decay) => ({ type: 'WIN_DISTRIBUTED_LAG', field, label: field + '_ad', partition_by: ['market'], order_by: [{ field: 'week' }],
  params: { kernel: 'geometric', max_lag: 8, decay, normalize: false } });
const ols = name => ({ type: 'REG_OLS', name, target: 'sales', predictors: ['tv_ad', 'search_ad', 'north'], holdout: 'week >= 92' });
const market = m => ({ type: 'FILTER_INCLUDE', field: 'market', values: [m] });

// ---- 1. fit once, bind everywhere (m.pulse, the true decays written in) ----
const scoreSlot = (label, m, fit) => ({
  label, cohort: { filename: 'm.pulse' }, filterers: [market(m)],
  attributes: [north,
    { type: 'ATTR_REG_PREDICT', label: 'pred', params: { fit } },
    { type: 'ATTR_FORMULA', label: 'miss', expression: 'sales - pred' },
    { type: 'ATTR_FORMULA', label: 'tv_part', expression: `coef("${fit}", "tv_ad") * tv_ad` }],
  windows: [lag('tv', 0.6), lag('search', 0.2)],
  aggregations: [{ type: 'AGG_SUM', field: 'sales', label: 'sales' }, { type: 'AGG_SUM', field: 'tv_part', label: 'tv_part' },
    { type: 'AGG_AVERAGE', field: 'miss', label: 'mean_miss' }, { type: 'AGG_STDDEV', field: 'miss', label: 'sd_miss' }],
});
const fitReq = { cohort: { filename: 'm.pulse' }, attributes: [north], windows: [lag('tv', 0.6), lag('search', 0.2)], regressions: [ols('base')] };
const fit = { fits: [{ name: 'base', request: fitReq }], requests: [scoreSlot('north', 'north', 'base'), scoreSlot('south', 'south', 'base')] };
out('fit', fit);
// a slot that names a fit the batch does not bind
const unknown = JSON.parse(JSON.stringify(fit)); unknown.requests[1].attributes[1].params.fit = 'bsae';
out('unknown', unknown);

// ---- 2. bind the winner of film 17's lhs sweep (m.pulse) ----
const sweepBody = reg => ({ cohort: { filename: 'm.pulse' }, attributes: [north], windows: [lag('tv', { $var: 'tv' }), lag('search', { $var: 'search' })], regressions: [reg], return: { exclude: ['data'] } });
const lhs17 = { mode: 'lhs', samples: 40, axes: [{ name: 'tv', range: { min: 0, max: 0.95 } }, { name: 'search', range: { min: 0, max: 0.95 } }],
  request: sweepBody(ols('sales')), rank: { by: 'regressions.sales.holdout.rmse' } };
const sa = (fit, ax) => `sweep_axis("${fit}", "${ax}")`;
const steady = (fit, ax) => `(1 - ${sa(fit, ax)} ^ 9) / (1 - ${sa(fit, ax)})`;
const bind = {
  sweep: lhs17,
  fits: [{ name: 'best', from_sweep: { regression: 'sales' } }],
  requests: [{ label: 'long_run', cohort: { filename: 'm.pulse' },
    attributes: [
      { type: 'ATTR_FORMULA', label: 'tv_mult', expression: steady('best', 'tv') },
      { type: 'ATTR_FORMULA', label: 'tv_long', expression: `coef("best", "tv_ad") * ${steady('best', 'tv')}` },
      { type: 'ATTR_FORMULA', label: 'search_long', expression: `coef("best", "search_ad") * ${steady('best', 'search')}` }],
    aggregations: [{ type: 'AGG_MAX', field: 'tv_mult', label: 'tv_mult' }, { type: 'AGG_MAX', field: 'tv_long', label: 'tv_long' },
      { type: 'AGG_MAX', field: 'search_long', label: 'search_long' }] }],
};
out('bind', bind);
// the same binding with no rank: no slot can win
const norank = JSON.parse(JSON.stringify(bind)); delete norank.sweep.rank;
out('norank', norank);

// ---- 3. the media-mix call (h.pulse) ----
const hill = { type: 'REG_MMM_HILL', name: 'mmm', target: 'sales', predictors: ['tv_ad', 'search_ad', 'north'], params: { channels: ['tv_ad', 'search_ad'] }, holdout: 'week >= 92' };
const hBody = { ...sweepBody(hill), cohort: { filename: 'h.pulse' } };
// d * (x_l1 + d * (x_l2 + ... + d * x_l8)) + x, d = the winner's decay
const nest = ch => { let e = `${ch}_l8`; for (let l = 7; l >= 1; l--) e = `${ch}_l${l} + d * (${e})`; return `${ch} + d * (${e})`.replace(/\bd\b/g, sa('mmm', ch)); };
const curve = (ch, x) => `coef("mmm", "${ch}_ad") * hill(${x}, coef("mmm", "k:${ch}_ad"), coef("mmm", "s:${ch}_ad"))`;
const mult = ch => `(1 - ${sa('mmm', ch)} ^ 9) / (1 - ${sa('mmm', ch)})`;
const objective = `${curve('tv', mult('tv') + ' * tv')} + ${curve('search', mult('search') + ' * search')}`;
const mmm = {
  params: { budget: 33, cap_search: 12 },
  sweep: { mode: 'lhs', samples: 400, axes: [{ name: 'tv', range: { min: 0.3, max: 0.8 } }, { name: 'search', range: { min: 0, max: 0.6 } }],
    request: hBody, rank: { by: 'regressions.mmm.holdout.rmse', order: 'asc' } },
  fits: [{ name: 'mmm', from_sweep: { regression: 'mmm' }, save: 'models/mmm.pulse-model.json' }],
  requests: [{ label: 'contribution', cohort: { filename: 'h.pulse' },
    windows: [{ for_each: { mode: 'grid', axes: [{ name: 'ch', values: ['tv', 'search'] }, { name: 'lag', values: [1, 2, 3, 4, 5, 6, 7, 8] }] },
      type: 'WIN_LAG', field: '{{ch}}', label: '{{ch}}_l{{lag}}', partition_by: ['market'], order_by: [{ field: 'week' }], params: { offset: { $var: 'lag' }, default: 0 } }],
    attributes: [
      { type: 'ATTR_FORMULA', label: 'tv_ad', expression: nest('tv') },
      { type: 'ATTR_FORMULA', label: 'search_ad', expression: nest('search') },
      { type: 'ATTR_FORMULA', label: 'tv_c', expression: curve('tv', 'tv_ad') },
      { type: 'ATTR_FORMULA', label: 'search_c', expression: curve('search', 'search_ad') }],
    groups: [{ type: 'GROUP_CATEGORY', field: 'market' }],
    aggregations: [{ type: 'AGG_SUM', field: 'sales', label: 'sales' }, { type: 'AGG_SUM', field: 'tv_c', label: 'tv_c' }, { type: 'AGG_SUM', field: 'search_c', label: 'search_c' },
      { type: 'AGG_SUM', field: 'tv', label: 'tv' }, { type: 'AGG_SUM', field: 'search', label: 'search' }] }],
  optimize: [
    { name: 'allocation', direction: 'maximize',
      variables: [{ name: 'tv', lower: 0, upper: 60 }, { name: 'search', lower: 0, upper: 'params.cap_search' }],
      objective, constraints: [{ expr: 'tv + search - params.budget', type: 'eq' }], starts: 8 },
    { name: 'overspend', direction: 'maximize',
      variables: [{ name: 'tv', lower: 0, upper: 60 }, { name: 'search', lower: 0, upper: 'params.cap_search' }],
      objective, constraints: [{ expr: 'tv + search - 80', type: 'eq' }], starts: 8 }],
};
out('mmm', mmm);

// ---- 4. save a vector fit as a population (m.pulse, 2024), then load it in a later request ----
const members = ['tv', 'search', 'sales'];
out('popsave', {
  fits: [{ name: 'y2024', save: 'pops/y2024.pulse-population.json', request: { cohort: { filename: 'm.pulse' },
    filterers: [{ type: 'FILTER_RANGE', field: 'year', values: ['2024', '2024'] }],
    matrices: [{ type: 'MAT_COVARIANCE', name: 'y2024', fields: members }] } }],
  requests: [{ label: 'weeks', cohort: { filename: 'm.pulse' }, aggregations: [{ type: 'AGG_COUNT', field: 'week', label: 'n' }] }],
});
out('popload', {
  cohort: { filename: 'm.pulse' }, populations: [{ name: 'y2024', path: 'pops/y2024.pulse-population.json' }],
  attributes: [{ type: 'ATTR_MAHALANOBIS', label: 'd2', fields: members, params: { fit: 'y2024' } }],
  groups: [{ type: 'GROUP_CATEGORY', field: 'year' }],
  aggregations: [{ type: 'AGG_AVERAGE', field: 'd2', label: 'mean_d2' }],
});

// ---- 5. the Bayesian media-mix model: one market, raw spend, decay inside the model (api process) ----
out('bayes', {
  cohort: { filename: 'h.pulse' }, filterers: [market('north')],
  regressions: [{ type: 'REG_MMM_BAYES', name: 'bayes', target: 'sales', predictors: ['tv', 'search'],
    rng_seed: 18, params: { channels: ['tv', 'search'], time: 'week', max_lag: 8 } }],
  return: { exclude: ['data'] },
});
// the same fit with target_accept raised from its default 0.8
const b99 = JSON.parse(fs.readFileSync('bayes.json', 'utf8')); b99.regressions[0].params.target_accept = 0.99;
out('bayes99', b99);

// ---- 6. after mmm.json has run: load the saved model in a later, ordinary request (api process) ----
if (process.argv[2] === 'load') {
  const ax = JSON.parse(fs.readFileSync('mmm.out.json', 'utf8')).data.ranking[0].axes;
  out('load', {
    cohort: { filename: 'h.pulse' }, models: [{ name: 'mmm', path: 'models/mmm.pulse-model.json' }],
    attributes: [north, { type: 'ATTR_REG_PREDICT', label: 'pred', params: { fit: 'mmm' } },
      { type: 'ATTR_FORMULA', label: 'miss', expression: 'sales - pred' }],
    windows: [lag('tv', ax.tv), lag('search', ax.search)],
    groups: [{ type: 'GROUP_CATEGORY', field: 'year' }],
    aggregations: [{ type: 'AGG_AVERAGE', field: 'sales', label: 'mean_sales' }, { type: 'AGG_AVERAGE', field: 'pred', label: 'mean_pred' },
      { type: 'AGG_STDDEV', field: 'miss', label: 'sd_miss' }],
  });
}
