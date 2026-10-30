// Cohort for film 17 (Compose: batch and sweep), reused by film 18 (fit, bind, optimize).
// m.csv: weekly media and sales for two markets over two years. Deterministic: seed 17.
// True carry-over: TV decays 0.6 a week, search 0.2 (geometric adstock, 8 lags, unnormalised).
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(17);
const DECAY = { tv: 0.6, search: 0.2 }, LAGS = 8;
const BASE = { north: 220, south: 160 }, BETA = { tv: 1.6, search: 3.2 };
const adstock = (xs, d) => xs.map((_, i) => { let s = 0; for (let l = 0; l <= LAGS && i - l >= 0; l++) s += Math.pow(d, l) * xs[i - l]; return s; });
const rows = [];
for (const market of ['north', 'south']) {
  const tv = [], search = [];
  for (let w = 1; w <= 104; w++) {
    // TV runs in flights: four weeks on, then off, with a market-specific phase
    const on = Math.floor((w + (market === 'north' ? 0 : 3)) / 4) % 2 === 0 || r.random() < 0.15;
    tv.push(on ? pyRound(r.uniform(20, 60), 1) : 0);
    search.push(pyRound(r.uniform(4, 16), 1));
  }
  const atv = adstock(tv, DECAY.tv), asr = adstock(search, DECAY.search);
  for (let i = 0; i < 104; i++) {
    const w = i + 1, season = 12 * Math.sin((w % 52) / 52 * 2 * Math.PI);
    const sales = pyRound(BASE[market] + season + BETA.tv * atv[i] + BETA.search * asr[i] + r.gauss(0, 9), 1);
    rows.push([market, w, w <= 52 ? 2024 : 2025, pyFloat(tv[i]), pyFloat(search[i]), pyFloat(sales)]);
  }
}
const header = ['market', 'week', 'year', 'tv', 'search', 'sales'];
fs.writeFileSync('m.csv', [header, ...rows].map(row => row.join(',') + '\r\n').join(''));

// s.csv: a small brand survey for the banner scene (its own seed, so m.csv is unchanged).
// 600 respondents; brand preference leans on age, awareness on gender.
const rs = new Random(1717), srows = [];
for (let i = 1; i <= 600; i++) {
  const gender = rs.choice(['female', 'male']);
  const age = rs.choiceWeighted(['18-34', '35-54', '55+'], [0.35, 0.4, 0.25]);
  const aware = rs.random() < (gender === 'female' ? 0.62 : 0.5) ? 'yes' : 'no';
  const pw = { '18-34': [0.5, 0.3, 0.2], '35-54': [0.35, 0.4, 0.25], '55+': [0.2, 0.35, 0.45] }[age];
  srows.push([i, gender, age, aware, rs.choiceWeighted(['Alto', 'Brio', 'Cora'], pw)]);
}
fs.writeFileSync('s.csv', [['id', 'gender', 'age', 'aware', 'brand'], ...srows].map(row => row.join(',') + '\r\n').join(''));
