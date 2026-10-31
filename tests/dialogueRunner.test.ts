import { expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Agent } from "../src/agent/agent";
import { GameRunner } from "../src/agent/runner";
import { Engine } from "../src/sim/engine";
import { queueSlot } from "../src/sim/layout";
import type { NpcReply, CutInDialogueRequest, DecisionResult } from "../src/shared/types";
import { DecisionLog } from "../src/ui/DecisionLog";

function fixture(negotiate: (r: CutInDialogueRequest) => Promise<NpcReply>, message = "我赶火车，能让我先办理吗？") {
  const e = new Engine(1); const w = e.world; const p = e.player;
  for (const [id] of w.persons) if (id !== "player") w.persons.delete(id);
  for (const f of w.facilities.values()) { f.queue = []; f.serving = null; }
  const f = w.facility("TVM-1")!;
  const npc = w.addPerson("normal", queueSlot(f.def, 0));
  npc.activity = { kind: "queued", facility: f.def.id };
  p.pos = queueSlot(f.def, 1); p.activity = { kind: "queued", facility: f.def.id };
  f.queue = [npc.id, p.id];
  const agent: Agent = { kind: "llm", dispose: async () => {}, decide: async (): Promise<DecisionResult> => ({
    action: { type: "request_cut_in", npcId: npc.id, message, reason: "节省时间" },
    thinking: null, usage: null, model: "test", latencyMs: 0, error: null,
  }) };
  const r = new GameRunner(e, agent, async () => ({ mechanic: "unsupported", reason: "", source: "keywords" }), { negotiate });
  return { r, e, f, p, npc };
}
const reply = (accepted: boolean): NpcReply => ({ accepted, reply: accepted ? "可以，你先吧。" : "我也赶时间，请排队。", reason: "自己的时间紧张", source: "llm", model: "test", usage: { inputTokens: 80, outputTokens: 30, thinkingTokens: null, cacheReadTokens: 0 } });

test("NPC refusal preserves the queue and records speech, reply, result and separate usage", async () => {
  const { r, f, p } = fixture(async () => reply(false));
  const before = structuredClone({ pos: p.pos, activity: p.activity, queue: f.queue });
  r.start(); await r.pending;
  expect({ pos: p.pos, activity: p.activity, queue: f.queue }).toEqual(before);
  expect(r.decisions[0].result?.ok).toBe(false);
  expect(r.decisions[0].dialogue?.response?.reply).toContain("请排队");
  expect(r.report().npcTotals).toMatchObject({ calls: 1, inputTokens: 80, outputTokens: 30 });
  expect(r.report().totals.outputTokens).toBe(0);
  const html = renderToStaticMarkup(createElement(DecisionLog, { decisions: r.decisions }));
  expect(html).toContain("我赶火车，能让我先办理吗？");
  expect(html).toContain("我也赶时间，请排队。");
  expect(html).toContain("拒绝让位");
});

test("acceptance starts physical movement, but does not reorder instantly", async () => {
  const { r, f, p, npc } = fixture(async () => reply(true));
  r.start(); await r.pending;
  expect(p.activity.kind).toBe("creative");
  expect(f.queue).toEqual([npc.id]);
  expect(r.decisions[0].dialogue?.execution?.ok).toBe(true);
});

test("invalid utterance avoids the additional model call", async () => {
  let calls = 0; const { r } = fixture(async () => { calls++; return reply(true); }, " ");
  r.start(); await r.pending;
  expect(calls).toBe(0);
  expect(r.decisions[0].result?.ok).toBe(false);
  expect(r.report().dialogues).toHaveLength(0);
});

test("late NPC response after stop remains recorded without moving the character", async () => {
  let release!: (reply: NpcReply) => void; let started!: () => void;
  const invoked = new Promise<void>((resolve) => { started = resolve; });
  const { r, p, f } = fixture(() => { started(); return new Promise((resolve) => { release = resolve; }); });
  const before = structuredClone({ pos: p.pos, activity: p.activity, queue: f.queue });
  r.start(); await invoked;
  expect(r.report().dialogues?.[0].status).toBe("pending");
  r.advance(100); expect(r.engine.t).toBe(0);
  r.stop(); release(reply(true)); await r.pending;
  expect({ pos: p.pos, activity: p.activity, queue: f.queue }).toEqual(before);
  expect(r.report().dialogues?.[0]).toMatchObject({ status: "completed", execution: null, response: { accepted: true } });
  expect(r.report().npcTotals?.calls).toBe(1);
  expect(r.decisions).toHaveLength(0);
});

test("NPC service errors never grant consent", async () => {
  const { r, f, p } = fixture(async () => { throw new Error("service unavailable"); });
  const before = [...f.queue]; r.start(); await r.pending;
  expect(f.queue).toEqual(before); expect(p.activity.kind).toBe("queued");
  expect(r.report().dialogues?.[0].status).toBe("error");
  expect(r.decisions[0].result?.ok).toBe(false);
});

test("Legacy dialogue failure preserves paid NPC usage and raw output in the run report", async () => {
  const originalFetch = globalThis.fetch;
  const failure: NpcReply = { ...reply(false), source: "error", output: { id: "failed-call", stopReason: "max_tokens", content: [{ type: "text", text: "部分返回" }] } };
  globalThis.fetch = async () => new Response(JSON.stringify(failure), { status: 502 });
  try {
    const { r, p } = fixture(async()=>failure); r.start(); await r.pending;
    const report = r.report();
    expect(p.activity.kind).toBe("queued");
    expect(report.npcTotals?.outputTokens).toBe(30);
    expect(report.dialogues?.[0].response?.output?.id).toBe("failed-call");
    expect(JSON.parse(JSON.stringify(report)).dialogues[0].response.output.content).toEqual(failure.output!.content);
  } finally { globalThis.fetch = originalFetch; }
});
