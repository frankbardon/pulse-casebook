// Samples for film 2 (concepts): the test, regression and matrix cards. Deterministic: seed 21.
// s.csv: 80 members, 20 per region. r.csv: six months of orders for the windows and series overlay.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(21);
const rows = [['id', 'region', 'age', 'income', 'tenure', 'spend', 'visits']];
const shift = { North: -3.5, South: 0, East: 1, West: 3.5 };
let id = 0;
for (const region of ['North', 'South', 'East', 'West']) for (let i = 0; i < 20; i++) {
  const age = pyRound(r.uniform(20, 64));
  const tenure = pyRound(Math.max(0, (age - 20) * 0.45 + r.gauss(0, 4)));
  const income = pyRound(42 + 0.55 * age + shift[region] + r.gauss(0, 6), 1);
  const spend = pyRound(Math.max(1, 0.6 * income - 10 + r.gauss(0, 5)), 1);
  const visits = Math.max(0, pyRound(2 + 0.12 * spend + r.gauss(0, 1.5)));
  rows.push([++id, region, age, pyFloat(income), tenure, pyFloat(spend), visits]);
}
fs.writeFileSync('s.csv', rows.map(row => row.join(',') + '\r\n').join(''));

// Monthly revenue 120, 135, 128, 150, 162, 171, split over a few orders per month.
const REV = [120, 135, 128, 150, 162, 171];
const orders = [['order_date', 'revenue']];
REV.forEach((total, m) => {
  const k = 3, parts = [];
  let left = total;
  for (let j = 0; j < k - 1; j++) { const p = r.randint(20, 50); parts.push(p); left -= p; }
  parts.push(left);
  parts.forEach((p, j) => orders.push([`2026-${String(m + 1).padStart(2, '0')}-${String(3 + j * 9).padStart(2, '0')}`, p]));
});
fs.writeFileSync('r.csv', orders.map(row => row.join(',') + '\r\n').join(''));
