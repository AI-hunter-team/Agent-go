import Anthropic from "@anthropic-ai/sdk";
import type { LlmService } from "./app";
import { ClaudeDecider, configFromEnv } from "./claude";
import { OpenAIClient, OpenAILlmService } from "./openai";
import { classifyIntent, normalizeGuidance } from "./structured";

export function createLlm(env: NodeJS.ProcessEnv = process.env): LlmService | null {
  const provider = env.AGENT_PROVIDER || (env.OPENAI_API_KEY ? "openai" : "anthropic");
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) return null;
    const cfg = configFromEnv({ ...env, AGENT_MODEL: env.AGENT_MODEL || "gpt-6-luna", AGENT_FALLBACK: "off" });
    return new OpenAILlmService(new OpenAIClient(env.OPENAI_BASE_URL || "https://api.openai.com/v1", env.OPENAI_API_KEY), cfg);
  }
  if (provider !== "anthropic") throw new Error(`未知 AGENT_PROVIDER：${provider}`);
  if (!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.AGENT_FORCE_LLM)) return null;
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY ?? null,
    authToken: env.ANTHROPIC_AUTH_TOKEN ?? null,
    baseURL: env.ANTHROPIC_BASE_URL,
    timeout: 20_000,
    maxRetries: 0,
  });
  const cfg = configFromEnv(env);
  const decider = new ClaudeDecider(client, cfg);
  return {
    model: cfg.model,
    decide: (session, turn) => decider.decide(session, turn),
    normalize: (text) => normalizeGuidance(client, cfg, text),
    classify: (intent, observation) => classifyIntent(client, cfg, intent, observation),
  };
}
