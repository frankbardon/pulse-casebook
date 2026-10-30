// The source cohort for film 22 (synthetic data). Deterministic: seed 22.
// It is drawn the way every casebook cohort is drawn: a seeded generator (../../build/pyrandom.js,
// CPython's random module) in the film's own data folder. Pulse's synth then profiles it and tops it up.
//   members.csv   1,000 members: region, age, spend (rises with age), plan (plus is likelier in the North)
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(22);
const REG = ['North', 'South', 'East', 'West'];
const rows = [['region', 'age', 'spend', 'plan']];
for (let i = 1; i <= 1000; i++) {
  const region = r.choiceWeighted(REG, [4, 3, 2, 1]);
  const age = Math.max(18, Math.min(85, pyRound(r.gauss(44, 13))));
  const spend = pyFloat(pyRound(Math.exp(3.2 + 0.02 * age + r.gauss(0, 0.45)), 2));
  const plan = r.random() < (region === 'North' ? 0.5 : 0.25) ? 'plus' : 'basic';
  rows.push([region, age, spend, plan]);
}
fs.writeFileSync('members.csv', rows.map(row => row.join(',') + '\r\n').join(''));
