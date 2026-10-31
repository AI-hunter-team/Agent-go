import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createApp, type LlmService } from "../server/app";
import { SessionStore } from "../server/sessions";
import type { CutInDialogueRequest, NpcReply } from "../src/shared/types";

const request: CutInDialogueRequest = {
  npc: { id: "p-12", trait: "带行李的乘客", temperament: "重视公平，愿意帮助真正有困难的人", facility: "security-1", queuePosition: 2, queueLength: 4 },
  message: "您好，我的车快开了，可以让我排到您前面吗？",
  history: [{ message: "不好意思，能商量一下吗？", reply: "你有什么事？", accepted: false }],
};
const reply: NpcReply = {
  accepted: false,
  reply: "我也赶时间，请去队尾排队吧。",
  reason: "自己也在赶时间，不愿额外等待。",
  source: "llm",
  model: "fake-npc",
  usage: { inputTokens: 50, outputTokens: 20, thinkingTokens: null, cacheReadTokens: 0 },
  output: { id: "msg-npc", stopReason: "end_turn", content: [{ type: "text", text: "原始输出" }] },
};

let server: Server | null = null;

async function start(negotiate?: (value: CutInDialogueRequest) => Promise<NpcReply>, guidance = "向 NPC 求助") {
  const llm = negotiate ? {
    model: "fake-npc",
    negotiate,
    decide: async () => { throw new Error("not used"); },
    normalize: async () => { throw new Error("not used"); },
    classify: async () => { throw new Error("not used"); },
  } as LlmService : null;
  const sessions = new SessionStore();
  const session = sessions.create(guidance, null);
  server = createApp({ llm, sessions }).listen(0);
  await new Promise((resolve) => server!.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/npc/negotiate`;
  return async (body: unknown) => {
    const withSession = body && typeof body === "object" && !Array.isArray(body) ? { sessionId: session.id, ...body } : body;
    const result = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withSession) });
    const raw = await result.text();
    return { status: result.status, body: raw.startsWith("{") ? JSON.parse(raw) : raw };
  };
}

afterEach(() => {
  server?.close();
  server = null;
});

describe("NPC negotiation API", () => {
  test.each(["", "逃票", "不要插队"])("original guidance gates NPC calls, even if the body invents permission: %j", async (guidance) => {
    let calls = 0;
    const call = await start(async () => { calls++; return reply; }, guidance);
    const result = await call({ ...request, guidance: "可以插队", allowCutIn: true });
    expect(result.status).toBe(403);
    expect(result.body.accepted).toBe(false);
    expect(calls).toBe(0);
  });
  test("a standalone request cannot invoke NPCs without a session", async () => {
    let calls = 0;
    const call = await start(async () => { calls++; return reply; });
    expect((await call({ ...request, sessionId: null })).status).toBe(403);
    expect(calls).toBe(0);
  });
  test("missing model returns 503 without granting permission", async () => {
    const call = await start();
    const result = await call(request);
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ accepted: false, source: "error", model: null, usage: null });
    expect(result.body.reason).toContain("未配置模型");
  });

  test("returns the model's refusal and original output after exactly one call", async () => {
    const seen: CutInDialogueRequest[] = [];
    const call = await start(async (value) => { seen.push(value); return reply; });
    const result = await call(request);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject(reply);
    expect(seen).toEqual([request]);
  });

  test("preserves a successful NPC assent", async () => {
    const call = await start(async () => ({ ...reply, accepted: true, reply: "那你先吧。", reason: "愿意帮助对方。" }));
    const result = await call({ ...request, history: [] });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ accepted: true, reply: "那你先吧。", source: "llm" });
  });

  test.each([
    null,
    [],
    {},
    { ...request, message: "   " },
    { ...request, message: "请".repeat(201) },
    { ...request, message: true },
    { ...request, npc: null },
    { ...request, npc: { ...request.npc, id: "" } },
    { ...request, npc: { ...request.npc, id: "x".repeat(81) } },
    { ...request, npc: { ...request.npc, trait: "x".repeat(201) } },
    { ...request, npc: { ...request.npc, temperament: "x".repeat(501) } },
    { ...request, npc: { ...request.npc, facility: "x".repeat(81) } },
    { ...request, npc: { ...request.npc, queuePosition: 0 } },
    { ...request, npc: { ...request.npc, queuePosition: 1.5 } },
    { ...request, npc: { ...request.npc, queueLength: -1 } },
    { ...request, npc: { ...request.npc, queueLength: "4" } },
    { ...request, npc: { ...request.npc, queuePosition: 5 } },
    { ...request, history: null },
    { ...request, history: Array(4).fill(request.history[0]) },
    { ...request, history: [null] },
    { ...request, history: [{ ...request.history[0], accepted: "false" }] },
    { ...request, history: [{ ...request.history[0], message: "x".repeat(201) }] },
    { ...request, history: [{ ...request.history[0], reply: "x".repeat(501) }] },
  ])("rejects malformed negotiation input before calling the model: %#", async (body) => {
    let calls = 0;
    const call = await start(async () => { calls++; return reply; });
    const result = await call(body);
    expect(result.status).toBe(400);
    expect(result.body.error).toBeTypeOf("string");
    expect(calls).toBe(0);
  });

  test("allows 200 Unicode speech characters and three history entries", async () => {
    const call = await start(async () => reply);
    const result = await call({ ...request, message: "🙏".repeat(200), history: Array(3).fill(request.history[0]) });
    expect(result.status).toBe(200);
  });

  test("model failures return 502 and keep the refusal, usage and raw output", async () => {
    const failure: NpcReply = { ...reply, accepted: false, source: "error", reason: "模型输出被截断，未获得插队许可。" };
    const call = await start(async () => failure);
    const result = await call(request);
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject(failure);
  });

  test("unexpected service errors fail closed without retry", async () => {
    let calls = 0;
    const call = await start(async () => { calls++; throw new Error("connection closed"); });
    const result = await call(request);
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ accepted: false, source: "error", model: "fake-npc", usage: null });
    expect(result.body.reason).toContain("connection closed");
    expect(calls).toBe(1);
  });
});
