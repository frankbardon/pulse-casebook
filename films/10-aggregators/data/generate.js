// The 400 illustrative rows behind film 10's shape chapter. It replays the film's own generator
// (PulseFilm.h.rng(11), the kit's mulberry32, and a Box-Muller lognormal) so h.csv holds exactly
// the values the histogram draws.
const fs = require('fs');
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const r = rng(11), out = ['x'];
for (let i = 0; i < 400; i++) { const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); out.push(String(Math.exp(3.4 + 0.55 * g))); }
fs.writeFileSync('h.csv', out.join('\n') + '\n');
