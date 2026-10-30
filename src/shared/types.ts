// Types shared by the simulation, the agents, the API server and the UI.

export interface Vec {
  x: number;
  y: number;
}

export type FacilityKind = "tvm" | "security" | "gate";
export type FacilityStatus = "open" | "closed" | "broken";
export type PassengerKind = "normal" | "elderly" | "luggage" | "hurried" | "player";

// ---------------------------------------------------------------------------
// Agent actions (what the agent may request; the engine validates and executes)

export type AgentAction =
  | { type: "move_to"; target: string; reason: string }
  | { type: "join_queue"; facility: string; reason: string }
  | { type: "leave_queue"; reason: string }
  | { type: "wait"; seconds: number; reason: string }
  | { type: "attempt_creative"; intent: string; reason: string };

export type ActionType = AgentAction["type"];

/** Closed list of creative mechanics the environment knows how to settle. */
export type CreativeMechanic = "cut_in_line" | "jump_gate" | "unsupported";

export interface CreativeClassification {
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
  | "fallback";

export interface Trigger {
  kind: TriggerKind;
  text: string;
}

export interface SelfObservation {
  position: Vec;
  zone: string;
  nearestNode: string;
  activity: string;
  hasTicket: boolean;
  screened: boolean;
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
}

export interface GuardObservation {
  id: string;
  position: Vec;
  facing: string;
  distance: number;
}

export interface Observation {
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
  action: AgentAction | null;
  thinking: string | null;
  usage: DecisionUsage | null;
  model: string | null;
  latencyMs: number;
  error: string | null;
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
}

export interface TimeBreakdown {
  walking: number;
  queueing: number;
  service: number;
  waiting: number;
  creative: number;
  idle: number;
}

export interface GameReport {
  seed: number;
  agentKind: "llm" | "offline";
  guidance: string;
  normalizedGuidance: NormalizedGuidance | null;
  status: GameStatus;
  /** Gate-crossing time in world seconds; null when the run failed. */
  score: number | null;
  failReason: string | null;
  elapsed: number;
  timeBreakdown: TimeBreakdown;
  violations: { t: number; mechanic: CreativeMechanic; detected: boolean }[];
  decisions: DecisionRecord[];
  events: GameEvent[];
  trail: Vec[];
  thinkingRealSeconds: number;
  totals: { decisions: number; inputTokens: number; outputTokens: number; thinkingTokens: number | null };
}
