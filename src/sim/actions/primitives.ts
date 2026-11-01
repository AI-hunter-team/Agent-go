import type { PlanStep, Severity, WorldEventKind } from "../../shared/types";

/** Closed primitive catalogue; validation/settlement live beside the executor's world access. */
export const PRIMITIVES: Record<PlanStep["op"], {
  duration: number;
  event?: WorldEventKind;
  severity: Severity;
  loudness: number;
}> = {
  approach: {
    duration: 0,
    severity: "odd",
    loudness: 0
  },
  take: {
    duration: 1.5,
    severity: "odd",
    loudness: 0
  },
  give: {
    duration: 1,
    severity: "odd",
    loudness: 0
  },
  drop: {
    duration: .5,
    event: "item_dropped",
    severity: "odd",
    loudness: 0
  },
  talk: {
    duration: 0,
    severity: "odd",
    loudness: 0
  },
  snatch: {
    duration: 1,
    event: "snatch",
    severity: "violation",
    loudness: 4
  },
  push: {
    duration: .8,
    event: "push",
    severity: "affecting",
    loudness: 5
  },
  strike: {
    duration: .5,
    event: "strike",
    severity: "violation",
    loudness: 0
  },
  restrain: { duration: .5, event: "push", severity: "violation", loudness: 2 },
  release: { duration: 0, severity: "odd", loudness: 0 },
  vault: {
    duration: 2.5,
    event: "vault",
    severity: "violation",
    loudness: 0
  },
  slide_handrail: {
    duration: 2,
    event: "slide_handrail",
    severity: "suspicious",
    loudness: 3
  },
  force_cut_in: {
    duration: 1.5,
    event: "force_cut_in",
    severity: "affecting",
    loudness: 3
  },
  make_noise: {
    duration: .5,
    event: "odd_behaviour",
    severity: "odd",
    loudness: 8
  },
  wait: {
    duration: 1,
    severity: "odd",
    loudness: 0
  }
};
const string = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 200;
const oneOf = (x: unknown, values: readonly string[]) => typeof x === "string" && values.includes(x);
const items = ["ticket", "coins", "umbrella", "water_bottle", "can", "snack", "backpack"];
export function isPlanStep(value: unknown): value is PlanStep {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  if (s.preconditions !== undefined && (!Array.isArray(s.preconditions) || s.preconditions.length > 8 || !s.preconditions.every(c => {
    if (!c || typeof c !== "object" || typeof c.text !== "string" || !c.text.trim() || c.text.length > 1000) return false;
    const keys = c.kind === "holding_item" ? ["kind", "text", "itemKind"] : ["kind", "text"];
    return Object.keys(c).every(k => keys.includes(k)) && (["guards_not_watching", "unverified"].includes(c.kind) || c.kind === "holding_item" && items.includes(c.itemKind));
  }))) return false;
  if (s.when !== undefined && !oneOf(s.when, ["always", "previous_refused", "previous_succeeded", "incapacitated_or_refused"])) return false;
  if (s.timing !== undefined && (!oneOf(s.timing, ["after_previous", "with_previous"]) || s.timing === "with_previous" && (s.op !== "talk" || s.when !== undefined && s.when !== "always"))) return false;
  if (s.pursue !== undefined && (typeof s.pursue !== "boolean" || !["strike", "snatch", "push", "restrain"].includes(String(s.op)))) return false;
  if (!string(s.op) || !Object.hasOwn(PRIMITIVES, s.op)) return false;
  const ref = (r: unknown) => Boolean(r && typeof r === "object" && string((r as Record<string, unknown>).id) && oneOf((r as Record<string, unknown>).kind, ["person", "item", "facility", "node", "spot"]));
  switch (s.op) {
    case "approach":
      return ref(s.target);
    case "take":
      return string(s.itemId);
    case "give":
      return string(s.itemId) && string(s.toId);
    case "drop":
      return string(s.itemId) && oneOf(s.mode, ["place", "drop", "throw"]) && (s.at === undefined || ref(s.at)) && !(s.at !== undefined && s.atPosition !== undefined)
        && (s.atPosition === undefined || !!s.atPosition && typeof s.atPosition === "object" && Number.isFinite((s.atPosition as {x:number}).x) && Number.isFinite((s.atPosition as {y:number}).y));
    case "talk":
      return string(s.npcId) && string(s.message) && oneOf(s.goal, ["chat", "ask_ticket", "trade", "yield", "persuade", "threaten", "bribe"]) && (s.offerItemId === undefined || string(s.offerItemId));
    case "snatch":
      return string(s.npcId) && oneOf(s.itemKind, items);
    case "push":
    case "restrain":
    case "release":
    case "force_cut_in":
      return string(s.npcId);
    case "strike":
      return ((string(s.npcId) && s.facilityId === undefined && oneOf(s.aim, ["knockout", "hurt"])) || (string(s.facilityId) && s.npcId === undefined && s.aim === "hurt")) && (s.itemId === undefined || string(s.itemId));
    case "vault":
      return oneOf(s.obstacle, ["gate", "railing", "escalator_side"]);
    case "slide_handrail":
      return true;
    case "make_noise":
      return oneOf(s.level, ["low", "mid", "high"]);
    case "wait":
      return typeof s.seconds === "number" && Number.isFinite(s.seconds) && s.seconds > 0 && s.seconds <= 20;
    default:
      return false;
  }
}
