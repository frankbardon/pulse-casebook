// Cohorts for film 18 (Compose: fit, bind and optimize). Deterministic.
// m.csv: film 17's weekly media and sales cohort, byte for byte (the same generator, seed 17).
//   True carry-over: TV decays 0.6 a week, search 0.2 (geometric adstock, 8 lags, unnormalised); sales are linear in both.
// h.csv: the same markets, weeks and spend, but sales saturate: each channel's adstock enters through a Hill curve.
//   Its noise has its own seed (18), so m.csv is unchanged.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(17), rh = new Random(18);
const DECAY = { tv: 0.6, search: 0.2 }, LAGS = 8;
const BASE = { north: 220, south: 160 }, BETA = { tv: 1.6, search: 3.2 };
// h.csv: beta * hill(adstock, k, s), hill(x, k, s) = x^s / (x^s + k^s)
const HILL = { tv: { beta: 240, k: 70, s: 1.6 }, search: { beta: 140, k: 14, s: 2.2 } };
const hill = (x, k, s) => Math.pow(x, s) / (Math.pow(x, s) + Math.pow(k, s));
const adstock = (xs, d) => xs.map((_, i) => { let s = 0; for (let l = 0; l <= LAGS && i - l >= 0; l++) s += Math.pow(d, l) * xs[i - l]; return s; });
const rows = [], hrows = [];
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
    const hs = pyRound(BASE[market] + season + HILL.tv.beta * hill(atv[i], HILL.tv.k, HILL.tv.s)
      + HILL.search.beta * hill(asr[i], HILL.search.k, HILL.search.s) + rh.gauss(0, 6), 1);
    hrows.push([market, w, w <= 52 ? 2024 : 2025, pyFloat(tv[i]), pyFloat(search[i]), pyFloat(hs)]);
  }
}
const header = ['market', 'week', 'year', 'tv', 'search', 'sales'];
const csv = rs => [header, ...rs].map(row => row.join(',') + '\r\n').join('');
fs.writeFileSync('m.csv', csv(rows));
fs.writeFileSync('h.csv', csv(hrows));
