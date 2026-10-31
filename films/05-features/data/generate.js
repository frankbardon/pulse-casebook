// Cohorts for film 5 (features). Deterministic: seed 5.
//   f.csv  240 customers: region, occupation, plan, member, income, churned, signup
//   s.csv   60 customers for the split grid: id, plan (42 Basic, 18 Pro)
//   d.csv    4 events at one instant, each with its own zone (one null zone)
const fs = require('fs');
const { Random, pyRound } = require('../../build/pyrandom');
const r = new Random(5);

// regions in exact shares 30/25/25/20; occupations with a rare tail
const REG = [].concat(...[['North', 72], ['South', 60], ['East', 60], ['West', 48]].map(([k, n]) => Array(n).fill(k)));
const OCC = [].concat(...[['Nurse', 70], ['Engineer', 90], ['Teacher', 60], ['Artist', 14], ['Pilot', 6]].map(([k, n]) => Array(n).fill(k)));
const P = { Nurse: 0.32, Engineer: 0.18, Teacher: 0.25, Artist: 0.7, Pilot: 0.05 };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = r.randbelow(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
shuffle(REG); shuffle(OCC);
const L = ['region,occupation,plan,member,income,churned,signup'];
for (let i = 0; i < 240; i++) {
  const plan = r.random() < 0.7 ? 'Basic' : 'Pro', member = r.random() < 0.4 ? 'true' : 'false';
  const income = pyRound(Math.exp(Math.log(48) + 0.75 * r.gauss(0, 1)), 2);
  const churned = r.random() < P[OCC[i]] ? 1 : 0;
  const d = new Date(Date.UTC(2023, 0, 1) + r.randint(0, 729) * 86400000).toISOString().slice(0, 10);
  L.push([REG[i], OCC[i], plan, member, income, churned, d].join(','));
}
fs.writeFileSync('f.csv', L.join('\n') + '\n');

// split grid: the plan pattern the film draws, 7 Basic then 3 Pro in each run of ten
const S = ['id,plan'];
for (let i = 0; i < 60; i++) S.push(`s${String(i + 1).padStart(2, '0')},${(i * 7) % 10 < 7 ? 'Basic' : 'Pro'}`);
fs.writeFileSync('s.csv', S.join('\n') + '\n');

// one instant, read in each row's own zone; e4 has no zone
fs.writeFileSync('d.csv', ['id,signup,event,zone',
  'e1,2024-03-14,2024-03-15T02:30:00Z,America/New_York',
  'e2,2024-03-14,2024-03-15T02:30:00Z,Europe/London',
  'e3,2024-03-14,2024-03-15T02:30:00Z,Asia/Tokyo',
  'e4,2024-03-14,2024-03-15T02:30:00Z,'].join('\n') + '\n');
