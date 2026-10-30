import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app";
import { createLlm } from "./llm";
import { SessionStore } from "./sessions";

const llm = createLlm();
const app = createApp({
  llm,
  sessions: new SessionStore(),
  frontendDir: process.env.NODE_ENV === "production" ? resolve("dist") : undefined,
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
  console.log(llm ? `Model agent enabled: ${llm.model}` : "No model credentials: offline agent only");
});

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10_000).unref();
  server.close((error) => {
    clearTimeout(timeout);
    process.exit(error ? 1 : 0);
  });
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
