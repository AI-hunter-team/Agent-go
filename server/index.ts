import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createApp, type LlmService } from "./app";
import { ClaudeDecider, configFromEnv } from "./claude";
import { SessionStore } from "./sessions";
import { classifyIntent, negotiateNpc, normalizeGuidance } from "./structured";

function createLlm(): LlmService | null {
  const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.AGENT_FORCE_LLM);
  if (!hasCredentials) return null;
  const client = new Anthropic({ timeout: 20_000, maxRetries: 0 });
  const cfg = configFromEnv();
  const decider = new ClaudeDecider(client, cfg);
  return {
    model: cfg.model,
    decide: (session, turn) => decider.decide(session, turn),
    normalize: (text) => normalizeGuidance(client, cfg, text),
    classify: (intent, observation) => classifyIntent(client, cfg, intent, observation),
    negotiate: (request) => negotiateNpc(client, cfg, request),
  };
}

const llm = createLlm();
const app = createApp({ llm, sessions: new SessionStore() });

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(llm ? `Model agent enabled: ${llm.model}` : "No model credentials: offline agent only");
});
