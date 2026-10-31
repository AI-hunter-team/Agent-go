import { isReasoningEffort, type ReasoningEffort } from "../src/shared/modelConfig";

export const DEFAULT_MODEL = "deepseek-flash";
export const DEFAULT_BASE_URL = "https://api.deepseek.com";

/** 所有 Responses 请求共用的总输出预算与思考设置。 */
export interface ModelSettings {
  model: string;
  maxTokens: number;
  reasoningEffort: ReasoningEffort;
  openaiStream: boolean;
}

/** 读取配置；旧的独立思考预算不再参与计算。 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ModelSettings {
  const effort = env.OPENAI_REASONING_EFFORT ?? "none";
  if (!isReasoningEffort(effort)) throw new Error("OPENAI_REASONING_EFFORT 必须是 none、low、high 或 max");
  const tokens = Number(env.DECISION_MAX_TOKENS ?? 4096);
  if (!Number.isSafeInteger(tokens) || tokens <= 0) throw new Error("DECISION_MAX_TOKENS 必须为正整数");
  return { model: env.AGENT_MODEL || DEFAULT_MODEL, maxTokens: tokens, reasoningEffort: effort, openaiStream: env.OPENAI_STREAM !== "0" };
}

/** NPC 模型由开发者固定，关闭思考并沿用统一总输出预算，不继承 Agent 的档位。 */
export function npcConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelSettings {
  return configFromEnv({ AGENT_MODEL: env.NPC_MODEL?.trim(), DECISION_MAX_TOKENS: env.DECISION_MAX_TOKENS, OPENAI_REASONING_EFFORT: "none", OPENAI_STREAM: "0" });
}

/** 保留用户填写的基础路径，只清除结尾斜线，不猜测 /v1。 */
export function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("API 地址必须是无账号、查询参数和片段的 HTTP(S) 地址");
  }
  return url.href.replace(/\/+$/, "");
}
