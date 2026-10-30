import Anthropic from "@anthropic-ai/sdk";
import type { AgentTurn, DecisionResult } from "../src/shared/types";
import { buildSystemPrompt, renderTurn } from "./prompts";
import type { Session } from "./sessions";
import { AGENT_TOOLS, parseToolUse } from "./tools";

/** Plan v1.1 limits reasoning only; action output has a separate budget. */
export const THINKING_TOKEN_CAP = 1024;
export const DEFAULT_OUTPUT_TOKENS = 4096;

export interface ClaudeConfig {
  model: string;
  /** Total completion safety limit, separate from the reasoning allowance. */
  maxTokens: number;
  /** Requested reasoning allowance; checked when the provider returns token details. */
  maxThinkingTokens: number;
  /** Server-side refusal fallback ("default"), or off for strict single-model comparisons. */
  fallback: boolean;
  /** Compatible API only; support depends on the chosen provider/model. */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  openaiStream?: boolean;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ClaudeConfig {
  const requested = Number(env.DECISION_MAX_TOKENS ?? DEFAULT_OUTPUT_TOKENS);
  const thinking = Number(env.DECISION_THINKING_TOKENS ?? THINKING_TOKEN_CAP);
  const maxThinkingTokens = Math.min(THINKING_TOKEN_CAP, Number.isFinite(thinking) && thinking > 0 ? Math.floor(thinking) : THINKING_TOKEN_CAP);
  const effort = env.OPENAI_REASONING_EFFORT ?? (env.AGENT_MODEL === "gpt-6-luna" ? "none" : "low");
  if (!["none", "minimal", "low", "medium", "high"].includes(effort)) throw new Error("OPENAI_REASONING_EFFORT 配置无效");
  return {
    reasoningEffort: effort as ClaudeConfig["reasoningEffort"],
    openaiStream: env.OPENAI_STREAM !== "0",
    model: env.AGENT_MODEL || "claude-opus-5-5",
    maxTokens: Math.max(maxThinkingTokens + 1024, Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_OUTPUT_TOKENS),
    maxThinkingTokens,
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
      session.pendingToolUseIds.length
        ? { role: "user", content: session.pendingToolUseIds.map((id) => ({ type: "tool_result" as const, tool_use_id: id, content: text })) }
        : { role: "user", content: text },
    );
    session.pendingToolUseIds = [];

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
          { type: "text", text: `本次思考预算不超过 ${this.cfg.maxThinkingTokens} token，动作输出另计。` },
        ],
        tools: AGENT_TOOLS,
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        messages: [{ role: "user", content: prompt.guidance }, ...session.messages],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return fail("模型限流，请稍后再试");
      if (err instanceof Anthropic.AuthenticationError) return fail("模型认证失败，请检查 ANTHROPIC_API_KEY");
      if (err instanceof Anthropic.APIError) return fail(`模型接口错误 ${err.status}，请检查接口配置或稍后重试`);
      return fail("无法连接模型，请检查接口配置或稍后重试");
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
      output: { id: response.id ?? null, stopReason: response.stop_reason ?? null, content: structuredClone(response.content) },
      model: response.model,
      usage: {
        inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
        thinkingTokens: u.output_tokens_details?.thinking_tokens ?? null,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
      },
    };

    if (response.stop_reason === "refusal") return fail("模型拒绝了这次请求", result);
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    session.pendingToolUseIds = toolUses.map((tool) => tool.id);
    if (!toolUses.length) {
      const why = response.stop_reason === "max_tokens" ? `超出单次决策 ${this.cfg.maxTokens} token 上限仍未调用工具` : "模型没有调用工具";
      return fail(why, result);
    }
    if (toolUses.length !== 1) return fail(`模型必须调用且只调用一个工具，实际 ${toolUses.length} 个，未执行`, result);
    const toolUse = toolUses[0];
    if ((result.usage?.thinkingTokens ?? 0) > this.cfg.maxThinkingTokens) {
      return fail(`思考用量 ${result.usage!.thinkingTokens} 超过 ${this.cfg.maxThinkingTokens} token，未执行`, result);
    }
    if (response.stop_reason === "max_tokens") return fail("工具调用被截断，未执行", result);
    const parsed = parseToolUse(toolUse.name, toolUse.input);
    if ("error" in parsed) return fail(parsed.error, result);
    return { ...fail("", result), action: parsed.action, error: null, latencyMs: Date.now() - started };
  }
}
