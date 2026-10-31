import { describe, expect, test } from "vitest";
import { configFromEnv } from "../server/claude";
import { createLlm } from "../server/llm";
import { OpenAIClient, OpenAILlmService } from "../server/openai";
import { SessionStore } from "../server/sessions";
import { SAFETY_SYSTEM_PROMPT } from "../server/security";
import { Engine } from "../src/sim/engine";

const cfg = { model: "gpt-6-luna", maxTokens: 4096, maxThinkingTokens: 1024, fallback: false };
const turn = () => ({ triggers: [], lastResult: null, observation: new Engine(1).observe() });
const call = (args = '{"facility":"TVM-1","reason":"先买票"}', id = "call1") => ({
  id, type: "function", function: { name: "join_queue", arguments: args },
});
const completion = (calls = [call()], finish_reason = "tool_calls") => ({
  model: "gpt-6-luna", choices: [{ finish_reason, message: { role: "assistant", content: null, tool_calls: calls } }],
  usage: { prompt_tokens: 100, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 50 }, completion_tokens_details: { reasoning_tokens: 10 } },
});

function fake(responses: unknown[]) {
  const requests: { url: string; init: RequestInit; body: Record<string, any> }[] = [];
  const fetcher = (async (url: string | URL | Request, init: RequestInit) => {
    requests.push({ url: String(url), init, body: JSON.parse(init.body as string) });
    const response = responses.shift();
    return response instanceof Response ? response : Response.json(response);
  }) as typeof fetch;
  const client = new OpenAIClient("https://example.test/v1/", "test-secret", fetcher);
  return { requests, service: new OpenAILlmService(client, cfg) };
}

describe("OpenAI-compatible model", () => {
  test("configured model receives the same custom deadline and crowd settings as the simulation", async () => {
    const settings = { timeLimitSeconds: 90, extraQueuePeople: 3 };
    const { service, requests } = fake([completion()]);
    await service.decide(new SessionStore().create("", null, undefined, settings), { ...turn(), observation: new Engine(1, settings).observe() });
    expect(requests[0].body.messages[0].content).toContain("90 秒（世界时间）");
    expect(requests[0].body.messages[0].content).toContain("额外增加 3 人");
  });
  test("uses the configured endpoint, one required tool and a total completion cap", async () => {
    const { service, requests } = fake([completion()]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toEqual({ type: "join_queue", facility: "TVM-1", reason: "先买票" });
    expect(result.model).toBe("gpt-6-luna");
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30, thinkingTokens: 10, cacheReadTokens: 50 });
    expect(requests[0].url).toBe("https://example.test/v1/chat/completions");
    expect(requests[0].body).toMatchObject({ model: "gpt-6-luna", max_completion_tokens: 4096, reasoning_effort: "low", tool_choice: "required", parallel_tool_calls: false });
    expect(requests[0].body).not.toHaveProperty("fallbacks");
    expect(requests[0].body.tools.every((t: any) => t.function.strict)).toBe(true);
    expect(requests[0].init.redirect).toBe("error");
  });

  test("lets DeepSeek choose whether to call a tool while keeping normal thinking", async () => {
    const deepseekConfig = { ...cfg, model: "deepseek-v4-pro", reasoningEffort: "low" as const };
    const fetcher = (async (_url: string | URL | Request, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({ model: "deepseek-v4-pro", reasoning_effort: "low", tool_choice: "auto" });
      return Response.json({ ...completion(), model: "deepseek-v4-pro" });
    }) as typeof fetch;
    const service = new OpenAILlmService(new OpenAIClient("https://api.deepseek.com/v1", "test-secret", fetcher), deepseekConfig);
    expect((await service.decide(new SessionStore().create("", null), turn())).action).toEqual({ type: "join_queue", facility: "TVM-1", reason: "先买票" });
  });

  test("carries tool results, observations and player guidance between turns and clears sessions", async () => {
    const { service, requests } = fake([completion(), completion([call(undefined, "call2")])]);
    const store = new SessionStore();
    const session = store.create("优先第二台售票机", null);
    await service.decide(session, turn());
    await service.decide(session, { ...turn(), lastResult: { ok: true, text: "已排队" } });
    const messages = requests[1].body.messages;
    expect(messages[0].content.startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
    expect(messages[0].content).not.toContain("优先第二台售票机");
    expect(messages[1]).toMatchObject({ role: "user", content: expect.stringContaining("优先第二台售票机") });
    expect(messages[3].tool_calls[0].id).toBe("call1");
    expect(messages[4]).toMatchObject({ role: "tool", tool_call_id: "call1" });
    expect(messages[4].content).toContain("已排队");
    expect(requests[0].body.messages).toHaveLength(3);
    store.delete(session.id);
    expect(store.create("", null).chatMessages).toEqual([]);
  });

  test.each([
    [completion([call()], "length"), "4096"],
    [completion([call("{")]), "JSON"],
    [completion([call('{"facility":"MOON"}')]), "facility"],
    [completion([]), "实际 0"],
    [completion([call(), call(undefined, "call2")]), "实际 2"],
    [{ choices: [{ finish_reason: "stop", message: { refusal: "refused" } }] }, "拒绝"],
    [{ choices: [] }, "choices"],
  ])("rejects invalid/truncated/refused responses %#", async (response, error) => {
    const { service } = fake([response]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain(error);
  });

  test("answers every rejected batched tool call before retrying", async () => {
    const { service, requests } = fake([completion([call(), call(undefined, "call2")]), completion()]);
    const session = new SessionStore().create("", null);
    await service.decide(session, turn());
    await service.decide(session, { ...turn(), retry: true });
    expect(requests[1].body.messages.slice(4)).toEqual([
      expect.objectContaining({ role: "tool", tool_call_id: "call1" }),
      expect.objectContaining({ role: "tool", tool_call_id: "call2" }),
    ]);
  });

  test("retains empty response evidence without putting blank assistant turns into retry history", async () => {
    const empty = { id: "empty-reply", model: "gpt-6-luna", choices: [{ finish_reason: "stop", message: { role: "assistant", content: "" } }] };
    const { service, requests } = fake([completion(), empty, completion([call(undefined, "call2")])]);
    const session = new SessionStore().create("", null);
    await service.decide(session, turn());
    const failed = await service.decide(session, turn());
    expect(failed.action).toBeNull();
    expect(failed.error).toContain("空响应");
    expect(failed.usage).toBeNull();
    expect(failed.output).toEqual({ id: "empty-reply", stopReason: "stop", content: [empty.choices[0].message] });
    expect(requests).toHaveLength(2); // No hidden transport retry.
    expect((await service.decide(session, { ...turn(), retry: true })).action).not.toBeNull();
    const messages = requests[2].body.messages;
    expect(messages.filter((m: any) => m.role === "assistant")).toEqual([expect.objectContaining({ tool_calls: [call()] })]);
    expect(messages.filter((m: any) => m.role === "tool")).toEqual([expect.objectContaining({ tool_call_id: "call1" })]);
    expect(messages.at(-1)).toMatchObject({ role: "user", content: expect.stringContaining("立即调用一个工具") });
  });

  test("accepts outputs above 1024 when reasoning fits, and rejects reasoning overruns", async () => {
    const within = completion();
    within.usage.completion_tokens = 1600;
    within.usage.completion_tokens_details.reasoning_tokens = 1000;
    const exceeded = structuredClone(within);
    exceeded.usage.completion_tokens_details.reasoning_tokens = 1025;
    const { service } = fake([within, exceeded]);
    const session = new SessionStore().create("", null);
    expect((await service.decide(session, turn())).action).not.toBeNull();
    const result = await service.decide(session, turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain("思考用量 1025 超过 1024");
  });

  test.each([401, 429, 500])("handles HTTP %i without leaking credentials", async (status) => {
    const { service, requests } = fake([new Response("test-secret upstream error", { status })]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("test-secret");
    expect(requests).toHaveLength(1);
  });

  test("normalizes guidance and classifies intent through strict JSON schemas", async () => {
    const guidance = { summary: "求稳", risk: "保守", priorities: [], rules: [], creativeIdeas: [], notExecutable: [], initialPlan: ["先买票"] };
    const jsonCompletion = (data: object) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }] });
    const { service, requests } = fake([jsonCompletion(guidance), jsonCompletion({ mechanic: "jump_gate", reason: "翻越" })]);
    expect(await service.normalize("稳一点")).toEqual(guidance);
    expect(await service.classify("翻过栏杆", null)).toEqual({ mechanic: "jump_gate", reason: "翻越", source: "llm" });
    expect(requests[0].body.response_format.json_schema).toMatchObject({ name: "guidance", strict: true });
    expect(requests[0].body.max_completion_tokens).toBe(4096);
    expect(requests[1].body.max_completion_tokens).toBe(1024);
    for (const request of requests) {
      expect(request.body.messages[0].content.startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
      expect(request.body.messages[1].role).toBe("user");
    }
  });

  test.each([null, {}, { summary: "x", risk: "x", priorities: [123] }])("rejects malformed structured guidance %#", async (value) => {
    const { service } = fake([{ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }]);
    await expect(service.normalize("稳一点")).rejects.toThrow("指导格式");
  });

  test("selects the provider and bounds the configured budget", () => {
    expect(createLlm({})).toBeNull();
    expect(createLlm({ AGENT_PROVIDER: "openai" })).toBeNull();
    const service = createLlm({ OPENAI_API_KEY: "test", OPENAI_BASE_URL: "https://example.test/v1", DECISION_MAX_TOKENS: "9999" });
    expect(service).toBeInstanceOf(OpenAILlmService);
    expect(service?.model).toBe("gpt-6-luna");
    expect(() => createLlm({ AGENT_PROVIDER: "typo" })).toThrow("AGENT_PROVIDER");
  });
});

test("compatible API traces retain returned reasoning, messages and invalid tool arguments", async () => {
  const message = { role: "assistant", content: "先看附近", reasoning_content: "接口返回的摘要", tool_calls: [call("{")] };
  const response = { ...completion(), id: "chat-trace", choices: [{ finish_reason: "tool_calls", message }] };
  const { service } = fake([response]);
  const result = await service.decide(new SessionStore().create("", null), turn());
  expect(result.action).toBeNull();
  expect(result.error).toContain("JSON");
  expect(result.thinking).toBe("接口返回的摘要");
  expect(result.output).toEqual({ id: "chat-trace", stopReason: "tool_calls", content: [message] });
});

test("compatible NPC calls retain paid usage on refusal, malformed output and truncation", async () => {
  const request = { npc: { id: "p2", trait: "普通乘客", temperament: "不赶时间", facility: "TVM-1", queuePosition: 1, queueLength: 2 }, message: "可以让我先吗？", history: [] };
  for (const [value, finish, source] of [
    [{ accepted: true, reply: "可以", reason: "愿意帮忙" }, "stop", "llm"],
    [{ accepted: "true", reply: "可以", reason: "愿意帮忙" }, "stop", "error"],
    [{ accepted: true, reply: "可以", reason: "愿意帮忙" }, "length", "error"],
  ] as const) {
    const response = { ...completion(), choices: [{ finish_reason: finish, message: { role: "assistant", content: JSON.stringify(value) } }] };
    const { service, requests } = fake([response]);
    const result = await service.negotiate(request);
    expect(result.source).toBe(source);
    expect(result.accepted).toBe(source === "llm");
    expect(result.usage?.outputTokens).toBe(30);
    expect(result.output?.content).toEqual([response.choices[0].message]);
    expect(requests).toHaveLength(1);
    expect(requests[0].body.response_format.json_schema.name).toBe("npc_reply");
    expect(requests[0].body.reasoning_effort).toBe("low");
    expect(requests[0].body).not.toHaveProperty("thinking");
    expect(requests[0].body.messages[0].content).toContain(SAFETY_SYSTEM_PROMPT);
  }
});


test("latency settings use none only for the tested Luna model and can restore low/non-streaming", () => {
  expect(configFromEnv({ AGENT_MODEL: "gpt-6-luna" })).toMatchObject({ reasoningEffort: "none", openaiStream: true });
  expect(configFromEnv({ AGENT_MODEL: "other-model" }).reasoningEffort).toBe("low");
  expect(configFromEnv({ AGENT_MODEL: "gpt-6-luna", OPENAI_REASONING_EFFORT: "low", OPENAI_STREAM: "0" })).toMatchObject({ reasoningEffort: "low", openaiStream: false });
  expect(() => configFromEnv({ OPENAI_REASONING_EFFORT: "typo" })).toThrow("OPENAI_REASONING_EFFORT");
});
