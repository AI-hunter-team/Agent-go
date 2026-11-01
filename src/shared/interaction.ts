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

/** newspaper is a saved-world alias; new physical items are normalized to can on spawn. */
export type ItemKind = "ticket" | "coins" | "umbrella" | "water_bottle" | "can" | "newspaper" | "snack" | "backpack";

/** Simulation-owned throw trajectory; rendering may sample it, never choose its landing. */
export interface ItemFlight { from: Vec; to: Vec; startedAt: number; landsAt: number; actorId: string; causeId?: string; targetId?: string }

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
  | { type: "flight"; trajectory: ItemFlight }
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
  trajectory?: ItemFlight;
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

/** Speech describes words; action describes an actual physical attempt. Neither guarantees success. */
export interface PhysicalAction {
  type: "physical_action";
  action: "push" | "snatch" | "strike" | "restrain" | "release";
  npcId: string;
  aim?: "hurt" | "knockout";
  itemId?: string;
  itemKind?: ItemKind;
  speech?: { message: string; goal: TalkGoal; offerItemId?: string };
  speechTiming?: "before" | "after" | "during";
  reason: string;
}

export type StepOperation =
  | { op: "approach"; target: EntityRef }
  | { op: "take"; itemId: string }
  | { op: "give"; itemId: string; toId: string }
  | { op: "drop"; itemId: string; mode: "place" | "drop" | "throw"; at?: EntityRef; atPosition?: Vec }
  | { op: "talk"; npcId: string; message: string; goal: TalkGoal; offerItemId?: string }
  | { op: "snatch"; npcId: string; itemKind: ItemKind }
  | { op: "push"; npcId: string }
  | { op: "restrain"; npcId: string }
  | { op: "release"; npcId: string }
  | { op: "strike"; npcId: string; itemId?: string; aim: "knockout" | "hurt" }
  | { op: "strike"; facilityId: string; itemId?: string; aim: "hurt" }
  | { op: "vault"; obstacle: "gate" | "railing" | "escalator_side" }
  | { op: "slide_handrail" }
  | { op: "force_cut_in"; npcId: string }
  | { op: "make_noise"; level: "low" | "mid" | "high" }
  | { op: "wait"; seconds: number };

export type StepPrecondition =
  | { kind: "guards_not_watching"; text: string }
  | { kind: "holding_item"; text: string; itemKind: ItemKind }
  | { kind: "unverified"; text: string };

export type PlanStep = StepOperation & {
  preconditions?: StepPrecondition[];
  /** Simultaneous speech starts with the preceding physical step. */
  timing?: "after_previous" | "with_previous";
  when?: "always" | "previous_refused" | "previous_succeeded" | "incapacitated_or_refused";
  pursue?: boolean;
};

export interface ModelMetadata { debug?: OperationDebug; model?: string | null; usage?: DecisionUsage | null }

export interface ActionPlan extends ModelMetadata {
  translation?: {
    instruction: string; originalSteps: PlanStep[]; changes: string[];
    originalStatus?: ActionPlan["status"]; originalReason?: string; originalSummary?: string; originalSource?: ActionPlan["source"];
    sourceGuidance?: string;
    sourceClauses?: import("./guidanceSources").GuidanceSource[];
    requirements: { text: string; start: number; kind: string; conditional: boolean; state: "covered" | "missing" | "unverified"; steps: number[]; explanation: string }[];
  };
  status: "plan" | "unsupported" | "needs_precondition";
  /** Runtime validators enforce 1–8 steps for plan, zero otherwise. */
  steps: PlanStep[];
  summary: string;
  reason: string;
  source: "llm" | "keywords";
}

export interface StepOutcome { ok: boolean; text: string; eventIds: string[] }

/** Observational records only: do not drive the simulator or change existing report fields. */
export interface ActionLifecycle {
  planId: number;
  stepIndex: number;
  t: number;
  step: PlanStep;
  phase: "approach" | "perform" | "dialogue" | "completed" | "interrupted" | "rejected" | "skipped";
  atPhase?: "approach" | "perform" | "dialogue";
  actorPosition: Vec;
  targetPosition?: Vec;
  distance?: number;
  reach?: number;
  text: string;
  ok?: boolean;
  evaluation?: { unprepared: boolean; hitProbability: number; knockoutGivenHit: number | null; reason: string };
}

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
export type InteractionAction = PhysicalAction | (
  | { type: "traverse"; connectorId?:string; route: "stairs" | "escalator"; walking?: boolean }
  | { type: "observe"; targetId: string }
  | { type: "take"; itemId: string }
  | { type: "give"; itemId: string; npcId: string }
  | { type: "drop"; itemId: string; mode: "place" | "drop" | "throw"; atPosition?: Vec }
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
  position?: Vec;
  evidence?: ObservedSceneEvent[];
}

/** Only events actually witnessed by the player enter observation memory. */
export interface ObservedSceneEvent {
  id: string; t: number; kind: "purchase_completed" | "queue_exit" | "item_received" | "item_released" | "ticket_used";
  personId: string; position: Vec; facilityId?: string; itemKind?: ItemKind; text: string;
}
export interface PersonQuery {
  criterion: "recent_purchase" | "recent_item_gain" | "recent_queue_exit" | "holding_item";
  description: string; itemKind?: ItemKind; facilityId?: string; personId?: string;
}
export interface PersonSearchState {
  instruction: string; query: PersonQuery; phase: "searching" | "confirmed" | "lost" | "expired" | "acting" | "finished";
  startedAt: number; deadline: number; targetId?: string; evidence: ObservedSceneEvent[];
  lastSeenPosition?: Vec; lastSeenAt?: number; detail: string;
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
  publicMap?: import("./world").PublicStationMap;
  recentEvents?: ObservedSceneEvent[];
  targetSearch?: PersonSearchState;
  /** Current visible guards only; absence is unknown, never proof of no witnesses. */
  guards?: import("./types").GuardObservation[];
  /** Bound by the server to the original session guidance. */
  guidance?: string;
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
    holding?: ItemKind[];
    activity?: string;
    evidence?: ObservedSceneEvent[];
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
