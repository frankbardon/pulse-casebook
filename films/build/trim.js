// Drop leading and trailing silence the way kokoro-onnx does (librosa.effects.trim:
// top_db 60, frame 2048, hop 512, centred frames), so line lengths match the series.
module.exports = function trim(y, topDb = 60, frame = 2048, hop = 512) {
  const half = frame / 2, n = 1 + Math.floor(y.length / hop);
  const mse = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let s = 0;
    for (let i = t * hop - half; i < t * hop + half; i++) if (i >= 0 && i < y.length) s += y[i] * y[i];
    mse[t] = s / frame;
  }
  const db = x => 10 * Math.log10(Math.max(1e-10, x));
  const ref = db(mse.reduce((a, b) => Math.max(a, b), 0));
  const loud = [...mse.keys()].filter(t => db(mse[t]) - ref > -topDb);
  if (!loud.length) return y.subarray(0, 0);
  return y.subarray(loud[0] * hop, Math.min(y.length, (loud.at(-1) + 1) * hop));
};
