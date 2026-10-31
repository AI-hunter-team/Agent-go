import type { LlmService } from "./app";
import { configFromEnv, DEFAULT_BASE_URL } from "./modelSettings";
import { ResponsesClient, ResponsesLlmService } from "./responses";
import { debugFetch } from "./debug";

/** 创建唯一的 Responses 通道；没有凭据时保留离线运行。 */
export function createLlm(env: NodeJS.ProcessEnv = process.env): LlmService | null {
  const provider = env.AGENT_PROVIDER || "responses";
  if (provider === "anthropic" || (!env.AGENT_PROVIDER && !env.OPENAI_API_KEY && (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN))) {
    throw new Error("Anthropic 原生通道已停用，请配置 Responses 基础地址、OPENAI_API_KEY 和 AGENT_MODEL；不会自动挪用旧密钥");
  }
  if (!["responses", "openai"].includes(provider)) throw new Error("未知 AGENT_PROVIDER：" + provider);
  if (!env.OPENAI_API_KEY) return null;
  const cfg = configFromEnv(env);
  return new ResponsesLlmService(new ResponsesClient(env.OPENAI_BASE_URL || DEFAULT_BASE_URL, env.OPENAI_API_KEY, debugFetch(), { stream: cfg.openaiStream }), cfg);
}
