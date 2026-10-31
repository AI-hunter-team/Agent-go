import type { Agent } from "../../src/agent/agent";
import type { AgentAction, AgentTurn, DecisionResult, TriggerKind } from "../../src/shared/types";

/** Conditions are evaluated only when the runner requests a decision. */
export interface ScriptedStep {
  at: number | TriggerKind;
  action: AgentAction;
}

/** Ordered, single-use steps; no direct access to simulation state. */
export class ScriptedAgent implements Agent {
  readonly kind = "offline" as const;
  readonly turns: AgentTurn[] = [];
  private cursor = 0;
  private readonly script: readonly ScriptedStep[];

  constructor(script: readonly ScriptedStep[]) {
    for (const step of script) {
      if (typeof step.at === "number" && (!Number.isFinite(step.at) || step.at < 0)) {
        throw new Error("Script times must be finite and non-negative");
      }
    }
    this.script = structuredClone(script);
  }

  get consumed(): number { return this.cursor; }

  async decide(turn: AgentTurn): Promise<DecisionResult> {
    this.turns.push(structuredClone(turn));
    const next = this.script[this.cursor];
    const due = next && (typeof next.at === "number"
      ? turn.observation.t >= next.at - 1e-9
      : turn.triggers.some((trigger) => trigger.kind === next.at));
    let action: AgentAction;
    if (due) {
      action = structuredClone(next.action);
      this.cursor++;
    } else {
      // A long wait is preempted by engine triggers (arrival, service completion,
      // etc.). Polling at 0.1 s would exhaust the runner's decision budget.
      const seconds = next && typeof next.at === "number" ? Math.max(0.1, Math.min(20, next.at - turn.observation.t)) : 20;
      action = { type: "wait", seconds, reason: next ? "等待剧本条件" : "剧本已结束" };
    }
    return { action, thinking: null, usage: null, model: null, latencyMs: 0, error: null };
  }

  async dispose() {
    this.cursor = 0;
    this.turns.length = 0;
  }
}
