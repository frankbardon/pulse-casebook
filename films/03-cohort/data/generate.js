// Cohorts for film 3 (the cohort file). Deterministic: seed 3.
//   m.csv            1,200 members: a store block repeated on every row, a multi-select set, a four-item battery
//   w.csv            80 rows whose late rows outgrow what the first 50 rows suggested
//   s1..s4.csv       four quarters of 30,000 purchases each, for the shard archive (removed after import by build.sh)
//   naive.json       a plain float sum of the same spend values in two orders (no Pulse involved)
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(3);
const out = (f, rows) => fs.writeFileSync(f, rows.map(row => row.join(',') + '\r\n').join(''));

/* ---- m.csv: members ---- */
const REG = ['North', 'South', 'East', 'West'];
const STORES = [];
for (let s = 1; s <= 12; s++) {
  const region = REG[(s - 1) % 4];
  STORES.push({ store: 'S' + String(s).padStart(2, '0'), region, format: r.choice(['mall', 'street', 'outlet']),
    sqft: 8000 + r.randint(0, 40) * 500, opened: `20${10 + r.randint(0, 12)}-0${1 + r.randint(0, 8)}-1${r.randint(0, 9)}` });
}
const SET = ['travel', 'tech', 'sport', 'food'];
const m = [['id', 'store', 'region', 'format', 'sqft', 'opened', 'age', 'spend', 'interests', 'q1', 'q2', 'q3', 'q4']];
for (let i = 1; i <= 1200; i++) {
  const st = r.choice(STORES);
  const age = r.random() < 0.05 ? '' : r.randint(18, 79);
  const spend = pyFloat(pyRound(Math.exp(r.gauss(4, 0.7)), 2));
  const u = r.random();
  const interests = u < 0.06 ? '' : u < 0.12 ? '|' : SET.filter(() => r.random() < 0.4).join('|') || r.choice(SET);
  const base = r.gauss(0, 1);
  const q = [0, 1, 2, 3].map(() => Math.max(1, Math.min(5, pyRound(3 + base + r.gauss(0, 0.7)))));
  if (r.random() < 0.03) q[2] = '';
  m.push([i, st.store, st.region, st.format, st.sqft, st.opened, age, spend, interests, ...q]);
}
out('m.csv', m);

/* ---- w.csv: the first 50 rows look like u4 visits with no null age; later rows disagree ---- */
const w = [['id', 'visits', 'age']];
for (let i = 1; i <= 80; i++) {
  let visits = r.randint(0, 12), age = r.randint(18, 79);
  if (i === 64) visits = 300;
  if (i === 71) age = '';
  w.push([i, visits, age]);
}
out('w.csv', w);

/* ---- s1..s4.csv: four quarters of purchases ---- */
const all = [];
let id = 0;
for (let q = 1; q <= 4; q++) {
  const rows = [['id', 'region', 'spend']];
  for (let k = 0; k < 30000; k++) {
    id++;
    const big = r.random() < 0.01;
    const spend = Number((big ? r.uniform(1e5, 1e6) : Math.exp(r.gauss(3, 1.2)) + r.random() * 1e-3).toFixed(6));
    const region = r.choice(REG);
    rows.push([id, region, String(spend)]);
    all.push([region, spend]);
  }
  out(`s${q}.csv`, rows);
}
const naive = {};
for (const reg of REG) {
  const xs = all.filter(a => a[0] === reg).map(a => a[1]);
  const fwd = xs.reduce((a, b) => a + b, 0), rev = xs.slice().reverse().reduce((a, b) => a + b, 0);
  naive[reg] = { forward: fwd, reverse: rev, equal: fwd === rev };
}
fs.writeFileSync('naive.json', JSON.stringify({ note: 'plain left-to-right float64 sums of spend by region over s1..s4, in file order and reversed; computed by generate.js, not by Pulse', sums: naive }, null, 2) + '\n');

/* ---- sv.csv: a small survey for the SPSS round trip. income 998 = don't know, 999 = refused ---- */
const sv = [['id', 'region', 'income', 'media']];
const MEDIA = ['tv', 'web', 'radio'];
for (let i = 1; i <= 40; i++) {
  const income = i % 10 === 3 ? 999 : i % 10 === 7 ? 998 : r.randint(18, 160);
  const v = r.random();
  const media = v < 0.08 ? '' : v < 0.18 ? '|' : MEDIA.filter(() => r.random() < 0.45).join('|') || r.choice(MEDIA);
  sv.push([i, r.choice(REG), income, media]);
}
out('sv.csv', sv);
