import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv[2]) throw new Error("Provide a new destination directory outside the source repository.");
const target = resolve(process.argv[2]), root = fileURLToPath(new URL("../../", import.meta.url));
const fromRoot = relative(root, target);
if (fromRoot === "" || (!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(".." + sep))) {
  throw new Error("Destination must be outside the source repository.");
}
try { await stat(target); throw new Error("Destination already exists: refusing to overwrite."); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
await mkdir(target, { recursive: true });
await mkdir(join(target, "preview"), { recursive: true });
await cp(join(root, "dist/station-kit-preview/index.html"), join(target, "preview/index.html"));
await cp(join(root, "dist/station-kit-preview/assets"), join(target, "preview/assets"), { recursive: true });
for (const relative of ["src/assets/station-kit", "scripts/station-kit", "design/station-kit", "docs/tasks/ASSET-KIT-001.md", "docs/validation/ASSET-KIT-001.md", "docs/validation/ASSET-KIT-001-V2.md"]) {
  await mkdir(dirname(join(target, "source", relative)), { recursive: true });
  await cp(join(root, relative), join(target, "source", relative), { recursive: true });
}
await mkdir(join(target, "THIRD-PARTY-LICENSES"), { recursive: true });
await cp(join(root, "node_modules/three/LICENSE"), join(target, "THIRD-PARTY-LICENSES/three.txt"));
await cp(join(root, "scripts/station-kit/serve.mjs"), join(target, "serve.mjs"));
await writeFile(join(target, "start-preview.cmd"), "@echo off\r\ncd /d \"%~dp0\"\r\nnode serve.mjs preview 5191\r\npause\r\n");
await writeFile(join(target, "README.md"), await readFile(join(root, "design/station-kit/README.md")));
console.log(JSON.stringify({ package: target, assets: "preview/assets/station-kit", preview: "start-preview.cmd" }));
