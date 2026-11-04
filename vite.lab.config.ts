import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** This port belongs to the lab, including a browser refresh at its root URL. */
const labEntry: Plugin = {
  name: "behavior-lab-entry",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? "/", "http://behavior-lab.local");
      if (["GET", "HEAD"].includes(req.method ?? "GET") && ["/", "/index.html", "/lab"].includes(url.pathname)) {
        res.writeHead(302, { Location: `/lab.html${url.search}`, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  mode: "behavior-lab",
  appType: "mpa",
  cacheDir: "node_modules/.vite-behavior-lab",
  plugins: [labEntry, react()],
  define: { __LAB_COMMIT__: JSON.stringify(execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()) },
  server: { host: "127.0.0.1", port: 5175, strictPort: true, watch: { ignored: ["**/tmp/**", "**/temp/**", "**/logs/**", "**/build/**"] }, proxy: { "/api": `http://127.0.0.1:${process.env.PORT ?? 8790}` } },
  build: { outDir: "tmp/behavior-lab-build", rollupOptions: { input: resolve("lab.html") } },
});
