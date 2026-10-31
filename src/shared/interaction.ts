// Interaction 2.0 contracts (docs/interaction-v2/design.md C1–C9).
// Runtime consumers: simulator, server, runner, report and scene presentation.
import type { OperationDebug } from "./debug";
import type { DecisionUsage } from "./types";
import type { Vec } from "./types";

export interface Loadout { backpack: boolean }
export const DEFAULT_LOADOUT: Readonly<Loadout> = Object.freeze({ backpack: true });
export function resolveLoadout(value: unknown = DEFAULT_LOADOUT): Readonly<Loadout> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => k !== "backpack") || typeof (value as Loadout).backpack !== "boolean") throw new RangeError("背包配置须为 { backpack: boolean }");
  return Object.freeze({ backpack: (value as Loadout).backpack });
}

export type AlertLevel = "none" | "white" | "yellow" | "red";
export type ObserverRole = "npc" | "guard" | "security_staff";
export type Severity = "odd" | "suspicious" | "affecting" | "danger" | "violation";
export type EntityRef = { kind: "person" | "item" | "facility" | "node" | "spot"; id: string };

export type ItemKind = "ticket" | "coins" | "umbrella" | "water_bottle" | "newspaper" | "snack" | "backpack";

export interface ItemDef {
  kind: ItemKind;
  label: string;
  /** Backpack capacity units; zero for small pocket items. */
  size: number;
  /** Audible drop radius in metres; throws multiply it by 1.5. */
  dropNoise: number;
  impact: number;
  value: number;
  security: "ok" | "inspect" | "confiscate";
  visibleWhenHeld: boolean;
}

export type ItemLocation =
  | { type: "held"; personId: string; slot: "pocket" | "hand" | "bag" }
  | { type: "ground"; pos: Vec }
  | { type: "container"; containerId: string }
  | { type: "spot"; spotId: string };

export interface Item {
  id: string;
  kind: ItemKind;
  location: ItemLocation;
  /** Legal owner; snatching changes possession, not this field. */
  ownerId: string | null;
  used?: boolean;
}

export interface ItemSpot {
  id: string;
  label: string;
  pos: Vec;
  stock: ItemKind[];
  takeSeconds: number;
}

export interface Persona {
  look: { build: string; outfit: string; carrying: string[]; manner: string; voice: string };
  traits: { courage: number; vanity: number; temper: number; fairness: number; meddling: number };
  situation: { hurry: number; fatigue: number; companionId: string | null; luggage: boolean };
}

export interface MemoryEntry {
  t: number;
  about: string | null;
  kind: string;
  text: string;
  eventId?: string;
}

export type WorldEventKind =
  | "item_dropped" | "item_thrown" | "collision" | "push" | "snatch" | "strike" | "knockout"
  | "threaten" | "vault" | "slide_handrail" | "escalator_exit" | "force_cut_in"
  | "argument" | "report" | "facility_damaged" | "power_out" | "power_restored" | "odd_behaviour";

export interface WorldEvent {
  id: string;
  t: number;
  kind: WorldEventKind;
  severity: Severity;
  actorId: string | null;
  targetId?: string;
  itemId?: string;
  pos: Vec;
  loudness: number;
  causeId?: string;
  /** Subject described by a report, not necessarily its speaker. */
  aboutId?: string;
  /** Last known subject position carried by a report; never a live hidden position. */
  aboutPos?: Vec;
}

export interface OngoingAct {
  actorId: string;
  kind: WorldEventKind;
  severity: Severity;
  targetId?: string;
  eventId: string;
}

export interface Percept {
  observerId: string;
  eventId: string;
  t: number;
  channel: "sight" | "hearing" | "report";
  role: "victim" | "witness" | "bystander";
  /** Hearing alone never identifies the actor. */
  attributedTo: string | null;
  pos: Vec;
}

export interface AlertRecord {
  observerId: string;
  subjectId: string;
  level: AlertLevel;
  ring: number;
  hiddenFor: number;
  since: number;
  causeEventId: string;
  reaction: string | null;
}

export interface AlertSignals {
  guardRed: { guardId: string; subjectId: string; causeEventId: string } | null;
}

export type TalkGoal = "chat" | "ask_ticket" | "trade" | "yield" | "persuade" | "threaten" | "bribe";

export type PlanStep =
  | { op: "approach"; target: EntityRef }
  | { op: "take"; itemId: string }
  | { op: "give"; itemId: string; toId: string }
  | { op: "drop"; itemId: string; mode: "place" | "drop" | "throw"; at?: EntityRef }
  | { op: "talk"; npcId: string; message: string; goal: TalkGoal; offerItemId?: string }
  | { op: "snatch"; npcId: string; itemKind: ItemKind }
  | { op: "push"; npcId: string }
  | { op: "strike"; npcId: string; itemId?: string; aim: "knockout" | "hurt" }
  | { op: "strike"; facilityId: string; itemId?: string; aim: "hurt" }
  | { op: "vault"; obstacle: "gate" | "railing" | "escalator_side" }
  | { op: "slide_handrail" }
  | { op: "force_cut_in"; npcId: string }
  | { op: "make_noise"; level: "low" | "mid" | "high" }
  | { op: "wait"; seconds: number };

export interface ModelMetadata { debug?: OperationDebug; model?: string | null; usage?: DecisionUsage | null }

export interface ActionPlan extends ModelMetadata {
  status: "plan" | "unsupported" | "needs_precondition";
  /** Runtime validators enforce 1–4 steps for plan, zero otherwise. */
  steps: PlanStep[];
  summary: string;
  reason: string;
  source: "llm" | "keywords";
}

export interface StepOutcome { ok: boolean; text: string; eventIds: string[] }

export interface NpcDialogueRequest {
  npc: {
    id: string;
    look: Persona["look"];
    traits: Persona["traits"];
    situation: Persona["situation"];
    alert: { level: AlertLevel; cause: string | null };
    memory: string[];
    holdings: ItemKind[];
    queue: { facility: string; position: number; length: number } | null;
  };
  speaker: { look: string; holding: ItemKind[] };
  goal: TalkGoal;
  message: string;
  offer: ItemKind | null;
  history: { message: string; reply: string; decision: NpcDecision }[];
}

export type NpcDecision = "accept" | "refuse" | "counter" | "comply_under_threat" | "flee" | "call_guard";

export interface NpcResponse extends ModelMetadata {
  reply: string;
  decision: NpcDecision;
  give: ItemKind | null;
  want: ItemKind | null;
  reason: string;
  source: "llm" | "offline" | "error";
}

/** C7 actions consumed by AgentAction and the engine. */
export type InteractionAction = (
  | { type: "traverse"; route: "stairs" | "escalator"; walking?: boolean }
  | { type: "observe"; targetId: string }
  | { type: "take"; itemId: string }
  | { type: "give"; itemId: string; npcId: string }
  | { type: "drop"; itemId: string; mode: "place" | "drop" }
  | { type: "talk"; npcId: string; message: string; goal: TalkGoal; offerItemId?: string }
  | { type: "act"; instruction: string }
) & { reason: string };

// Role-visible observations deliberately exclude hidden traits and alert values.
export interface InventoryEntry { id: string; kind: ItemKind; slot: "pocket" | "hand" | "bag" }
export interface BagObservation { has: boolean; used: number; capacity: number }
export interface ActionObservation { op: string; progress: number }
export interface PersonObservation {
  id: string;
  look: string;
  distance: number;
  doing: string;
  towardYou: string | null;
  holding: string[];
}
export interface ItemObservation { id: string; kind: ItemKind; where: string; distance: number }

export interface AlertChange {
  t: number;
  observerId: string;
  subjectId: string;
  from: AlertLevel;
  to: AlertLevel;
  cause: string;
}
export interface ItemTransfer { t: number; itemId: string; kind: ItemKind; from: string; to: string; how: string }
export interface BossRecord { t: number; instruction: string; plan: ActionPlan; outcomes: StepOutcome[] }

export interface BossContext {
  self: {
    position: Vec;
    inventory: {
      id: string;
      kind: ItemKind;
    }[];
  };
  people: {
    id: string;
    look: string;
    position: Vec;
    queue: string | null;
  }[];
  items: {
    id: string;
    kind: ItemKind;
    position: Vec;
  }[];
  facilities: {
    id: string;
    label: string;
  }[];
}
