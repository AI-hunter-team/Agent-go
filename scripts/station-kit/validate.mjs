import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const validatorPath = process.argv[2], output = process.argv[3];
if (!validatorPath) throw new Error("Usage: node validate.mjs <installed gltf-validator directory> [report output file]");
const validator = createRequire(import.meta.url)(resolve(validatorPath));
const root = fileURLToPath(new URL("../../public/assets/station-kit/", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const files = []; let errors = 0, warnings = 0;
for (const entry of manifest.assets) {
  const bytes = await readFile(join(root, entry.file));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256 || bytes.length !== entry.bytes) throw new Error("Manifest hash/size mismatch: " + entry.file);
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: entry.file, writeTimestamp: false, maxIssues: 0 });
  errors += result.issues.numErrors; warnings += result.issues.numWarnings;
  files.push({ file: entry.file, errors: result.issues.numErrors, warnings: result.issues.numWarnings, infos: result.issues.numInfos, messages: result.issues.messages });
}
const checks = [
  ["wall-straight", [3, 3.5, 0.4]], ["pillar", [2, 3.5, 2.02]], ["floor-ivory", [3, 0.122, 3]],
];
for (const [id, expected] of checks) {
  const asset = manifest.assets.find((a) => a.id === id);
  if (asset.bounds.size.some((v, i) => Math.abs(v - expected[i]) > 0.025)) throw new Error("Model scale contract mismatch: " + id);
}
for (const id of ["ticket-machine", "security-arch", "fare-gate"]) {
  const variants = manifest.assets.filter((a) => a.id === id);
  if (variants.map((v) => v.state).sort().join(",") !== "broken,closed,open") throw new Error("Missing state variant: " + id);
}
const report = { validator: validator.version(), files, modelCount: files.length, textureCount: manifest.materials.length, errors, warnings, sha256Verified: true, dimensionsVerified: checks.map((c) => c[0]) };
if (output) await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ validator: report.validator, models: files.length, errors, warnings, hashes: "verified", dimensions: "verified" }));
if (errors || warnings) process.exitCode = 1;
