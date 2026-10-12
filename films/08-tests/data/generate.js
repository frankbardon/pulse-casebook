// Cohort for film 8 (tests and regressions). Deterministic: seed 7.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(7);
const L = ['arm,region,spend,visits,tenure,converted'];
for (let i = 0; i < 240; i++) {
  const arm = r.choice(['A', 'B']), reg = r.choice(['North', 'South', 'East']);
  const v = r.randint(1, 12), ten = pyRound(r.uniform(1, 10), 2);
  const sp = pyRound(20 + 3.1 * v + 1.5 * ten + (arm === 'B' ? 6 : 0) + r.gauss(0, 8), 2);
  const p = 1 / (1 + Math.exp(-(-3 + 0.35 * v + (arm === 'B' ? 0.6 : 0))));
  L.push(`${arm},${reg},${pyFloat(sp)},${v}.5,${pyFloat(ten)},${r.random() < p ? 'yes' : 'no'}`);
}
fs.writeFileSync('t.csv', L.join('\n') + '\n');
