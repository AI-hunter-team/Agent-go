import { expect, test } from "vitest";
import { getHeadMessage, getSessionHeadMessage, getHeadMessageDeadlines, type HeadMessageInput } from "../src/ui/headMessages";
import { GameSession } from "../src/ui/gameSession";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { dialogueFixture } from "./fixtures/dialogue";

const input = (changes: Partial<HeadMessageInput> = {}): HeadMessageInput => ({
  actorId: "player", t: 12, mode: "full", speech: [], ...changes,
});

async function returnedDecision(thinking: string | null = "售票机队伍较短，先去买票。") {
  const session = new GameSession(1);
  session.start({
    kind: "llm",
    async decide() {
      return { action: { type: "wait" as const, seconds: 20, reason: "等候当前办理完成" }, thinking,
        usage: null, model: "test", latencyMs: 0, error: null };
    },
    async dispose() {},
  }, async intent => classifyByKeywords(intent));
  await session.runner!.pending;
  return session;
}

test.each([
  ["售票机队伍较短，先去买票。", "售票机队伍较短，先去买票。"],
  [null, "等候当前办理完成"],
  ["   ", "等候当前办理完成"],
])("the scene shows returned thinking or the action reason when the record is collapsed (%s)", async (thinking, expected) => {
  const session = await returnedDecision(thinking);
  expect(getSessionHeadMessage(session, "player", "full", null, 100))
    .toEqual({ kind: "thought", text: expected, pending: false });
  expect(getSessionHeadMessage(session, "player", "icons", null, 200))
    .toEqual({ kind: "thought", text: null, pending: false });
  expect(getSessionHeadMessage(session, "player", "full", null, 300)?.text).toBe(expected);
  expect(getSessionHeadMessage(session, "n1", "full", null, 300)).toBeNull();
  expect(getSessionHeadMessage(session, "player", "hidden", null, 300)).toBeNull();
});

test("a returned thought expires in real time while paused or at 4x without replaying on mode changes", async () => {
  const session = await returnedDecision();
  expect(getHeadMessageDeadlines(session, 100)).toEqual([4100]);
  session.setPaused(true);
  expect(getSessionHeadMessage(session, "player", "full", null, 1000)?.text).toBe("售票机队伍较短，先去买票。");
  session.setSpeed(4);
  session.engine.world.t = 16;
  expect(getSessionHeadMessage(session, "player", "full", null, 1100)?.text).toBe("售票机队伍较短，先去买票。");
  expect(getSessionHeadMessage(session, "player", "icons", null, 4100)).toBeNull();
  expect(getSessionHeadMessage(session, "player", "full", null, 4200)).toBeNull();
  expect(getHeadMessageDeadlines(session, 4200)).toEqual([]);
});

test("a new decision replaces the old thought even when both finish at the same world time", async () => {
  const session = await returnedDecision();
  expect(getSessionHeadMessage(session, "player", "full", null, 100)).not.toBeNull();
  expect(getSessionHeadMessage(session, "player", "full", null, 4100)).toBeNull();
  session.engine.notify("action_failed", "重新评估");
  session.runner!.advance(0);
  expect(getSessionHeadMessage(session, "player", "full", "thinking", 4200))
    .toEqual({ kind: "thought", text: null, pending: true });
  expect(getSessionHeadMessage(session, "player", "full", null, 4200)).toBeNull();
  await session.runner!.pending;
  expect(getSessionHeadMessage(session, "player", "full", null, 4300)?.text).toBe("售票机队伍较短，先去买票。");
  expect(getHeadMessageDeadlines(session, 4300)).toEqual([8300]);
  session.preview(2);
  expect(getSessionHeadMessage(session, "player", "full", null, 4400)).toBeNull();
  expect(getHeadMessageDeadlines(session, 4400)).toEqual([]);
});

test("current NPC dialogue keeps priority over the returned player thought", async () => {
  const session = await returnedDecision();
  session.runner!.interactionDialogues.push({ t: 0, request: dialogueFixture(), response: {
    reply: "请沿标识去售票机。", decision: "refuse", give: null, want: null, reason: "指路", source: "offline",
  } });
  expect(getSessionHeadMessage(session, "player", "full", null, 100)).toBeNull();
  expect(getSessionHeadMessage(session, "n1", "full", null, 100)?.text).toBe("请沿标识去售票机。");
});

test("speech belongs to its speaker and takes priority over an earlier decision", () => {
  const speech = [{ speakerId: "p1", text: "我还在等人", t: 11 }, { speakerId: "player", text: "能让我先过吗？", t: 12 }];
  expect(getHeadMessage(input({ speech, decision: { t: 10, thinking: "选择沟通", action: null } })))
    .toMatchObject({ kind: "speech", text: "能让我先过吗？" });
  expect(getHeadMessage(input({ actorId: "p1", speech }))).toMatchObject({ kind: "speech", text: "我还在等人" });
  expect(getHeadMessage(input({ actorId: "p2", speech }))).toBeNull();
});

test("expanded records keep indicators without exposing speech or thought text", () => {
  const speech = [{ speakerId: "player", text: "private line", t: 12 }];
  expect(getHeadMessage(input({ mode: "icons", speech }))).toMatchObject({ kind: "speech", text: null });
  expect(getHeadMessage(input({ mode: "icons", decision: { t: 12, thinking: "private thought", action: null } })))
    .toMatchObject({ kind: "thought", text: null });
});

test("the player's actual dialogue request appears even when only the NPC reply is logged as speech", () => {
  const utterance = { t: 12, text: "可以交换这张票吗？" };
  expect(getHeadMessage(input({ utterance }))).toMatchObject({ kind: "speech", text: "可以交换这张票吗？" });
  expect(getHeadMessage(input({ utterance, mode: "icons" }))).toMatchObject({ kind: "speech", text: null });
  expect(getHeadMessage(input({ utterance, t: 17 }))).toBeNull();
});

test("actual NPC replies win over same-time simulation settlement messages", () => {
  expect(getHeadMessage(input({ actorId: "p1", speech: [{ speakerId: "p1", text: "执行让位成功", t: 12 }],
    utterance: { t: 12, text: "你先走吧。" } }))).toMatchObject({ text: "你先走吧。" });
});

test("returned replies keep only the latest NPC text and demote an older NPC to an icon", () => {
  const session = new GameSession(1);
  session.engine.world.t = 12;
  const runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent));
  session.runner = runner;
  for (const [id, t, message, reply] of [["p1", 11, "能让我先过吗？", "可以，你先走吧。"], ["p2", 12, "这里怎么走？", "向前走。"]] as const) {
    const request = dialogueFixture();
    request.npc.id = id; request.message = message;
    runner.interactionDialogues.push({ t, request, response: { reply, decision: "accept", give: null, want: null, reason: "同意", source: "offline" } });
  }
  session.engine.world.t = 11;
  session.engine.world.log("speech", "p1：已经执行让位", true);
  session.engine.world.t = 12;
  session.presentation.settle(session.engine);
  expect(getSessionHeadMessage(session, "p1", "full")).toMatchObject({ text: null });
  expect(getSessionHeadMessage(session, "p2", "full")).toMatchObject({ text: "向前走。" });
  expect(getSessionHeadMessage(session, "player", "full")).toBeNull();
});

test("real time expires speech while the game clock is frozen", () => {
  const session = new GameSession(1);
  session.engine.world.t = 12;
  const runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent));
  session.runner = runner;
  runner.interactionDialogues.push({ t: 12, request: dialogueFixture(), response: { reply: "可以", decision: "accept", give: null, want: null, reason: "hidden", source: "offline" } });
  expect(getSessionHeadMessage(session, "n1", "full", null, 100)).toMatchObject({ text: "可以" });
  expect(getSessionHeadMessage(session, "n1", "full", null, 4101)).toBeNull();
  expect(session.engine.t).toBe(12);
});

test("a burst of five NPC replies shows one short text and at most two icons", () => {
  const session = new GameSession(1);
  session.engine.world.t = 12;
  const runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent));
  session.runner = runner;
  for (let i = 1; i <= 5; i++) {
    const request = dialogueFixture(); request.npc.id = `n${i}`;
    runner.interactionDialogues.push({ t: 12, request, response: { reply: "这是一段比较长的完整答复。".repeat(10), decision: "refuse", give: null, want: null, reason: "hidden", source: "offline" } });
  }
  const messages = [1, 2, 3, 4, 5].map(i => getSessionHeadMessage(session, `n${i}`, "full", null, 100)).filter(Boolean);
  expect(messages).toHaveLength(3);
  expect(messages.filter(message => message?.text)).toHaveLength(1);
  expect([...(messages.find(message => message?.text)?.text ?? "")]).toHaveLength(48);
  expect([1, 2, 3, 4].map(i => getSessionHeadMessage(session, `n${i}`, "full", null, 2601)).filter(Boolean)).toHaveLength(0);
});

test("an identical new reply is a new turn, while a new game removes all old bubbles", () => {
  const session = new GameSession(1);
  session.engine.world.t = 12;
  const runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent)); session.runner = runner;
  const record = { t: 12, request: dialogueFixture(), response: { reply: "不行", decision: "refuse" as const, give: null, want: null, reason: "hidden", source: "offline" as const } };
  runner.interactionDialogues.push(record);
  getSessionHeadMessage(session, "n1", "full", null, 0);
  expect(getSessionHeadMessage(session, "n1", "full", null, 4100)).toBeNull();
  runner.interactionDialogues.push(structuredClone(record));
  expect(getSessionHeadMessage(session, "n1", "full", null, 4200)).toMatchObject({ text: "不行" });
  session.preview(2);
  expect(getSessionHeadMessage(session, "n1", "full", null, 4300)).toBeNull();
});

test("speeding the simulation to 4x does not shorten an already displayed real-time bubble", () => {
  const session = new GameSession(1);
  session.engine.world.t = 12;
  const runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent)); session.runner = runner;
  runner.interactionDialogues.push({ t: 12, request: dialogueFixture(), response: { reply: "请先排队", decision: "refuse", give: null, want: null, reason: "hidden", source: "offline" } });
  expect(getSessionHeadMessage(session, "n1", "full", null, 100)).toMatchObject({ text: "请先排队" });
  session.engine.world.t = 16.1;
  expect(getSessionHeadMessage(session, "n1", "full", null, 1125)).toMatchObject({ text: "请先排队" });
  session.engine.world.t = 29;
  expect(getSessionHeadMessage(session, "n1", "full", null, 4101)).toBeNull();
});

test("registering wakeup deadlines before the first canvas frame prevents a stale reply on tab return", () => {
  const session = new GameSession(1); session.engine.world.t = 12;
  session.runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent));
  session.runner.interactionDialogues.push({ t: 12, request: dialogueFixture(), response: { reply: "请排队", decision: "refuse", give: null, want: null, reason: "hidden", source: "offline" } });
  expect(getHeadMessageDeadlines(session, 100)).toEqual([4100]);
  expect(getSessionHeadMessage(session, "n1", "full", null, 5000)).toBeNull();
  expect(getHeadMessageDeadlines(session, 5000)).toEqual([]);
});

test("a background speaker keeps its real deadline when a 4x scene snapshot drops the old speech", () => {
  const session = new GameSession(1); session.engine.world.t = 12;
  session.engine.world.log("speech", "p1：请排队", true); session.presentation.settle(session.engine);
  expect(getSessionHeadMessage(session, "p1", "full", null, 100)).toMatchObject({ text: null });
  session.engine.world.t = 16.1; session.presentation.settle(session.engine);
  expect(getSessionHeadMessage(session, "p1", "full", null, 1125)).not.toBeNull();
  expect(getSessionHeadMessage(session, "p1", "full", null, 2601)).toBeNull();
});

test("background chatter does not take the full-text slot from the current conversation", () => {
  const session = new GameSession(1); session.engine.world.t = 12;
  session.runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent));
  session.runner.interactionDialogues.push({ t: 12, request: dialogueFixture(), response: { reply: "请排队", decision: "refuse", give: null, want: null, reason: "hidden", source: "offline" } });
  session.engine.world.log("speech", "p9：有人在赶车", true); session.presentation.settle(session.engine);
  expect(getSessionHeadMessage(session, "n1", "full", null, 100)).toMatchObject({ text: "请排队" });
  expect(getSessionHeadMessage(session, "p9", "full", null, 100)).toMatchObject({ text: null });
});

test("a new question hides the same NPC's previous reply until the replacement arrives", () => {
  const session = new GameSession(1);
  session.engine.world.t = 12;
  const runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent));
  session.runner = runner;
  const request = dialogueFixture();
  runner.interactionDialogues.push({ t: 11, request, response: { reply: "我正在等朋友。", decision: "refuse", give: null, want: null, reason: "等人", source: "offline" } });
  const nextRequest = { ...request, message: "那可以让我先走吗？" };
  session.engine.dialogue.pendingDialogue = { request: nextRequest, step: { op: "talk", npcId: request.npc.id, goal: "yield", message: nextRequest.message }, eventId: "test-question" };
  expect(getSessionHeadMessage(session, "player", "full")).toMatchObject({ text: nextRequest.message });
  expect(getSessionHeadMessage(session, request.npc.id, "full")).toBeNull();

  runner.interactionDialogues.push({ t: 12, request: nextRequest, response: { reply: "可以，你先走吧。", decision: "accept", give: null, want: null, reason: "同意", source: "offline" } });
  session.engine.dialogue.pendingDialogue = null;
  expect(getSessionHeadMessage(session, "player", "full", "thinking")).toBeNull();
  expect(getSessionHeadMessage(session, request.npc.id, "full")).toMatchObject({ text: "可以，你先走吧。" });
  expect(runner.interactionDialogues).toHaveLength(2);
});

test("only returned thinking is shown and an action reason can explain a decision", () => {
  expect(getHeadMessage(input({ decision: { t: 12, thinking: "队伍较短，先买票。", action: null } })))
    .toMatchObject({ kind: "thought", text: "队伍较短，先买票。", pending: false });
  expect(getHeadMessage(input({ decision: { t: 12, thinking: null, action: { type: "wait", seconds: 1, reason: "等候办理" } } })))
    .toMatchObject({ kind: "thought", text: "等候办理" });
  expect(getHeadMessage(input({ decision: { t: 12, thinking: null, action: null } }))).toBeNull();
});

test("a pending request shows status instead of pretending an older thought is current", () => {
  expect(getHeadMessage(input({ phase: "thinking", decision: { t: 12, thinking: "上一轮", action: null } })))
    .toMatchObject({ kind: "thought", text: null, pending: true });
});

test("old and future speech or decisions cannot linger above an actor", () => {
  for (const t of [7.9, 13]) {
    expect(getHeadMessage(input({ speech: [{ speakerId: "player", text: "过期", t }] }))).toBeNull();
    expect(getHeadMessage(input({ decision: { t, thinking: "过期", action: null } }))).toBeNull();
  }
  expect(getHeadMessage(input({ speech: [{ speakerId: "player", text: "仍有效", t: 8 }] })))
    .toMatchObject({ text: "仍有效" });
});

test("hidden mode removes even pending messages after a run ends", () => {
  expect(getHeadMessage(input({ mode: "hidden", phase: "thinking", speech: [{ speakerId: "player", text: "结束", t: 12 }] }))).toBeNull();
});
