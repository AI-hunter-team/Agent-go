import type { AgentTurn, CreativeClassification, DecisionResult, Observation, CutInDialogueRequest, NpcReply, GameReport } from "../shared/types";

/** Anything that turns a decision request into an action request. */
export interface Agent {
  readonly kind: "llm" | "offline";
  decide(turn: AgentTurn): Promise<DecisionResult>;
  /** Clear in-run memory at the end of a run. */
  dispose(report?: GameReport): Promise<void>;
}

/** Environment-side mapping of a creative intent onto the closed mechanic list. */
export type Classifier = (intent: string, observation: Observation) => Promise<CreativeClassification>;

export type NpcNegotiator = (request: CutInDialogueRequest) => Promise<NpcReply>;
