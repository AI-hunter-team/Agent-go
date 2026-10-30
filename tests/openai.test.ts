import { describe, expect, test } from "vitest";
import { createLlm } from "../server/llm";
import { OpenAIClient, OpenAILlmService } from "../server/openai";
import { SessionStore } from "../server/sessions";
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

  test("carries tool results, observations and player guidance between turns and clears sessions", async () => {
    const { service, requests } = fake([completion(), completion([call(undefined, "call2")])]);
    const store = new SessionStore();
    const session = store.create("优先第二台售票机", null);
    await service.decide(session, turn());
    await service.decide(session, { ...turn(), lastResult: { ok: true, text: "已排队" } });
    const messages = requests[1].body.messages;
    expect(messages[0].content).toContain("优先第二台售票机");
    expect(messages[2].tool_calls[0].id).toBe("call1");
    expect(messages[3]).toMatchObject({ role: "tool", tool_call_id: "call1" });
    expect(messages[3].content).toContain("已排队");
    expect(requests[0].body.messages).toHaveLength(2);
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
    expect(requests[1].body.messages.slice(3)).toEqual([
      expect.objectContaining({ role: "tool", tool_call_id: "call1" }),
      expect.objectContaining({ role: "tool", tool_call_id: "call2" }),
    ]);
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
