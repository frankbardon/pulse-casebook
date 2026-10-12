// Lay each cue's narration on one track at its cue time: narration.wav.
const fs = require('fs');
const wav = require('./wav');
const cues = JSON.parse(fs.readFileSync('cues.json', 'utf8'));
const { sr } = JSON.parse(fs.readFileSync('vo/lens.json', 'utf8'));
const dur = parseFloat(fs.readFileSync('dur.txt', 'utf8'));
const track = new Float32Array(Math.floor(dur * sr) + sr);
cues.forEach((c, i) => {
  const a = wav.read(`vo/${String(i).padStart(2, '0')}.wav`).samples;
  const st = Math.floor(c.t * sr);
  for (let j = 0; j < a.length && st + j < track.length; j++) track[st + j] += a[j];
  if (i + 1 < cues.length && c.t + a.length / sr > cues[i + 1].t) throw new Error(`overlap at cue ${i}`);
});
const out = track.subarray(0, Math.floor(dur * sr));
const peak = out.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
for (let i = 0; i < out.length; i++) out[i] *= 0.89 / peak;
wav.write('narration.wav', out, sr);
console.log('ok', Math.round(dur * 100) / 100, 'peak', peak);
