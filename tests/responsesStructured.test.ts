import { expect, test } from "vitest";
import { fake, jsonResponse, cfg, response, toolCall } from "./responsesSupport";
import { SAFETY_SYSTEM_PROMPT } from "../server/security";
import type { CutInDialogueRequest } from "../src/shared/types";

const guidance = { summary: "求稳", risk: "保守", priorities: [], rules: [], creativeIdeas: [], notExecutable: [], initialPlan: ["去售票机"] };
const npc: CutInDialogueRequest = { npc: { id: "p2", trait: "普通乘客", temperament: "不赶时间", facility: "TVM-1", queuePosition: 1, queueLength: 2 },
  message: "可以让我先吗？", history: [{ message: "您好", reply: "有什么事？", accepted: false }] };
const agreement = { accepted: true, reply: "可以，你先吧", reason: "愿意帮助" };

test.each(["none", "low", "high", "max"] as const)("all structured operations share %s effort and total budget", async (effort) => {
  const { service, requests } = fake([jsonResponse(guidance), jsonResponse({ mechanic: "jump_gate", reason: "翻越" }), jsonResponse(agreement)],
    { ...cfg, reasoningEffort: effort, maxTokens: 6000 });
  expect(await service.normalize("稳一点")).toEqual(guidance);
  expect(await service.classify("跨过栏杆", null)).toEqual({ mechanic: "jump_gate", reason: "翻越", source: "llm" });
  expect(await service.negotiate(npc)).toMatchObject({ ...agreement, source: "llm", usage: { inputTokens: 100, thinkingTokens: 10 } });
  expect(requests.map((r) => r.body.text.format.name)).toEqual(["guidance", "classification", "npc_reply"]);
  for (const request of requests) {
    expect(request.url).toBe("https://api.deepseek.com/responses");
    expect(request.body).toMatchObject({ reasoning: { effort }, max_output_tokens: 6000, text: { format: { type: "json_schema", strict: true } } });
    expect(request.body.instructions.startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
    expect(request.body.input[0].role).toBe("user");
    expect(request.body).not.toHaveProperty("response_format");
  }
  expect(JSON.parse(requests[2].body.input[0].content.split("\n").slice(1).join("\n"))).toEqual(npc);
  expect(requests[1].body.text.format.schema.properties.mechanic.enum).toEqual(["cut_in_line", "jump_gate", "unsupported"]);
});

test.each([null, {}, { ...guidance, priorities: [123] }])("rejects malformed guidance %#", async (value) => {
  await expect(fake([jsonResponse(value)]).service.normalize("求稳")).rejects.toThrow("指导格式");
});

test.each([
  jsonResponse({}, { status: "incomplete" }),
  jsonResponse({}, { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }),
  response({ output: [toolCall()] }),
  jsonResponse({ mechanic: "fly", reason: "no" }),
])("invalid classification raises instead of inventing a game mechanism %#", async (value) => {
  await expect(fake([value]).service.classify("飞过去", null)).rejects.toThrow();
});

test.each([
  jsonResponse(agreement),
  jsonResponse({ ...agreement, accepted: "true" }),
  jsonResponse({ ...agreement, reply: "" }),
  jsonResponse({ ...agreement, reason: "" }),
  jsonResponse({ ...agreement, extra: true }),
  jsonResponse(agreement, { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
  response({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }),
  response({ status: "failed", error: { message: "test-secret" } }),
  response({ output: [toolCall()] }),
])("NPC result validation retains raw output and usage, including failures %#", async (value) => {
  const { service, requests } = fake([value]);
  const result = await service.negotiate(npc);
  const valid = value.status === "completed" && JSON.stringify(value.output) === JSON.stringify(jsonResponse(agreement).output);
  expect(result.source).toBe(valid ? "llm" : "error");
  expect(result.accepted).toBe(valid);
  expect(result.usage?.outputTokens).toBe(30);
  expect(result.output?.content).toEqual(value.output);
  expect(result.output?.content).not.toBe(value.output);
  expect(result.reason).not.toContain("test-secret");
  if (!valid) expect(result.reason).toContain("未获得插队许可");
  expect(requests).toHaveLength(1);
});

test("NPC transport failure is explicit and has no fabricated usage", async () => {
  const { service, requests } = fake([new Response("test-secret", { status: 500 })]);
  expect(await service.negotiate(npc)).toMatchObject({ accepted: false, source: "error", model: "deepseek-flash", usage: null });
  expect(requests).toHaveLength(1);
});

test("NPC raw output preserves returned reasoning without adding a thinking field", async () => {
  const value = jsonResponse(agreement);
  value.output.unshift({ type: "reasoning", content: [{ type: "reasoning_text", text: "接口返回" }] });
  const result = await fake([value]).service.negotiate(npc);
  expect(result.output?.content).toEqual(value.output);
  expect(result).not.toHaveProperty("thinking");
});
