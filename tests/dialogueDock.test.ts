import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GameSession } from "../src/ui/gameSession";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { dialogueFixture } from "./fixtures/dialogue";
import { getConversationTurns, groupConversations } from "../src/ui/dialoguePresentation";
import { DialogueDock, ConversationHistory } from "../src/ui/DialogueDock";

function fixture() {
  const session = new GameSession(1);
  session.runner = new GameRunner(session.engine, new HeuristicAgent(), async intent => classifyByKeywords(intent));
  for (const [npcId, message, reply, t] of [["p1", "第一问", "我也赶时间", 12], ["p2", "问另一位", "请排队", 12], ["p1", "我帮您提行李，能先走吗", "可以，谢谢", 12]] as const) {
    const request = dialogueFixture(); request.npc.id = npcId; request.npc.look.outfit = "红色外套"; request.message = message;
    session.runner.interactionDialogues.push({ t, request, response: { reply, decision: reply.startsWith("可以") ? "accept" : "refuse", give: null, want: null, source: "llm", reason: "hidden psychology" } });
  }
  return session;
}
test("same-time conversations group by NPC while preserving turn order and full utterances", () => {
  const session = fixture();
  const turns = getConversationTurns(session);
  expect(turns.map(turn => [turn.npcId, turn.round, turn.question])).toEqual([["p1", 1, "第一问"], ["p2", 1, "问另一位"], ["p1", 2, "我帮您提行李，能先走吗"]]);
  expect(groupConversations(turns).map(group => [group.npcId, group.turns.length])).toEqual([["p1", 2], ["p2", 1]]);
  expect(JSON.stringify(turns)).not.toContain("hidden psychology");
  expect(renderToStaticMarkup(createElement(ConversationHistory, { turns }))).toContain("第 2 轮");
});
test("the dock contains one full current exchange and an explicit consent label", () => {
  const html = renderToStaticMarkup(createElement(DialogueDock, { session: fixture() }));
  expect(html).toContain("当前对话");
  expect(html).toContain("我帮您提行李，能先走吗");
  expect(html).toContain("可以，谢谢");
  expect(html).toContain("同意请求");
  expect(html).not.toContain("第一问");
  expect(html).not.toContain("hidden psychology");
  expect(html).toContain("对话记录");
});
test("a pending turn displays its question without reusing the previous answer", () => {
  const session = fixture(), request = dialogueFixture(); request.npc.id = "p1"; request.message = "新的请求";
  session.engine.dialogue.pendingDialogue = { request, step: { op: "talk", npcId: "p1", message: request.message, goal: "yield" }, eventId: "pending" };
  const turns = getConversationTurns(session);
  expect(turns.at(-1)).toMatchObject({ npcId: "p1", round: 3, reply: null, status: "pending", question: "新的请求" });
  const html = renderToStaticMarkup(createElement(DialogueDock, { session }));
  expect(html).toContain("等待回复");
  expect(html).toContain("新的请求");
  expect(html).not.toContain("可以，谢谢");
});
test("no dialogue means no empty dock, while the history retains every actual exchange", () => {
  expect(renderToStaticMarkup(createElement(DialogueDock, { session: new GameSession(1) }))).toBe("");
  const html = renderToStaticMarkup(createElement(ConversationHistory, { turns: getConversationTurns(fixture()) }));
  for (const line of ["第一问", "我也赶时间", "问另一位", "请排队", "我帮您提行李", "可以，谢谢"]) expect(html).toContain(line);
});

test("a pending legacy conversation stays current when mixed with native replies at the same world time", () => {
  const session = fixture();
  session.runner!.dialogues.push({ t: 12, decisionIndex: 4, request: { npc: { id: "p7", trait: "普通乘客", temperament: "hidden", facility: "TVM-1", queuePosition: 1, queueLength: 3 }, message: "新的请求", history: [] }, startedAt: "now", finishedAt: null, status: "pending", response: null, execution: null });
  expect(getConversationTurns(session).at(-1)).toMatchObject({ npcId: "p7", status: "pending", reply: null });
});
