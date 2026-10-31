// The chain-scene cohort for film 6 (filters). Deterministic: seed 6.
// k.csv: 1,000 members with region and age, a few of each left null.
const fs = require('fs');
const { Random } = require('../../build/pyrandom');
const r = new Random(6);
const rows = [['id', 'region', 'age']];
for (let id = 1; id <= 1000; id++) {
  const region = r.random() < 0.03 ? '' : r.choice(['North', 'South', 'East', 'West']);
  const age = r.random() < 0.04 ? '' : r.randint(12, 84);
  rows.push([id, region, age]);
}
fs.writeFileSync('k.csv', rows.map(row => row.join(',') + '\r\n').join(''));
