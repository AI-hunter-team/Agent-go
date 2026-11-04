import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const excluded = new Set([".git", ".codex", ".agents", ".vscode", "api-debug", "node_modules", "dist", "build", "coverage", "tmp", "temp", "logs"]);
async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(e => !excluded.has(e.name)).map(e =>
    e.isDirectory() ? markdownFiles(resolve(dir, e.name)) : e.name.endsWith(".md") ? [resolve(dir, e.name)] : []));
  return nested.flat();
}
function prose(text) {
  let fence = null;
  return text.split(/\r?\n/).map(line => {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (match) { if (!fence) fence = match[1][0]; else if (match[1][0] === fence) fence = null; return ""; }
    return fence ? "" : line;
  }).join("\n");
}
function anchors(text) {
  const found = new Set(), counts = new Map();
  for (const line of prose(text).split("\n")) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const slug = heading[1].toLowerCase().replace(/<[^>]*>/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[\p{P}\p{S}]/gu, ch => ch === "-" || ch === "_" ? ch : "").replace(/\s/g, "-");
      const count = counts.get(slug) ?? 0; counts.set(slug, count + 1);
      found.add(count ? slug + "-" + count : slug);
    }
    for (const id of line.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) found.add(id[1]);
  }
  return found;
}

/** Local paths and Markdown heading anchors only; no network requests. */
export async function checkDocs(root) {
  const files = await markdownFiles(root), errors = [], cache = new Map();
  for (const file of files) {
    const raw = await readFile(file, "utf8"), text = prose(raw);
    const targets = [...text.matchAll(/!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\)/g)].map(m => m[1]);
    for (const m of text.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>\n]+>|\S+)/gm)) targets.push(m[1]);
    if (/(?:[A-Za-z]:[\\/]+Users[\\/]+(?!Public\b)|\/Users\/[^/\s]+\/)/.test(raw)) errors.push(relative(root, file) + ": personal machine path");
    for (let target of targets) {
      target = target.replace(/^<|>$/g, "");
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) continue;
      const hash = target.indexOf("#"), pathPart = hash < 0 ? target : target.slice(0, hash);
      let fragment = hash < 0 ? "" : target.slice(hash + 1), decoded;
      try { decoded = decodeURIComponent(pathPart); fragment = decodeURIComponent(fragment); }
      catch { errors.push(relative(root, file) + ": invalid encoding " + target); continue; }
      const dest = decoded ? resolve(dirname(file), decoded) : file, rel = relative(root, dest);
      if (isAbsolute(rel) || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../")) { errors.push(relative(root, file) + ": link outside repository " + target); continue; }
      try { await stat(dest); } catch { errors.push(relative(root, file) + ": missing " + target); continue; }
      if (fragment && extname(dest) === ".md") {
        if (!cache.has(dest)) cache.set(dest, anchors(await readFile(dest, "utf8")));
        if (!cache.get(dest).has(fragment)) errors.push(relative(root, file) + ": missing anchor " + target);
      }
    }
  }
  return { files: files.length, errors };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkDocs(resolve(process.argv[2] ?? "."));
  for (const error of result.errors) console.error(error);
  console.log("Checked " + result.files + " Markdown files; " + result.errors.length + " local link/path errors. External URLs were not fetched.");
  process.exitCode = result.errors.length ? 1 : 0;
}
