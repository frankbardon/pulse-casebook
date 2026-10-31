// Cohort for film 9 (groupers): g.csv, 300 orders over the four weeks of
// Monday 2 March to Sunday 29 March 2026. Deterministic: seed 9.
//   region   North / South / East / West, a few left blank (null)
//   plan     Basic / Plus / Pro; West never buys Pro, so West × Pro is never observed
//   spend    order value, a few left blank (null)
//   ts       the order instant, stored as UTC (a Z literal)
//   zone     the store's IANA zone, one per region (a random one where region is blank)
//   channels a multi-select of web, app and store: "|" is answered-but-none, blank is null
//   customer 90 repeat customers, for the windows-first visit number
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(9);
const pad = n => String(n).padStart(2, '0');
const ZONE = { North: 'Europe/Berlin', South: 'America/New_York', East: 'Asia/Tokyo', West: 'America/Los_Angeles' };
const ZONES = Object.values(ZONE);
const DOW_W = [0.8, 0.9, 1.0, 1.0, 1.2, 1.6, 1.4];   // Monday .. Sunday
const rows = [];
for (let id = 1; id <= 300; id++) {
  const region = r.random() < 0.03 ? '' : r.choiceWeighted(['North', 'South', 'East', 'West'], [0.34, 0.3, 0.2, 0.16]);
  const plans = region === 'West' ? ['Basic', 'Plus'] : ['Basic', 'Plus', 'Pro'];
  const plan = r.random() < 0.02 ? '' : r.choiceWeighted(plans, region === 'West' ? [0.6, 0.4] : [0.5, 0.32, 0.18]);
  const base = { Basic: 18, Plus: 42, Pro: 85, '': 40 }[plan];
  const spend = r.random() < 0.03 ? '' : pyFloat(pyRound(base * r.uniform(0.6, 1.5), 2));
  const week = r.randint(0, 3), dow = r.choiceWeighted([0, 1, 2, 3, 4, 5, 6], DOW_W);
  const day = 2 + week * 7 + dow, hh = r.randint(0, 23), mm = r.randint(0, 59);
  const ts = `2026-03-${pad(day)}T${pad(hh)}:${pad(mm)}:00Z`;
  const zone = region ? ZONE[region] : r.choice(ZONES);
  let channels;
  const u = r.random();
  if (u < 0.04) channels = '';
  else if (u < 0.10) channels = '|';
  else {
    const pick = ['web', 'app', 'store'].filter((c, i) => r.random() < [0.55, 0.45, 0.3][i]);
    channels = pick.length ? pick.join('|') : 'web';
  }
  const customer = 'c' + String(r.randint(1, 90)).padStart(3, '0');
  rows.push([id, region, plan, spend, ts, zone, channels, customer]);
}
const header = ['id', 'region', 'plan', 'spend', 'ts', 'zone', 'channels', 'customer'];
fs.writeFileSync('g.csv', [header, ...rows].map(row => row.join(',') + '\r\n').join(''));
