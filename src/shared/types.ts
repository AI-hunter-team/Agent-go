// Types shared by the simulation, the agents, the API server and the UI.
import type { OperationDebug, RunDebug } from "./debug";
import type { GameSettings } from "./gameSettings";
import type {
  ActionObservation, AlertChange, BagObservation, BossRecord, InventoryEntry,
  ItemObservation, ItemTransfer, Persona, PersonObservation, WorldEvent,
} from "./interaction";
export type * from "./interaction";

export interface Vec {
  x: number;
  y: number;
}

export type FacilityKind = "tvm" | "security" | "gate";
export type FacilityStatus = "open" | "closed" | "broken";
export type PassengerKind = "normal" | "elderly" | "luggage" | "hurried" | "player";

// ---------------------------------------------------------------------------
// Agent actions (what the agent may request; the engine validates and executes)

export type AgentAction = import("./interaction").InteractionAction
  | { type: "move_to"; target: string; reason: string }
  | { type: "join_queue"; facility: string; reason: string }
  | { type: "leave_queue"; reason: string }
  | { type: "wait"; seconds: number; reason: string }
  | { type: "descend_stairs"; reason: string }
  | { type: "request_cut_in"; npcId: string; message: string; reason: string }
  | { type: "attempt_creative"; intent: string; reason: string };

export type ActionType = AgentAction["type"];

/** Closed list of creative mechanics the environment knows how to settle. */
export type CreativeMechanic = "cut_in_line" | "jump_gate" | "unsupported";

export interface CreativeClassification {
  debug?: OperationDebug;
  mechanic: CreativeMechanic;
  reason: string;
  /** "llm" when classified by the model, "keywords" for the offline fallback. */
  source: "llm" | "keywords";
}

export interface ActionResult {
  ok: boolean;
  text: string;
}

// ---------------------------------------------------------------------------
// Decision triggers and observations

export type TriggerKind =
  | "start"
  | "arrived"
  | "joined_queue"
  | "service_done"
  | "service_rejected"
  | "action_failed"
  | "wait_done"
  | "facility_changed"
  | "broadcast"
  | "complaint"
  | "queue_closed"
  | "creative_done"
  | "periodic"
  | "fallback"
  | "action_interrupted"
  | "noticed"
  | "spoken_to";

export interface Trigger {
  kind: TriggerKind;
  text: string;
}

export interface SelfObservation {
  inventory?: InventoryEntry[];
  bag?: BagObservation;
  action?: ActionObservation | null;
  position: Vec;
  zone: string;
  nearestNode: string;
  activity: string;
  hasTicket: boolean;
  screened: boolean;
  passedGate?: boolean;
  queue: { facility: string; position: number; length: number } | null;
  elapsed: number;
  timeLeft: number;
}

export interface FacilityObservation {
  id: string;
  kind: FacilityKind;
  status: FacilityStatus;
  distance: number;
  efficiency: string;
  /** Service time range for one ordinary passenger, already scaled by the lane multiplier. */
  serviceRange: [number, number];
  queueLength: number;
  /** Visible traits of the people in the queue, front to back. */
  queue: string[];
  serving: string | null;
  note: string | null;
  /** Individually identifiable passengers visible in this queue, in queue order. */
  people?: { id: string; trait: string; distance?: number }[];
}

export interface GuardObservation {
  doing?: string;
  id: string;
  position: Vec;
  facing: string;
  distance: number;
}

export interface Observation {
  people?: PersonObservation[];
  items?: ItemObservation[];
  t: number;
  self: SelfObservation;
  facilities: FacilityObservation[];
  guards: GuardObservation[];
}

/** One decision request: what changed, how the last action went, and what is visible now. */
export interface AgentTurn {
  triggers: Trigger[];
  lastResult: ActionResult | null;
  observation: Observation;
  /** Set on the single retry after a failed decision. */
  retry?: boolean;
}

export interface DecisionUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number | null;
  cacheReadTokens: number;
}

export interface DecisionResult {
  debug?: OperationDebug;
  action: AgentAction | null;
  thinking: string | null;
  usage: DecisionUsage | null;
  model: string | null;
  latencyMs: number;
  error: string | null;
  /** Content exactly as returned by the model API; never reconstructed reasoning. */
  output?: { id: string | null; stopReason: string | null; content: unknown[] };
}

export interface DecisionAttempt {
  decisionIndex: number;
  attempt: number;
  input: AgentTurn;
  startedAt: string;
  finishedAt: string | null;
  status: "pending" | "completed" | "error";
  response: DecisionResult | null;
  /** Null when the proposal was never executed (failure, retry or cancellation). */
  execution: ActionResult | null;
}

export interface CutInDialogueRequest {
  npc: { id: string; trait: string; temperament: string; facility: string; queuePosition: number; queueLength: number };
  message: string;
  history: { message: string; reply: string; accepted: boolean }[];
}

export interface NpcReply {
  debug?: OperationDebug;
  accepted: boolean;
  reply: string;
  reason: string;
  source: "llm" | "offline" | "error";
  model: string | null;
  usage: DecisionUsage | null;
  output?: DecisionResult["output"];
}

export interface NpcDialogueRecord {
  t: number;
  decisionIndex: number;
  request: CutInDialogueRequest;
  startedAt: string;
  finishedAt: string | null;
  status: "pending" | "completed" | "error";
  response: NpcReply | null;
  execution: ActionResult | null;
}

// ---------------------------------------------------------------------------
// Guidance (pre-game)

export const GUIDANCE_MAX_CHARS = 300;

export interface NormalizedGuidance {
  summary: string;
  priorities: string[];
  risk: string;
  rules: string[];
  creativeIdeas: string[];
  notExecutable: string[];
  initialPlan: string[];
}

// ---------------------------------------------------------------------------
// Game records

export type GameStatus = "running" | "success" | "failed";

export interface GameEvent {
  t: number;
  kind: string;
  text: string;
  /** True for events the player-controlled character could perceive. */
  playerVisible: boolean;
}

export interface DecisionRecord {
  index: number;
  t: number;
  triggers: Trigger[];
  observationSummary: string;
  action: AgentAction | null;
  result: ActionResult | null;
  classification: CreativeClassification | null;
  thinking: string | null;
  usage: DecisionUsage | null;
  model: string | null;
  latencyMs: number;
  error: string | null;
  fallback: boolean;
  attempts?: DecisionAttempt[];
  dialogue?: NpcDialogueRecord;
}

export interface TimeBreakdown {
  walking: number;
  queueing: number;
  service: number;
  waiting: number;
  creative: number;
  idle: number;
  stairs?: number;
}

export interface TrailPoint extends Vec {
  /** World time; absent only in recordings made before trajectory replay. */
  t?: number;
}

export interface GameReport {
  alerts?: AlertChange[];
  items?: ItemTransfer[];
  worldEvents?: WorldEvent[];
  personas?: Record<string, Persona>;
  boss?: BossRecord[];
  /** Missing only on recordings made before configurable difficulty. */
  settings?: GameSettings;
  debug?: RunDebug;
  seed: number;
  agentKind: "llm" | "offline";
  guidance: string;
  normalizedGuidance: NormalizedGuidance | null;
  status: GameStatus;
  /** Arrival time at the lower platform in world seconds; null when the run failed. */
  score: number | null;
  failReason: string | null;
  elapsed: number;
  timeBreakdown: TimeBreakdown;
  violations: { t: number; mechanic: CreativeMechanic; detected: boolean }[];
  decisions: DecisionRecord[];
  /** Includes pending calls and responses that arrived after the run ended. */
  attempts?: DecisionAttempt[];
  dialogues?: NpcDialogueRecord[];
  npcTotals?: { calls: number; inputTokens: number; outputTokens: number; realSeconds: number };
  events: GameEvent[];
  trail: TrailPoint[];
  thinkingRealSeconds: number;
  totals: { decisions: number; inputTokens: number; outputTokens: number; thinkingTokens: number | null };
}
