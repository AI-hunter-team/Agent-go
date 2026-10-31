import type { GameSettings } from "./gameSettings";
import type { NormalizedGuidance } from "./types";
import { NORMALIZED_MAX_JSON_LENGTH, NORMALIZED_MAX_TEXT_LENGTH } from "./guidance";

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
  return { summary: plan.understanding, priorities: [], risk: "", rules: guidance.trim() ? [guidance] : [], creativeIdeas: [], notExecutable: [], initialPlan: [...plan.actions, plan.adjustment] };
}
export function validPlan(value: unknown, guidance = ""): value is JourneyPlan {
  const p = value as JourneyPlan | null;
  return (
    !!p &&
    typeof p.understanding === "string" &&
    p.understanding.trim().length > 0 &&
    p.understanding.length <= NORMALIZED_MAX_TEXT_LENGTH &&
    typeof p.adjustment === "string" &&
    p.adjustment.trim().length > 0 &&
    p.adjustment.length <= NORMALIZED_MAX_TEXT_LENGTH &&
    Array.isArray(p.actions) &&
    p.actions.length > 0 &&
    p.actions.length <= 8 &&
    p.actions.every(
      (a) => typeof a === "string" && a.trim().length > 0 && a.length <= NORMALIZED_MAX_TEXT_LENGTH,
    ) &&
    JSON.stringify(planToNormalized(p, guidance)).length <= NORMALIZED_MAX_JSON_LENGTH
  );
}
