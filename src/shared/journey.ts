import type { GameSettings } from "./gameSettings";
import type { NormalizedGuidance } from "./types";

export interface JourneyInput {
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
  sceneId: string;
  sceneName: string;
  characterId: string;
  characterName: string;
  model: string | null;
  plan: JourneyPlan | null;
  autonomous: boolean;
  preparationMs: number;
}
export function validPlan(value: unknown): value is JourneyPlan {
  const p = value as JourneyPlan | null;
  return (
    !!p &&
    typeof p.understanding === "string" &&
    p.understanding.trim().length > 0 &&
    p.understanding.length <= 1500 &&
    typeof p.adjustment === "string" &&
    p.adjustment.trim().length > 0 &&
    p.adjustment.length <= 1500 &&
    Array.isArray(p.actions) &&
    p.actions.length > 0 &&
    p.actions.length <= 8 &&
    p.actions.every(
      (a) => typeof a === "string" && a.trim().length > 0 && a.length <= 1000,
    )
  );
}
