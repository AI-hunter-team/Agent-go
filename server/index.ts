import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app";
import { createLlm } from "./llm";
import { SessionStore } from "./sessions";
import { debugLoggerFromEnv } from "./debug";
import { configFromEnv } from "./modelSettings";

const llm = createLlm();
const debugLogger = debugLoggerFromEnv();
const provider = "responses";
if (process.env.DECISION_THINKING_TOKENS !== undefined) console.warn("DECISION_THINKING_TOKENS 已停用；使用 OPENAI_REASONING_EFFORT 与 DECISION_MAX_TOKENS。");
const config = configFromEnv({ ...process.env, AGENT_MODEL: llm?.model ?? process.env.AGENT_MODEL });
const app = createApp({ llm, sessions: new SessionStore(), frontendDir: process.env.NODE_ENV === "production" ? resolve("dist") : undefined, debugLogger, modelParameters: {
  provider, ...config, model: llm?.model ?? null, effort: config.reasoningEffort, timeoutMs: 20_000, transportRetries: 0,
} });

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
  console.log(llm ? `Model agent enabled: ${llm.model}` : "No model credentials: offline agent only");
  console.log("Boss and NPC dialogue use each session’s bound model configuration");
  console.log("Review uses the run’s user model when configured, otherwise the server default");
  console.log(debugLogger.enabled ? "Debug JSONL logging enabled" : "Debug file logging disabled");
});

let closing = false;
/** 优雅停止 HTTP 服务，最多等待 10 秒释放连接。 */
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
