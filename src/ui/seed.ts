/** Eight-digit scenario IDs are easy to copy and fit within the simulator's uint32 seed. */
export function randomSeed(previous?: number): number {
  const seed = 10_000_000 + Math.floor(Math.random() * 90_000_000);
  return seed === previous ? (seed === 99_999_999 ? 10_000_000 : seed + 1) : seed;
}
