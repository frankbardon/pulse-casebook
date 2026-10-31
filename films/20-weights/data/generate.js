// Cohorts for film 20 (weights and raking). Deterministic: seed 20.
// survey.csv: 600 illustrative survey rows over two waves (300 each). The sample runs young and
// male against the census targets the film rakes to (age 29/33/38, gender 51/49), and north is
// oversampled, so a design weight dwt (north 0.8, south 1.3) undoes that. Older respondents are
// more often satisfied, so the weights move the estimate.
// freq.csv / dup.csv: one small table stored two ways, as six rows with a count n, and as the
// twenty rows that count stands for.
// inv.csv: ten rows whose weight w holds a null, a negative, a zero and a fraction.
const fs = require('fs');
const { Random, pyFloat, pyRound } = require('../../build/pyrandom');
const r = new Random(20);
const pick = (p, keys) => { let u = r.random(); for (let i = 0; i < keys.length; i++) { if (u < p[i]) return keys[i]; u -= p[i]; } return keys[keys.length - 1]; };
const AGES = ['18-34', '35-54', '55+'];
const SAMPLE = { w1: [0.47, 0.33, 0.20], w2: [0.43, 0.35, 0.22] };
const rows = [['id', 'wave', 'age', 'gender', 'region', 'dwt', 'satisfied', 'spend']];
let id = 0;
for (const w of ['w1', 'w2']) for (let i = 0; i < 300; i++) {
  const age = pick(SAMPLE[w], AGES), gender = r.random() < 0.41 ? 'F' : 'M', region = r.random() < 0.62 ? 'north' : 'south';
  const ai = AGES.indexOf(age);
  const p = 0.42 + 0.12 * ai + (gender === 'F' ? 0.06 : 0) + (w === 'w2' ? 0.03 : 0);
  const sat = r.random() < p ? 1 : 0;
  const spend = Math.max(5, r.gauss(38 + 9 * ai, 12));
  rows.push([++id, w, age, gender, region, region === 'north' ? '0.8' : '1.3', sat, pyFloat(pyRound(spend, 2))]);
}
fs.writeFileSync('survey.csv', rows.map(x => x.join(',') + '\n').join(''));

const T = [['basic', 3, 4], ['basic', 5, 2], ['plus', 6, 3], ['plus', 8, 5], ['pro', 7, 2], ['pro', 9, 4]];
fs.writeFileSync('freq.csv', 'plan,score,n\n' + T.map(([p, s, n]) => `${p},${s},${n}\n`).join(''));
fs.writeFileSync('dup.csv', 'plan,score\n' + T.flatMap(([p, s, n]) => Array(n).fill(`${p},${s}\n`)).join(''));

const INV = [[12, '1'], [15, '2'], [9, ''], [20, '-1'], [14, '0'], [11, '1.5'], [18, '3'], [16, '2'], [10, '1'], [13, '4']];
fs.writeFileSync('inv.csv', 'x,w\n' + INV.map(([x, w]) => `${x},${w}\n`).join(''));
