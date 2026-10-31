import type { GameSession } from "./gameSession";

export type DialogueStatus = "pending" | "accepted" | "refused" | "counter" | "ended" | "error";
export interface ConversationTurn {
  id: string;
  npcId: string;
  label: string;
  round: number;
  t: number;
  question: string;
  reply: string | null;
  status: DialogueStatus;
}
export const dialogueStatusLabel: Record<DialogueStatus, string> = {
  pending: "等待回复", accepted: "同意请求", refused: "拒绝请求", counter: "提出条件", ended: "对话结束", error: "未收到答复",
};

/** Only public utterances and appearance enter the presentation model. */
export function getConversationTurns(session: GameSession): ConversationTurn[] {
  const current: ConversationTurn[] = (session.runner?.interactionDialogues ?? []).map((record, index) => ({
    id: `native-${index}`, npcId: record.request.npc.id,
    label: `NPC ${record.request.npc.id}${record.request.npc.look.outfit ? ` · ${record.request.npc.look.outfit}` : ""}`,
    round: 0, t: record.t, question: record.request.message,
    reply: record.response.source === "error" ? null : record.response.reply,
    status: record.response.source === "error" ? "error" : record.response.decision === "accept" || record.response.decision === "comply_under_threat" ? "accepted"
      : record.response.decision === "refuse" ? "refused" : record.response.decision === "counter" ? "counter" : "ended",
  }));
  const legacy: ConversationTurn[] = (session.runner?.dialogues ?? []).map((record, index) => ({
    id: `legacy-${index}`, npcId: record.request.npc.id, label: `NPC ${record.request.npc.id} · ${record.request.npc.trait}`,
    round: 0, t: record.t, question: record.request.message, reply: record.response?.source === "error" ? null : record.response?.reply ?? null,
    status: record.status === "pending" ? "pending" : record.status === "error" ? "error" : record.response?.accepted ? "accepted" : "refused",
  }));
  const pending = session.engine.executor.pendingDialogue;
  const turns = [...legacy, ...current].sort((a, b) => a.t - b.t || Number(a.status === "pending") - Number(b.status === "pending"));
  if (pending) turns.push({
    id: `native-${current.length}`, npcId: pending.request.npc.id,
    label: `NPC ${pending.request.npc.id}${pending.request.npc.look.outfit ? ` · ${pending.request.npc.look.outfit}` : ""}`,
    round: 0, t: session.engine.t, question: pending.request.message, reply: null, status: "pending",
  });
  const rounds = new Map<string, number>();
  return turns.map(turn => {
    const round = (rounds.get(turn.npcId) ?? 0) + 1;
    rounds.set(turn.npcId, round);
    return { ...turn, round };
  });
}

export function groupConversations(turns: readonly ConversationTurn[]) {
  const groups = new Map<string, { npcId: string; label: string; turns: ConversationTurn[] }>();
  for (const turn of turns) {
    if (!groups.has(turn.npcId)) groups.set(turn.npcId, { npcId: turn.npcId, label: turn.label, turns: [] });
    groups.get(turn.npcId)!.turns.push(turn);
  }
  return [...groups.values()];
}
