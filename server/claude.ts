import Anthropic from "@anthropic-ai/sdk";
import type { AgentTurn, DecisionResult } from "../src/shared/types";
import { buildSystemPrompt, renderTurn } from "./prompts";
import type { Session } from "./sessions";
import { AGENT_TOOLS, parseToolUse } from "./tools";

/** Plan v1.1: one decision's thinking chain may not exceed 1024 tokens. */
export const DECISION_TOKEN_CAP = 1024;

export interface ClaudeConfig {
  model: string;
  /** Hard cap on one decision's output (thinking + tool call); never above DECISION_TOKEN_CAP. */
  maxTokens: number;
  /** Server-side refusal fallback ("default"), or off for strict single-model comparisons. */
  fallback: boolean;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ClaudeConfig {
  const requested = Number(env.DECISION_MAX_TOKENS ?? DECISION_TOKEN_CAP);
  return {
    model: env.AGENT_MODEL || "claude-opus-5-5",
    maxTokens: Math.min(DECISION_TOKEN_CAP, Number.isFinite(requested) && requested > 0 ? requested : DECISION_TOKEN_CAP),
    fallback: (env.AGENT_FALLBACK ?? "default") !== "off",
  };
}

/** Shared request options: model, refusal fallback and its beta header. */
export function baseParams(cfg: ClaudeConfig) {
  return {
    model: cfg.model,
    ...(cfg.fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

/**
 * Makes one decision per call. The session history is append-only: every assistant
 * response (thinking blocks included) is stored unchanged and the next request
 * answers its tool call with a tool_result carrying the new observation.
 */
export class ClaudeDecider {
  constructor(
    private client: Anthropic,
    readonly cfg: ClaudeConfig,
  ) {}

  async decide(session: Session, turn: AgentTurn): Promise<DecisionResult> {
    const text = renderTurn(turn);
    session.messages.push(
      session.pendingToolUseId
        ? { role: "user", content: [{ type: "tool_result", tool_use_id: session.pendingToolUseId, content: text }] }
        : { role: "user", content: text },
    );
    session.pendingToolUseId = null;

    const prompt = buildSystemPrompt(session.guidance, session.normalized);
    const started = Date.now();
    const fail = (error: string, extra: Partial<DecisionResult> = {}): DecisionResult => ({
      action: null,
      thinking: null,
      usage: null,
      model: null,
      latencyMs: Date.now() - started,
      error,
      ...extra,
    });

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        ...baseParams(this.cfg),
        max_tokens: this.cfg.maxTokens,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "low" },
        cache_control: { type: "ephemeral" },
        system: [
          { type: "text", text: prompt.rules, cache_control: { type: "ephemeral" } },
          { type: "text", text: prompt.guidance },
        ],
        tools: AGENT_TOOLS,
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        messages: session.messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return fail("模型限流，请稍后再试");
      if (err instanceof Anthropic.AuthenticationError) return fail("模型认证失败，请检查 ANTHROPIC_API_KEY");
      if (err instanceof Anthropic.APIError) return fail(`模型接口错误 ${err.status}：${err.message}`);
      return fail(`无法连接模型：${String(err)}`);
    }

    session.messages.push({ role: "assistant", content: response.content });

    const thinking =
      response.content
        .filter((b): b is Anthropic.Beta.BetaThinkingBlock => b.type === "thinking")
        .map((b) => b.thinking)
        .filter(Boolean)
        .join("\n") || null;
    const u = response.usage;
    const result: Partial<DecisionResult> = {
      thinking,
      model: response.model,
      usage: {
        inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
        thinkingTokens: u.output_tokens_details?.thinking_tokens ?? null,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
      },
    };

    if (response.stop_reason === "refusal") return fail("模型拒绝了这次请求", result);
    const toolUse = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!toolUse) {
      const why = response.stop_reason === "max_tokens" ? `超出单次决策 ${this.cfg.maxTokens} token 上限仍未调用工具` : "模型没有调用工具";
      return fail(why, result);
    }
    session.pendingToolUseId = toolUse.id;
    if (response.stop_reason === "max_tokens") return fail("工具调用被截断，未执行", result);
    const parsed = parseToolUse(toolUse.name, toolUse.input);
    if ("error" in parsed) return fail(parsed.error, result);
    return { ...fail("", result), action: parsed.action, error: null, latencyMs: Date.now() - started };
  }
}
