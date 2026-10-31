import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

const root = resolve(process.argv[2] ?? "preview"), port = Number(process.argv[3] ?? 5191);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".glb": "model/gltf-binary", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const file = resolve(root, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Content-Length": info.size, "Cache-Control": "no-cache" });
    if (req.method === "HEAD") res.end(); else createReadStream(file).on("error", () => res.destroy()).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
server.on("error", (error) => {
  console.error("Preview server could not listen (" + error.code + "). Choose another port: node serve.mjs preview <port>");
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => console.log("Station kit preview: http://127.0.0.1:" + server.address().port + "/"));
