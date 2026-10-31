import { expect, test } from "vitest";
import { GameRunner } from "../src/agent/runner";
import { DialogueFollowThrough } from "../src/agent/dialogueFollowThrough";
import type { Agent } from "../src/agent/agent";
import type { ActionPlan, AgentAction, AgentTurn, NpcResponse } from "../src/shared/types";
import { createFixtureEngine } from "./fixtures/scenarios";

const guidance = "插队，如果对方不同意，改变话术再次尝试";
const wait: AgentAction = { type: "wait", seconds: 20, reason: "继续排队" };
const npcReply = (decision: "accept" | "refuse"): NpcResponse => ({ decision, reply: decision === "accept" ? "好，请先过" : "我也赶时间，不能让位", give: null, want: null, reason: "隐藏判断", source: "llm" });

function setup(text: string, script: (id: string) => AgentAction[], options: { maxDecisions?: number; responses?: ("accept" | "refuse")[]; plan?: (id: string) => ActionPlan } = {}) {
  const engine = createFixtureEngine();
  const npc = engine.world.addPerson("normal", { x: 8, y: 15 });
  const f = engine.world.facility("TVM-2")!;
  f.queue = [npc.id, "player"];
  f.serving = { personId: "busy", remaining: 1000, recheck: false };
  npc.pos = engine.world.queueStandPoint(f, 0);
  npc.activity = { kind: "queued", facility: f.def.id };
  engine.player.pos = engine.world.queueStandPoint(f, 1, "player");
  engine.player.activity = { kind: "queued", facility: f.def.id };
  const turns: AgentTurn[] = [], actions = script(npc.id), replies = [...(options.responses ?? ["refuse", "accept"])];
  const agent: Agent = { kind: "llm", async decide(turn) {
    turns.push(structuredClone(turn));
    return { action: actions.shift() ?? wait, model: "fixture", thinking: null, usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 0, cacheReadTokens: 0 }, latencyMs: 1, error: null };
  }, async dispose() {} };
  const runner = new GameRunner(engine, agent, async () => ({ mechanic: "unsupported", reason: "", source: "keywords" }), {
    guidance: text, maxDecisions: options.maxDecisions,
    respond: async () => npcReply(replies.shift() ?? "refuse"),
    interpret: async () => options.plan?.(npc.id) ?? ({ status: "plan", steps: [{ op: "wait", seconds: 20 }], summary: "等待", reason: "", source: "llm" }),
  });
  const talk = (message: string): AgentAction => ({ type: "talk", npcId: npc.id, goal: "yield", message, reason: "请求让位" });
  return { engine, npc, f, turns, runner, talk, agent };
}
const talk = (id: string, message: string): AgentAction => ({ type: "talk", npcId: id, goal: "yield", message, reason: "请求让位" });
async function until(runner: GameRunner, done: () => boolean) {
  if (runner.phase === "ready") runner.start();
  for (let i = 0; i < 1000 && !done(); i++) {
    if (runner.pending) await runner.pending;
    else runner.advance(1);
  }
  expect(done()).toBe(true);
}

test("a skipped retry is corrected before waiting and consent completes the condition", async () => {
  const s = setup(guidance, id => [talk(id, "我赶时间，能先走吗"), wait, talk(id, "理解您也着急，我只买一张票，能借十秒吗"), wait]);
  await until(s.runner, () => s.runner.interactionDialogues.length === 2 && s.runner.decisions.length === 3);
  expect(s.turns[1].lastResult).toMatchObject({ ok: true, dialogue: { decision: "refuse", goalAchieved: false } });
  expect(s.turns[1].dialogueFollowThrough).toMatchObject({ status: "pending", remaining: 1 });
  expect(s.turns[2].correction).toBeTruthy();
  expect(s.runner.decisions[1].attempts).toHaveLength(2);
  expect(s.runner.decisions[1].attempts?.[0].execution?.ok).toBe(false);
  expect(s.runner.decisions[1].usage?.inputTokens).toBe(20);
  expect(s.turns[3].dialogueFollowThrough).toMatchObject({ status: "in_progress", remaining: 0 });
  expect(s.runner.decisions[2].attempts).toHaveLength(1);
  expect(s.engine.dialogue.history.get(s.npc.id)).toHaveLength(2);
  expect(JSON.stringify(s.turns)).not.toContain("隐藏判断");
  await until(s.runner, () => s.runner.decisions.length === 4);
  expect(s.turns[4].dialogueFollowThrough).toMatchObject({ status: "completed", remaining: 0 });
  expect(s.turns[4].lastResult?.dialogue).toMatchObject({ goalAchieved: true, effectPending: false });
  s.runner.stop();
});

test("repeating the original sentence with punctuation changes does not consume a retry", async () => {
  const s = setup(guidance, id => [talk(id, "我赶时间，能先走吗？"), talk(id, "我赶时间 能先走吗!"), talk(id, "只借十秒，您愿意让我先买一张吗")]);
  await until(s.runner, () => s.runner.interactionDialogues.length === 2);
  expect(s.turns[2].correction).toBeTruthy();
  expect(s.engine.dialogue.history.get(s.npc.id)?.map(h => h.message)).toEqual(["我赶时间，能先走吗？", "只借十秒，您愿意让我先买一张吗"]);
  s.runner.stop();
});

test.each(["", "插队", "插队，被拒后不要再试", "插队，不同意就正常排队，不要改变话术", "do not retry if refused"]) ("no retry is imposed without an affirmative requirement: %s", async text => {
  const s = setup(text, id => [talk(id, "能先走吗"), wait]);
  await until(s.runner, () => s.runner.decisions.length === 2);
  expect(s.turns).toHaveLength(2);
  expect(s.turns[1].dialogueFollowThrough).toBeUndefined();
  expect(s.runner.decisions[1].action?.type).toBe("wait");
  s.runner.stop();
});

test("an adjusted retry that is refused still fulfils the requested single retry", async () => {
  const s = setup(guidance, id => [talk(id, "能先走吗"), talk(id, "只借十秒先买一张好吗"), wait], { responses: ["refuse", "refuse"] });
  await until(s.runner, () => s.runner.decisions.length === 3);
  expect(s.turns).toHaveLength(3);
  expect(s.turns[2].dialogueFollowThrough).toMatchObject({ status: "completed", remaining: 0 });
  s.runner.stop();
});

test("the simulator's three-round limit releases a pending condition with a reason", async () => {
  const s = setup(guidance, id => [talk(id, "能先走吗"), wait]);
  s.engine.dialogue.history.set(s.npc.id, [1, 2].map(i => ({ message: `之前${i}`, reply: "不行", decision: "refuse" })));
  await until(s.runner, () => s.runner.decisions.length === 2);
  expect(s.turns[1].dialogueFollowThrough).toMatchObject({ status: "blocked", reason: expect.stringContaining("三轮") });
  expect(s.turns).toHaveLength(2);
  s.runner.stop();
});

test("an unavailable original NPC releases a same-person retry without inventing consent", async () => {
  const s = setup("插队，被拒后向同一个人改变话术再试", id => [talk(id, "能先走吗"), wait]);
  await until(s.runner, () => s.runner.interactionDialogues.length === 1);
  s.engine.world.persons.delete(s.npc.id);
  s.f.queue = ["player"];
  await until(s.runner, () => s.runner.decisions.length === 2);
  expect(s.turns[1].dialogueFollowThrough).toMatchObject({ status: "blocked", reason: expect.any(String) });
  expect(s.turns[1].lastResult?.dialogue?.goalAchieved).toBe(false);
  expect(s.turns).toHaveLength(2);
  s.runner.stop();
});

test("repeatedly ignoring a correction advances time and never exceeds the model budget", async () => {
  const s = setup(guidance, id => [talk(id, "能先走吗"), wait, wait, wait], { maxDecisions: 3 });
  await until(s.runner, () => s.runner.decisions.length >= 3);
  expect(s.runner.calls.decisions).toBe(3);
  expect(s.runner.decisions[1].fallback).toBe(true);
  expect(s.engine.t).toBeGreaterThan(0);
  expect(s.runner.budgetExhausted).toBe(true);
  s.runner.stop();
});

test("a compound act cannot bypass the pending dialogue requirement", async () => {
  const s = setup(guidance, id => [talk(id, "能先走吗"), { type: "act", instruction: "等20秒", reason: "放弃交涉" }, talk(id, "只借十秒好吗")]);
  await until(s.runner, () => s.runner.interactionDialogues.length === 2);
  expect(s.runner.bossPlans[0].outcomes[0].ok).toBe(false);
  expect(s.engine.t).toBe(0);
  s.runner.stop();
});

test.each([true, false])("the original person's identity is enforced only when required: %s", async same => {
  const s = setup(same ? "插队，被拒后向同一个人改变话术再试" : guidance, id => [talk(id, "能先走吗"), talk("p2", "只借十秒可以吗"), talk(id, "能让我先买一张票吗")]);
  const other = s.engine.world.addPerson("normal", { ...s.npc.pos });
  expect(other.id).toBe("p2");
  s.f.queue = [s.npc.id, other.id, "player"];
  other.pos = s.engine.world.queueStandPoint(s.f, 1);
  other.activity = { kind: "queued", facility: s.f.def.id };
  s.engine.player.pos = s.engine.world.queueStandPoint(s.f, 2, "player");
  await until(s.runner, () => s.runner.interactionDialogues.length === 2);
  expect(s.runner.interactionDialogues[1].request.npc.id).toBe(same ? s.npc.id : other.id);
  expect(s.turns).toHaveLength(same ? 3 : 2);
  s.runner.stop();
});

test("two expressly requested retries stop after three actual conversations", async () => {
  const s = setup("插队，被拒后改变话术再试两次", id => [talk(id, "能先走吗"), talk(id, "只借十秒好吗"), talk(id, "我帮您操作售票机，能让我先买一张吗"), wait], { responses: ["refuse", "refuse", "refuse"] });
  await until(s.runner, () => s.runner.decisions.length === 4);
  expect(s.turns[1].dialogueFollowThrough?.remaining).toBe(2);
  expect(s.turns[2].dialogueFollowThrough?.remaining).toBe(1);
  expect(s.turns[3].dialogueFollowThrough).toMatchObject({ status: "completed", remaining: 0 });
  expect(s.engine.dialogue.history.get(s.npc.id)).toHaveLength(3);
  s.runner.stop();
});

test("first-round acceptance does not create a retry task", async () => {
  const s = setup(guidance, id => [talk(id, "能先走吗"), wait], { responses: ["accept"] });
  await until(s.runner, () => s.runner.decisions.length === 2);
  expect(s.turns).toHaveLength(2);
  expect(s.turns[1].dialogueFollowThrough).toBeUndefined();
  s.runner.stop();
});

test("ending during the correction ignores the late action", async () => {
  const s = setup(guidance, id => [talk(id, "能先走吗"), wait]);
  await until(s.runner, () => s.runner.interactionDialogues.length === 1);
  const original = s.agent.decide.bind(s.agent);
  let resolve!: (value: Awaited<ReturnType<Agent["decide"]>>) => void;
  s.agent.decide = turn => turn.correction ? new Promise(done => { resolve = done; }) : original(turn);
  s.runner.advance(0);
  for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
  expect(resolve).toBeTypeOf("function");
  const pending = s.runner.pending;
  s.runner.stop();
  resolve({ action: s.talk("只借十秒好吗"), thinking: null, usage: null, model: "fixture", latencyMs: 0, error: null });
  await pending;
  expect(s.runner.interactionDialogues).toHaveLength(1);
  expect(s.engine.dialogue.history.get(s.npc.id)).toHaveLength(1);
  expect(s.runner.phase).toBe("ended");
});

test("a prohibition on changing people does not negate changing the wording", async () => {
  const s = setup("插队，被拒后不要换人，改变话术再试", id => [talk(id, "能先走吗"), wait, talk(id, "只借十秒好吗")]);
  await until(s.runner, () => s.runner.interactionDialogues.length === 2);
  expect(s.turns[1].dialogueFollowThrough).toMatchObject({ status: "pending", sameNpc: true });
  expect(s.turns[2].correction).toBeTruthy();
  s.runner.stop();
});

test("a compound plan must return control after the retry before choosing its next action", () => {
  const s = setup(guidance, () => []);
  const tracker = new DialogueFollowThrough("插队，被拒后改话术再试两次");
  tracker.record({ ok: true, text: "不行", dialogue: { npcId: s.npc.id, goal: "yield", message: "能先走吗", reply: "不行", decision: "refuse", goalAchieved: false } });
  expect(tracker.check({ status: "plan", source: "llm", summary: "先谈后等", reason: "", steps: [
    { op: "talk", npcId: s.npc.id, goal: "yield", message: "只借十秒好吗" }, { op: "wait", seconds: 20 },
  ] }, s.engine)).toBeTruthy();
});

test("a refusal in the initial compound plan pauses its queued suffix before it can bypass retry", async () => {
  const s = setup(guidance, id => [{ type: "act", instruction: "先问能否让我先走，不行就等20秒", reason: "交涉" }, talk(id, "只借十秒好吗")], {
    plan: id => ({ status: "plan", source: "llm", summary: "交涉", reason: "", steps: [{ op: "talk", npcId: id, goal: "yield", message: "能先走吗" }, { op: "wait", seconds: 20 }] }),
  });
  await until(s.runner, () => s.runner.interactionDialogues.length === 2);
  expect(s.turns[1].dialogueFollowThrough?.status).toBe("pending");
  expect(s.engine.t).toBe(0);
  expect(s.engine.world.events.some(event => event.kind === "action_interrupted")).toBe(true);
  s.runner.stop();
});

test("consent that becomes invalid during movement is reported as failed, not a completed goal", async () => {
  const s = setup("插队，被拒后改话术再试两次", id => [talk(id, "能先走吗"), talk(id, "只借十秒好吗"), wait]);
  await until(s.runner, () => s.runner.interactionDialogues.length === 2);
  s.f.queue = [];
  await until(s.runner, () => s.runner.decisions.length >= 4);
  const last = s.turns.at(-1)!;
  expect(last.lastResult).toMatchObject({ ok: false, dialogue: { decision: "accept", goalAchieved: false, effectPending: false } });
  expect(last.dialogueFollowThrough).toMatchObject({ status: "blocked", reason: expect.stringContaining("让位已失效") });
  expect(last.dialogueFollowThrough?.history.at(-1)?.goalAchieved).toBe(false);
  s.runner.stop();
});
