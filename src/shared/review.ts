import type { AgentAction, ActionResult, DecisionUsage, FacilityStatus, GameEvent, GameReport, Observation, TimeBreakdown, Vec } from "./types";
import { countChars, guidanceError } from "./guidance";

export interface WorldReviewSnapshot {
  t: number;
  player: Vec;
  facilities: { id: string; status: FacilityStatus; queue: string[]; serving: { personId: string; remaining: number } | null }[];
  guards: { id: string; position: Vec; facing: number }[];
  transit?: { queue: string[]; riders: { id: string; remaining: number }[] };
}
export interface ReviewInput {
  status: "failed";
  seed: number;
  guidance: string;
  elapsed: number;
  failReason: string;
  timeBreakdown: TimeBreakdown;
  decisions: { index: number; t: number; observed: Observation | null; action: AgentAction | null; result: ActionResult | null; error: string | null }[];
  events: GameEvent[];
  worldSnapshots: WorldReviewSnapshot[];
}
export interface ReviewEvidence { decisionIndexes: number[]; eventIndexes: number[] }
export interface ReviewStrategy extends ReviewEvidence {
  id: string; title: string; change: string; reason: string; when: string; tradeoff: string; recommended: boolean;
}
export interface ReviewAnalysis {
  summary: string;
  primaryCause: string;
  secondaryFactors: string[];
  uncertainties: string[];
  turningPoints: (ReviewEvidence & { t: number; knownThen: string; discoveredAfter: string; assessment: string })[];
  strategies: ReviewStrategy[];
}
export interface ReviewMetadata { model: string; usage: DecisionUsage | null; latencyMs: number }
export interface ReviewResult extends ReviewMetadata { analysis: ReviewAnalysis }
export interface DraftResult extends ReviewMetadata { guidance: string }
export interface ReviewAttempt extends ReviewMetadata { operation: "review" | "draft"; status: "success" | "error" }
/** Only safe metadata crosses the API; raw model responses and errors stay server-side. */
export class ReviewFailure extends Error {
  constructor(message: string, readonly attempt: ReviewAttempt | null = null) { super(message); }
}

/** Deliberate projection: never send debug parameters, raw responses or internal reasoning. */
export function buildReviewInput(report: GameReport): ReviewInput {
  if (report.status !== "failed") throw new Error("仅对已失败的对局生成复盘");
  return structuredClone({
    status: "failed", seed: report.seed, guidance: report.guidance, elapsed: report.elapsed,
    failReason: report.failReason ?? "原因未记录", timeBreakdown: report.timeBreakdown,
    decisions: report.decisions.map(d => ({ index: d.index, t: d.t,
      observed: (d.attempts ?? report.attempts?.filter(a => a.decisionIndex === d.index))?.[0]?.input.observation ?? null,
      action: d.action, result: d.result, error: d.error,
    })),
    events: report.events, worldSnapshots: report.worldSnapshots ?? [],
  });
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 600): v is string => typeof v === "string" && !!v.trim() && countChars(v) <= max;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const texts = (v: unknown, max: number) => list(v, max) && v.every(s => text(s));
const point = (v: unknown) => object(v) && typeof v.x === "number" && Number.isFinite(v.x) && typeof v.y === "number" && Number.isFinite(v.y);

export function validateReviewInput(value: unknown): asserts value is ReviewInput {
  const fail = () => { throw new Error("复盘资料格式无效或超出限制"); };
  if (!object(value) || value.status !== "failed" || !Number.isSafeInteger(value.seed) || (value.seed as number) < 1
    || guidanceError(value.guidance) || !finite(value.elapsed) || value.elapsed > 3600 || !text(value.failReason)
    || !object(value.timeBreakdown) || !Object.values(value.timeBreakdown).every(finite)
    || !list(value.decisions, 120) || !list(value.events, 2000) || !list(value.worldSnapshots, 300)
    || Object.keys(value).some(k => !["status", "seed", "guidance", "elapsed", "failReason", "timeBreakdown", "decisions", "events", "worldSnapshots"].includes(k))
    || JSON.stringify(value).length > 600_000) return fail();
  const within = (t: unknown) => finite(t) && t <= (value.elapsed as number) + 0.001;
  if (!value.decisions.every(d => object(d) && Number.isSafeInteger(d.index) && (d.index as number) >= 1 && within(d.t)
    && (d.observed === null || (object(d.observed) && within(d.observed.t) && object(d.observed.self) && Array.isArray(d.observed.facilities) && Array.isArray(d.observed.guards)))
    && (d.action === null || (object(d.action) && typeof d.action.type === "string"))
    && (d.result === null || (object(d.result) && typeof d.result.ok === "boolean" && typeof d.result.text === "string"))
    && (d.error === null || typeof d.error === "string"))) return fail();
  if (new Set(value.decisions.map(d => (d as { index: number }).index)).size !== value.decisions.length) return fail();
  if (!value.events.every(e => object(e) && within(e.t) && text(e.kind, 80) && text(e.text, 2000) && typeof e.playerVisible === "boolean")) return fail();
  if (!value.worldSnapshots.every(s => object(s) && within(s.t) && point(s.player)
    && list(s.facilities, 30) && s.facilities.every(f => object(f) && text(f.id, 80) && ["open", "closed", "broken"].includes(String(f.status))
      && list(f.queue, 200) && f.queue.every(p => text(p, 100)) && (f.serving === null || (object(f.serving) && text(f.serving.personId, 80) && finite(f.serving.remaining))))
    && list(s.guards, 20) && s.guards.every(g => object(g) && text(g.id, 80) && point(g.position) && typeof g.facing === "number" && Number.isFinite(g.facing))
    && (s.transit === undefined || (object(s.transit) && list(s.transit.queue, 100) && s.transit.queue.every(id => text(id, 100))
      && list(s.transit.riders, 100) && s.transit.riders.every(r => object(r) && text(r.id, 100) && finite(r.remaining)))))) return fail();
}

export function validateStrategies(value: unknown): asserts value is ReviewStrategy[] {
  if (!list(value, 3) || !value.length || !value.every(s => object(s)
    && ["id", "title", "change", "reason", "when", "tradeoff"].every(k => text(s[k], k === "id" ? 60 : 600))
    && typeof s.recommended === "boolean" && list(s.decisionIndexes, 120) && s.decisionIndexes.every(Number.isSafeInteger)
    && list(s.eventIndexes, 2000) && s.eventIndexes.every(Number.isSafeInteger))
    || new Set(value.map(s => (s as ReviewStrategy).id)).size !== value.length) throw new Error("策略建议格式无效");
}

export function validateReview(value: unknown, input: ReviewInput): ReviewAnalysis {
  if (!object(value) || !text(value.summary) || !text(value.primaryCause) || !texts(value.secondaryFactors, 8) || !texts(value.uncertainties, 8) || !(value.uncertainties as unknown[]).length
    || !list(value.turningPoints, 6) || !value.turningPoints.length) throw new Error("模型复盘格式无效");
  validateStrategies(value.strategies);
  if (value.strategies.length < 2) throw new Error("复盘需要两到三条策略建议");
  if (value.strategies.filter(s => s.recommended).length !== 1) throw new Error("复盘应明确推荐一条策略");
  const recordedTimes = [0, input.elapsed, ...input.decisions.map(d => d.t), ...input.events.map(e => e.t), ...input.worldSnapshots.map(s => s.t)];
  const decisionIds = new Set(input.decisions.map(d => d.index));
  const evidence = (v: Record<string, unknown>) => list(v.decisionIndexes, 120) && v.decisionIndexes.every(i => Number.isSafeInteger(i) && decisionIds.has(i as number))
    && list(v.eventIndexes, 2000) && v.eventIndexes.every(i => Number.isSafeInteger(i) && (i as number) >= 0 && (i as number) < input.events.length);
  if (!value.turningPoints.every(p => object(p) && finite(p.t) && p.t <= input.elapsed + 0.001
    && recordedTimes.some(t => Math.abs(t - (p.t as number)) <= 0.001)
    && text(p.knownThen) && text(p.discoveredAfter) && text(p.assessment) && evidence(p))
    || !value.strategies.every(s => evidence(s as unknown as Record<string, unknown>))) throw new Error("复盘引用了不存在的记录或时间");
  return value as unknown as ReviewAnalysis;
}

export function validateDraft(value: unknown): { guidance: string } {
  if (!object(value) || !text(value.guidance, 300) || guidanceError(value.guidance)) throw new Error("模型指导草稿必须是 1–300 字");
  return { guidance: value.guidance };
}
