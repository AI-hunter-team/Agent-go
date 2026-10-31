import type { DecisionRecord } from "../shared/types";
import type { SceneSnapshot } from "./presentation";
import type { GameSession } from "./gameSession";

export type HeadMessageMode = "full" | "icons" | "hidden";
export interface HeadMessageInput {
  actorId: string;
  t: number;
  mode: HeadMessageMode;
  speech: SceneSnapshot["speech"];
  utterance?: { t: number; text: string };
  phase?: "thinking" | "ready" | null;
  decision?: Pick<DecisionRecord, "t" | "thinking" | "action">;
}
export interface HeadMessage {
  kind: "speech" | "thought";
  text: string | null;
  pending: boolean;
}

/** 头顶只展示当前人物的近期内容；请求未返回时不复用上一轮思考。 */
export function getHeadMessage(input: HeadMessageInput): HeadMessage | null {
  if (input.mode === "hidden") return null;
  const recent = (t: number) => input.t >= t && input.t - t <= 4;
  let spoken = input.utterance && recent(input.utterance.t) ? input.utterance : undefined;
  for (let i = input.speech.length - 1; i >= 0; i--) {
    const line = input.speech[i];
    if (line.speakerId === input.actorId && recent(line.t) && line.text.trim()) {
      if (!spoken || line.t > spoken.t) spoken = line;
      break;
    }
  }
  if (spoken?.text.trim()) return { kind: "speech", text: input.mode === "full" ? spoken.text : null, pending: false };
  if (input.actorId !== "player") return null;
  if (input.phase) return { kind: "thought", text: null, pending: input.phase === "thinking" };
  const decision = input.decision;
  if (decision && recent(decision.t)) {
    const text = decision.thinking?.trim() || decision.action?.reason.trim();
    if (text) return { kind: "thought", text: input.mode === "full" ? text : null, pending: false };
  }
  return null;
}

/** 对话原文来自请求/回复记录，世界日志可能只是执行结果。 */
export function getSessionHeadMessage(session: GameSession, actorId: string, mode: HeadMessageMode, phase?: HeadMessageInput["phase"]): HeadMessage | null {
  let utterance: HeadMessageInput["utterance"];
  const current = lastDialogueFor(session.runner?.interactionDialogues, actorId);
  const legacy = lastDialogueFor(session.runner?.dialogues, actorId);
  const dialogue = current && (!legacy || current.t >= legacy.t) ? current : legacy;
  const pending = session.engine.executor.pendingDialogue;
  // A conversation has one active speaker: the question, then the replacement reply.
  if (pending?.request.npc.id === actorId || actorId !== "player" && dialogue && !dialogue.response) return null;
  if (actorId === "player" && !pending && dialogue?.response && session.engine.t >= dialogue.t && session.engine.t - dialogue.t <= 4) return null;
  if (dialogue) utterance = { t: dialogue.t, text: actorId === "player" ? dialogue.request.message : dialogue.response!.reply };
  if (actorId === "player" && pending) utterance = { t: session.engine.t, text: pending.request.message };
  return getHeadMessage({ actorId, t: session.engine.t, mode, speech: session.presentation.current.speech, utterance,
    phase: actorId === "player" ? phase : null,
    decision: session.runner?.phase === "running" ? session.runner.decisions.at(-1) : undefined });
}

function lastDialogueFor<T extends { request: { npc: { id: string } } }>(records: readonly T[] | undefined, actorId: string): T | undefined {
  if (!records) return undefined;
  for (let i = records.length - 1; i >= 0; i--) {
    if (actorId === "player" || records[i].request.npc.id === actorId) return records[i];
  }
  return undefined;
}
