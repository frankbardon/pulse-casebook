// Declare user-missing codes on one numeric variable of a .sav written by `pulse export spss --uncompressed`.
// Pulse's own synthesised export never declares missing values, so this adds the discrete missing-value slots
// a survey tool would have written: record type 2's n_missing_values, followed by one flt64 per code.
// Usage: node patch-sav.js IN.sav OUT.sav VARNAME CODE [CODE ...]   (at most 3 discrete codes)
const fs = require('fs');
const [inp, outp, want, ...codes] = process.argv.slice(2);
const b = fs.readFileSync(inp);
let o = 176, done = false;
while (b.readInt32LE(o) === 2) {
  const hasLabel = b.readInt32LE(o + 8), nMiss = b.readInt32LE(o + 12), name = b.slice(o + 24, o + 32).toString().trim();
  let end = o + 32;
  if (hasLabel) end += 4 + Math.ceil(b.readInt32LE(end) / 4) * 4;
  end += Math.abs(nMiss) * 8;
  if (name === want.toUpperCase()) {
    if (nMiss !== 0 || b.readInt32LE(o + 4) !== 0) throw new Error(name + ' is not a plain numeric variable');
    const slots = Buffer.alloc(8 * codes.length);
    codes.forEach((c, i) => slots.writeDoubleLE(Number(c), 8 * i));
    const head = Buffer.from(b.slice(0, end)); head.writeInt32LE(codes.length, o + 12);
    fs.writeFileSync(outp, Buffer.concat([head, slots, b.slice(end)]));
    done = true; break;
  }
  o = end;
}
if (!done) throw new Error('no numeric variable ' + want);
