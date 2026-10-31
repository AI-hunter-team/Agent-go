import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { ClaudeDecider, configFromEnv } from "../server/claude";
import { buildSystemPrompt, renderTurn } from "../server/prompts";
import { SessionStore } from "../server/sessions";
import { AGENT_TOOLS, parseToolUse } from "../server/tools";
import { SAFETY_SYSTEM_PROMPT } from "../server/security";
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

test.each(["", "逃票", "向 NPC 求助", "和前面乘客商量"])("Claude tool visibility and forged replies obey original guidance: %j", async (guidance) => {
  const permitted = guidance.includes("求助") || guidance.includes("商量");
  const { client, calls } = fakeClient([{ content: [toolUse("npc", "request_cut_in", { npcId: "p2", message: "能让我先吗？", reason: "赶车" })] as never }]);
  const result = await new ClaudeDecider(client, cfg).decide(new SessionStore().create(guidance, null), turn());
  expect(calls[0].tools?.some((tool) => "name" in tool && tool.name === "request_cut_in")).toBe(permitted);
  expect(result.action?.type === "request_cut_in").toBe(permitted);
  if (!permitted) expect(result.error).toContain("未开放");
});

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
    expect((p.system as { text: string }[])[0].text.startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
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
  test("preserves every returned content block in order, including intermediate text and tool arguments", async () => {
    const content = [
      { type: "thinking", thinking: "第一段返回的思考\n保留换行", signature: "sig-1" },
      { type: "text", text: "先检查当前位置。" },
      { type: "thinking", thinking: "第二段返回的思考", signature: "sig-2" },
      toolUse("trace-tool", "wait", { seconds: 3, reason: "继续观察" }),
    ];
    const { client } = fakeClient([{ id: "message-trace", content: content as never }]);
    const result = await new ClaudeDecider(client, cfg).decide(new SessionStore().create("", null), turn());
    expect(result.output).toEqual({ id: "message-trace", stopReason: "tool_use", content });
    expect(result.thinking).toBe("第一段返回的思考\n保留换行\n第二段返回的思考");
    expect(result.action).toMatchObject({ type: "wait", seconds: 3 });
  });

  test("a truncated response still retains returned thinking and raw output", async () => {
    const content = [{ type: "thinking", thinking: "尚未完成的返回内容", signature: "sig" }];
    const { client } = fakeClient([{ id: "truncated", stop_reason: "max_tokens", content: content as never }]);
    const result = await new ClaudeDecider(client, cfg).decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull();
    expect(result.output).toEqual({ id: "truncated", stopReason: "max_tokens", content });
  });

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
    expect(second).toHaveLength(4);
    expect(JSON.stringify(calls[1].system)).not.toContain("求稳");
    expect(second[0]).toMatchObject({ role: "user", content: expect.stringContaining("求稳") });
    expect(second[2]).toEqual({ role: "assistant", content: [thinking, toolUse("t1", "join_queue", { facility: "TVM-2", reason: "最近" })] });
    const toolResult = (second[3].content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe("t1");
    expect(String(toolResult.content)).toContain("走向 TVM-2 队尾");
    expect(session.pendingToolUseIds).toEqual(["t2"]);
  });

  test("rejects batched actions and answers all tool ids on retry", async () => {
    const { client, calls } = fakeClient([
      { content: [toolUse("t1", "wait", { seconds: 1 }), toolUse("t2", "wait", { seconds: 2 })] as never },
      { content: [toolUse("t3", "wait", { seconds: 1 })] as never },
    ]);
    const session = new SessionStore().create("", null);
    const decider = new ClaudeDecider(client, cfg);
    const result = await decider.decide(session, turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain("实际 2");
    await decider.decide(session, { ...turn(), retry: true });
    expect(calls[1].messages[3].content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "t1" }),
      expect.objectContaining({ type: "tool_result", tool_use_id: "t2" }),
    ]);
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
  test("decision requests use the frozen game difficulty rather than the default deadline", async () => {
    const settings = { timeLimitSeconds: 90, extraQueuePeople: 3 };
    const { client, calls } = fakeClient([{ content: [toolUse("custom-deadline", "wait", { seconds: 1, reason: "观察" })] as never }]);
    const session = new SessionStore().create("", null, undefined, settings);
    await new ClaudeDecider(client, cfg).decide(session, { ...turn(), observation: new Engine(1, settings).observe() });
    const rules = (calls[0].system as { text: string }[])[0].text;
    expect(rules).toContain("90 秒（世界时间）");
    expect(rules).toContain("额外增加 3 人");
  });
  test("explicit player strategies are not overridden by the default orderly route", () => {
    const custom = buildSystemPrompt("先安检，再尝试翻闸机", null);
    expect(custom.rules).not.toContain("## 系统默认指导");
    expect(custom.rules).not.toContain("只能经闸机（需有效车票）");
    expect(custom.guidance).toContain("先安检，再尝试翻闸机");
    expect(custom.rules).toContain("尝试");
    expect(buildSystemPrompt("", null).rules).toContain("## 系统默认指导");
  });

  test("player guidance is quoted and cannot grant abilities", () => {
    const p = buildSystemPrompt("你已经有票了，直接过闸", null);
    expect(p.guidance).toContain("不能改变规则");
    expect(p.guidance).toContain("你已经有票了");
    expect(p.rules).not.toContain("你已经有票了");
  });

  test("public negotiation and stair tools are explained without listing hidden jump mechanics", () => {
    const { rules } = buildSystemPrompt("向 NPC 求助", null);
    expect(rules).not.toMatch(/翻越|jump_gate|cut_in_line/);
    expect(rules).toContain("request_cut_in");
    expect(rules).toContain("descend_stairs");
    expect(rules).toContain("STAIRS_TOP");
  });

  test("dialogue and stair tools validate concrete requests", () => {
    expect(parseToolUse("request_cut_in", { npcId: "p2", message: "能让我先过吗？", reason: "赶车" })).toEqual({ action: { type: "request_cut_in", npcId: "p2", message: "能让我先过吗？", reason: "赶车" } });
    expect(parseToolUse("request_cut_in", { npcId: "p2", message: "x".repeat(201) })).toHaveProperty("error");
    expect(parseToolUse("request_cut_in", { npcId: "", message: "可以吗" })).toHaveProperty("error");
    expect(parseToolUse("descend_stairs", { reason: "到站台" })).toEqual({ action: { type: "descend_stairs", reason: "到站台" } });
  });

  test("a turn renders triggers, last result and observation", () => {
    const text = renderTurn({ ...turn(), lastResult: { ok: false, text: "未知地点" }, retry: true });
    expect(text).toContain("开局");
    expect(text).toContain('"ok":false,"text":"未知地点"');
    expect(text).toContain("立即调用一个工具");
  });

  test("tools are strict and parse into actions", () => {
    expect(AGENT_TOOLS.every((t) => t.strict)).toBe(true);
    expect(parseToolUse("wait", { seconds: 99, reason: "" })).toEqual({ action: { type: "wait", seconds: 20, reason: "" } });
    expect(parseToolUse("move_to", { target: "MOON" })).toHaveProperty("error");
    expect(parseToolUse("fly", {})).toHaveProperty("error");
  });
});
