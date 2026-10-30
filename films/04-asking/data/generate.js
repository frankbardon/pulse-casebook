// The cohort for film 4 (asking before running): s.csv, 800 shoppers in an
// A/B test, with region, plan, arm, spend, visits and a sign-up date.
// Deterministic: seed 4. A few spend values are left null.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(4);
const pad = n => String(n).padStart(2, '0');
const rows = [['id', 'region', 'plan', 'arm', 'spend', 'visits', 'signup']];
for (let id = 1; id <= 800; id++) {
  const region = r.choiceWeighted(['North', 'South', 'East', 'West'], [0.3, 0.25, 0.25, 0.2]);
  const plan = r.choiceWeighted(['Basic', 'Plus', 'Pro'], [0.5, 0.3, 0.2]);
  const arm = r.random() < 0.5 ? 'control' : 'variant';
  const base = { Basic: 40, Plus: 70, Pro: 120 }[plan] * { North: 1.0, South: 0.95, East: 1.08, West: 1.02 }[region];
  const spend = r.random() < 0.03 ? '' : pyFloat(pyRound(Math.max(5, base * (arm === 'variant' ? 1.07 : 1) + r.gauss(0, 18)), 2));
  const visits = Math.max(1, Math.round(4 + r.gauss(0, 2) + (plan === 'Pro' ? 2 : 0)));
  const d = `2025-${pad(r.randint(1, 12))}-${pad(r.randint(1, 28))}`;
  rows.push([id, region, plan, arm, spend, visits, d]);
}
fs.writeFileSync('s.csv', rows.map(row => row.join(',') + '\r\n').join(''));
