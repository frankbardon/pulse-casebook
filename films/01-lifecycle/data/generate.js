// Cohorts for film 1 (lifecycle). Deterministic.
//  l.csv: 140 members, from the same mulberry32 stream (seed 11) the film's record loop draws,
//         so the animated records are these records. Extra columns come from a second stream.
//  x.csv: 69 members for the crosstab scene: 68 with a region and a plan, plus record 2,
//         which has a region (East) and no plan.
const fs = require('fs');
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const REG = ['North', 'South', 'East', 'West'], MU = [72, 58, 64, 81];
const rand = rng(11), extra = rng(12), rows = [['region', 'age', 'signup', 'income', 'opted_in', 'tier']];
const day0 = Date.UTC(2021, 0, 1);
for (let i = 0; i < 140; i++) {
  const u = rand(); const g = u < .3 ? 0 : u < .55 ? 1 : u < .8 ? 2 : 3;
  const age = 16 + Math.floor(rand() * 64);
  const z = Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const inc = Math.round((MU[g] + 11 * z) * 10) / 10;          // thousands, one decimal
  const signup = new Date(day0 + Math.floor(extra() * 1400) * 864e5).toISOString().slice(0, 10);
  const opted = extra() < 0.6 ? 'true' : 'false';
  const tier = extra() < 0.15 ? '' : String(1 + Math.floor(extra() * 3));
  rows.push([REG[g], age, signup, (Math.round(inc * 10) * 100).toFixed(1), opted, tier]);
}
fs.writeFileSync('l.csv', rows.map(r => r.join(',') + '\n').join(''));
// shards of 35, in record order
for (let s = 0; s < 4; s++) fs.writeFileSync(`l${s + 1}.csv`, [rows[0], ...rows.slice(1 + s * 35, 1 + (s + 1) * 35)].map(r => r.join(',') + '\n').join(''));

const XT = [[12, 7, 3], [9, 14, 5], [4, 6, 8]], XR = ['North', 'South', 'East'], XC = ['Basic', 'Plus', 'Pro'];
const x = [['id', 'region', 'plan']]; let id = 1;
XT.forEach((row, i) => row.forEach((n, j) => { for (let k = 0; k < n; k++) { if (id === 2) x.push([id++, 'East', '']); x.push([id++, XR[i], XC[j]]); } }));
fs.writeFileSync('x.csv', x.map(r => r.join(',') + '\n').join(''));
