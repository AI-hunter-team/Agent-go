/** Deterministic PRNG (mulberry32). Same seed ⇒ same sequence. */
export class Rng {
  private state: number;
  private readonly seedBase: number;

  constructor(seed: number) {
    this.seedBase = seed >>> 0;
    this.state = this.seedBase;
  }

  /** Does not advance this stream. Retain the child; the same label restarts it. */
  fork(label: string): Rng {
    return new Rng(this.seedBase ^ fnv1a(label));
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/** FNV-1a over UTF-8 bytes, with unsigned 32-bit overflow. */
function fnv1a(label: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(label)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}
