import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app";
import { createLlm, createNpcLlm } from "./llm";
import { SessionStore } from "./sessions";
import { debugLoggerFromEnv } from "./debug";
import { configFromEnv } from "./claude";

const llm = createLlm();
const npcLlm = createNpcLlm();
const debugLogger = debugLoggerFromEnv();
const provider = process.env.AGENT_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "anthropic");
const config = configFromEnv({ ...process.env, AGENT_MODEL: llm?.model ?? process.env.AGENT_MODEL });
const app = createApp({ llm, npcLlm, sessions: new SessionStore(), frontendDir: process.env.NODE_ENV === "production" ? resolve("dist") : undefined, debugLogger, modelParameters: {
  provider,
  ...config, model: llm?.model ?? null, effort: provider === "openai" ? config.reasoningEffort : "low", timeoutMs: 20_000, transportRetries: 0,
}, npcModelParameters: {
  provider: process.env.NPC_PROVIDER || (process.env.NPC_OPENAI_API_KEY ? "openai" : "anthropic"),
  model: npcLlm?.model ?? null, maxTokens: 1024, fallback: false,
  ...(npcLlm?.model === "kimi-k2.6" ? { thinking: { type: "disabled" }, effort: null } : { effort: "low" }),
  timeoutMs: 20_000, transportRetries: 0,
} });

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
  console.log(llm ? `Model agent enabled: ${llm.model}` : "No model credentials: offline agent only");
  console.log(npcLlm ? `NPC model enabled: ${npcLlm.model}` : "No developer NPC model configured: NPC negotiation unavailable");
  console.log(debugLogger.enabled ? "Debug JSONL logging enabled" : "Debug file logging disabled");
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
