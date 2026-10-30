import type {
  ActionResult,
  AgentAction,
  AgentTurn,
  CreativeClassification,
  DecisionAttempt,
  DecisionRecord,
  DecisionResult,
  GameReport,
  NormalizedGuidance,
  NpcDialogueRecord,
  NpcReply,
} from "../shared/types";
import type { Engine } from "../sim/engine";
import { classifyByKeywords } from "../sim/intent";
import { summarizeObservation } from "../sim/observation";
import { DECISION_LIMITS } from "../sim/scenario";
import { prepareCutIn } from "../sim/negotiation";
import type { Agent, Classifier, NpcNegotiator } from "./agent";

export type RunnerPhase = "ready" | "running" | "thinking" | "ended";

export interface RunnerOptions {
  guidance?: string;
  normalizedGuidance?: NormalizedGuidance | null;
  maxDecisions?: number;
  /** Called whenever phase or records change, so a UI can re-render. */
  onChange?: () => void;
  now?: () => number;
  negotiate?: NpcNegotiator;
}

/**
 * Drives one run. The world only advances in advance(); while a decision is pending
 * the runner stops stepping, which freezes everyone and the clock ("bullet time").
 */
export class GameRunner {
  phase: RunnerPhase = "ready";
  readonly decisions: DecisionRecord[] = [];
  readonly attempts: DecisionAttempt[] = [];
  readonly dialogues: NpcDialogueRecord[] = [];
  private npcRealMs = 0;
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
    const attempts: DecisionAttempt[] = [];

    let result = await this.timed(turn, attempts);
    if (!result.action && engine.status === "running") {
      const retry = await this.timed({ ...turn, retry: true }, attempts);
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
    let dialogue: NpcDialogueRecord | undefined;

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
      } else if (action.type === "request_cut_in") {
        const negotiation = await this.negotiate(action);
        if (engine.status !== "running") return;
        outcome = negotiation.outcome;
        dialogue = negotiation.dialogue;
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
    if (!fallback && attempts.length) attempts[attempts.length - 1].execution = structuredClone(outcome);

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
      attempts,
      dialogue,
    });

    if (this.decisions.length >= this.maxDecisions && !this.budgetExhausted) {
      this.budgetExhausted = true;
      engine.world.log("budget", `已用完本局 ${this.maxDecisions} 次决策，之后不再调用模型`, true);
    }
  }

  private async negotiate(action: Extract<AgentAction, { type: "request_cut_in" }>): Promise<{ outcome: ActionResult; dialogue?: NpcDialogueRecord }> {
    const e = this.engine;
    const history = this.dialogues.filter((d) => d.request.npc.id === action.npcId && d.response)
      .map((d) => ({ message: d.request.message, reply: d.response!.reply, accepted: d.response!.accepted }));
    const prepared = prepareCutIn(e.world, action.npcId, action.message, history);
    if (!prepared.ok) return { outcome: prepared };
    const dialogue: NpcDialogueRecord = {
      t: e.t, decisionIndex: this.decisions.length + 1, request: prepared.request,
      startedAt: new Date().toISOString(), finishedAt: null, status: "pending", response: null, execution: null,
    };
    this.dialogues.push(dialogue);
    this.opts.onChange?.();
    const start = this.now();
    let response: NpcReply;
    try {
      response = this.opts.negotiate ? await this.opts.negotiate(prepared.request) : {
        accepted: false, reply: "NPC 模型未连接，本次无法沟通，请继续排队。", reason: "离线模式不生成模型答复",
        source: "offline", model: null, usage: null,
      };
      // Consent only comes from an explicit model boolean, never a truthy value or an error fallback.
      if (response.source !== "llm" || response.accepted !== true) response = { ...response, accepted: false };
    } catch (err) {
      response = { accepted: false, reply: "沟通失败，请继续排队或稍后重试。", reason: String(err), source: "error", model: null, usage: null };
    } finally {
      this.npcRealMs += this.now() - start;
    }
    dialogue.response = structuredClone(response);
    dialogue.finishedAt = new Date().toISOString();
    dialogue.status = response.source === "llm" ? "completed" : "error";
    this.opts.onChange?.();
    if (e.status !== "running") return { outcome: { ok: false, text: "本局已结束，NPC 答复仅记录，未执行" }, dialogue };
    const outcome = response.accepted ? e.creative.startConsentedCutIn(e.player, action.npcId)
      : { ok: false, text: `${prepared.request.npc.id}：${response.reply}${response.source === "llm" ? "（未同意让位，保留原位次）" : `（${response.reason}）`}` };
    dialogue.execution = structuredClone(outcome);
    e.world.log("npc_dialogue", `你对 ${action.npcId} 说：“${action.message}”；NPC：“${response.reply}”。${outcome.text}`, true);
    return { outcome, dialogue };
  }

  private async timed(turn: AgentTurn, attempts: DecisionAttempt[]): Promise<DecisionResult> {
    const start = this.now();
    const record: DecisionAttempt = {
      decisionIndex: this.decisions.length + 1,
      attempt: attempts.length + 1,
      input: structuredClone(turn),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "pending",
      response: null,
      execution: null,
    };
    attempts.push(record);
    this.attempts.push(record);
    this.opts.onChange?.();
    let result: DecisionResult;
    try {
      result = await this.agent.decide(turn);
    } catch (err) {
      result = { action: null, thinking: null, usage: null, model: null, latencyMs: 0, error: String(err) };
    } finally {
      this.thinkingRealMs += this.now() - start;
    }
    record.response = structuredClone(result);
    record.status = result.error ? "error" : "completed";
    record.finishedAt = new Date().toISOString();
    this.opts.onChange?.();
    return result;
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
    for (const a of this.attempts) {
      totals.inputTokens += a.response?.usage?.inputTokens ?? 0;
      totals.outputTokens += a.response?.usage?.outputTokens ?? 0;
      totals.thinkingTokens += a.response?.usage?.thinkingTokens ?? 0;
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
        stairs: round(tb.stairs ?? 0),
      },
      violations: e.creative.violations.map((v) => ({ ...v })),
      decisions: this.decisions,
      attempts: this.attempts,
      dialogues: this.dialogues,
      npcTotals: {
        calls: this.dialogues.length,
        inputTokens: this.dialogues.reduce((sum, d) => sum + (d.response?.usage?.inputTokens ?? 0), 0),
        outputTokens: this.dialogues.reduce((sum, d) => sum + (d.response?.usage?.outputTokens ?? 0), 0),
        realSeconds: round(this.npcRealMs / 1000),
      },
      events: [...e.world.events],
      trail: e.trail,
      thinkingRealSeconds: round(this.thinkingRealMs / 1000),
      totals,
    };
  }
}
