/**
 * Deterministic seeded RNG — Mulberry32.
 * Tiny, fast, good enough for procedural world gen.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Ensure non-zero 32-bit state
    this.state = (seed | 0) || 0x9e3779b9;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  unitVector3(out: [number, number, number]): [number, number, number] {
    // Uniformly distributed point on unit sphere (Marsaglia).
    const u = this.range(-1, 1);
    const theta = this.range(0, Math.PI * 2);
    const s = Math.sqrt(1 - u * u);
    out[0] = s * Math.cos(theta);
    out[1] = s * Math.sin(theta);
    out[2] = u;
    return out;
  }

  // Derive a new independent RNG from a child index. Lets us make
  // per-star / per-planet seeds without affecting parent stream.
  child(index: number): Rng {
    return new Rng(this.state ^ (index * 0x9e3779b1));
  }
}
