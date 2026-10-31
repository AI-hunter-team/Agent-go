import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  cacheDir: fileURLToPath(new URL("../../node_modules/.vite-metro-train", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)), base: "./",
  server: { host: "127.0.0.1", port: 5197, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
  build: { outDir: fileURLToPath(new URL("../../dist/metro-train-preview", import.meta.url)), emptyOutDir: true },
});
