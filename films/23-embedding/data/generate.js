// The cohort for film 23 (embedding Pulse). Deterministic: seed 23.
//   orders.csv  24 illustrative orders: an order id, a region (North, South, East, West),
//               a channel (web, store), an amount and an item count.
//   more.csv    the same 24 orders plus four more, so a rewrite of orders.pulse
//               gives the watcher a real content change.
const fs = require('fs');
const { Random, pyRound, pyFloat } = require('../../build/pyrandom');
const r = new Random(23);
const REGIONS = ['North', 'South', 'East', 'West'], BASE = { North: 60, South: 45, East: 52, West: 38 };
const head = ['order_id', 'region', 'channel', 'amount', 'items'];
const rows = [];
for (let i = 0; i < 28; i++) {
  const region = REGIONS[i % 4], channel = r.choiceWeighted(['web', 'store'], [0.6, 0.4]);
  const items = r.randint(1, 5);
  const amount = pyFloat(pyRound(Math.max(5, BASE[region] + 9 * (items - 3) + r.gauss(0, 8)), 2));
  rows.push([1001 + i, region, channel, amount, items]);
}
const csv = rs => [head, ...rs].map(x => x.join(',')).join('\n') + '\n';
fs.writeFileSync('orders.csv', csv(rows.slice(0, 24)));
fs.writeFileSync('more.csv', csv(rows));
