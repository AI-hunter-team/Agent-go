import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = Number(process.env.PORT ?? env.PORT ?? 8787);
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": `http://127.0.0.1:${apiPort}` },
    },
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
    },
  };
});
