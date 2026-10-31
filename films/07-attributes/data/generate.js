// Writes the scatter cohorts the attributes film draws: reg.csv (sales ~ spend, scene
// "Regression diagnostics") and mv.csv (height, weight, scene "Multivariate scores").
// It uses the film kit's own rng (films/kit/film-kit.js), seeded as in scenes.js, so the
// points Pulse scores are the points on screen. Run from this folder: node generate.js
const fs = require('fs');
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gaussOf = r => () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

// scenes.js RG: 28 points around sales = 20 + 3.2 spend, plus a high-leverage point and an odd response.
{ const r = rng(17), g = gaussOf(r);
  const pts = Array.from({ length: 28 }, () => { const x = 2 + r() * 10; return [x, 20 + 3.2 * x + 4 * g()]; });
  pts.push([22, 72]); pts.push([7, 62]);
  fs.writeFileSync('reg.csv', 'id,spend,sales\n' + pts.map((p, i) => `${i + 1},${p[0]},${p[1]}`).join('\n') + '\n'); }

// scenes.js MV: 70 correlated (height, weight) points, plus the tall-but-light member last.
{ const r = rng(5), g = gaussOf(r);
  const pts = Array.from({ length: 70 }, () => { const a = g(), b = g(); return [170 + 9 * a, 70 + 9 * (0.85 * a + 0.53 * b)]; });
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  pts.push([mx + 11, my - 10]);
  fs.writeFileSync('mv.csv', 'id,height,weight\n' + pts.map((p, i) => `${i + 1},${p[0]},${p[1]}`).join('\n') + '\n'); }
