// Cohorts for film 21 (time zones and panels). Deterministic: node generate.js writes the same four CSVs every time.
//   o.csv  orders from three stores in three zones, one local week (seed 21)
//   h.csv  a Berlin meter read every 30 minutes (UTC) across both 2026 DST changes (no randomness in the times)
//   w.csv  naive wall-clock readings for the source-zone import (hand-written rows)
//   p.csv  a long monthly panel of plans, January to June 2026 (seed 2121)
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const out = (name, header, rows) => fs.writeFileSync(name, [header, ...rows].map(r => r.join(',') + '\r\n').join(''));
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');

// o.csv: each store's orders over its own local Monday 16 to Sunday 22 March 2026. In that week New York is on
// EDT (UTC-4, DST began 8 March), London on GMT (UTC+0, DST begins 29 March) and Tokyo on JST (UTC+9).
const r = new Random(21);
const STORES = [['ny', 'America/New_York', -4], ['london', 'Europe/London', 0], ['tokyo', 'Asia/Tokyo', 9]];
const orders = [];
let id = 0;
for (let d = 16; d <= 22; d++) for (const [store, zone, off] of STORES) {
  const n = r.randint(8, 14);
  for (let k = 0; k < n; k++) {
    const hour = r.choiceWeighted([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], [1, 2, 2, 2, 3, 4, 3, 3, 3, 3, 4, 5, 5, 4, 4, 3, 2]);
    const minute = r.randint(0, 59);
    const utc = Date.UTC(2026, 2, d, hour, minute) - off * 3600e3;
    orders.push([utc, store, zone, pyFloat(pyRound(r.uniform(8, 120), 2))]);
  }
}
orders.sort((a, b) => a[0] - b[0]);
const oRows = orders.map(([utc, store, zone, amount]) => [++id, store, zone, iso(utc), amount]);
// one order whose zone cell is empty: it has no local day under time_zone_field
oRows.push([++id, 'london', '', '2026-03-18T12:00:00Z', 40]);
out('o.csv', ['id', 'store', 'zone', 'at', 'amount'], oRows);

// h.csv: one reading every 30 minutes (UTC) for three UTC days around each 2026 change in Berlin:
// 29 March (02:00 CET jumps to 03:00 CEST) and 25 October (03:00 CEST falls back to 02:00 CET).
const hRows = [];
for (const [m, d0] of [[2, 28], [9, 24]]) for (let i = 0; i < 3 * 48; i++) {
  const ms = Date.UTC(2026, m, d0) + i * 1800e3;
  hRows.push(['m1', iso(ms), pyFloat(pyRound(1 + 0.5 * Math.sin(i / 48 * 2 * Math.PI), 3))]);
}
out('h.csv', ['meter', 'at', 'kwh'], hRows);

// w.csv: naive wall-clock times, as a site logger wrote them, with each site's zone in its own column.
out('w.csv', ['id', 'site', 'zone', 'read_at'], [
  ['w1', 'berlin', 'Europe/Berlin', '2026-03-29T01:30:00'],
  ['w2', 'berlin', 'Europe/Berlin', '2026-03-29T02:30:00'],   // skipped: 02:00 to 03:00 does not exist that night
  ['w3', 'berlin', 'Europe/Berlin', '2026-03-29T03:30:00'],
  ['w4', 'berlin', 'Europe/Berlin', '2026-10-25T02:30:00'],   // repeated: 02:30 happens twice that night
  ['w5', 'tokyo', 'Asia/Tokyo', '2026-03-29T02:30:00'],       // Tokyo has no DST
  ['w6', 'ny', 'America/New_York', '2026-03-29T02:30:00'],    // New York changed on 8 March
]);

// p.csv: a long panel. Each subject joins on trial in January, February or March, is observed on the first of
// every month to June, and stops being observed after the month it churns. Spend: trial 0, basic about 20, pro about 50.
const rp = new Random(2121);
const P = { trial: [['trial', 0.2], ['basic', 0.4], ['pro', 0.2], ['churned', 0.2]],
  basic: [['basic', 0.78], ['pro', 0.1], ['churned', 0.12]],
  pro: [['pro', 0.84], ['basic', 0.1], ['churned', 0.06]] };
const SPEND = { trial: 0, basic: 20, pro: 50, churned: 0 };
const pRows = [];
for (let s = 1; s <= 300; s++) {
  const subj = 's' + String(s).padStart(3, '0');
  let state = 'trial';
  for (let m = rp.randint(1, 3); m <= 6; m++) {
    const spend = SPEND[state] ? pyFloat(pyRound(SPEND[state] + rp.gauss(0, 3), 1)) : 0;
    pRows.push([subj, '2026-' + String(m).padStart(2, '0') + '-01', state, spend]);
    if (state === 'churned') break;
    const row = P[state];
    state = rp.choiceWeighted(row.map(x => x[0]), row.map(x => x[1]));
  }
}
out('p.csv', ['subject', 'month', 'plan', 'spend'], pRows);
