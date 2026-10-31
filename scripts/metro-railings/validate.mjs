import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const [validatorDirectory, output] = process.argv.slice(2);
if (!validatorDirectory) throw new Error("Usage: node scripts/metro-railings/validate.mjs <gltf-validator-directory> [report.json]");
const validator = createRequire(import.meta.url)(resolve(validatorDirectory));
const directory = fileURLToPath(new URL("../../public/assets/metro-railings/", import.meta.url));
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
const files = []; let errors = 0, warnings = 0;
for (const entry of manifest.assets) {
  const bytes = await readFile(join(directory, entry.file));
  if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Hash/size mismatch: " + entry.id);
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: entry.file, writeTimestamp: false, maxIssues: 0 });
  errors += result.issues.numErrors; warnings += result.issues.numWarnings;
  files.push({ file: entry.file, ...result.issues });
}
const report = { validator: validator.version(), models: files.length, errors, warnings, hashesVerified: true, files };
if (output) await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ validator: report.validator, models: report.models, errors, warnings, hashesVerified: true }));
if (errors || warnings) process.exitCode = 1;
