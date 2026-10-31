import { interpret, type Structured } from "./boss";
import { respond } from "./npcDialogue";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmService } from "./app";
import { ClaudeDecider, configFromEnv } from "./claude";
import { OpenAIClient, OpenAILlmService } from "./openai";
import { classifyIntent, negotiateNpc, normalizeGuidance, structuredCall } from "./structured";
import { debugFetch } from "./debug";

export function createLlm(env: NodeJS.ProcessEnv = process.env): LlmService | null {
  const provider = env.AGENT_PROVIDER || (env.OPENAI_API_KEY ? "openai" : "anthropic");
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) return null;
    const cfg = configFromEnv({ ...env, AGENT_MODEL: env.AGENT_MODEL || "gpt-6-luna", AGENT_FALLBACK: "off" });
    return new OpenAILlmService(new OpenAIClient(env.OPENAI_BASE_URL || "https://api.openai.com/v1", env.OPENAI_API_KEY, debugFetch(), { stream: cfg.openaiStream }), cfg);
  }
  if (provider !== "anthropic") throw new Error(`未知 AGENT_PROVIDER：${provider}`);
  if (!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.AGENT_FORCE_LLM)) return null;
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY ?? null,
    authToken: env.ANTHROPIC_AUTH_TOKEN ?? null,
    baseURL: env.ANTHROPIC_BASE_URL,
    timeout: 20_000,
    maxRetries: 0,
    fetch: debugFetch(),
  });
  const cfg = configFromEnv(env);
  const decider = new ClaudeDecider(client, cfg);
  const call: Structured = async (system, user, schema, _name, maxTokens) => {
    let metadata: import("../src/shared/interaction").ModelMetadata = {model:cfg.model,usage:null};
    try { const value=await structuredCall(client,cfg,{system,user,schema,maxTokens,validate:(value):value is unknown=>value!==undefined,onResponse:response=>{
      const u=response.usage; metadata={model:response.model,usage:u?{inputTokens:(u.input_tokens??0)+(u.cache_read_input_tokens??0)+(u.cache_creation_input_tokens??0),outputTokens:u.output_tokens??0,thinkingTokens:u.output_tokens_details?.thinking_tokens??null,cacheReadTokens:u.cache_read_input_tokens??0}:null};
    }});
    return {value,metadata};
    } catch(error) { throw Object.assign(error instanceof Error ? error : new Error("结构化调用失败"),{modelMetadata:metadata}); }
  };
  return {
    interpret: (instruction, context) => interpret(call, instruction, context),
    respond: (request) => respond(call, request),
    model: cfg.model,
    decide: (session, turn) => decider.decide(session, turn),
    normalize: (text) => normalizeGuidance(client, cfg, text),
    classify: (intent, observation) => classifyIntent(client, cfg, intent, observation),
    negotiate: (request) => negotiateNpc(client, cfg, request),
  };
}
