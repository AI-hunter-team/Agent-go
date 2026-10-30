import "dotenv/config";
import { createApp } from "./app";
import { createLlm } from "./llm";
import { SessionStore } from "./sessions";
import { debugLoggerFromEnv } from "./debug";
import { configFromEnv } from "./claude";

const llm = createLlm();
const debugLogger = debugLoggerFromEnv();
const app = createApp({ llm, sessions: new SessionStore(), debugLogger, modelParameters: {
  provider: process.env.AGENT_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "anthropic"),
  ...configFromEnv(), model: llm?.model ?? null, effort: "low", timeoutMs: 20_000, transportRetries: 0,
} });

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(llm ? `Model agent enabled: ${llm.model}` : "No model credentials: offline agent only");
  console.log(debugLogger.enabled ? "Debug JSONL logging enabled" : "Debug file logging disabled");
});
