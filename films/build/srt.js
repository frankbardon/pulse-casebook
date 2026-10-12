// Write subtitles from cues.json and vo/lens.json to the path given as argv[2].
const fs = require('fs');
const cues = JSON.parse(fs.readFileSync('cues.json', 'utf8'));
const { lens } = JSON.parse(fs.readFileSync('vo/lens.json', 'utf8'));
const p = (n, w = 2) => String(n).padStart(w, '0');
const ts = x => `${p(Math.floor(x / 3600))}:${p(Math.floor(x % 3600 / 60))}:${p(Math.floor(x % 60))},${p(Math.round(x % 1 * 1000), 3)}`;
fs.writeFileSync(process.argv[2], cues.map((c, i) => `${i + 1}\n${ts(c.t)} --> ${ts(c.t + lens[i] + 0.2)}\n${c.say}\n`).join('\n'));
