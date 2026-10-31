import { afterEach, describe, expect, test, vi } from "vitest";
import { configFromEnv, type ClaudeConfig } from "../server/claude";
import { ModelConfigStore } from "../server/modelConfig";
import { OpenAIClient, OpenAILlmService } from "../server/openai";
import { SessionStore } from "../server/sessions";
import { SAFETY_SYSTEM_PROMPT } from "../server/security";
import { GameRunner } from "../src/agent/runner";
import { Engine } from "../src/sim/engine";

const cfg = configFromEnv({ AGENT_MODEL: "deepseek-flash", AGENT_FALLBACK: "off" });
const turn = () => ({ triggers: [], lastResult: null, observation: new Engine(1).observe() });
const call = (id = "call-1", args = { seconds: 2, reason: "观察" }) => ({
  id, type: "function", function: { name: "wait", arguments: JSON.stringify(args) },
});
const completion = (calls = [call()], reasoning = "测试用的供应商返回内容") => ({
  model: "deepseek-flash", choices: [{ finish_reason: "tool_calls", message: {
    role: "assistant", content: null, reasoning_content: reasoning, tool_calls: calls,
  } }],
  usage: { prompt_tokens: 100, completion_tokens: 40, completion_tokens_details: { reasoning_tokens: 20 } },
});
const textCompletion = (value: unknown) => ({ choices: [{ finish_reason: "stop", message: {
  role: "assistant", reasoning_content: "结构化测试返回内容", content: JSON.stringify(value),
} }] });
const npcRequest = { npc: { id: "p2", trait: "普通乘客", temperament: "平和", facility: "TVM-1", queuePosition: 1, queueLength: 2 }, message: "能让我先吗？", history: [] };

function fake(responses: unknown[], url = "https://api.deepseek.com/v1", config: ClaudeConfig = cfg) {
  const requests: Record<string, any>[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    // Model the documented rejection and history requirements, rather than merely returning success.
    if (url === "https://api.deepseek.com/v1") {
      if (body.thinking?.type === "enabled" && body.tool_choice === "required") return Response.json({ error: "thinking/required conflict" }, { status: 400 });
      if (body.tools && body.messages.some((m: any) => m.role === "assistant" && typeof m.reasoning_content !== "string")) {
        return Response.json({ error: "missing reasoning_content" }, { status: 400 });
      }
    }
    const response = responses.shift();
    if (response === undefined) throw new Error("Unexpected extra network request");
    return response instanceof Response ? response : Response.json(response);
  };
  return { requests, service: new OpenAILlmService(new OpenAIClient(url, "fixture-key", fetcher, { stream: config.openaiStream }), config) };
}

afterEach(() => vi.unstubAllEnvs());

describe("DeepSeek thinking Chat Completions", () => {
  test.each(["https://api.deepseek.com", "https://api.deepseek.com/v1", "https://api.deepseek.com/beta"])("keeps thinking enabled and permits ordinary tools on %s", async (url) => {
    const { service, requests } = fake([completion()], url);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.error).toBeNull();
    expect(result.action).toEqual({ type: "wait", seconds: 2, reason: "观察" });
    expect(requests[0]).toMatchObject({ max_tokens: 4096, reasoning_effort: "low", thinking: { type: "enabled" }, tool_choice: "auto", stream: true });
    expect(requests[0]).not.toHaveProperty("max_completion_tokens");
    expect(requests[0]).not.toHaveProperty("parallel_tool_calls");
    expect(requests[0].tools.every((tool: any) => !("strict" in tool.function))).toBe(true);
    const message = requests[0].tools.find((tool: any) => tool.function.name === "talk").function.parameters.properties.message;
    expect(message).not.toHaveProperty("minLength");
    expect(message).not.toHaveProperty("maxLength");
    expect(result.thinking).toBe("测试用的供应商返回内容");
    expect(result.usage?.thinkingTokens).toBe(20);
  });

  test("returns reasoning and tool IDs on every subsequent turn without changing old requests", async () => {
    const { service, requests } = fake([completion(), completion([call("call-2")], "第二轮返回内容"), completion([call("call-3")])]);
    const session = new SessionStore().create("", null);
    for (let i = 0; i < 3; i++) expect((await service.decide(session, { ...turn(), lastResult: i ? { ok: true, text: "已执行等待" } : null })).error).toBeNull();
    expect(requests[0].messages).toHaveLength(3);
    const assistants = requests[2].messages.filter((message: any) => message.role === "assistant");
    expect(assistants.map((message: any) => message.reasoning_content)).toEqual(["测试用的供应商返回内容", "第二轮返回内容"]);
    expect(requests[2].messages.filter((message: any) => message.role === "tool").map((message: any) => message.tool_call_id)).toEqual(["call-1", "call-2"]);
    expect(requests[2].messages.at(-1).content).toContain("已执行等待");
  });

  test("a text-only turn keeps its reasoning and can be corrected by the existing one retry", async () => {
    const text = { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "先观察", reasoning_content: "文本轮次的返回内容" } }] };
    const { service, requests } = fake([text, completion()]);
    const session = new SessionStore().create("", null);
    const engine = new Engine(1);
    const runner = new GameRunner(engine, { kind: "llm", decide: (next) => service.decide(session, next), dispose: async () => {} }, async () => ({ mechanic: "unsupported", reason: "fixture", source: "keywords" }));
    runner.start();
    await runner.pending;
    expect(requests).toHaveLength(2);
    expect(requests[1].messages).toContainEqual({ role: "assistant", content: "先观察", reasoning_content: "文本轮次的返回内容" });
    expect(requests[1].messages.at(-1).content).toContain("立即调用一个工具");
    expect(runner.decisions[0].fallback).toBe(false);
    expect(runner.decisions[0].action?.type).toBe("wait");
    expect(engine.player.activity.kind).toBe("waiting");
    runner.stop();
  });

  test("repeated text-only turns stop at two attempts and use the existing fallback", async () => {
    const text = { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "观察", reasoning_content: "文本轮次" } }] };
    const { service, requests } = fake([text, text]);
    const session = new SessionStore().create("", null);
    const runner = new GameRunner(new Engine(1), { kind: "llm", decide: (next) => service.decide(session, next), dispose: async () => {} }, async () => ({ mechanic: "unsupported", reason: "fixture", source: "keywords" }));
    runner.start();
    await runner.pending;
    expect(requests).toHaveLength(2);
    expect(runner.decisions[0].fallback).toBe(true);
    expect(runner.decisions[0].attempts).toHaveLength(2);
    runner.stop();
  });

  test("multiple tools are rejected and paired before retry, while reasoning remains intact", async () => {
    const { service, requests } = fake([completion([call("a"), call("b")]), completion()]);
    const session = new SessionStore().create("", null);
    const result = await service.decide(session, turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain("实际 2");
    expect((await service.decide(session, { ...turn(), retry: true })).error).toBeNull();
    expect(requests[1].messages[3].reasoning_content).toBe("测试用的供应商返回内容");
    expect(requests[1].messages.slice(4).map((message: any) => message.tool_call_id)).toEqual(["a", "b"]);
  });

  test("relaxing the upstream schema does not permit oversized dialogue arguments", async () => {
    const response = completion();
    response.choices[0].message.tool_calls[0].function = { name: "request_cut_in", arguments: JSON.stringify({ npcId: "p2", message: "问".repeat(201), reason: "让位" }) };
    const { service } = fake([response]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain("200");
  });

  test("reasoning cap still rejects actions and keeps actual usage", async () => {
    const response = completion();
    response.usage.completion_tokens_details.reasoning_tokens = 1025;
    const { service } = fake([response]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain("超过 1024");
    expect(result.usage?.thinkingTokens).toBe(1025);
  });

  test("empty thinking-only output is recorded but does not create a blank history turn", async () => {
    const response = completion([]);
    const { service } = fake([response]);
    const session = new SessionStore().create("", null);
    const result = await service.decide(session, turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain("空响应");
    expect(result.thinking).toBe("测试用的供应商返回内容");
    expect(session.chatMessages).toHaveLength(1);
  });

  test("an explicitly disabled thinking configuration is still respected", async () => {
    const { service, requests } = fake([completion()], undefined, { ...cfg, reasoningEffort: "none" });
    await service.decide(new SessionStore().create("", null), turn());
    expect(requests[0]).toMatchObject({ reasoning_effort: "none", thinking: { type: "disabled" } });
  });

  test.each(["https://gateway.test/v1", "https://api.deepseek.com.example.test/v1"])("does not change the generic provider contract for %s", async (url) => {
    const { service, requests } = fake([completion()], url);
    await service.decide(new SessionStore().create("", null), turn());
    expect(requests[0]).toMatchObject({ max_completion_tokens: 4096, tool_choice: "required", parallel_tool_calls: false });
    expect(requests[0]).not.toHaveProperty("thinking");
    expect(requests[0]).not.toHaveProperty("max_tokens");
    expect(requests[0].tools.every((tool: any) => tool.function.strict === true)).toBe(true);
  });

  test("fragmented streamed reasoning is assembled and returned in the next request", async () => {
    const stream = (id: string) => {
      const event = (delta: object, finish: string | null = null, usage?: object) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }], usage })}\n\n`;
      return new Response(event({ role: "assistant", reasoning_content: "分段" }) + event({ reasoning_content: "内容" })
        + event({ tool_calls: [{ index: 0, id, type: "function", function: { name: "wait", arguments: '{"seconds":2,"reason":"观察"}' } }] })
        + event({}, "tool_calls", { completion_tokens: 25, completion_tokens_details: { reasoning_tokens: 10 } }) + 'data: [DONE]\n\n',
      { headers: { "content-type": "text/event-stream" } });
    };
    const { service, requests } = fake([stream("s1"), stream("s2")]);
    const session = new SessionStore().create("", null);
    expect((await service.decide(session, turn())).thinking).toBe("分段内容");
    expect((await service.decide(session, turn())).action?.type).toBe("wait");
    expect(requests[1].messages[3]).toMatchObject({ reasoning_content: "分段内容", tool_calls: [{ id: "s1" }] });
  });
});

describe("DeepSeek JSON operations and browser configuration", () => {
  test("guidance, classification and NPC output use JSON mode with local schema validation", async () => {
    const guidance = { summary: "试着翻闸", risk: "激进", priorities: [], rules: [], creativeIdeas: ["翻闸"], notExecutable: [], initialPlan: ["先观察"] };
    const { service, requests } = fake([textCompletion(guidance), textCompletion({ mechanic: "jump_gate", reason: "翻越" }), textCompletion({ accepted: true, reply: "可以", reason: "愿意帮助" })]);
    expect(await service.normalize("试着翻闸")).toEqual(guidance);
    expect(await service.classify("翻闸", null)).toMatchObject({ mechanic: "jump_gate", source: "llm" });
    expect(await service.negotiate(npcRequest)).toMatchObject({ accepted: true, source: "llm" });
    expect(requests.map((body) => body.max_tokens)).toEqual([4096, 1024, 1024]);
    for (const body of requests) {
      expect(body).toMatchObject({ thinking: { type: "enabled" }, reasoning_effort: "low", response_format: { type: "json_object" } });
      expect(body).not.toHaveProperty("max_completion_tokens");
      expect(body.response_format).not.toHaveProperty("json_schema");
      expect(body.messages[0].content.startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
      expect(body.messages[0].content).toContain('"properties"');
      expect(body.messages[1].content).toContain("不可信 JSON 数据");
    }
  });

  test("invalid or blank JSON never grants NPC consent or rewrites guidance/classification", async () => {
    const { service } = fake([
      textCompletion({ summary: "x", risk: "x", priorities: [42] }),
      textCompletion({ mechanic: "invented", reason: "x" }),
      textCompletion({ accepted: "true", reply: "可以", reason: "x" }),
      { choices: [{ finish_reason: "stop", message: { content: "   " } }] },
    ]);
    await expect(service.normalize("正常排队")).rejects.toThrow("指导格式");
    await expect(service.classify("翻闸", null)).rejects.toThrow("分类格式");
    expect(await service.negotiate(npcRequest)).toMatchObject({ accepted: false, source: "error" });
    expect(await service.negotiate(npcRequest)).toMatchObject({ accepted: false, source: "error" });
  });

  test("page configuration probes use the same thinking-compatible profile", async () => {
    vi.stubEnv("OPENAI_REASONING_EFFORT", "low");
    const requests: Record<string, any>[] = [];
    const store = new ModelConfigStore(async (input, init) => {
      if (String(input).endsWith("/models")) return Response.json({ data: [{ id: "deepseek-flash" }] });
      requests.push(JSON.parse(String(init?.body)));
      return Response.json(completion());
    });
    const { token } = await store.verify("https://api.deepseek.com", "fixture-key");
    expect(await store.enable(token, "deepseek-flash")).toEqual({ llm: true, model: "deepseek-flash" });
    expect(requests[0]).toMatchObject({ tool_choice: "auto", thinking: { type: "enabled" }, reasoning_effort: "low", max_tokens: 4096 });
    expect(JSON.stringify(requests)).not.toContain("fixture-key");
  });
});
