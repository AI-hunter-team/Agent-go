import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { classifyIntent, negotiateNpc, normalizeGuidance } from "../server/structured";
import type { CutInDialogueRequest } from "../src/shared/types";
import { SAFETY_SYSTEM_PROMPT } from "../server/security";

const cfg = { model: "claude-opus-5-5", maxTokens: 4096, maxThinkingTokens: 1024, fallback: false };

function fakeClient(output: string | { name: string; input: unknown }, stop_reason = "end_turn", extra: Record<string, unknown> = {}) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const requestOptions: unknown[] = [];
  const client = {
    beta: {
      messages: {
        create: async (p: Anthropic.Beta.MessageCreateParamsNonStreaming, options?: unknown) => {
          calls.push(p);
          requestOptions.push(options);
          return {
            id: "msg-structured",
            type: "message",
            role: "assistant",
            model: "api-returned-model",
            stop_sequence: null,
            usage: { input_tokens: 100, output_tokens: 25, cache_read_input_tokens: 20, cache_creation_input_tokens: 10, output_tokens_details: { thinking_tokens: 7 } },
            stop_reason,
            content: typeof output === "string"
              ? [{ type: "text", text: output }]
              : [{ type: "tool_use", id: "structured-1", ...output }],
            ...extra,
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls, requestOptions };
}

describe("structured calls", () => {
  test("guidance normalization returns the parsed structure via a JSON schema", async () => {
    const g = { summary: "求稳", priorities: ["稳定"], risk: "保守", rules: [], creativeIdeas: [], notExecutable: [], initialPlan: ["去售票机"] };
    const { client, calls } = fakeClient(JSON.stringify(g));
    expect(await normalizeGuidance(client, cfg, "稳一点")).toEqual(g);
    expect(calls[0].output_config?.format?.type).toBe("json_schema");
    expect(calls[0].fallbacks).toBeUndefined();
    expect(String(calls[0].system).startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
  });

  test("classification is constrained to the closed mechanic list", async () => {
    const { client, calls } = fakeClient(JSON.stringify({ mechanic: "jump_gate", reason: "翻越" }));
    expect(await classifyIntent(client, cfg, "从栏杆上跨过去", null)).toEqual({ mechanic: "jump_gate", reason: "翻越", source: "llm" });
    const schema = calls[0].output_config?.format?.schema as { properties: { mechanic: { enum: string[] } } };
    expect(schema.properties.mechanic.enum).toEqual(["cut_in_line", "jump_gate", "unsupported"]);
    expect(String(calls[0].system).startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
  });

  test("refusals and truncation raise so the API falls back to keywords", async () => {
    await expect(classifyIntent(fakeClient("", "refusal").client, cfg, "x", null)).rejects.toThrow();
    await expect(normalizeGuidance(fakeClient("{", "max_tokens").client, cfg, "x")).rejects.toThrow();
  });

  test("DeepSeek returns guidance through a named tool instead of unsupported JSON schema output", async () => {
    const g = { summary: "观察队伍", priorities: ["比较速度"], risk: "未说明", rules: [], creativeIdeas: [], notExecutable: [], initialPlan: ["去售票区"] };
    const { client, calls } = fakeClient({ name: "structured_output", input: g }, "tool_use");
    expect(await normalizeGuidance(client, { ...cfg, model: "deepseek-flash" }, "观察队伍长度、速度和人群组成")).toEqual(g);
    expect(calls[0].thinking).toEqual({ type: "disabled" });
    expect(calls[0].output_config?.format).toBeUndefined();
    expect(calls[0].tool_choice).toEqual({ type: "tool", name: "structured_output" });
    expect(calls[0].tools?.[0]).toMatchObject({ name: "structured_output", input_schema: { required: ["summary", "priorities", "risk", "rules", "creativeIdeas", "notExecutable", "initialPlan"] } });
  });

  test("DeepSeek classifies creative intents through structured tool arguments", async () => {
    const { client } = fakeClient({ name: "structured_output", input: { mechanic: "jump_gate", reason: "翻越栏杆" } }, "tool_use");
    expect(await classifyIntent(client, { ...cfg, model: "deepseek-flash" }, "跨过栏杆", null)).toEqual({ mechanic: "jump_gate", reason: "翻越栏杆", source: "llm" });
  });

  test("DeepSeek rejects missing, malformed or truncated structured tool output", async () => {
    const deepseek = { ...cfg, model: "deepseek-flash" };
    for (const output of ["```json\n{}\n```", { name: "other_tool", input: {} }, { name: "structured_output", input: null }, { name: "structured_output", input: {} }]) {
      await expect(normalizeGuidance(fakeClient(output).client, deepseek, "观察队伍")).rejects.toThrow("结构化");
    }
    await expect(classifyIntent(fakeClient({ name: "structured_output", input: { mechanic: "jump_gate" } }).client, deepseek, "跨过栏杆", null)).rejects.toThrow("结构化");
    await expect(normalizeGuidance(fakeClient({ name: "structured_output", input: {} }, "max_tokens").client, deepseek, "观察队伍")).rejects.toThrow("截断");
  });
});

const npcRequest: CutInDialogueRequest = {
  npc: { id: "p-12", trait: "年轻乘客", temperament: "不喜欢插队，自己也赶时间", facility: "tvm-1", queuePosition: 2, queueLength: 5 },
  message: "您好，我的车快开了，能让我先买票吗？",
  history: [{ message: "您好。", reply: "有什么事？", accepted: false }],
};

describe("model NPC negotiation", () => {
  test("Claude returns the NPC's decision with its raw response and real usage", async () => {
    const decision = { accepted: false, reply: "我也赶时间，请按顺序排队。", reason: "不愿因让位而耽误自己的行程。" };
    const raw = JSON.stringify(decision);
    const { client, calls, requestOptions } = fakeClient(raw);
    const result = await negotiateNpc(client, { ...cfg, fallback: true }, npcRequest);
    expect(result).toEqual({
      ...decision, source: "llm", model: "api-returned-model",
      usage: { inputTokens: 130, outputTokens: 25, thinkingTokens: 7, cacheReadTokens: 20 },
      output: { id: "msg-structured", stopReason: "end_turn", content: [{ type: "text", text: raw }] },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].output_config?.format?.type).toBe("json_schema");
    expect(calls[0].fallbacks).toBeUndefined();
    expect(requestOptions).toEqual([{ maxRetries: 0 }]);
    expect(JSON.parse((calls[0].messages[0].content as string).split("\n").slice(1).join("\n"))).toEqual(npcRequest);
  });

  test("DeepSeek roleplays the NPC through a forced named tool", async () => {
    const decision = { accepted: true, reply: "你先吧，祝你赶上车。", reason: "愿意帮忙且自己不着急。" };
    const { client, calls } = fakeClient({ name: "structured_output", input: decision }, "tool_use");
    const result = await negotiateNpc(client, { ...cfg, model: "deepseek-flash" }, npcRequest);
    expect(result).toMatchObject({ ...decision, source: "llm", usage: { inputTokens: 130, outputTokens: 25 } });
    expect(result.output?.content).toEqual([{ type: "tool_use", id: "structured-1", name: "structured_output", input: decision }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].thinking).toEqual({ type: "disabled" });
    expect(calls[0].tool_choice).toEqual({ type: "tool", name: "structured_output" });
    expect(calls[0].output_config?.format).toBeUndefined();
    expect(calls[0].tools?.[0]).toMatchObject({ name: "structured_output", input_schema: { required: ["accepted", "reply", "reason"] } });
  });

  test.each([
    ["not JSON", "end_turn", "claude-opus-5-5"],
    [JSON.stringify({ accepted: "true", reply: "你先吧", reason: "愿意帮助" }), "end_turn", "claude-opus-5-5"],
    [JSON.stringify({ accepted: true, reply: "", reason: "愿意帮助" }), "end_turn", "claude-opus-5-5"],
    [JSON.stringify({ accepted: true, reply: "你先吧", reason: "" }), "end_turn", "claude-opus-5-5"],
    [JSON.stringify({ accepted: true, reply: "你先吧", reason: "愿意帮助" }), "max_tokens", "claude-opus-5-5"],
    ["", "refusal", "claude-opus-5-5"],
    [{ name: "other_tool", input: { accepted: true, reply: "你先吧", reason: "愿意帮助" } }, "tool_use", "deepseek-flash"],
    [{ name: "structured_output", input: { accepted: 1, reply: "你先吧", reason: "愿意帮助" } }, "tool_use", "deepseek-flash"],
  ] as const)("invalid, truncated or refused NPC output fails closed and retains usage: %#", async (output, stopReason, model) => {
    const { client, calls } = fakeClient(output, stopReason);
    const result = await negotiateNpc(client, { ...cfg, model }, npcRequest);
    expect(result).toMatchObject({ accepted: false, source: "error", model: "api-returned-model", usage: { inputTokens: 130, outputTokens: 25 } });
    expect(result.reason).toContain("未获得插队许可");
    expect(result.reply.trim()).not.toBe("");
    expect(result.output?.content).toEqual(typeof output === "string" ? [{ type: "text", text: output }] : [{ type: "tool_use", id: "structured-1", ...output }]);
    expect(calls).toHaveLength(1);
  });

  test("transport errors return an explicit failure after one attempt", async () => {
    let calls = 0;
    const client = { beta: { messages: { create: async () => { calls++; throw new Error("timeout"); } } } } as unknown as Anthropic;
    const result = await negotiateNpc(client, cfg, npcRequest);
    expect(result).toMatchObject({ accepted: false, source: "error", model: cfg.model, usage: null });
    expect(result.reason).toContain("timeout");
    expect(result.output).toBeUndefined();
    expect(calls).toBe(1);
  });

  test("preserves every API-returned content block without inventing reasoning", async () => {
    const content = [
      { type: "thinking", thinking: "API 返回的思考", signature: "unchanged" },
      { type: "text", text: JSON.stringify({ accepted: false, reply: "请按顺序。", reason: "重视公平。" }) },
    ];
    const { client } = fakeClient("", "end_turn", { content });
    const result = await negotiateNpc(client, cfg, npcRequest);
    expect(result.output?.content).toEqual(content);
    expect(result.output?.content).not.toBe(content);
    expect(result).not.toHaveProperty("thinking");
  });
});
