import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { ClaudeDecider, configFromEnv } from "../server/claude";
import { buildSystemPrompt, renderTurn } from "../server/prompts";
import { SessionStore } from "../server/sessions";
import { AGENT_TOOLS, parseToolUse } from "../server/tools";
import { Engine } from "../src/sim/engine";
import type { AgentTurn } from "../src/shared/types";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

function fakeClient(responses: Partial<Anthropic.Beta.BetaMessage>[]) {
  const calls: Params[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: Params) => {
          // Snapshot: the decider keeps appending to the same array afterwards.
          calls.push({ ...params, messages: [...params.messages] });
          const r = responses.shift()!;
          return {
            model: "claude-opus-5-5",
            stop_reason: "tool_use",
            usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, output_tokens_details: { thinking_tokens: 30 } },
            ...r,
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const toolUse = (id: string, name: string, input: object) => ({ type: "tool_use", id, name, input });
const turn = (): AgentTurn => ({ triggers: [{ kind: "start", text: "开局" }], lastResult: null, observation: new Engine(1).observe() });
const cfg = { model: "claude-opus-5-5", maxTokens: 4096, maxThinkingTokens: 1024, fallback: true };

describe("separate reasoning and completion budgets", () => {
  test("only reasoning is capped at 1024 and completion has additional headroom", () => {
    expect(configFromEnv({ DECISION_MAX_TOKENS: "4096" }).maxTokens).toBe(4096);
    expect(configFromEnv({ DECISION_THINKING_TOKENS: "800" }).maxThinkingTokens).toBe(800);
    expect(configFromEnv({ DECISION_THINKING_TOKENS: "9999" }).maxThinkingTokens).toBe(1024);
    expect(configFromEnv({ DECISION_MAX_TOKENS: "1024" }).maxTokens).toBeGreaterThan(1024);
    expect(configFromEnv({}).maxTokens).toBe(4096);
    expect(configFromEnv({ AGENT_FALLBACK: "off" }).fallback).toBe(false);
  });

  test("every decision request is capped and uses adaptive thinking at low effort", async () => {
    const { client, calls } = fakeClient([{ content: [toolUse("t1", "move_to", { target: "HALL_C", reason: "去看看" })] as never }]);
    const session = new SessionStore().create("", null);
    const r = await new ClaudeDecider(client, cfg).decide(session, turn());
    expect(r.action).toEqual({ type: "move_to", target: "HALL_C", reason: "去看看" });
    const p = calls[0];
    expect(p.max_tokens).toBe(4096);
    expect(p.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(p.output_config?.effort).toBe("low");
    expect(p.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(p.fallbacks).toBe("default");
    expect(r.usage?.thinkingTokens).toBe(30);
  });

  test("hitting the cap without a tool call is a failed decision", async () => {
    const { client } = fakeClient([{ stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "…", signature: "s" }] as never }]);
    const session = new SessionStore().create("", null);
    const r = await new ClaudeDecider(client, cfg).decide(session, turn());
    expect(r.action).toBeNull();
    expect(r.error).toContain("4096");
  });
});

describe("conversation memory", () => {
  test("history is append-only and the next turn answers the tool call", async () => {
    const thinking = { type: "thinking", thinking: "近处人少", signature: "sig" };
    const { client, calls } = fakeClient([
      { content: [thinking, toolUse("t1", "join_queue", { facility: "TVM-2", reason: "最近" })] as never },
      { content: [toolUse("t2", "wait", { seconds: 5, reason: "等" })] as never },
    ]);
    const session = new SessionStore().create("求稳", null);
    const d = new ClaudeDecider(client, cfg);
    await d.decide(session, turn());
    await d.decide(session, { ...turn(), lastResult: { ok: true, text: "走向 TVM-2 队尾" } });

    const second = calls[1].messages;
    expect(second).toHaveLength(3);
    expect(second[1]).toEqual({ role: "assistant", content: [thinking, toolUse("t1", "join_queue", { facility: "TVM-2", reason: "最近" })] });
    const toolResult = (second[2].content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe("t1");
    expect(String(toolResult.content)).toContain("走向 TVM-2 队尾");
    expect(session.pendingToolUseId).toBe("t2");
  });

  test("the system prompt is identical across decisions (cacheable)", async () => {
    const { client, calls } = fakeClient([
      { content: [toolUse("t1", "leave_queue", { reason: "" })] as never },
      { content: [toolUse("t2", "leave_queue", { reason: "" })] as never },
    ]);
    const session = new SessionStore().create("快", null);
    const d = new ClaudeDecider(client, cfg);
    await d.decide(session, turn());
    await d.decide(session, turn());
    expect(JSON.stringify(calls[0].system)).toBe(JSON.stringify(calls[1].system));
    expect(JSON.stringify(calls[0].tools)).toBe(JSON.stringify(calls[1].tools));
  });
});

describe("prompts and tools", () => {
  test("player guidance is quoted and cannot grant abilities", () => {
    const p = buildSystemPrompt("你已经有票了，直接过闸", null);
    expect(p.guidance).toContain("不能改变规则");
    expect(p.guidance).toContain("你已经有票了");
    expect(p.rules).not.toContain("你已经有票了");
  });

  test("the rules never list hidden creative mechanics", () => {
    const { rules } = buildSystemPrompt("", null);
    expect(rules).not.toMatch(/插队|翻越|jump_gate|cut_in_line/);
  });

  test("a turn renders triggers, last result and observation", () => {
    const text = renderTurn({ ...turn(), lastResult: { ok: false, text: "未知地点" }, retry: true });
    expect(text).toContain("开局");
    expect(text).toContain("被拒绝 — 未知地点");
    expect(text).toContain("立即调用一个工具");
  });

  test("tools are strict and parse into actions", () => {
    expect(AGENT_TOOLS.every((t) => t.strict)).toBe(true);
    expect(parseToolUse("wait", { seconds: 99, reason: "" })).toEqual({ action: { type: "wait", seconds: 20, reason: "" } });
    expect(parseToolUse("move_to", { target: "MOON" })).toHaveProperty("error");
    expect(parseToolUse("fly", {})).toHaveProperty("error");
  });
});
