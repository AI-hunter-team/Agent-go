import { generateWorld, publicMap } from "../src/sim/worldDefinition";
import { describe, expect, test } from "vitest";
import { configFromEnv } from "../server/modelSettings";
import { createLlm } from "../server/llm";
import { ResponsesLlmService } from "../server/responses";
import { SessionStore } from "../server/sessions";
import { SAFETY_SYSTEM_PROMPT } from "../server/security";
import { Engine } from "../src/sim/engine";
import { cfg, fake, response, toolCall, turn } from "./responsesSupport";

describe("Responses decisions", () => {
  test("the model receives public refusal progress and the unexecuted candidate correction", async () => {
    const { service, requests } = fake([response()]);
    const progress = {
      instruction: "插队，被拒后换话术", status: "pending" as const, npcId: "p21", goal: "yield" as const,
      sameNpc: false, remaining: 1, history: [{ npcId: "p21", goal: "yield" as const, message: "能先走吗", reply: "我也赶时间", decision: "refuse" as const, goalAchieved: false }],
    };
    await service.decide(new SessionStore().create("插队，被拒后换话术", null), { ...turn(), dialogueFollowThrough: progress, correction: "直接等待的候选动作未执行" });
    const rendered = requests[0].body.input.at(-1).content as string;
    const observation = JSON.parse(rendered.split("\n")[1]);
    expect(observation.dialogueFollowThrough).toEqual(progress);
    expect(JSON.parse(rendered.split("\n")[3])).toEqual({ correction: "直接等待的候选动作未执行" });
  });
  test("uses DeepSeek root, disabled reasoning and one strict required function", async () => {
    const { service, requests } = fake([response()]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toEqual({ type: "join_queue", facility: "TVM-1", reason: "先买票" });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30, thinkingTokens: 10, cacheReadTokens: 50 });
    expect(requests[0].url).toBe("https://api.deepseek.com/responses");
    expect(requests[0].body).toMatchObject({ model: "deepseek-flash", reasoning: { effort: "none" }, max_output_tokens: 4096, stream: true,
      store: false, include: ["reasoning.encrypted_content"], tool_choice: "required", parallel_tool_calls: false });
    expect(requests[0].body.tools.every((tool: any) => tool.type === "function" && tool.strict && tool.parameters && !tool.function)).toBe(true);
    expect(requests[0].body).not.toHaveProperty("messages");
    expect(requests[0].body).not.toHaveProperty("stream_options");
    expect(requests[0].init.redirect).toBe("error");
  });

  test("preserves reasoning, guidance and tool results through the complete local history", async () => {
    const thought = { type: "reasoning", id: "rs1", content: [{ type: "reasoning_text", text: "保留原样" }], encrypted_content: "opaque" };
    const output = [thought, toolCall(undefined, "first")];
    const { service, requests } = fake([response({ output }), response()]);
    const store = new SessionStore();
    const session = store.create("优先第二台售票机", null);
    const first = await service.decide(session, turn());
    await service.decide(session, { ...turn(), lastResult: { ok: true, text: "已排队" } });
    expect(first.thinking).toBe("保留原样");
    expect(first.output?.content).toEqual(output);
    expect(first.output?.content).not.toBe(output);
    expect(requests[1].body.instructions.startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
    expect(requests[1].body.instructions).not.toContain("优先第二台售票机");
    expect(requests[1].body.input[0].content).toContain("优先第二台售票机");
    expect(requests[1].body.input).toContainEqual(thought);
    expect(requests[1].body.input.at(-1)).toMatchObject({ type: "function_call_output", call_id: "first", output: expect.stringContaining("已排队") });
    expect(requests[1].body.instructions).toBe(requests[0].body.instructions);
    expect(requests[1].body.tools).toEqual(requests[0].body.tools);
    expect(requests[1].body).not.toHaveProperty("previous_response_id");
    store.delete(session.id);
    expect(store.create("", null).responseItems).toEqual([]);
  });

  test.each([
    [response({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), "4096"],
    [response({ status: "failed", error: { code: "error", message: "test-secret" } }), "未成功"],
    [response({ output: [toolCall("{")] }), "JSON"],
    [response({ output: [toolCall('{"facility":"MOON"}')] }), "facility"],
    [response({ output: [] }), "实际 0"],
    [response({ output: [toolCall(), toolCall()] }), "实际 2"],
    [response({ output: [toolCall(undefined, "same"), toolCall(undefined, "same")] }), "重复"],
    [response({ output: [{ type: "function_call", name: "wait" }] }), "结构"],
    [response({ output: [{ type: "message", content: [{ type: "refusal", refusal: "refused" }] }] }), "拒绝"],
    [response({ output: [{ type: "web_search_call" }] }), "未授权"],
    [{ choices: [] }, "Responses"],
  ])("rejects malformed, refused and incomplete output %#", async (value, error) => {
    const { service } = fake([value as object]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull();
    expect(result.error).toContain(error as string);
    expect(result.error).not.toContain("test-secret");
  });

  test("answers every rejected tool with non-execution evidence before retrying", async () => {
    const { service, requests } = fake([response({ output: [toolCall(undefined, "a"), toolCall(undefined, "b")] }), response()]);
    const session = new SessionStore().create("", null);
    const failed = await service.decide(session, turn());
    expect(failed.action).toBeNull();
    await service.decide(session, { ...turn(), retry: true });
    const results = requests[1].body.input.filter((item: any) => item.type === "function_call_output");
    expect(results.map((item: any) => item.call_id)).toEqual(["a", "b"]);
    expect(results.every((item: any) => JSON.parse(item.output).executed === false)).toBe(true);
    expect(requests[1].body.input.at(-1).content).toContain("立即调用一个工具");
  });

  test("empty response evidence is retained without introducing blank assistant turns", async () => {
    const empty = response({ output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "" }] }], usage: null });
    const { service, requests } = fake([response(), empty, response()]);
    const session = new SessionStore().create("", null);
    await service.decide(session, turn());
    const failed = await service.decide(session, turn());
    expect(failed.output?.content).toEqual(empty.output);
    expect(failed.usage).toBeNull();
    expect(failed.error).toContain("空动作");
    await service.decide(session, { ...turn(), retry: true });
    expect(requests[2].body.input.filter((item: any) => item.role === "assistant")).toEqual([]);
    expect(requests).toHaveLength(3);
  });

  test("reasoning above 1024 is allowed; total overflow still fails with usage", async () => {
    const valid = response({ usage: { output_tokens: 2200, output_tokens_details: { reasoning_tokens: 1800 } } });
    const { service } = fake([valid, response({ usage: { output_tokens: 4097 } })], { ...cfg, reasoningEffort: "high" });
    const session = new SessionStore().create("", null);
    expect((await service.decide(session, turn())).action).not.toBeNull();
    const failed = await service.decide(session, turn());
    expect(failed.action).toBeNull();
    expect(failed.error).toContain("总输出");
    expect(failed.usage?.outputTokens).toBe(4097);
  });

  test.each([400, 401, 403, 422, 429, 500])("HTTP %i does not leak secrets or retry", async (status) => {
    const { service, requests } = fake([new Response("test-secret", { status })]);
    const result = await service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("test-secret");
    expect(requests).toHaveLength(1);
  });

  test("decision instructions use the frozen game settings", async () => {
    const settings = { timeLimitSeconds: 90, extraQueuePeople: 3 };
    const { service, requests } = fake([response()]);
    await service.decide(new SessionStore().create("", null, undefined, settings), { ...turn(), observation: new Engine(1, settings).observe() });
    expect(requests[0].body.instructions).toContain("90 秒（世界时间）");
    expect(requests[0].body.instructions).toContain("额外增加 3 人");
    expect(requests[0].body.instructions).not.toContain("1024");
  });
});

test("configuration defaults, legacy aliases and removed protocols are explicit", () => {
  expect(createLlm({})).toBeNull();
  for (const provider of ["responses", "openai"]) expect(createLlm({ AGENT_PROVIDER: provider, OPENAI_API_KEY: "fake" })).toBeInstanceOf(ResponsesLlmService);
  expect(createLlm({ OPENAI_API_KEY: "fake" })?.model).toBe("deepseek-flash");
  expect(() => createLlm({ AGENT_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "fake" })).toThrow("已停用");
  expect(() => createLlm({ ANTHROPIC_AUTH_TOKEN: "fake" })).toThrow("不会自动");
  expect(() => createLlm({ AGENT_PROVIDER: "typo" })).toThrow("AGENT_PROVIDER");
  expect(configFromEnv({ DECISION_THINKING_TOKENS: "1" })).toEqual(cfg);
  expect(configFromEnv({ DECISION_MAX_TOKENS: "512" }).maxTokens).toBe(512);
  expect(() => configFromEnv({ DECISION_MAX_TOKENS: "NaN" })).toThrow("DECISION_MAX_TOKENS");
  expect(() => configFromEnv({ OPENAI_REASONING_EFFORT: "medium" })).toThrow("OPENAI_REASONING_EFFORT");
  for (const effort of ["none", "low", "high", "max"]) expect(configFromEnv({ OPENAI_REASONING_EFFORT: effort }).reasoningEffort).toBe(effort);
});

test("generated sessions expose and accept all actual gates, including G8",async()=>{
  const definition=generateWorld(3),map=publicMap(definition),session=new SessionStore().create("",null);
  session.publicMap=map;
  const {service,requests}=fake([response({output:[toolCall('{"facility":"G8","reason":"选择本局实际闸机"}')]})]);
  const engine=new Engine(3,{},undefined,undefined,definition);
  const result=await service.decide(session,{triggers:[],lastResult:null,observation:engine.observe()});
  expect(result.action).toMatchObject({type:"join_queue",facility:"G8"});
  const join=requests[0].body.tools.find((t:any)=>t.name==="join_queue");
  expect(join.parameters.properties.facility.enum).toEqual(map.facilities.map(f=>f.id));
  expect(requests[0].body.instructions).toContain(map.layoutHash);
});
