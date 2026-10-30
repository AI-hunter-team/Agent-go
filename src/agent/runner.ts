import type {
  ActionResult,
  AgentAction,
  AgentTurn,
  CreativeClassification,
  DecisionRecord,
  DecisionResult,
  GameReport,
  NormalizedGuidance,
} from "../shared/types";
import type { Engine } from "../sim/engine";
import { classifyByKeywords } from "../sim/intent";
import { summarizeObservation } from "../sim/observation";
import { DECISION_LIMITS } from "../sim/scenario";
import type { Agent, Classifier } from "./agent";

export type RunnerPhase = "ready" | "running" | "thinking" | "ended";

export interface RunnerOptions {
  guidance?: string;
  normalizedGuidance?: NormalizedGuidance | null;
  maxDecisions?: number;
  /** Called whenever phase or records change, so a UI can re-render. */
  onChange?: () => void;
  now?: () => number;
}

/**
 * Drives one run. The world only advances in advance(); while a decision is pending
 * the runner stops stepping, which freezes everyone and the clock ("bullet time").
 */
export class GameRunner {
  phase: RunnerPhase = "ready";
  readonly decisions: DecisionRecord[] = [];
  thinkingRealMs = 0;
  budgetExhausted = false;
  /** Latest decision while it is still being made, for the "thinking" indicator. */
  pending: Promise<void> | null = null;

  private lastResult: ActionResult | null = null;
  private consecutiveFailures = 0;
  private rejectStreak = 0;
  private readonly maxDecisions: number;
  private readonly now: () => number;

  constructor(
    readonly engine: Engine,
    readonly agent: Agent,
    private readonly classify: Classifier,
    private readonly opts: RunnerOptions = {},
  ) {
    this.maxDecisions = opts.maxDecisions ?? DECISION_LIMITS.maxDecisions;
    this.now = opts.now ?? (() => performance.now());
  }

  start() {
    if (this.phase !== "ready") return;
    this.phase = "running";
    this.advance(0);
  }

  /** End immediately, even when paused or waiting for an in-flight model request. */
  stop(reason = "玩家结束了本局") {
    this.engine.abort(reason);
    this.finish();
  }

  /** Step the world up to `steps` times, stopping early when a decision is needed. */
  advance(steps: number) {
    if (this.phase !== "running") return;
    for (let i = 0; ; i++) {
      if (this.engine.status !== "running") return this.finish();
      if (this.engine.hasTriggers()) {
        if (this.budgetExhausted) this.engine.takeTriggers();
        else return this.beginDecision();
      }
      if (i >= steps) return;
      this.engine.step();
    }
  }

  /** Run to the end without rendering (tests, fast-forward). */
  async runToEnd(stepsPerSlice = 50) {
    if (this.phase === "ready") this.start();
    while (this.phase !== "ended") {
      if (this.pending) await this.pending;
      else this.advance(stepsPerSlice);
    }
  }

  private beginDecision() {
    this.phase = "thinking";
    this.opts.onChange?.();
    this.pending = this.decide().finally(() => {
      this.pending = null;
      if (this.engine.status !== "running") this.finish();
      else if (this.phase === "thinking") this.phase = "running";
      this.opts.onChange?.();
    });
  }

  private async decide() {
    const engine = this.engine;
    const triggers = engine.takeTriggers();
    const observation = engine.observe();
    const turn: AgentTurn = { triggers, lastResult: this.lastResult, observation };
    const t = engine.t;

    let result = await this.timed(turn);
    if (!result.action && engine.status === "running") {
      const retry = await this.timed({ ...turn, retry: true });
      const firstUsage = result.usage;
      const nextUsage = retry.usage;
      result = {
        ...retry,
        latencyMs: result.latencyMs + retry.latencyMs,
        usage: firstUsage || nextUsage ? {
          inputTokens: (firstUsage?.inputTokens ?? 0) + (nextUsage?.inputTokens ?? 0),
          outputTokens: (firstUsage?.outputTokens ?? 0) + (nextUsage?.outputTokens ?? 0),
          cacheReadTokens: (firstUsage?.cacheReadTokens ?? 0) + (nextUsage?.cacheReadTokens ?? 0),
          thinkingTokens: firstUsage?.thinkingTokens == null || nextUsage?.thinkingTokens == null
            ? null : firstUsage.thinkingTokens + nextUsage.thinkingTokens,
        } : null,
      };
    }
    if (engine.status !== "running") return;

    let action: AgentAction | null = result.action;
    let classification: CreativeClassification | null = null;
    let fallback = false;
    let outcome: ActionResult;

    if (action) {
      this.consecutiveFailures = 0;
      if (action.type === "attempt_creative") {
        try {
          classification = await this.classify(action.intent, observation);
        } catch {
          classification = classifyByKeywords(action.intent);
        }
        if (engine.status !== "running") return;
        outcome = engine.applyAction(action, classification.mechanic);
      } else {
        outcome = engine.applyAction(action);
      }
    } else {
      fallback = true;
      this.consecutiveFailures++;
      action = { type: "wait", seconds: DECISION_LIMITS.fallbackWaitSeconds, reason: "决策失败，系统保底等待" };
      outcome = engine.applyAction(action);
      outcome = { ok: outcome.ok, text: `（决策失败，系统保底）${outcome.text}` };
      if (this.consecutiveFailures >= DECISION_LIMITS.maxConsecutiveFailures) {
        engine.abort(`连续 ${this.consecutiveFailures} 次决策失败，模型不可用`);
      }
    }
    // A rejected request changes nothing in the world, so ask again right away — but
    // after two rejections in a row let time move on instead of re-asking in place.
    if (!fallback && !outcome.ok && engine.status === "running") {
      this.rejectStreak++;
      if (this.rejectStreak >= 2) {
        this.rejectStreak = 0;
        const waited = engine.applyAction({ type: "wait", seconds: DECISION_LIMITS.fallbackWaitSeconds, reason: "" });
        outcome = { ok: false, text: `${outcome.text}（连续被拒，系统让角色${waited.text}）` };
      } else {
        engine.notify("action_failed", outcome.text);
      }
    } else {
      this.rejectStreak = 0;
    }
    this.lastResult = outcome;

    this.decisions.push({
      index: this.decisions.length + 1,
      t,
      triggers,
      observationSummary: summarizeObservation(observation),
      action,
      result: outcome,
      classification,
      thinking: result.thinking,
      usage: result.usage,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error,
      fallback,
    });

    if (this.decisions.length >= this.maxDecisions && !this.budgetExhausted) {
      this.budgetExhausted = true;
      engine.world.log("budget", `已用完本局 ${this.maxDecisions} 次决策，之后不再调用模型`, true);
    }
  }

  private async timed(turn: AgentTurn): Promise<DecisionResult> {
    const start = this.now();
    try {
      return await this.agent.decide(turn);
    } catch (err) {
      return { action: null, thinking: null, usage: null, model: null, latencyMs: 0, error: String(err) };
    } finally {
      this.thinkingRealMs += this.now() - start;
    }
  }

  private finish() {
    if (this.phase === "ended") return;
    this.phase = "ended";
    void this.agent.dispose().catch(() => undefined);
    this.opts.onChange?.();
  }

  report(): GameReport {
    const e = this.engine;
    const totals = { decisions: this.decisions.length, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
    for (const d of this.decisions) {
      totals.inputTokens += d.usage?.inputTokens ?? 0;
      totals.outputTokens += d.usage?.outputTokens ?? 0;
      totals.thinkingTokens += d.usage?.thinkingTokens ?? 0;
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    const tb = e.timeBreakdown;
    return {
      seed: e.seed,
      agentKind: this.agent.kind,
      guidance: this.opts.guidance ?? "",
      normalizedGuidance: this.opts.normalizedGuidance ?? null,
      status: e.status,
      score: e.score,
      failReason: e.failReason,
      elapsed: e.t,
      timeBreakdown: {
        walking: round(tb.walking),
        queueing: round(tb.queueing),
        service: round(tb.service),
        waiting: round(tb.waiting),
        creative: round(tb.creative),
        idle: round(tb.idle),
      },
      violations: e.creative.violations.map((v) => ({ ...v })),
      decisions: this.decisions,
      events: [...e.world.events],
      trail: e.trail,
      thinkingRealSeconds: round(this.thinkingRealMs / 1000),
      totals,
    };
  }
}
