import type { GameSettings } from "./gameSettings";
import type { NormalizedGuidance } from "./types";
import { NORMALIZED_MAX_JSON_LENGTH, NORMALIZED_MAX_TEXT_LENGTH } from "./guidance";
import { guidanceSources, verifiedCoverage, type GuidanceRequirement } from "./guidanceSources";

export interface JourneyInput {
  world?: import("./world").WorldDescriptor;
  sceneId: "metro";
  seed: number;
  settings: GameSettings;
  loadout?: import("./interaction").Loadout;
  guidance: string;
  autonomous: boolean;
  runId: string;
}
export interface JourneyPlan {
  understanding: string;
  actions: string[];
  adjustment: string;
  sourceGuidance?: string;
  requirements?: GuidanceRequirement[];
  preparation?: { source: "adapted" | "default"; notes: string[] };
}

/** Controlled, user-readable planning failure; no vendor response or credentials. */
export class JourneyPlanError extends Error {}

/** Attach authoritative original text; model-supplied quotations never replace it. */
export function retainJourneyGuidance(plan: JourneyPlan, original: string, coverage?: unknown): JourneyPlan {
  if (!original) return { understanding: plan.understanding, actions: plan.actions, adjustment: plan.adjustment, ...(plan.preparation ? {preparation:plan.preparation} : {}) };
  const rows = Array.isArray(coverage) ? coverage.filter(r=>r && typeof r === "object") : [];
  return { understanding: plan.understanding, actions: plan.actions, adjustment: plan.adjustment, ...(plan.preparation ? {preparation:plan.preparation} : {}), sourceGuidance: original, requirements: guidanceSources(original).map(source => {
    const matches=rows.filter(r=>r.sourceId === source.id);
    const row=matches.length === 1 && verifiedCoverage([{...matches[0],sourceId:"r1"}],source.text,plan.actions.length) ? matches[0] : undefined;
    return { ...source, kind: row?.kind ?? "other", handling: row?.handling ?? "unverified", steps: row?.steps ?? [], explanation: row?.explanation ?? "原文已保留；此项尚未完成语义核对，不能视为满足" };
  }) };
}
export interface JourneyPreparation {
  debug?: import("./debug").OperationDebug;
  id: string;
  model: string;
  normalized: NormalizedGuidance;
  plan: JourneyPlan;
}
export interface JourneyMetadata {
  worldName?: string;
  worldSeedSource?: { mode: "random" | "custom"; value: string };
  sceneId: string;
  sceneName: string;
  characterId: string;
  characterName: string;
  model: string | null;
  plan: JourneyPlan | null;
  autonomous: boolean;
  preparationMs: number;
}
export function planToNormalized(plan: JourneyPlan, guidance = ""): NormalizedGuidance {
  const projected={ summary: plan.understanding, priorities: [], risk: "", rules: (plan.sourceGuidance??guidance).trim() ? [plan.sourceGuidance??guidance] : [], creativeIdeas: [], notExecutable: [], initialPlan: [...plan.actions, plan.adjustment] };
  if ([projected.summary,...projected.initialPlan,...projected.rules].every(s=>s.length<=NORMALIZED_MAX_TEXT_LENGTH) && projected.initialPlan.length<=20 && JSON.stringify(projected).length<=NORMALIZED_MAX_JSON_LENGTH) return projected;
  // Compatibility cache only. Full text is stored separately in Session.journeyPlan and the report.
  return { ...projected, summary:"完整初始方案已单独保留；本摘要不能替代原指导和完整方案。", initialPlan:["按照本局完整初始方案与原指导行动，现场变化时重新观察。"] };
}
export function validPlan(value: unknown, _guidance = ""): value is JourneyPlan {
  const p = value as JourneyPlan | null;
  return (
    !!p &&
    (p.sourceGuidance === undefined || typeof p.sourceGuidance === "string" && [...p.sourceGuidance].length <= 300) &&
    typeof p.understanding === "string" &&
    p.understanding.trim().length > 0 &&
    typeof p.adjustment === "string" &&
    p.adjustment.trim().length > 0 &&
    Array.isArray(p.actions) &&
    p.actions.length > 0 &&
    p.actions.every(
      (a) => typeof a === "string" && a.trim().length > 0,
    )
  );
}
