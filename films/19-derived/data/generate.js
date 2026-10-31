// The cohorts for film 19 (derived cohorts). Deterministic: seed 19.
//   w.csv   48 rows: six stores x eight weeks of sales (Mondays 5 Jan to 23 Feb 2026),
//           with the store's number, name, region, format and opening date, revenue (one left null),
//           visits and a messy promo answer (Yes / Y / No / Unsure).
//   st.csv  the store table for the join: five of the six stores (S6 has no row),
//           with a manager and floor area.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(19);
const STORES = [
  [1, 'S1', 'North', 'Mall', '2019-03-02', 120], [2, 'S2', 'North', 'Street', '2021-06-12', 80],
  [3, 'S3', 'North', 'Mall', '2018-09-15', 105], [4, 'S4', 'South', 'Street', '2022-04-09', 70],
  [5, 'S5', 'South', 'Mall', '2020-11-21', 115], [6, 'S6', 'South', 'Street', '2023-02-18', 90]];
const PROMO = ['Yes', 'Y', 'No', 'Unsure'];
const week = i => new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10);
const rows = [['store_no', 'store', 'region', 'format', 'opened', 'week', 'revenue', 'visits', 'promo']];
for (let w = 0; w < 8; w++) for (const [no, s, reg, fmt, opened, base] of STORES) {
  const promo = r.choiceWeighted(PROMO, [0.3, 0.2, 0.4, 0.1]);
  const lift = promo === 'Yes' || promo === 'Y' ? 1.15 : 1;
  let rev = pyFloat(pyRound(Math.max(20, base * lift * (1 + 0.02 * w) + r.gauss(0, 9)), 1));
  if (s === 'S3' && w === 5) rev = '';                       // one missing week
  const visits = Math.max(10, Math.round((base * lift) / 2.5 + r.gauss(0, 4)));
  rows.push([no, s, reg, fmt, opened, week(w), rev, visits, promo]);
}
fs.writeFileSync('w.csv', rows.map(x => x.join(',') + '\r\n').join(''));
const st = [['store_no', 'manager', 'sqft']];
[[1, 'Ada', 5200], [2, 'Ben', 2400], [3, 'Cleo', 4800], [4, 'Dev', 2100], [5, 'Eve', 5600]].forEach(x => st.push(x));
fs.writeFileSync('st.csv', st.map(x => x.join(',') + '\r\n').join(''));
// tx.csv  six till receipts near midnight UTC (6 to 9 Feb 2026), for the filter-to-file
//         time-zone run: which ones fall on a weekend depends on the zone that reads the day.
const tx = [['receipt', 'store_no', 'at', 'amount'],
  [1, 1, '2026-02-06T15:00:00Z', 42.5], [2, 2, '2026-02-07T18:00:00Z', 18.0], [3, 4, '2026-02-08T23:30:00Z', 63.2],
  [4, 5, '2026-02-09T03:00:00Z', 27.9], [5, 1, '2026-02-09T14:00:00Z', 51.0], [6, 3, '2026-02-08T04:00:00Z', 35.4]];
fs.writeFileSync('tx.csv', tx.map(x => x.join(',') + '\r\n').join(''));
