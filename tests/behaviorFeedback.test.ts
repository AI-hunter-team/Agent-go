import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { LabController, type LabAgent } from "../src/lab/controller";
import { createLabEngine, LAB_SCENARIOS } from "../src/lab/scenarios";
import { PERSONALITY_PROFILES } from "../src/sim/content/personas";
import { LabStage } from "../src/lab/LabStage";
import type { ActionPlan, AgentAction, NpcResponse } from "../src/shared/types";

const noFrame = async () => {};
const reply: NpcResponse = { reply: "我很害怕，但我不交票，也没有让位。", decision: "refuse", give: null, want: null, reason: "测试", source: "llm" };
function actor(action: AgentAction, plan?: ActionPlan): LabAgent {
  return { kind: "llm", dispose: vi.fn(async () => {}), decide: async () => ({ action, error: null, thinking: null, usage: null, model: "fixture", latencyMs: 0 }),
    interpret: async () => plan!, respond: async () => reply };
}
function bodyPlan(npcId: string, snatch = false): ActionPlan {
  return { status: "plan", source: "llm", summary: "先靠近，威胁后击打", reason: "测试", steps: [
    { op: "approach", target: { kind: "person", id: npcId } }, { op: "talk", npcId, goal: "threaten", message: "交出票，否则不客气。" },
    { op: "strike", npcId, aim: "hurt" }, ...(snatch ? [{ op: "snatch" as const, npcId, itemKind: "ticket" as const }] : []),
  ] };
}
const configured = (id: string) => { const p = PERSONALITY_PROFILES.find(p => p.id === id)!; return createLabEngine("physical", 1, { "*": { traits: p.traits, situation: { hurry: p.hurry, fatigue: p.fatigue } } }); };

describe("truthful step feedback", () => {
  test("reply appears once; settlement is factual and steps use their own timestamps", async () => {
    const e = configured("tough"), n = [...e.world.persons.values()].find(p => !p.isPlayer)!;
    const a = actor({ type: "act", instruction: "威胁最近的乘客，然后殴打他", reason: "测试" }, bodyPlan(n.id));
    const c = new LabController(e, undefined, async () => a, noFrame);
    await c.run("恐吓威胁并且殴打，插队", "model", undefined, "queue-tvm");
    const r = c.runs[0];
    expect(r.trace.filter(t => t.text.includes(reply.reply))).toHaveLength(1);
    expect(r.trace.find(t => t.kind === "对话结果")!.text).toContain("对方拒绝");
    expect(r.trace.some(t => t.kind === "动作结算" || t.kind === "对话结算")).toBe(false);
    const arrived = r.steps.find(s => s.step.op === "approach" && s.phase === "completed")!;
    const strike = r.steps.find(s => s.step.op === "strike" && s.phase === "completed")!;
    expect(strike).toBeDefined(); expect(arrived.t).toBeLessThan(strike.t);
    expect(r.trace.find(t => t.kind.includes("动作完成") && t.text.startsWith("接近"))!.t).toBe(arrived.t);
    expect(r.assessment!.goals.find(g => g.label === "插队/让位")).toMatchObject({ state: "no" });
    expect(r.assessment!.goals.find(g => g.label === "击打")).toMatchObject({ state: "yes" });
    expect(r.assessment!.summary).toContain("未完成：插队/让位");
  });
  test("a target leaving observation during attack interrupts the attempt and skips the snatch", async () => {
    const e = configured("timid"), n = [...e.world.persons.values()].find(p => !p.isPlayer)!;
    const a = actor({ type: "act", instruction: "威胁后击打，然后抢票", reason: "测试" }, bodyPlan(n.id, true));
    const c = new LabController(e, undefined, async () => a, async()=>{ if(e.executor.action?.op==="strike" && e.executor.action.phase==="perform") n.pos={x:40,y:15}; });
    await c.run("威胁并殴打最近的乘客，抢夺车票", "model");
    const r = c.runs[0], start = r.steps.find(s => s.step.op === "strike" && s.phase === "perform");
    const failed = r.steps.find(s => s.step.op === "strike" && s.phase === "interrupted");
    expect(start).toBeDefined(); expect(failed).toBeDefined();
    expect(failed!.distance).toBeGreaterThan(failed!.reach!);
    expect(r.trace.some(t => t.kind === "人物实际反应" && t.text.includes("逃离"))).toBe(true);
    expect(r.steps.some(s => s.step.op === "snatch" && s.phase === "skipped")).toBe(true);
    expect(r.steps.some(s => s.step.op === "snatch" && s.phase === "perform")).toBe(false);
    expect(r.after!.hasTicket).toBe(false);
    expect(r.frames.some(f => f.action?.op === "strike" && f.action.phase === "perform")).toBe(true);
    expect(r.frames.some(f => f.actors.some(p => p.reaction === "flee"))).toBe(true);
    expect(r.after!.npcs.find(p => p.id === n.id)!.position).not.toEqual(r.before.npcs.find(p => p.id === n.id)!.position);
  });
  test("accepted yielding is confirmed from actual queue insertion and pauses before service", async () => {
    const e = createLabEngine("queue-tvm"), f = e.world.facility("TVM-2")!, id = f.queue[0];
    f.serving = { personId: "fixture-busy", remaining: 1000, recheck: false };
    const a = actor({ type: "talk", npcId: id, goal: "yield", message: "请让我先买票", reason: "测试" });
    a.respond = async () => ({ ...reply, reply: "可以，你先走。", decision: "accept" });
    const c = new LabController(e, undefined, async () => a, noFrame);
    await c.run("请求最近的排队乘客让位", "model", undefined, "queue-tvm");
    expect(c.runs[0].assessment!.goals.find(g => g.label === "插队/让位")!.state).toBe("yes");
    expect(c.engine.t).toBeLessThan(10);
    expect(c.engine.world.queuePosition(c.engine.player)).not.toBeNull();
  });
  test("replay markup draws sampled actors and the actual swinging phase", async () => {
    const c = new LabController(configured("tough"), undefined, undefined, noFrame);
    await c.run("击打最近的乘客", "offline");
    const r = structuredClone(c.runs[0]);
    const frame = r.frames.find(f => f.action?.op === "strike" && f.action.phase === "perform")!;
    r.frames = [frame]; r.state = "running";
    const html = renderToStaticMarkup(createElement(LabStage, { run: r, active: true }));
    expect(html).toContain("挥击中"); expect(html).toContain("<svg"); expect(html).toContain("p1");
  });
});

describe("scene-matched short prompts", () => {
  test.each(LAB_SCENARIOS)("$id has a short nonempty default within the input budget", scene => {
    expect(scene.prompt.trim().length).toBeGreaterThan(0);
    expect([...scene.prompt].length).toBeLessThanOrEqual(60);
  });
});
