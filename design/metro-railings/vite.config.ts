import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const output = fileURLToPath(new URL("../../dist/metro-railings/", import.meta.url));
export default defineConfig({
  root, base: "./", publicDir: false,
  build: { outDir: output, emptyOutDir: true, target: "es2022" },
  plugins: [{ name: "copy-metro-railing-assets", async closeBundle() {
    await mkdir(output + "/assets", { recursive: true });
    await cp(fileURLToPath(new URL("../../public/assets/metro-railings/", import.meta.url)), output + "/assets/metro-railings", { recursive: true });
  } }],
});
