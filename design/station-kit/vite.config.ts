import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
  base: "./",
  server: { host: "127.0.0.1", port: 5190, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
  build: { outDir: fileURLToPath(new URL("../../dist/station-kit-preview", import.meta.url)), emptyOutDir: true },
});
