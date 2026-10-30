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
import { DECISION_LIMITS, RULES, DT } from "../sim/scenario";
import type { Agent, Classifier } from "./agent";
import { summarizeDebug, type DebugAttempt, type OperationDebug, type RunDebug } from "../shared/debug";

export type RunnerPhase = "ready" | "running" | "thinking" | "ended";

export interface RunnerOptions {
  guidance?: string;
  normalizedGuidance?: NormalizedGuidance | null;
  maxDecisions?: number;
  /** Called whenever phase or records change, so a UI can re-render. */
  onChange?: () => void;
  now?: () => number;
  runId?: string;
  preparation?: { durationMs: number; server: OperationDebug | null };
}

/**
 * Drives one run. The world only advances in advance(); while a decision is pending
 * the runner stops stepping, which freezes everyone and the clock ("bullet time").
 */
export class GameRunner {
  phase: RunnerPhase = "ready";
  readonly decisions: DecisionRecord[] = [];
  get thinkingRealMs() { return this.snapshotDebug().summary.aiWaitMs; }
  budgetExhausted = false;
  /** Latest decision while it is still being made, for the "thinking" indicator. */
  pending: Promise<void> | null = null;

  private lastResult: ActionResult | null = null;
  private consecutiveFailures = 0;
  private rejectStreak = 0;
  private readonly maxDecisions: number;
  private readonly now: () => number;
  private readonly debug: RunDebug;
  private active: { record: DebugAttempt; start: number } | null = null;

  constructor(
    readonly engine: Engine,
    readonly agent: Agent,
    private readonly classify: Classifier,
    private readonly opts: RunnerOptions = {},
  ) {
    this.maxDecisions = opts.maxDecisions ?? DECISION_LIMITS.maxDecisions;
    this.now = opts.now ?? (() => performance.now());
    this.debug = {
      version: 1, runId: opts.runId ?? crypto.randomUUID(), startedAt: new Date().toISOString(), endedAt: null,
      parameters: { seed: engine.seed, agentKind: agent.kind, maxDecisions: this.maxDecisions, timeLimitSeconds: RULES.timeLimit, stepSeconds: DT, simulationRules: { ...RULES }, decisionLimits: { ...DECISION_LIMITS } },
      preparation: opts.preparation ?? { durationMs: 0, server: null }, attempts: [], summary: summarizeDebug([]),
    };
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
        const record = this.beginAttempt("classification", turn);
        try {
          classification = await this.classify(action.intent, observation);
          if (record.status !== "cancelled") {
            record.server = classification.debug ?? null;
            record.error = classification.debug?.error ?? null;
            record.classification = { mechanic: classification.mechanic, reason: classification.reason, source: classification.source };
          }
        } catch (error) {
          if (record.status !== "cancelled") record.error = String(error);
          classification = classifyByKeywords(action.intent);
          if (record.status !== "cancelled") record.classification = classification;
        } finally { this.endAttempt(record); }
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
    const record = this.beginAttempt(turn.retry ? "retry" : "decision", turn);
    try {
      const result = await this.agent.decide(turn);
      if (record.status !== "cancelled") {
        record.action = result.action; record.error = result.error;
        record.usage = result.usage; record.server = result.debug ?? null;
      }
      return result;
    } catch (err) {
      if (record.status !== "cancelled") record.error = String(err);
      return { action: null, thinking: null, usage: null, model: null, latencyMs: 0, error: String(err) };
    } finally {
      this.endAttempt(record);
    }
  }

  private beginAttempt(operation: DebugAttempt["operation"], turn: AgentTurn): DebugAttempt {
    const self = turn.observation.self;
    const record: DebugAttempt = {
      index: this.debug.attempts.length + 1, decisionIndex: this.decisions.length + 1,
      operation, stage: !self.hasTicket ? "ticket" : !self.screened ? "security" : "gate",
      startedAt: new Date().toISOString(), durationMs: 0, status: "pending", turn: structuredClone(turn),
      action: null, classification: null, error: null, usage: null, server: null,
    };
    this.debug.attempts.push(record);
    this.active = { record, start: this.now() };
    return record;
  }

  private endAttempt(record: DebugAttempt) {
    if (record.status === "cancelled") return;
    if (this.active?.record === record) {
      record.durationMs = Math.max(0, this.now() - this.active.start);
      record.status = "completed";
      this.active = null;
    }
  }

  private snapshotDebug(): RunDebug {
    const debug = structuredClone(this.debug);
    if (this.active) debug.attempts[this.active.record.index - 1].durationMs = Math.max(0, this.now() - this.active.start);
    debug.summary = summarizeDebug(debug.attempts, debug.preparation.durationMs);
    return debug;
  }

  private finish() {
    if (this.phase === "ended") return;
    this.phase = "ended";
    if (this.active) {
      this.active.record.durationMs = Math.max(0, this.now() - this.active.start);
      this.active.record.status = "cancelled";
      this.active.record.error = "对局结束时请求仍未返回；计时截至结束时刻";
      this.active = null;
    }
    this.debug.endedAt = new Date().toISOString();
    void this.agent.dispose(this.report()).catch(() => undefined);
    this.opts.onChange?.();
  }

  report(): GameReport {
    const e = this.engine;
    const totals: GameReport["totals"] = { decisions: this.decisions.length, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
    for (const d of this.decisions) {
      totals.inputTokens += d.usage?.inputTokens ?? 0;
      totals.outputTokens += d.usage?.outputTokens ?? 0;
      totals.thinkingTokens = totals.thinkingTokens === null || d.usage?.thinkingTokens == null
        ? null : totals.thinkingTokens + d.usage.thinkingTokens;
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    const tb = e.timeBreakdown;
    return {
      debug: this.snapshotDebug(),
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
