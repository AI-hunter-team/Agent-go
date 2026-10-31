import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const validator = createRequire(import.meta.url)(resolve(process.argv[2] ?? "tmp/metro-tools/node_modules/gltf-validator"));
const directory = new URL("../../public/assets/metro-train/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
const reports = [];
for (const entry of manifest.assets) {
  const bytes = await readFile(new URL(entry.file, directory));
  assert.equal(bytes.length, entry.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const doors = json.nodes.filter((node) => node.extras?.role === "metroDoor"); assert.equal(doors.length, 20);
  assert(doors.every((node) => node.translation[0] === node.extras.closedX && Math.abs(node.extras.travel) === 0.665));
  assert(entry.triangles < 100000); assert(entry.bounds.size[0] > 22.7 && entry.bounds.size[0] < 23.6); assert(entry.bounds.size[2] > 3.6 && entry.bounds.size[2] < 3.85);
  assert(entry.cabin.clearHeight > 2.65 && entry.cabin.clearHeight < 2.75);
  assert.equal(json.images.length, 3); assert(json.images.every(image => image.bufferView !== undefined && image.mimeType === "image/png"));
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: entry.file, writeTimestamp: false, maxIssues: 0 });
  reports.push({ file: entry.file, issues: result.issues, info: result.info });
}
const errors = reports.reduce((n, r) => n + r.issues.numErrors, 0), warnings = reports.reduce((n, r) => n + r.issues.numWarnings, 0);
await mkdir("tmp", { recursive: true });
await writeFile("tmp/metro-train-gltf-validation.json", JSON.stringify({ validator: validator.version(), reports }, null, 2));
console.log(JSON.stringify({ validator: validator.version(), models: reports.length, errors, warnings, hashes: "verified", doors: "verified", proportions: "verified" }));
assert.equal(errors, 0); assert.equal(warnings, 0);
