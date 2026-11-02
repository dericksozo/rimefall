// Small seeded RNG. Deterministic for a given seed and call order.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.seed = 1;
    this.random = mulberry32(1);
    this.reset(seed);
  }

  reset(seed = 1) {
    const value = Number(seed);
    const s = Number.isFinite(value) ? value >>> 0 : 1;
    this.seed = s;
    this.random = mulberry32(s);
  }

  next() {
    return this.random();
  }

  // Integer in [0, maxExclusive).
  int(maxExclusive) {
    if (!(maxExclusive > 0)) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  // Integer in [min, max] inclusive.
  range(min, max) {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}
