import type { DecisionRecord } from "../shared/types";
import type { SceneSnapshot } from "./presentation";
import type { GameSession } from "./gameSession";
import { getConversationTurns } from "./dialoguePresentation";

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

interface SceneSpeech { key: string; actorId: string; text: string; t: number; foreground: boolean }
const lifetimes = new WeakMap<GameSession, { generation: number; seen: Map<string, number>; ambient: Map<string, SceneSpeech>; deadlines: number[] }>();
const short = (text: string) => [...text].length <= 48 ? text : [...text].slice(0, 47).join("") + "…";

/** Registers visual arrival before a canvas frame, and shares its exact real deadlines with the wakeup scheduler. */
export function getHeadMessageDeadlines(session: GameSession, nowMs = performance.now()): number[] {
  getSessionHeadMessage(session, "player", "icons", null, nowMs);
  return lifetimes.get(session)?.deadlines ?? [];
}

/** Foreground dialogue takes priority over returned decisions; messages expire in real milliseconds. */
export function getSessionHeadMessage(session: GameSession, actorId: string, mode: HeadMessageMode, phase?: HeadMessageInput["phase"], nowMs = performance.now()): HeadMessage | null {
  if (mode === "hidden") return null;
  let lifetime = lifetimes.get(session);
  if (!lifetime || lifetime.generation !== session.generation) {
    lifetime = { generation: session.generation, seen: new Map(), ambient: new Map(), deadlines: [] };
    lifetimes.set(session, lifetime);
  }
  const recent = (t: number, key: string) => t <= session.engine.t && (lifetime.seen.has(key) || session.engine.t - t <= 4);
  const turns = getConversationTurns(session);
  const pending = turns.at(-1)?.status === "pending" ? turns.at(-1) : undefined;
  const candidates: SceneSpeech[] = turns
    .filter(turn => turn.reply && recent(turn.t, `${turn.id}:reply`) && (!pending || turn.npcId !== pending.npcId))
    .map(turn => ({ key: `${turn.id}:reply`, actorId: turn.npcId, text: turn.reply!, t: turn.t, foreground: true }));
  for (const line of session.presentation.current.speech) {
    if (!recent(line.t, `ambient:${line.speakerId}:${line.t}:${line.text}`) || !line.text.trim() || line.speakerId === pending?.npcId) continue;
    if (turns.some(turn => turn.npcId === line.speakerId && turn.reply && turn.t >= line.t)) continue;
    candidates.push({ key: `ambient:${line.speakerId}:${line.t}:${line.text}`, actorId: line.speakerId, text: line.text, t: line.t, foreground: false });
  }
  for (const [key, cached] of lifetime.ambient) {
    if (nowMs - lifetime.seen.get(key)! >= 4000) { lifetime.ambient.delete(key); continue; }
    if (cached.t > session.engine.t || cached.actorId === pending?.npcId || candidates.some(candidate => candidate.key === key)) continue;
    if (turns.some(turn => turn.npcId === cached.actorId && turn.reply && turn.t >= cached.t)) continue;
    candidates.push(cached);
  }
  candidates.sort((a, b) => a.t - b.t);
  if (pending) candidates.push({ key: `${pending.id}:question`, actorId: "player", text: pending.question, t: pending.t, foreground: true });
  const latest = candidates.filter(candidate => candidate.foreground).at(-1) ?? candidates.at(-1);
  // Keep only the latest event per person, so a pending question replaces their old reply.
  const speakers = new Set<string>();
  const ordered = latest ? [latest, ...[...candidates].reverse().filter(candidate => candidate.key !== latest.key)] : [];
  const selected = ordered.filter(candidate => {
    if (speakers.has(candidate.actorId)) return false;
    speakers.add(candidate.actorId); return true;
  }).slice(0, 3);
  for (const candidate of selected) {
    if (!lifetime.seen.has(candidate.key)) lifetime.seen.set(candidate.key, nowMs);
    if (!candidate.foreground) lifetime.ambient.set(candidate.key, candidate);
  }
  if (lifetime.seen.size > 256) lifetime.seen.delete(lifetime.seen.keys().next().value!);
  const expiresAt = (candidate: SceneSpeech) => lifetime.seen.get(candidate.key)! + (candidate.key === latest?.key && candidate.foreground ? 4000 : 2500);
  const visible = selected.filter(candidate => nowMs < expiresAt(candidate));
  const decision = session.runner?.phase === "running" ? session.runner.decisions.at(-1) : undefined;
  const decisionKey = `decision:${decision?.index}`;
  const decisionText = decision?.thinking?.trim() || decision?.action?.reason.trim();
  const currentDecision = decision && decisionText && recent(decision.t, decisionKey);
  if (currentDecision && !lifetime.seen.has(decisionKey)) lifetime.seen.set(decisionKey, nowMs);
  const decisionDeadline = currentDecision ? lifetime.seen.get(decisionKey)! + 4000 : 0;
  const decisionVisible = nowMs < decisionDeadline;
  lifetime.deadlines = [...new Set([...visible.map(expiresAt), ...(decisionVisible ? [decisionDeadline] : [])])].sort((a, b) => a - b);
  const own = visible.find(candidate => candidate.actorId === actorId);
  if (own) return { kind: "speech", text: mode === "full" && own.key === latest?.key && own.foreground ? short(own.text) : null, pending: false };
  if (actorId !== "player" || visible.some(candidate => candidate.foreground)) return null;
  if (phase) return { kind: "thought", text: null, pending: phase === "thinking" };
  if (decisionVisible) return { kind: "thought", text: mode === "full" ? decisionText! : null, pending: false };
  return null;
}
