// Cohort for film 14 (SEM). Deterministic: seed 14.
// 900 illustrative survey rows: three waves (300 each), two channels, a 1-5 rating battery
// (service s1-s3, value v1-v3) driven by two latent qualities, and a 0-10 recommend score.
// s3 cross-loads on value. Across the waves the value mean falls and the service mean rises.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(14);
const cl = x => Math.max(1, Math.min(5, pyRound(x)));
const rows = [['wave', 'channel', 's1', 's2', 's3', 'v1', 'v2', 'v3', 'recommend']];
const WAVES = { w1: [0, 0], w2: [0.25, -0.35], w3: [0.45, -0.6] };   // [service shift, value shift]
const LS = [1.0, 0.9, 0.8], LV = [1.0, 0.85, 0.75];
for (const w of ['w1', 'w2', 'w3']) for (let i = 0; i < 300; i++) {
  const ch = r.random() < 0.55 ? 'online' : 'store';
  const [ms, mv] = WAVES[w];
  const S = r.gauss(ms, 0.8), V = r.gauss(mv + 0.3 * S, 0.8);
  const s = LS.map(l => cl(3 + l * S + r.gauss(0, 0.6)));
  const v = LV.map(l => cl(3 + l * V + r.gauss(0, 0.6)));
  s[2] = cl(s[2] + 0.45 * V);   // s3 also leans on value: the misfit the first model shows
  const rec = Math.max(0, Math.min(10, 6 + 1.2 * V + 0.7 * S + r.gauss(0, 1.1)));
  rows.push([w, ch, ...s, ...v, pyFloat(pyRound(rec, 1))]);
}
fs.writeFileSync('sem.csv', rows.map(row => row.join(',') + '\r\n').join(''));
