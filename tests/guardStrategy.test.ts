import { expect, test } from "vitest";
import { createFixtureEngine, emptyScenario } from "./fixtures/scenarios";
import { createLabEngine } from "../src/lab/scenarios";
import { buildIntentContext } from "../src/sim/intent";
import { reconcileInstruction } from "../src/sim/actions/instructionAudit";
import { preconditionError } from "../src/sim/actions/preconditions";
import { interpret, validatePlan } from "../server/boss";
import { parseToolUse } from "../server/tools";
import type { ActionPlan, PlanStep } from "../src/shared/types";
import { GameRunner } from "../src/agent/runner";
import { createApp } from "../server/app";
import { SessionStore } from "../server/sessions";
import type { AddressInfo } from "node:net";

const source = "最快速度不买票，趁着保安不注意，不能在保安看着的时候翻栏杆过去。想办法搞走保安注意力";
const plan = (steps: PlanStep[]): ActionPlan => ({ status: "plan", steps, summary: "尝试行动", reason: "测试", source: "llm" });
function fixture() {
  const e = createFixtureEngine(emptyScenario(), [
    { id: "security-S1", label: "1号安检员", role: "security_staff", route: [{ x: 28.5, y: 3.5 }], facing: Math.PI, speed: 0, pauseSeconds: 0 },
    { id: "security-S2", label: "2号安检员", role: "security_staff", route: [{ x: 28.5, y: 12.5 }], facing: Math.PI, speed: 0, pauseSeconds: 0 },
    { id: "hidden", label: "远处保安", route: [{ x: 50, y: 25 }], facing: Math.PI, speed: 0, pauseSeconds: 0 },
  ]);
  e.player.pos = { x: 25.3, y: 10 };
  return e;
}

test("captured decision #3: west-facing S2 sees the player to its west, S1 does not", () => {
  const e = fixture(), view = e.observe();
  const second = view.guards.find(g => g.id === "security-S2")!;
  expect(second.sight).toMatchObject({ facingDegrees: 180, directionToYou: "西北", angleToYouDegrees: 38, canSeeYou: true });
  expect(view.guards.find(g => g.id === "security-S1")!.sight!.canSeeYou).toBe(false);
  expect(view.guards.some(g => g.id === "hidden")).toBe(false);
  expect(buildIntentContext(e.world, e.guards).guards).toEqual(view.guards);
  expect(JSON.stringify(view.guards)).not.toMatch(/alert|traits|watching|hidden/);
});

test("the real replay's observe-security-S2 action works through the actual engine", () => {
  const e = fixture();
  const result = e.applyAction({ type: "observe", targetId: "security-S2", reason: "确认最近保安视线" });
  expect(result).toMatchObject({ ok: true, text: expect.stringContaining("当前视线覆盖你") });
  expect(result.text).toContain("面朝西");
  expect(e.player.activity).toMatchObject({ kind: "waiting", remaining: 1 });
  expect(e.applyAction({ type: "observe", targetId: "hidden", reason: "" }).ok).toBe(false);
});

test("original guard condition survives a shortened role instruction and is checked before emitting a vault", async () => {
  const e = fixture(), context = buildIntentContext(e.world, e.guards, source);
  const interpreted = await interpret(async () => plan([{ op: "vault", obstacle: "railing" }]), "快速翻越低栏杆", context);
  expect(interpreted.translation!.sourceGuidance).toBe(source);
  expect(interpreted.translation!.sourceClauses!.map(c => c.text).join("")).toBe(source);
  expect(interpreted.steps[0].preconditions).toEqual([{ kind: "guards_not_watching", text: expect.any(String) }]);
  const result = e.applyAction({ type: "act", instruction: "快速翻越低栏杆", reason: "" }, undefined, interpreted);
  expect(result.ok).toBe(false);
  expect(result.text).toContain("security-S2");
  expect(e.events.events.some(v => v.kind === "vault")).toBe(false);
  expect(e.status).toBe("running");
});

test("attention conditions do not become a universal ban on risk", () => {
  const e = fixture();
  const p = reconcileInstruction("直接翻越低栏杆", plan([{ op: "vault", obstacle: "railing" }]), buildIntentContext(e.world, e.guards)).plan;
  expect(p.steps[0].preconditions).toBeUndefined();
  expect(e.applyAction({ type: "act", instruction: "直接翻越低栏杆", reason: "" }, undefined, p).ok).toBe(true);
  expect(e.status).toBe("failed");
});

test("the same world permits a conditional attempt when the guard turns away; unknown sight stays unknown", () => {
  const e = fixture(), step: PlanStep = { op: "vault", obstacle: "railing", preconditions: [{ kind: "guards_not_watching", text: "保安未注视" }] };
  for (const g of e.guards.guards) g.facing = 0;
  expect(preconditionError(step, e.world, e.guards)).toBeNull();
  e.player.pos = { x: 2, y: 15 };
  expect(preconditionError(step, e.world, e.guards)).toContain("未知");
});

test("item and unsupported conditions remain explicit; null wire metadata is decoded", () => {
  const e = fixture(), context = buildIntentContext(e.world, e.guards);
  const p = validatePlan({ ...plan([{ op: "wait", seconds: 1 }]), steps: [{ op: "wait", seconds: 1, preconditions: [{ kind: "guards_not_watching", text: "等转头", itemKind: null }] }] }, context)!;
  expect(p.steps[0].preconditions).toEqual([{ kind: "guards_not_watching", text: "等转头" }]);
  expect(preconditionError({ op: "wait", seconds: 1, preconditions: [{ kind: "holding_item", itemKind: "water_bottle", text: "先拿瓶子" }] }, e.world, e.guards)).toContain("先寻找并取得");
  expect(preconditionError({ op: "wait", seconds: 1, preconditions: [{ kind: "unverified", text: "雨停后" }] }, e.world, e.guards)).toContain("尚未能检查");
});

test("a public item spot can be chosen before an unseen item has an id", () => {
  const e = createFixtureEngine();
  expect(parseToolUse("move_to", { target: "convenience", reason: "自主寻找道具" })).toHaveProperty("action");
  expect(e.applyAction({ type: "move_to", target: "convenience", reason: "自主寻找道具" }).ok).toBe(true);
  expect(e.player.activity.kind).toBe("walking");
});

test("take then throw transfers a real bottle and can attract an unwitnessing guard", () => {
  const e = createLabEngine("hearing");
  e.player.pos = { x: 38, y: 13 }; // GATE_N is 5.4m away, inside the actual six-metre throw limit.
  const bottle = e.world.items.holdings("player").find(i => i.kind === "water_bottle")!;
  e.world.items.move(bottle.id, { type: "ground", pos: { ...e.player.pos } });
  const p = plan([{ op: "take", itemId: bottle.id }, { op: "drop", itemId: bottle.id, mode: "throw", at: { kind: "node", id: "GATE_N" }, preconditions: [{ kind: "holding_item", itemKind: "water_bottle", text: "实际取得后再使用" }] }]);
  expect(e.executor.start(p).ok).toBe(true);
  for (let i = 0; i < 60 && e.executor.busy; i++) e.step();
  for (let tick=0;tick<6;tick++) e.step(); // Release and landing are separate simulation events.
  expect(e.executor.outcomes.every(o => o.ok)).toBe(true);
  expect(bottle.location.type).toBe("ground");
  expect(e.events.events.some(v => v.kind === "item_thrown")).toBe(true);
  expect(e.guards.guards[0].mode).toBe("investigate");
  expect(e.world.items.transfers.filter(t => t.itemId === bottle.id).map(t => t.how)).toEqual(expect.arrayContaining(["take", "throw"]));
});

test("the full instruction fits beyond the former 200 character truncation", () => {
  const text = "保留我的条件。".repeat(40);
  expect(parseToolUse("act", { instruction: text, reason: "" })).toHaveProperty("action.instruction", text);
});

test("the normal runner carries original guidance even if the role and interpreter omit the condition", async () => {
  const e = fixture();
  const runner = new GameRunner(e, { kind: "llm", decide: async () => ({ action: { type: "act", instruction: "快速翻越低栏杆", reason: "" }, error: null, model: "fixture", usage: null, thinking: null, latencyMs: 0 }), dispose: async () => {} },
    async () => ({ mechanic: "unsupported", source: "keywords", reason: "" }), { guidance: source, interpret: async (_input, context) => {
      expect(context.guidance).toBe(source);
      return plan([{ op: "vault", obstacle: "railing" }]);
    } });
  runner.start(); await runner.pending;
  expect(runner.decisions[0].result!.ok).toBe(false);
  expect(runner.decisions[0].result!.text).toContain("视线覆盖");
  expect(runner.bossPlans[0].plan.translation!.sourceGuidance).toBe(source);
  expect(e.status).toBe("running");
  runner.stop();
});

test("the API binds the session's original guidance and retains interpreter conditions and source trace", async () => {
  const e = fixture(), sessions = new SessionStore(), s = sessions.create(source, null);
  const server = createApp({ sessions, llm: { model: "fixture", decide: async () => { throw new Error("unused"); }, normalize: async () => { throw new Error("unused"); },
    classify: async () => { throw new Error("unused"); }, interpret: async (_input, context) => {
      expect(context.guidance).toBe(source);
      return plan([{ op: "vault", obstacle: "railing" }]);
    } } }).listen(0, "127.0.0.1");
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/boss/interpret`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: s.id, instruction: "快速翻越低栏杆", context: { ...buildIntentContext(e.world, e.guards), guidance: "forged" } }) });
    expect(r.status).toBe(200);
    const p = await r.json();
    expect(p.translation.sourceGuidance).toBe(source);
    expect(p.steps[0].preconditions[0].kind).toBe("guards_not_watching");
  } finally { server.close(); }
});

test.each(["如果保安不注意就翻越栏杆", "只有保安没有看到我时才翻越栏杆", "趁保安背对时翻越栏杆"])("conditional wording remains a sight precondition: %s", instruction => {
  const e = fixture();
  const checked = reconcileInstruction(instruction, plan([{ op: "vault", obstacle: "railing" }]), buildIntentContext(e.world, e.guards));
  expect(checked.plan.status).toBe("plan");
  expect(checked.plan.steps[0].preconditions?.[0].kind).toBe("guards_not_watching");
  expect(e.executor.start(checked.plan).ok).toBe(false);
});

test("previous-success and actual-possession requirements keep their own meanings", () => {
  const e = fixture(), context = buildIntentContext(e.world, e.guards);
  const bottle = e.world.items.spawn("water_bottle", { type: "ground", pos: { ...e.player.pos } }, null);
  const holding = reconcileInstruction("取得水瓶后再投掷水瓶", plan([{ op: "drop", itemId: bottle.id, mode: "throw" }]), context);
  expect(holding.plan.status).toBe("plan");
  expect(holding.plan.steps[0].preconditions).toContainEqual({ kind: "holding_item", itemKind: "water_bottle", text: "取得水瓶后再" });
  expect(e.executor.start(holding.plan).ok).toBe(false);
  const previous = reconcileInstruction("如果前一步成功后再放下背包", plan([{ op: "drop", itemId: e.world.items.bag("player")!.id, mode: "place" }]), context);
  expect(previous.plan.steps[0].when).toBe("previous_succeeded");
  expect(previous.requirements.find(r => r.kind === "drop")?.state).toBe("covered");
});

test("unsupported conditions and repeated validation retain the complete source trace", () => {
  const e = fixture(), context = buildIntentContext(e.world, e.guards, source);
  const instruction = "如果下雨就翻越栏杆";
  const first = reconcileInstruction(instruction, plan([{ op: "vault", obstacle: "railing" }]), context).plan;
  const second = reconcileInstruction(instruction, first, buildIntentContext(e.world, e.guards)).plan;
  expect(second.status).toBe("unsupported");
  expect(second.translation?.instruction).toBe(instruction);
  expect(second.translation?.sourceGuidance).toBe(source);
  expect(second.translation?.sourceClauses?.map(c => c.text).join("")).toBe(source);
});
