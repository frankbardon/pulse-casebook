// Cohort for film 12 (tests and regressions). Deterministic: seed 7 for the original columns.
// The later columns (id, pre_spend, checkout_mins) come from a second stream (seed 8), so the
// original six columns, and every figure computed from them, are unchanged.
//   pre_spend      last period's spend, before the arms were assigned (the CUPED covariate)
//   checkout_mins  minutes in checkout: above 0 only for a converted row, so it leaks the outcome
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(7), r2 = new Random(8);
const L = ['id,arm,region,spend,visits,tenure,converted,pre_spend,checkout_mins'];
for (let i = 0; i < 240; i++) {
  const arm = r.choice(['A', 'B']), reg = r.choice(['North', 'South', 'East']);
  const v = r.randint(1, 12), ten = pyRound(r.uniform(1, 10), 2);
  const sp = pyRound(20 + 3.1 * v + 1.5 * ten + (arm === 'B' ? 6 : 0) + r.gauss(0, 8), 2);
  const p = 1 / (1 + Math.exp(-(-3 + 0.35 * v + (arm === 'B' ? 0.6 : 0))));
  const conv = r.random() < p;
  const pre = pyRound(sp - (arm === 'B' ? 6 : 0) + r2.gauss(0, 5), 2);
  const mins = conv ? pyRound(r2.uniform(1, 9), 1) : 0;
  L.push(`${i + 1},${arm},${reg},${pyFloat(sp)},${v}.5,${pyFloat(ten)},${conv ? 'yes' : 'no'},${pyFloat(pre)},${pyFloat(mins)}`);
}
fs.writeFileSync('t.csv', L.join('\n') + '\n');
