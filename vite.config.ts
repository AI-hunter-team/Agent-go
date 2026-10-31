import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = Number(process.env.PORT ?? env.PORT ?? 8787);
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": `http://127.0.0.1:${apiPort}` },
    },
    build: { rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), showroom: fileURLToPath(new URL("./showroom.html", import.meta.url)), validation: fileURLToPath(new URL("./validation.html", import.meta.url)) } } },
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
    },
  };
});
