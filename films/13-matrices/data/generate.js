// Cohort for film 9 (matrices). Deterministic: seed 11.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(11);
const cl = x => Math.max(1, Math.min(7, pyRound(x)));
const rows = [['segment', 's1', 's2', 's3', 'r4', 'v1', 'v2', 'v3', 'age', 'tenure', 'income']];
for (let i = 0; i < 300; i++) {
  const seg = r.choice(['Bronze', 'Silver', 'Gold']);
  const sh = { Bronze: -0.6, Silver: 0, Gold: 0.7 }[seg];
  const A = r.gauss(sh, 1), B = r.gauss(-sh * 0.5, 1);
  const s = [0, 1, 2].map(() => cl(4 + 1.1 * A + r.gauss(0, 0.8)));
  const r4 = cl(4 - 1.0 * A + r.gauss(0, 0.9));
  const v = [0, 1, 2].map(() => cl(4 + 1.0 * B + r.gauss(0, 0.8)));
  const age = pyRound(r.uniform(22, 65));
  const tenure = pyRound(Math.max(0, age - 22 + r.gauss(0, 3)));
  const income = pyRound(30 + 0.9 * age + r.gauss(0, 12), 1);
  const v3 = r.random() < 0.1 ? '' : v[2];
  rows.push([seg, ...s, r4, v[0], v[1], v3, age, tenure, pyFloat(income)]);
}
fs.writeFileSync('m.csv', rows.map(row => row.join(',') + '\r\n').join(''));
