import { readFile, readdir, stat, mkdir, writeFile, copyFile, cp } from "node:fs/promises";
import { resolve } from "node:path";

// Include installed build-time modules whose code may be bundled into the frontend.
// Platform-specific packages not installed here are omitted; tracked files are never written.
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const sections = [await readFile("THIRD_PARTY_NOTICES.md", "utf8"), await readFile("licenses/README.md", "utf8"), "Google Material Design Icons\n" + await readFile("public/assets/icons/LICENSE", "utf8")];
const supplements = new Map([
  ["@react-three/fiber@8.18.0", "react-three-fiber"], ["maath@0.10.8", "maath"],
  ["stats-gl@2.4.2", "stats-gl"], ["stackback@0.0.2", "stackback"],
  ["@mediapipe/tasks-vision@0.10.17", "mediapipe"], ["draco3d@1.5.9", "draco3d"],
]);
for (const path of Object.keys(lock.packages).filter(p => p.includes("node_modules/")).sort()) {
  let pkg;
  try { pkg = JSON.parse(await readFile(resolve(path, "package.json"), "utf8")); } catch { continue; }
  const names = (await readdir(path)).filter(n => /^(?:licen[cs]e|copying|notice)(?:[.-]|$)/i.test(n));
  const texts = [];
  for (const name of names) if ((await stat(resolve(path, name))).isFile()) texts.push(name + "\n" + await readFile(resolve(path, name), "utf8"));
  const supplement = supplements.get(pkg.name + "@" + pkg.version);
  if (!texts.length && supplement) texts.push(await readFile("licenses/" + supplement + ".txt", "utf8"));
  if (!texts.length && (pkg.name.startsWith("@esbuild/") || pkg.name.startsWith("@rollup/rollup-"))) {
    const host = pkg.name.startsWith("@esbuild/") ? "esbuild" : "rollup";
    const hostDir = resolve(path, "../..", host), hostMeta = JSON.parse(await readFile(resolve(hostDir, "package.json"), "utf8"));
    if (hostMeta.version !== pkg.version) throw new Error("Platform/host license version mismatch: " + pkg.name);
    texts.push(await readFile(resolve(hostDir, "LICENSE.md"), "utf8"));
  }
  if (!texts.length) {
    const readme = (await readdir(path)).find(n => /^readme(?:\.md)?$/i.test(n));
    if (readme) {
      const body = await readFile(resolve(path, readme), "utf8"), start = body.search(/^#{1,3}\s+(?:license|copyright)/im);
      if (start >= 0) texts.push(body.slice(start));
    }
  }
  const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  sections.push(["===== " + pkg.name + "@" + pkg.version + " =====", "Declared license: " + (pkg.license ?? "not declared"), repo ?? "", ...texts,
    ...(!texts.length ? ["No standalone license text shipped in this installed package; see its declared license and upstream repository."] : [])].join("\n"));
}
await mkdir("dist", { recursive: true });
await writeFile("dist/THIRD_PARTY_NOTICES.txt", sections.join("\n\n"), "utf8");
await copyFile("LICENSE", "dist/LICENSE");
await cp("licenses", "dist/licenses", { recursive: true });
console.log("Copied project license and dependency notices into dist/.");
