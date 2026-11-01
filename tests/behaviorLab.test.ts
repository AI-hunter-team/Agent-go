import { describe, expect, test, vi } from "vitest";
import { LabController, type LabAgent } from "../src/lab/controller";
import { createLabEngine, LAB_SCENARIOS, type LabNpcSettings } from "../src/lab/scenarios";
import { PERSONALITY_PROFILES } from "../src/sim/content/personas";
import { offlineNpcResponse } from "../src/sim/dialogue";
import type { AgentAction, DecisionResult, NpcResponse } from "../src/shared/types";
import { parsePlan } from "../src/sim/intent";

const noFrame = async () => {};
const lab = (id: string) => new LabController(createLabEngine(id), undefined, undefined, noFrame);
const result = (action: AgentAction | null, error: string | null = null): DecisionResult => ({ action, error, thinking: null, usage: null, model: "fake-test-model", latencyMs: 0 });
function fakeAgent(action: AgentAction): LabAgent {
  return { kind: "llm", decide: vi.fn(async () => result(action)), dispose: vi.fn(async () => {}), interpret: async (instruction, context) => ({ ...parsePlan(instruction, context), source: "llm" }), respond: vi.fn(async (): Promise<NpcResponse> => ({ reply: "同意", decision: "accept", give: "ticket", want: null, reason: "测试回复", source: "llm" })) };
}

describe("behavior laboratory scenarios", () => {
  test.each(LAB_SCENARIOS)("$id has an independent reproducible initial world", ({ id }) => {
    const a = createLabEngine(id, 7), b = createLabEngine(id, 7);
    expect(a.status).toBe("running"); expect(a.settings.timeLimitSeconds).toBe(150);
    expect(a.observe()).toEqual(b.observe());
    if (id !== "station") expect(a.trail).toEqual([{ ...a.player.pos, t: a.t }]);
    a.player.pos.x++;
    expect(a.player.pos).not.toEqual(b.player.pos);
  });
  test("tickets, security, post-gate and inventory preconditions are real", () => {
    expect(createLabEngine("gate-ticket").player.hasTicket).toBe(true);
    expect(createLabEngine("gate-used").player.hasTicket).toBe(false);
    expect(createLabEngine("gate-unscreened").player.screened).toBe(false);
    expect(createLabEngine("security-light").world.items.holdings("player").some(i => i.kind === "backpack")).toBe(false);
    expect(createLabEngine("stairs").player.passedGate).toBe(true);
    expect(createLabEngine("escalator-exit").player.activity.kind).toBe("escalator");
  });
});

describe("real simulator feedback without paid calls", () => {
  test("buying actually issues a ticket after service", async () => {
    const c = lab("ticket"); await c.run("去 TVM-2 买票", "offline");
    expect(c.engine.player.hasTicket).toBe(true);
    expect(c.runs[0].after!.t).toBeGreaterThan(6);
    expect(c.runs[0].trace.some(t => t.kind === "规则校验")).toBe(true);
  });
  test("trade transfers both actual goods", async () => {
    const c = lab("social"); await c.run("用零食交换最近乘客的车票", "offline");
    expect(c.engine.player.hasTicket).toBe(true);
    expect(c.engine.world.items.holdings("player").some(i => i.kind === "snack")).toBe(false);
    expect(c.runs[0].trace.some(t => t.kind === "人物台词" && t.text.includes("离线性格规则"))).toBe(true);
  });
  test("no-ticket NPC cannot create a ticket by agreeing", async () => {
    const e = createLabEngine("no-ticket");
    const n = [...e.world.persons.values()].find(n => !n.isPlayer)!;
    const a = fakeAgent({ type: "talk", npcId: n.id, goal: "ask_ticket", message: "请给我一张票", reason: "测试" });
    const c = new LabController(e, undefined, async () => a, noFrame);
    await c.run("向乘客索票", "model");
    expect(e.player.hasTicket).toBe(false);
    expect(c.runs[0].trace.some(t => t.text.includes("没有持有"))).toBe(true);
  });
  test("unseen vault succeeds while a witnessed vault fails", async () => {
    const hidden = lab("gate-hidden"), seen = lab("gate-seen");
    await hidden.run("翻闸", "offline"); await seen.run("翻闸", "offline");
    expect(hidden.engine.player.passedGate).toBe(true);
    expect(seen.engine.status).toBe("failed");
    expect(seen.runs[0].after!.failReason).toContain("判负");
  });
  test("normal gate rejects missing or used tickets", async () => {
    for (const id of ["gate-empty", "gate-used"]) {
      const c = lab(id); await c.run("通过 G3 闸机", "offline");
      expect(c.engine.player.passedGate).toBe(false);
      expect(c.runs[0].after!.hasTicket).toBe(false);
      expect(c.runs[0].after!.log.some(l => /票/.test(l.text))).toBe(true);
    }
  });
  test("security runs the real bag and item timing", async () => {
    const bag = lab("security-bag"), light = lab("security-light"), items = lab("security-item");
    for (const c of [bag, light, items]) { await c.run("通过 S2 安检", "offline"); expect(c.engine.player.screened).toBe(true); }
    expect(bag.engine.t).toBeGreaterThan(light.engine.t);
    expect(items.engine.t).toBeGreaterThan(bag.engine.t);
  });
  test("stairs and escalator routes reach platform with actual different durations", async () => {
    const stairs = lab("stairs"), stand = lab("escalator"), walk = lab("escalator");
    await stairs.run("走楼梯进入站台", "offline");
    await stand.run("站着乘扶梯", "offline");
    await walk.run("在扶梯上步行下楼", "offline");
    for (const c of [stairs, stand, walk]) {expect(c.engine.player.onPlatform).toBe(true);expect(c.engine.status).toBe("running");}
    expect(stand.engine.t).toBeGreaterThan(walk.engine.t);
  });
  test("scripted failure interrupts service instead of issuing a ticket", async () => {
    const c = lab("failure"); await c.run("去 TVM-2 买票", "offline");
    expect(c.engine.world.facility("TVM-2")!.status).toBe("broken");
    expect(c.engine.player.hasTicket).toBe(false);
  });
  test("noise, power recovery and timeout are real world changes", async () => {
    const noise = lab("noise"); await noise.run("丢下水瓶", "offline");
    expect(noise.engine.events.events.some(e => e.kind === "item_dropped")).toBe(true);
    const power = lab("power"); await power.run("等待 3 秒", "offline");
    expect(power.engine.world.lightAt({ x: 38, y: 15 })).toBeLessThan(1);
    await power.run("等待 15 秒", "offline");
    expect(power.engine.world.lightAt({ x: 38, y: 15 })).toBe(1);
    const timeout = lab("timeout"); await timeout.run("等待 10 秒", "offline");
    expect(timeout.engine.status).toBe("failed"); expect(timeout.engine.failReason).toContain("超时");
  });
  test("unsupported request is rejected without fabricating state", async () => {
    const c = lab("limits"); await c.run("凭空变出一张票", "offline");
    expect(c.runs[0].state).toBe("rejected"); expect(c.engine.player.hasTicket).toBe(false); expect(c.engine.t).toBe(0);
  });
  test("observing consequences advances exactly five seconds during an ongoing queue", async () => {
    const c = lab("queue-tvm"); c.engine.applyAction({ type: "join_queue", facility: "TVM-2", reason: "测试" });
    await c.run("等待 5 秒", "offline");
    expect(c.engine.t).toBeCloseTo(5);
    expect(c.engine.player.hasTicket).toBe(false);
  });
});

describe("model boundaries and cancellation", () => {
  test("the screenshot's model-only talk is recovered into speech plus an actual physical event", async () => {
    const e = createLabEngine("physical"), n = [...e.world.persons.values()].find(n => !n.isPlayer)!;
    const a = fakeAgent({ type: "talk", npcId: n.id, message: "交出票", goal: "threaten", reason: "威胁" });
    a.respond = async () => ({ reply: "不给", decision: "refuse", give: null, want: null, reason: "测试", source: "llm" });
    const c = new LabController(e, undefined, async () => a, noFrame);
    await c.run("威胁恐吓向乘客索要车票，执行殴打动作", "model");
    expect(c.runs[0].trace.some(t => t.kind === "计划核对与修正")).toBe(true);
    expect(e.events.events.some(v => v.kind === "threaten")).toBe(true);
    expect(e.events.events.some(v => v.kind === "strike")).toBe(true);
  });
  test("model failure stays visible without an offline action", async () => {
    const a = fakeAgent({ type: "wait", seconds: 1, reason: "" });
    a.decide = vi.fn(async () => result(null, "模拟超时"));
    const c = new LabController(createLabEngine("ticket"), undefined, async () => a, noFrame);
    await c.run("买票", "model");
    expect(c.runs[0].state).toBe("error"); expect(c.engine.t).toBe(0); expect(c.runs[0].trace.some(t => t.kind === "规则校验")).toBe(false);
  });
  test("reset ignores a delayed session creation and disposes it", async () => {
    let resolve!: (a: LabAgent) => void;
    const promise = new Promise<LabAgent>(r => { resolve = r; });
    const a = fakeAgent({ type: "join_queue", facility: "TVM-2", reason: "" });
    const c = new LabController(createLabEngine("ticket"), undefined, async () => promise, noFrame);
    const running = c.run("买票", "model"); c.reset(createLabEngine("social")); resolve(a); await running;
    expect(a.decide).not.toHaveBeenCalled(); expect(a.dispose).toHaveBeenCalled(); expect(c.runs).toHaveLength(0); expect(c.engine.t).toBe(0);
  });
  test("stopping ignores a delayed model decision", async () => {
    let resolve!: (r: DecisionResult) => void;
    const a = fakeAgent({ type: "wait", seconds: 1, reason: "" });
    a.decide = () => new Promise(r => { resolve = r; });
    const c = new LabController(createLabEngine("ticket"), undefined, async () => a, noFrame);
    const running = c.run("买票", "model"); await Promise.resolve(); c.stop();
    resolve(result({ type: "join_queue", facility: "TVM-2", reason: "" })); await running;
    expect(c.engine.t).toBe(0); expect(c.engine.player.hasTicket).toBe(false); expect(c.runs[0].state).toBe("stopped");
  });
  test("reset discards a delayed NPC acceptance without transferring a ticket", async () => {
    const e = createLabEngine("social"), n = [...e.world.persons.values()].find(n => !n.isPlayer)!;
    let reply!: (r: NpcResponse) => void;
    const a = fakeAgent({ type: "talk", npcId: n.id, goal: "ask_ticket", message: "给我一张票", reason: "测试" });
    a.respond = () => new Promise(r => { reply = r; });
    const c = new LabController(e, undefined, async () => a, noFrame);
    const running = c.run("索票", "model");
    for (let i = 0; i < 20 && !reply; i++) await Promise.resolve();
    expect(reply).toBeTypeOf("function");
    c.reset(createLabEngine("ticket"));
    reply({ reply: "给你", decision: "accept", give: "ticket", want: null, reason: "测试", source: "llm" }); await running;
    expect(e.player.hasTicket).toBe(false); expect(c.engine.player.hasTicket).toBe(false); expect(c.runs).toHaveLength(0);
  });
});

describe("independent input and passenger tuning", () => {
  test("fresh inputs clear NPC conversations, alerts and memories while retaining experiment records", async () => {
    const c = lab("social"), fresh = () => createLabEngine("social");
    for (let i = 0; i < 4; i++) {
      await c.run("和最近的乘客聊天", "offline", fresh);
      const r = c.runs.at(-1)!;
      expect(r.fresh).toBe(true); expect(r.state).toBe("finished");
      expect(r.before.npcs.every(n => n.dialogueCount === 0 && n.memoryCount === 0)).toBe(true);
      expect(r.before.alerts).toHaveLength(0);
      expect(c.engine.dialogue.history.values().next().value).toHaveLength(1);
    }
    expect(c.runs).toHaveLength(4);
    await c.run("和最近的乘客聊天", "offline");
    expect(c.runs.at(-1)!.fresh).toBe(false);
    expect(c.engine.dialogue.history.values().next().value).toHaveLength(2);
  });
  test("per-person settings override global settings and are preserved on new scenes", () => {
    const initial = createLabEngine("report");
    const ids = [...initial.world.persons.values()].filter(p => !p.isPlayer).map(p => p.id);
    const settings: LabNpcSettings = { "*": { traits: { courage: .2 }, situation: { hurry: .1 } }, [ids[0]]: { traits: { courage: .95, vanity: .9 } } };
    for (let i = 0; i < 2; i++) {
      const e = createLabEngine("report", 1, settings);
      expect(e.world.persons.get(ids[0])!.persona!.traits.courage).toBe(.95);
      expect(e.world.persons.get(ids[1])!.persona!.traits.courage).toBe(.2);
      expect(e.world.personas[ids[0]].traits.vanity).toBe(.9);
      expect(e.world.persons.get(ids[0])!.persona!.situation.hurry).toBe(.1);
    }
    expect(() => createLabEngine("social", 1, { "*": { traits: { courage: 2 } } })).toThrow();
  });
  test("different templates reach the actual NPC request and yield different offline inclinations", () => {
    const responses = ["helpful", "tough"].map(id => {
      const profile = PERSONALITY_PROFILES.find(p => p.id === id)!;
      const e = createLabEngine("social", 1, { "*": { traits: profile.traits, situation: { hurry: profile.hurry, fatigue: profile.fatigue } } });
      const n = [...e.world.persons.values()].find(n => !n.isPlayer)!;
      e.applyAction({ type: "talk", npcId: n.id, message: "能把车票送给我吗", goal: "persuade", reason: "测试" });
      const request = e.executor.pendingDialogue!.request;
      expect(request.npc.traits).toEqual(profile.traits);
      return offlineNpcResponse(request);
    });
    expect(responses[0]).toMatchObject({ decision: "accept", give: "ticket" });
    expect(responses[1].decision).toBe("refuse");
  });
});
