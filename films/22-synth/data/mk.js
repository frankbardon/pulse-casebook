// Writes the synth specs derived from shop.json, so each differs from it only where its comment says.
const fs = require('fs');
const shop = JSON.parse(fs.readFileSync('shop.json'));
const put = (name, edit) => { const s = JSON.parse(JSON.stringify(shop)); edit(s); fs.writeFileSync(name + '.json', JSON.stringify(s, null, 2) + '\n'); };
const field = (s, n) => s.fields.find(f => f.name === n);
// rate is not a poisson param (lambda is)
put('badparam', s => { field(s, 'visits').params = { rate: 3 }; });
// one Gaussian-copula pair
put('cop', s => { s.correlations = [{ a: 'age', b: 'spend', rho: 0.6 }]; });
// a poisson marginal cannot join the copula
put('coppois', s => { s.correlations = [{ a: 'age', b: 'visits', rho: 0.4 }]; });
// three participants, two pairs named: the third pair is assumed independent
put('copgap', s => { s.fields.push({ name: 'basket', type: 'f64', distribution: 'uniform', params: { min: 1, max: 9 } });
  s.correlations = [{ a: 'age', b: 'spend', rho: 0.6 }, { a: 'spend', b: 'basket', rho: 0.5 }]; });
// reject and redraw
put('cons', s => { s.constraints = [{ expr: 'spend >= 30' }]; });
put('consx', s => { s.constraints = [{ expr: 'spend >= 30' }]; s.max_rejection_rate = 0.1; });
// rules: gate, derive, a dead gate
const extra = s => s.fields.push(
  { name: 'tier', type: 'categorical_u8', nullable: true, distribution: 'weighted_categorical', params: { values: ['silver', 'gold'], weights: [0.7, 0.3] } },
  { name: 'vip', type: 'packed_bool', distribution: 'constant', params: { value: false } });
put('rules', s => { extra(s); s.rules = [
  { when: 'member == 0', set_null: ['tier'] },
  { set_expr: { vip: 'spend > 100' } },
  { when: 'age > 90', set: { tier: 'gold' } }]; });
// set_null on a field that is not nullable
put('rulesbad', s => { extra(s); s.rules = [{ when: 'member == 0', set_null: ['region'] }]; });
// a rule that determines spend claims it ahead of the copula
put('claim', s => { s.correlations = [{ a: 'age', b: 'spend', rho: 0.6 }]; s.rules = [{ set_expr: { spend: 'visits * 15 + 10' } }]; });
// process requests over the generated cohorts (q-<cohort>.json)
const q = (name, cohort, extra = {}) => fs.writeFileSync('q-' + name + '.json', JSON.stringify({ cohort: { filename: cohort + '.pulse' }, ...extra }) + '\n');
const summary = { aggregations: [
  { type: 'AGG_COUNT', field: 'id', label: 'n' }, { type: 'AGG_MAX', field: 'id', label: 'max_id' },
  { type: 'AGG_AVERAGE', field: 'age', label: 'age' }, { type: 'AGG_MIN', field: 'age', label: 'age_min' }, { type: 'AGG_MAX', field: 'age', label: 'age_max' },
  { type: 'AGG_AVERAGE', field: 'spend', label: 'spend' }, { type: 'AGG_MIN', field: 'spend', label: 'spend_min' }, { type: 'AGG_AVERAGE', field: 'visits', label: 'visits' }] };
q('shop', 'shop', summary);
q('shop-region', 'shop', { groups: [{ field: 'region' }], aggregations: [{ type: 'AGG_COUNT', field: 'id', label: 'n' }] });
q('shop-member', 'shop', { groups: [{ field: 'member' }], aggregations: [{ type: 'AGG_COUNT', field: 'id', label: 'n' }] });
q('cop', 'cop', summary);
q('cons', 'cons', summary);
for (const [c, m] of [['shop', 'pearson'], ['shop', 'spearman'], ['cop', 'pearson'], ['cop', 'spearman'], ['claim', 'pearson']])
  q(`r-${c}-${m}`, c, { vectors: [{ name: 'v', fields: ['age', 'spend'] }], matrices: [{ type: 'MAT_CORRELATION', vector: 'v', name: 'r', params: { method: m } }] });
q('rules', 'rules', { groups: [{ field: 'member' }], aggregations: [{ type: 'AGG_COUNT', field: 'id', label: 'n' }, { type: 'AGG_COUNT', field: 'tier', label: 'tier' },
  { type: 'AGG_SUM', field: 'vip', label: 'vip' }, { type: 'AGG_MIN', field: 'spend', label: 'spend_min' }] });
q('topup', 'topup', { groups: [{ field: '_synthetic' }], aggregations: [{ type: 'AGG_COUNT', field: 'age', label: 'n' }, { type: 'AGG_AVERAGE', field: 'age', label: 'age' }, { type: 'AGG_AVERAGE', field: 'spend', label: 'spend' }] });
