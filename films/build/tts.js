// Synthesize each cue's spoken line with Kokoro: vo/NN.wav + vo/lens.json.
const fs = require('fs');
const { env } = require('@huggingface/transformers');
const { KokoroTTS } = require('kokoro-js');
const trim = require('./trim');
const wav = require('./wav');
const voice = process.argv[2] || 'af_heart';
env.cacheDir = process.env.KOKORO_DIR || 'models';
(async () => {
  const k = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
  if (process.argv.includes('--fetch')) return console.log('model ready in', env.cacheDir);
  const cues = JSON.parse(fs.readFileSync('cues.json', 'utf8'));
  const lens = []; let sr;
  for (const [i, c] of cues.entries()) {
    const a = await k.generate(c.say, { voice, speed: 1 });
    a.audio = trim(a.audio);
    sr = a.sampling_rate;
    wav.write(`vo/${String(i).padStart(2, '0')}.wav`, a.audio, sr);
    lens.push(Math.round(a.audio.length / sr * 1000) / 1000);
    console.log(i, lens.at(-1), c.say.slice(0, 60));
  }
  fs.writeFileSync('vo/lens.json', JSON.stringify({ sr, lens }));
})();
