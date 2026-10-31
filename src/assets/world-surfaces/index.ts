/** Original seamless PBR recipes, fixed coordinates: never consume simulation RNG. */
export type SurfaceKind = "stone" | "plaster" | "steel" | "concrete" | "rubber" | "tactile" | "paint" | "ribbed";
export const SURFACE_METRES: Record<SurfaceKind, number> = { stone: 1.2, plaster: 2, steel: .6, concrete: 2, rubber: .4, tactile: .3, paint: 1, ribbed: .24 };
const noise = (x: number, y: number, salt = 0) => {
  let n = Math.imul(x + 97, 374761393) ^ Math.imul(y + 131, 668265263) ^ Math.imul(salt + 19, 1274126177);
  n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
export function surfacePixels(kind: SurfaceKind, size = 256) {
  const color = new Uint8Array(size * size * 4), normal = new Uint8Array(color.length), roughness = new Uint8Array(color.length), heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, grain = noise(x, y), fine = grain - .5;
    let value = 244, height = .5, rough = .85;
    if (kind === "stone") {
      const chip = noise(Math.floor(u * 92), Math.floor(v * 92), 3);
      const seam = Math.min(u, v, 1 - u, 1 - v) < .003;
      value = seam ? 156 : 230 + fine * 12 + (chip > .94 ? -48 : chip < .06 ? 18 : 0); height = seam ? .28 : .5 + fine * .05; rough = .74 + grain * .13;
    } else if (kind === "plaster") { value = 243 + fine * 13; height = .5 + fine * .13; rough = .94; }
    else if (kind === "concrete") {
      const pit = noise(Math.floor(u * 80), Math.floor(v * 80), 5) > .977;
      value = 226 + fine * 15 - (pit ? 36 : 0); height = .5 + fine * .12 - (pit ? .16 : 0); rough = .93;
    } else if (kind === "steel") { value = 233 + (noise(x, 1, 7) - .5) * 25 + fine * 4; height = .5 + (noise(x, 1, 7) - .5) * .025; rough = .4 + noise(x, 1, 9) * .22; }
    else if (kind === "rubber") { value = 239 + fine * 15; height = .5 + fine * .12; rough = .93; }
    else if (kind === "paint") { value = 248 + fine * 9; height = .5 + fine * .035; rough = .63 + grain * .12; }
    else if (kind === "ribbed") { const rib = (x % (size / 12)) / (size / 12); value = (rib < .3 ? 130 : 241) + fine * 6; height = rib < .3 ? .2 : .8; rough = rib < .3 ? .83 : .46; }
    else {
      const cx = (u * 6) % 1 - .5, cy = (v * 6) % 1 - .5, radius = Math.hypot(cx, cy);
      height = radius < .26 ? .84 : .38; value = radius < .26 ? 248 : 229 + fine * 12; rough = .87;
      if (Math.min(u, v, 1 - u, 1 - v) < .012) { height = .2; value = 180; }
    }
    const i = (y * size + x) * 4; heights[y * size + x] = height;
    color.set([value, value, value, 255], i); const r = Math.round(rough * 255); roughness.set([r, r, r, 255], i);
  }
  const sample = (x: number, y: number) => heights[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (sample(x + 1, y) - sample(x - 1, y)) * 2, dy = (sample(x, y + 1) - sample(x, y - 1)) * 2, length = Math.hypot(dx, dy, 1);
    normal.set([Math.round(128 - dx / length * 127), Math.round(128 - dy / length * 127), Math.round(128 + 1 / length * 127), 255], (y * size + x) * 4);
  }
  return { color, normal, roughness, size, metres: SURFACE_METRES[kind] };
}
