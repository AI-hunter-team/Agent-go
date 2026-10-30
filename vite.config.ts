import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
