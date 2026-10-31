import { expect, test } from "vitest";
import { getHeadMessage, getSessionHeadMessage, type HeadMessageInput } from "../src/ui/headMessages";
import { GameSession } from "../src/ui/gameSession";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { dialogueFixture } from "./fixtures/dialogue";

const input = (changes: Partial<HeadMessageInput> = {}): HeadMessageInput => ({
  actorId: "player", t: 12, mode: "full", speech: [], ...changes,
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

test("returned replies replace the player's request bubble while retaining each NPC's latest reply", () => {
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
  expect(getSessionHeadMessage(session, "p1", "full")).toMatchObject({ text: "可以，你先走吧。" });
  expect(getSessionHeadMessage(session, "p2", "full")).toMatchObject({ text: "向前走。" });
  expect(getSessionHeadMessage(session, "player", "full")).toBeNull();
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
