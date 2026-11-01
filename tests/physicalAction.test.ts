import { describe, expect, test } from "vitest";
import { parseToolUse, AGENT_TOOLS } from "../server/tools";
import { createLabEngine } from "../src/lab/scenarios";
import { physicalActionPlan } from "../src/sim/actions/physical";
import { explicitPhysicalIntent } from "../src/shared/physicalIntent";
import { buildIntentContext, parsePlan } from "../src/sim/intent";
import { recoverPhysicalAction } from "../src/lab/physicalIntent";
import { fake, response, toolCall } from "./responsesSupport";
import { SessionStore } from "../server/sessions";
import { GameRunner } from "../src/agent/runner";
import type { Agent } from "../src/agent/agent";

describe("separate physical action transport", () => {
  const wire = { action: "strike", npcId: "p1", aim: "hurt", itemId: null, itemKind: null, speech: { message: "把票给我", goal: "threaten", offerItemId: null }, reason: "测试指令" };
  test("tool carries action and speech separately and keeps the old talk format", () => {
    expect(AGENT_TOOLS.find(t => t.name === "physical_action")?.strict).toBe(true);
    const parsed = parseToolUse("physical_action", wire);
    expect(parsed).toMatchObject({ action: { type: "physical_action", action: "strike", aim: "hurt", speech: { goal: "threaten" } } });
    if ("action" in parsed && parsed.action.type === "physical_action") expect(physicalActionPlan(parsed.action).steps.map(s => s.op)).toEqual(["talk", "strike"]);
    expect(parseToolUse("talk", { npcId: "p1", message: "你好", goal: "chat" })).toHaveProperty("action.type", "talk");
  });
  test.each([
    { ...wire, action: "teleport" }, { ...wire, aim: null }, { ...wire, action: "snatch", aim: null, itemKind: null },
    { ...wire, action: "push", aim: "hurt" }, { ...wire, success: true }, { ...wire, speech: { ...wire.speech, success: true } },
  ])("rejects malformed or outcome-writing physical fields", (bad) => expect(parseToolUse("physical_action", bad)).toHaveProperty("error"));
  test("speech finishes first, then an actual strike event is emitted", () => {
    const e = createLabEngine("physical"), n = [...e.world.persons.values()].find(p => !p.isPlayer)!;
    expect(e.applyAction({ type: "physical_action", action: "strike", npcId: n.id, aim: "hurt", speech: { message: "交出票", goal: "threaten" }, reason: "测试" }).ok).toBe(true);
    expect(e.executor.pendingDialogue).not.toBeNull();
    expect(e.events.events.some(v => v.kind === "strike")).toBe(false);
    e.dialogue.apply({ reply: "不给", decision: "refuse", give: null, want: null, reason: "测试拒绝", source: "offline" });
    for (let i = 0; i < 30 && !e.events.events.some(v => v.kind === "strike"); i++) e.step();
    expect(e.events.events.some(v => v.kind === "strike" && v.targetId === n.id)).toBe(true);
  });
  test("the dialogue cap cannot prohibit an independently requested physical attempt", () => {
    const e = createLabEngine("physical"), n = [...e.world.persons.values()].find(p => !p.isPlayer)!;
    e.dialogue.history.set(n.id, Array.from({ length: 3 }, () => ({ message: "问", reply: "拒绝", decision: "refuse" as const })));
    expect(e.applyAction({ type: "physical_action", action: "strike", npcId: n.id, aim: "hurt", speech: { message: "交出票", goal: "threaten" }, reason: "测试" }).ok).toBe(true);
    expect(e.executor.pendingDialogue).toBeNull();
    expect(e.world.events.some(v => v.kind === "speech_skipped")).toBe(true);
    expect(e.events.events.some(v => v.kind === "strike")).toBe(true);
  });
  test("the screenshot command produces talk and strike as separate steps", () => {
    const e = createLabEngine("social"), context = buildIntentContext(e.world, e.guards);
    const instruction = "威胁恐吓向最近的乘客索要车票，执行殴打动作";
    expect(parsePlan(instruction, context).steps.map(s => s.op)).toEqual(["talk", "strike"]);
    const n = context.people[0];
    expect(recoverPhysicalAction(instruction, { type: "talk", npcId: n.id, message: "交出票", goal: "threaten", reason: "" }, context)).toMatchObject({ action: "strike", speech: { goal: "threaten" } });
  });
  test.each(["威胁他说：“不给我票就殴打你”", "不要执行殴打动作", "不进行殴打", "如果他拒绝，然后击打他", "要是拒绝就打晕他"])("does not turn words, negation or conditions into an unconditional attack: %s", input => expect(explicitPhysicalIntent(input)).toBeNull());
  test("does not redirect an explicit attack on another or unknown person", () => {
    const e = createLabEngine("social"), context = buildIntentContext(e.world, e.guards), n = context.people[0];
    expect(recoverPhysicalAction("威胁p1，殴打p999", { type: "talk", npcId: n.id, message: "交票", goal: "threaten", reason: "" }, context)).toBeNull();
  });
  test("Responses transport parses the physical tool and keeps it in model history", async () => {
    const e = createLabEngine("physical"), n = [...e.world.persons.values()].find(p => !p.isPlayer)!;
    const { service, requests } = fake([response({ output: [toolCall(JSON.stringify({ ...wire, npcId: n.id }), "physical-call", "physical_action")] })]);
    const session = new SessionStore().create("交谈后尝试殴打", null);
    const decision = await service.decide(session, { observation: e.observe(), triggers: [], lastResult: null });
    expect(decision.error).toBeNull(); expect(decision.action?.type).toBe("physical_action");
    expect(requests[0].body.tools.some((t: { name: string }) => t.name === "physical_action")).toBe(true);
  });
  test("the formal game runner executes the tool and resolves its NPC dialogue", async () => {
    const e = createLabEngine("physical"), n = [...e.world.persons.values()].find(p => !p.isPlayer)!;
    const agent: Agent = { kind: "llm", dispose: async () => {}, decide: async () => ({ action: { type: "physical_action", action: "strike", aim: "hurt", npcId: n.id, speech: { message: "交出票", goal: "threaten" }, reason: "测试" }, error: null, usage: null, thinking: null, latencyMs: 0, model: "test" }) };
    const runner = new GameRunner(e, agent, async () => ({ mechanic: "unsupported", source: "keywords", reason: "" }), { respond: async () => ({ reply: "不给", decision: "refuse", give: null, want: null, reason: "测试", source: "llm" }) });
    runner.start();
    for (let i = 0; i < 50 && !e.events.events.some(v => v.kind === "strike"); i++) { if (runner.pending) await runner.pending; else runner.advance(1); }
    expect(runner.interactionDialogues).toHaveLength(1);
    expect(e.events.events.some(v => v.kind === "strike")).toBe(true);
    runner.stop();
  });
});
