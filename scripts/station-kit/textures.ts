import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const table = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(kind: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(kind), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  const header = Buffer.alloc(4), tail = Buffer.alloc(4);
  header.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, tail]);
}
function png(size: number, rgba: Uint8Array) {
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function random(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export async function generateTextures(directory: string, size = 512) {
  if (![128, 256, 512, 1024].includes(size)) throw new Error("Texture size must be 128, 256, 512 or 1024.");
  await mkdir(directory, { recursive: true });
  const records: object[] = [];
  for (const [family, seed, grain] of [["terrazzo", 851, 0.006], ["plaster", 271, 0.012], ["coating", 913, 0.004]] as const) {
    const rng = random(seed), count = size * size;
    const color = new Uint8Array(count * 4), height = new Float32Array(count), rough = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      const noise = (Math.floor(rng() * 4) - 1.5) / 3;
      const grey = family === "terrazzo" ? 240 : 250;
      color.set([grey + noise * 4, grey + noise * 4, grey + noise * 4, 255], i * 4);
      height[i] = noise * grain;
      const value = Math.round((family === "plaster" ? 0.9 : family === "coating" ? 0.62 : 0.43) * 255 + noise * 8);
      rough.set([value, value, value, 255], i * 4);
    }
    if (family === "terrazzo") {
      const palette = [[176, 183, 171], [205, 194, 170], [220, 215, 199], [156, 170, 158], [229, 228, 216]];
      // Torus-wrapped polygons: fragments can cross every tile boundary without seams.
      for (let chip = 0; chip < 4700; chip++) {
        const cx = rng() * size, cy = rng() * size, rx = (0.0015 + rng() * 0.0035) * size, ry = rx * (0.55 + rng() * 0.7);
        const angle = rng() * Math.PI * 2, base = palette[Math.floor(rng() * palette.length)];
        const cos = Math.cos(angle), sin = Math.sin(angle), radius = Math.ceil(Math.max(rx, ry));
        for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
          const nx = (ox * cos + oy * sin) / rx, ny = (-ox * sin + oy * cos) / ry;
          if (Math.abs(nx) + Math.abs(ny) > 1.32 || nx * nx + ny * ny > 1) continue;
          const x = (Math.floor(cx + ox) + size) % size, y = (Math.floor(cy + oy) + size) % size, i = y * size + x;
          color.set([...base, 255], i * 4); height[i] += 0.0015;
        }
      }
    }
    const normal = new Uint8Array(count * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size];
      const dy = height[(y + 1) % size * size + x] - height[(y + size - 1) % size * size + x];
      const length = Math.hypot(dx * 2, dy * 2, 1);
      normal.set([Math.round(128 - dx * 254 / length), Math.round(128 + dy * 254 / length), Math.round(128 + 127 / length), 255], i * 4);
    }
    for (const [kind, data] of [["color", color], ["normal", normal], ["roughness", rough]] as const) {
      const file = family + "-" + kind + ".png";
      const bytes = png(size, data); await writeFile(join(directory, file), bytes);
      records.push({ file, family, map: kind, width: size, height: size, bytes: bytes.length, source: "original-seeded-procedural", seed, tilingMetres: 3 });
    }
  }
  return records;
}
