// CPython-compatible random numbers and number formatting, so the Node generators
// reproduce the committed cohorts byte-for-byte. The cohorts were first generated
// with CPython's `random` module; changing anything here changes every film's data.

const N = 624, M = 397;

class Random {
  constructor(seed) { this.seed(seed); }

  // random.seed(int): init_by_array over the 32-bit words of abs(seed).
  seed(a) {
    let n = BigInt(Math.abs(a)); const key = [];
    do { key.push(Number(n & 0xffffffffn)); n >>= 32n; } while (n > 0n);
    const mt = this.mt = new Uint32Array(N);
    mt[0] = 19650218;
    for (let i = 1; i < N; i++) mt[i] = Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
    let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.mti = N;
    this.gaussNext = null;
  }

  genrand() {
    const mt = this.mt;
    if (this.mti >= N) {
      for (let k = 0; k < N; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % N] & 0x7fffffff);
        mt[k] = mt[(k + M) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random() {
    const a = this.genrand() >>> 5, b = this.genrand() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  // _randbelow for n < 2**32: getrandbits(n.bit_length()) with rejection.
  randbelow(n) {
    const k = 32 - Math.clz32(n);
    let r;
    do r = this.genrand() >>> (32 - k); while (r >= n);
    return r;
  }

  choice(seq) { return seq[this.randbelow(seq.length)]; }
  randint(a, b) { return a + this.randbelow(b - a + 1); }
  uniform(a, b) { return a + (b - a) * this.random(); }

  // random.choices(population, weights)[0]
  choiceWeighted(population, weights) {
    const cum = []; let acc = 0;
    for (const w of weights) cum.push(acc += w);
    const x = this.random() * cum[cum.length - 1];
    let lo = 0, hi = population.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
    return population[lo];
  }

  gauss(mu, sigma) {
    let z = this.gaussNext; this.gaussNext = null;
    if (z === null) {
      const x2pi = this.random() * 2 * Math.PI;
      const g2rad = Math.sqrt(-2 * Math.log(1 - this.random()));
      z = Math.cos(x2pi) * g2rad;
      this.gaussNext = Math.sin(x2pi) * g2rad;
    }
    return mu + z * sigma;
  }
}

// Python's round(x, nd): round half to even on the exact binary value.
function pyRound(x, nd = 0) {
  if (!Number.isFinite(x)) return x;
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const neg = hi >>> 31, bexp = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo), e;
  if (bexp) { mant |= 1n << 52n; e = bexp - 1075; } else e = -1074;
  let num = mant * 10n ** BigInt(nd), den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  let q = num / den; const r2 = (num % den) * 2n;
  if (r2 > den || (r2 === den && q & 1n)) q++;
  const v = Number(`${neg ? '-' : ''}${q}e-${nd}`);
  return v === 0 && neg ? -0 : v;
}

// Python's str(float).
function pyFloat(x) {
  if (Object.is(x, -0)) return '-0.0';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1);
  const s = String(x);
  return s.replace(/e([+-])(\d)$/, 'e$10$2');
}

module.exports = { Random, pyRound, pyFloat };
