// Cohorts for film 16 (overlays): o.csv (2024-2025) and o2025.csv (the 2025 slice,
// used as the facet against population o.pulse). Deterministic: seed 5.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(5);
const pad = n => String(n).padStart(2, '0');
const rows = []; let rid = 0;
for (let m = 0; m < 24; m++) {
  const y = 2024 + Math.floor(m / 12), mo = m % 12 + 1;
  const n = Math.trunc(40 + m * 1.2 + 8 * Math.sin(mo / 12 * 2 * Math.PI) + r.gauss(0, 3));
  for (let k = 0; k < n; k++) {
    rid++;
    const region = r.choiceWeighted(['North', 'South', 'East'], [0.4, 0.35, 0.25]);
    const pw = { North: [0.5, 0.3, 0.2], South: [0.35, 0.4, 0.25], East: [0.3, 0.3, 0.4] }[region];
    const plan = r.choiceWeighted(['Basic', 'Plus', 'Pro'], pw);
    const base = { Basic: 20, Plus: 45, Pro: 90 }[plan];
    const rev = pyRound(base * r.uniform(0.8, 1.3), 2);
    const d = `${y}-${pad(mo)}-${pad(r.randint(1, 28))}`;
    rows.push([rid, region, plan, pyFloat(rev), d, y]);
  }
}
const header = ['id', 'region', 'plan', 'revenue', 'signup', 'year'];
const csv = rs => [header, ...rs].map(row => row.join(',') + '\r\n').join('');
fs.writeFileSync('o.csv', csv(rows));
fs.writeFileSync('o2025.csv', csv(rows.filter(row => row[5] === 2025)));

// u.csv: a usage cohort for the matrix-result host (its own seed, so o.csv is unchanged).
const ru = new Random(11);
const urows = [];
for (let i = 1; i <= 360; i++) {
  const region = ru.choiceWeighted(['North', 'South', 'East'], [0.4, 0.35, 0.25]);
  const pace = { North: 6, South: 7, East: 8 }[region];
  const sessions = ru.randint(2, 30);
  const minutes = pyRound(sessions * pace * ru.uniform(0.6, 1.4) + ru.gauss(0, 15), 1);
  const tickets = Math.max(0, Math.round(5 - sessions / 7 + ru.gauss(0, 1.6)));
  urows.push([i, region, sessions, pyFloat(Math.max(1, minutes)), tickets]);
}
fs.writeFileSync('u.csv', [['id', 'region', 'sessions', 'minutes', 'tickets'], ...urows].map(row => row.join(',') + '\r\n').join(''));
