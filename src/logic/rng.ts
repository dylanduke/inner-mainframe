export class RNG {
    constructor(public seed: number) {
      if (seed === 0) this.seed = 0x9e3779b9; // avoid zero state
    }
    next(): number {
      // xorshift32
      let x = this.seed | 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.seed = x | 0;
      // 0..1
      return ((x >>> 0) / 0xffffffff);
    }
    pick<T>(arr: T[]): T {
      return arr[Math.floor(this.next() * arr.length)];
    }
  }
  