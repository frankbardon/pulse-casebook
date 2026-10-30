// The cohort for film 15 (crosstabs): t.csv, 600 respondents to a two-wave brand
// tracker. Deterministic: seed 15. Brand is asked only of those aware of the
// category, so it is null for the rest; a few skip the satisfaction score.
// intent is stored as a code (1, 2, 3); labels/intent_names.json turns it into text.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(15);
const rows = [['id', 'wave', 'region', 'age', 'aware', 'brand', 'intent', 'score', 'wt']];
const AGE = ['18-34', '35-54', '55+'];
const WT = { '18-34': 0.7, '35-54': 1.1, '55+': 1.4 };   // young respondents were over-sampled
for (let id = 1; id <= 600; id++) {
  const wave = id <= 300 ? 'W1' : 'W2';
  const region = r.choiceWeighted(['North', 'South', 'East', 'West'], [0.3, 0.25, 0.25, 0.2]);
  const age = r.choiceWeighted(AGE, [0.45, 0.33, 0.22]);
  const aware = r.random() < (wave === 'W1' ? 0.62 : 0.74) ? 'yes' : 'no';
  const bw = { North: [0.5, 0.3, 0.2], South: [0.3, 0.45, 0.25], East: [0.25, 0.3, 0.45], West: [0.35, 0.35, 0.3] }[region];
  const brand = aware === 'yes' ? r.choiceWeighted(['Acorn', 'Birch', 'Cedar'], bw) : '';
  const lift = (brand === 'Acorn' ? 0.6 : brand === 'Cedar' ? -0.4 : 0) + (wave === 'W2' ? 0.5 : 0);
  const intent = r.choiceWeighted(['1', '2', '3'], aware === 'yes' ? [0.25, 0.4, 0.35] : [0.5, 0.35, 0.15]);
  const raw = 6 + lift + (age === '55+' ? 0.5 : 0) + r.gauss(0, 1.8);
  const score = r.random() < 0.04 ? '' : Math.max(0, Math.min(10, Math.round(raw)));
  const wt = pyFloat(pyRound(WT[age] * r.uniform(0.85, 1.15), 3));
  rows.push([id, wave, region, age, aware, brand, intent, score, wt]);
}
fs.writeFileSync('t.csv', rows.map(row => row.join(',') + '\r\n').join(''));
