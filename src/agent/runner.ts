import type { ActionPlan, BossRecord, NpcDialogueRequest, NpcResponse } from "../shared/types";
import { buildIntentContext, parsePlan } from "../sim/intent";
import { offlineNpcResponse } from "../sim/dialogue";
import { HeuristicAgent } from "./heuristicAgent";
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
import { DECISION_LIMITS, RULES, DT } from "../sim/scenario";
import type { Agent, Classifier, NpcNegotiator, Interpreter, NpcResponder } from "./agent";
import { summarizeDebug, type DebugAttempt, type OperationDebug, type RunDebug } from "../shared/debug";
import { prepareCutIn } from "../sim/negotiation";
import { ReviewRecorder } from "./reviewRecorder";
import { DialogueFollowThrough } from "./dialogueFollowThrough";

function combineResults(first: DecisionResult, next: DecisionResult): DecisionResult {
  return {
    ...next, latencyMs: first.latencyMs + next.latencyMs,
    usage: first.usage || next.usage ? {
      inputTokens: (first.usage?.inputTokens ?? 0) + (next.usage?.inputTokens ?? 0),
      outputTokens: (first.usage?.outputTokens ?? 0) + (next.usage?.outputTokens ?? 0),
      cacheReadTokens: (first.usage?.cacheReadTokens ?? 0) + (next.usage?.cacheReadTokens ?? 0),
      thinkingTokens: first.usage?.thinkingTokens == null || next.usage?.thinkingTokens == null ? null
        : first.usage.thinkingTokens + next.usage.thinkingTokens,
    } : null,
  };
}

export const BUDGETS = { decisions: 80, boss: 20, npc: 30 } as const;

export type RunnerPhase = "ready" | "running" | "thinking" | "ended";

export interface RunnerOptions {
  journey?: import("../shared/journey").JourneyMetadata;
  guidance?: string;
  normalizedGuidance?: NormalizedGuidance | null;
  maxDecisions?: number;
  /** Called whenever phase or records change, so a UI can re-render. */
  onChange?: () => void;
  now?: () => number;
  negotiate?: NpcNegotiator;
  interpret?: Interpreter;
  respond?: NpcResponder;
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
  readonly attempts: DecisionAttempt[] = [];
  readonly dialogues: NpcDialogueRecord[] = [];
  readonly bossPlans: BossRecord[] = [];
  readonly interactionDialogues: {t: number; request: NpcDialogueRequest; response: NpcResponse}[] = [];
  readonly calls = { decisions: 0, boss: 0, npc: 0 };
  private readonly offline = new HeuristicAgent();
  private npcRealMs = 0;
  get thinkingRealMs() { return this.snapshotDebug().summary.aiWaitMs; }
  budgetExhausted = false;
  /** Latest decision while it is still being made, for the "thinking" indicator. */
  pending: Promise<void> | null = null;
  get journey() {
    return this.opts.journey ? { ...this.opts.journey, model: this.decisions.find(d => d.model)?.model ?? this.opts.journey.model } : undefined;
  }

  private lastResult: ActionResult | null = null;
  private consecutiveFailures = 0;
  private rejectStreak = 0;
  private readonly maxDecisions: number;
  private readonly now: () => number;
  private readonly debug: RunDebug;
  private active: { record: DebugAttempt; start: number } | null = null;
  private readonly reviewRecorder = new ReviewRecorder();
  private readonly followThrough: DialogueFollowThrough;
  private activeYield: NonNullable<ActionResult["dialogue"]> | null = null;

  constructor(
    readonly engine: Engine,
    readonly agent: Agent,
    private readonly classify: Classifier,
    private readonly opts: RunnerOptions = {},
  ) {
    this.followThrough = new DialogueFollowThrough(opts.guidance ?? "");
    engine.executor.onConsentComplete = (npcId, outcome) => {
      if (engine.status !== "running" || this.activeYield?.npcId !== npcId) return;
      this.lastResult = { ...outcome, dialogue: { ...this.activeYield, effectPending: false, goalAchieved: outcome.ok } };
      this.activeYield = null;
      this.followThrough.record(this.lastResult);
    };
    this.maxDecisions = Math.min(opts.maxDecisions ?? BUDGETS.decisions, BUDGETS.decisions);
    this.now = opts.now ?? (() => performance.now());
    this.debug = {
      version: 1, runId: opts.runId ?? crypto.randomUUID(), startedAt: new Date().toISOString(), endedAt: null,
      parameters: { seed: engine.seed, agentKind: agent.kind, maxDecisions: this.maxDecisions, timeLimitSeconds: engine.settings.timeLimitSeconds, extraQueuePeople: engine.settings.extraQueuePeople, stepSeconds: DT, simulationRules: { ...RULES, timeLimit: engine.settings.timeLimitSeconds }, decisionLimits: { ...DECISION_LIMITS, maxDecisions: this.maxDecisions, boss: BUDGETS.boss, npc: BUDGETS.npc } },
      preparation: opts.preparation ?? { durationMs: 0, server: null }, attempts: [], summary: summarizeDebug([]),
    };
    this.reviewRecorder.capture(engine);
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
      if (this.engine.executor.pendingDialogue) return this.beginDialogue();
      if (this.engine.hasTriggers()) return this.beginDecision();
      if (i >= steps) return;
      this.engine.step();
      this.reviewRecorder.capture(this.engine);
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
    this.reviewRecorder.capture(this.engine, true);
    this.phase = "thinking";
    this.opts.onChange?.();
    this.pending = this.decide().finally(() => {
      this.pending = null;
      if (this.engine.status !== "running") this.finish();
      else if (this.phase === "thinking") this.phase = "running";
      this.opts.onChange?.();
    });
  }

  private beginDialogue() {
    this.phase = "thinking";
    this.opts.onChange?.();
    this.pending = this.answerDialogue().finally(() => {
      this.pending = null;
      if (this.engine.status !== "running") this.finish();
      else if (this.phase === "thinking") this.phase = "running";
      this.opts.onChange?.();
    });
  }
  private async answerDialogue() {
    const pending = this.engine.executor.pendingDialogue;
    if (!pending) return;
    const request = structuredClone(pending.request);
    const record = this.beginAttempt("npc_respond", {triggers:[],lastResult:this.lastResult,observation:this.engine.observe()});
    let response: NpcResponse;
    try {
      if (this.opts.respond && this.calls.npc < BUDGETS.npc) {
        this.calls.npc++;
        response = await this.opts.respond(request);
      } else response = offlineNpcResponse(request);
    } catch { response = {reply:"暂时无法答复。",decision:"refuse",give:null,want:null,reason:"对话请求失败",source:"error"}; }
    record.server = response.debug ?? null;
    record.usage = response.usage ?? null;
    record.error = response.source === "error" ? response.reason : null;
    this.endAttempt(record);
    this.interactionDialogues.push({t:this.engine.t,request,response:structuredClone(response)});
    if (this.engine.status !== "running" || this.engine.executor.pendingDialogue !== pending) return;
    this.lastResult = this.engine.dialogue.apply(response);
    if (this.lastResult.dialogue?.effectPending) this.activeYield = structuredClone(this.lastResult.dialogue);
    if (response.source !== "error") this.followThrough.record(this.lastResult);
    if (this.followThrough.progress(this.engine)?.status === "pending" && this.engine.executor.busy) {
      this.engine.executor.cancel("对话被拒，暂停复合行动的后续步骤，先落实改变话术的要求");
    }
    this.engine.notify("spoken_to", `${request.npc.id}：${response.reply}`);
  }

  private async decide() {
    const engine = this.engine;
    const triggers = engine.takeTriggers();
    const observation = engine.observe();
    const dialogueFollowThrough = this.followThrough.progress(engine, this.budgetExhausted ? "模型决策预算已用完，转为离线行动" : this.calls.npc >= BUDGETS.npc ? "NPC 对话预算已用完" : undefined);
    const turn: AgentTurn = { triggers, lastResult: this.lastResult, observation, ...(dialogueFollowThrough ? { dialogueFollowThrough } : {}) };
    const t = engine.t;
    const attempts: DecisionAttempt[] = [];

    let result = await this.timed(turn, attempts);
    if (!result.action && engine.status === "running") {
      const retry = await this.timed({ ...turn, retry: true }, attempts);
      result = combineResults(result, retry);
    }
    if (engine.status !== "running") return;

    let guidanceFailure: string | null = null;
    if (result.action && dialogueFollowThrough?.status === "pending") {
      let issue = this.followThrough.check(result.action, engine);
      if (issue) {
        attempts[attempts.length - 1].execution = { ok: false, text: issue };
        if (this.calls.decisions < this.maxDecisions) {
          const corrected = await this.timed({ ...turn, correction: issue }, attempts);
          result = combineResults(result, corrected);
          if (engine.status !== "running") return;
          issue = result.action ? this.followThrough.check(result.action, engine) : null;
        }
        if (issue) {
          guidanceFailure = issue;
          attempts[attempts.length - 1].execution = { ok: false, text: issue };
          result = { ...result, action: null, error: issue };
        }
      }
    }

    let action: AgentAction | null = result.action;
    let classification: CreativeClassification | null = null;
    let fallback = false;
    let outcome: ActionResult;
    let dialogue: NpcDialogueRecord | undefined;

    if (action) {
      this.consecutiveFailures = 0;
      if (action.type === "act") {
        const context = buildIntentContext(engine.world, engine.guards);
        const record = this.beginAttempt("interpret",turn);
        let plan: ActionPlan;
        try {
          if (this.opts.interpret && this.calls.boss < BUDGETS.boss) {
            this.calls.boss++;
            plan = await this.opts.interpret(action.instruction, context);
          } else plan = parsePlan(action.instruction, context);
        } catch (error) { record.error = String(error); plan = parsePlan(action.instruction, context); }
        record.server = plan.debug ?? null;
        record.usage = plan.usage ?? null;
        this.endAttempt(record);
        if (engine.status !== "running") return;
        const issue = dialogueFollowThrough?.status === "pending" ? this.followThrough.check(plan, engine) : null;
        outcome = issue ? { ok: false, text: issue } : engine.applyAction(action, undefined, plan);
        this.bossPlans.push({t:engine.t,instruction:action.instruction,plan:structuredClone(plan),outcomes:outcome.ok ? engine.executor.outcomes : [{...outcome,eventIds:[]}]});
      } else if (action.type === "attempt_creative") {
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
      if (!guidanceFailure) this.consecutiveFailures++;
      action = { type: "wait", seconds: DECISION_LIMITS.fallbackWaitSeconds, reason: guidanceFailure ? "指导要求尚未落实，保底推进后重新评估" : "决策失败，系统保底等待" };
      outcome = engine.applyAction(action);
      outcome = { ok: outcome.ok, text: `${guidanceFailure ?? "（决策失败，系统保底）"}${outcome.text}` };
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

    if (this.calls.decisions >= this.maxDecisions && !this.budgetExhausted) {
      this.budgetExhausted = true;
      engine.world.log("budget", `已用完本局 ${this.maxDecisions} 次决策，之后由离线策略继续`, true);
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
    const debugRecord = this.beginAttempt("negotiation", { triggers: [], lastResult: this.lastResult, observation: e.observe() });
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
      this.endAttempt(debugRecord);
    }
    if (debugRecord.status !== "cancelled") { debugRecord.usage = response.usage; debugRecord.error = response.source === "error" ? response.reason : null; debugRecord.server = response.debug ?? null; }
    dialogue.response = structuredClone(response);
    dialogue.finishedAt = new Date().toISOString();
    dialogue.status = response.source === "llm" ? "completed" : "error";
    this.opts.onChange?.();
    if (e.status !== "running") return { outcome: { ok: false, text: "本局已结束，NPC 答复仅记录，未执行" }, dialogue };
    const outcome = response.accepted ? e.creative.startConsentedCutIn(e.player, action.npcId)
      : { ok: false, text: `${prepared.request.npc.id}：${response.reply}${response.source === "llm" ? "（未同意让位，保留原位次）" : `（${response.reason}）`}` };
    if (response.source === "llm") {
      const publicResult: ActionResult = { ok: response.accepted ? outcome.ok : true, text: outcome.text, dialogue: {
        npcId: action.npcId, goal: "yield", message: action.message, reply: response.reply,
        decision: response.accepted ? "accept" : "refuse", goalAchieved: false,
        ...(response.accepted && outcome.ok ? { effectPending: true } : {}),
      } };
      if (publicResult.dialogue?.effectPending) this.activeYield = structuredClone(publicResult.dialogue);
      this.followThrough.record(publicResult);
      (outcome as ActionResult).dialogue = publicResult.dialogue;
    }
    dialogue.execution = structuredClone(outcome);
    e.world.log("npc_dialogue", `你对 ${action.npcId} 说：“${action.message}”；NPC：“${response.reply}”。${outcome.text}`, true);
    return { outcome, dialogue };
  }

  private async timed(turn: AgentTurn, attempts: DecisionAttempt[]): Promise<DecisionResult> {
    const debugRecord = this.beginAttempt(turn.retry || turn.correction ? "retry" : "decision", turn);
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
      if (this.budgetExhausted || this.calls.decisions >= this.maxDecisions) result = await this.offline.decide(turn);
      else { this.calls.decisions++; result = await this.agent.decide(turn); }

    } catch (err) {
      result = { action: null, thinking: null, usage: null, model: null, latencyMs: 0, error: String(err) };
    } finally {
      this.endAttempt(debugRecord);
    }
    if (debugRecord.status !== "cancelled") {
      debugRecord.action = result.action; debugRecord.error = result.error;
      debugRecord.usage = result.usage; debugRecord.server = result.debug ?? null;
    }
    record.response = structuredClone(result);
    record.status = result.error ? "error" : "completed";
    record.finishedAt = new Date().toISOString();
    this.opts.onChange?.();
    return result;
  }

  private beginAttempt(operation: DebugAttempt["operation"], turn: AgentTurn): DebugAttempt {
    const self = turn.observation.self;
    const record: DebugAttempt = {
      index: this.debug.attempts.length + 1, decisionIndex: this.decisions.length + 1,
      operation, stage: self.onPlatform ? "boarding" : self.passedGate ? "stairs" : !self.hasTicket ? "ticket" : !self.screened ? "security" : "gate",
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
    this.reviewRecorder.capture(this.engine, true);
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
    for (const a of this.attempts) {
      totals.inputTokens += a.response?.usage?.inputTokens ?? 0;
      totals.outputTokens += a.response?.usage?.outputTokens ?? 0;
      totals.thinkingTokens = totals.thinkingTokens === null || a.response?.usage?.thinkingTokens == null
        ? null : totals.thinkingTokens + a.response.usage.thinkingTokens;
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    const tb = e.timeBreakdown;
    return {
      goal: "board_train",
      alerts: structuredClone(e.alerts.history),
      items: structuredClone(e.world.items.transfers),
      worldEvents: structuredClone(e.events.events),
      personas: structuredClone(e.world.personas),
      boss: structuredClone(this.bossPlans),
      interactionDialogues: structuredClone(this.interactionDialogues),
      calls: { ...this.calls },
      operationUsage: this.debug.attempts.reduce<NonNullable<GameReport["operationUsage"]>>((summary, a) => {
        const row = summary[a.operation] ??= { calls: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0, realSeconds: 0 };
        row.calls++; row.inputTokens += a.usage?.inputTokens ?? 0; row.outputTokens += a.usage?.outputTokens ?? 0;
        row.unknownUsage += Number(!a.usage); row.realSeconds += (a.durationMs ?? 0) / 1000;
        return summary;
      }, {}),
      ...(this.journey ? { journey: structuredClone(this.journey) } : {}),
      ...(this.phase === "ended" ? { worldSnapshots: this.reviewRecorder.snapshot() } : {}),
      debug: this.snapshotDebug(),
      seed: e.seed,
      settings: { ...e.settings },
      loadout: { ...e.loadout },
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
        escalator: round(tb.escalator ?? 0),
        distraction: round(tb.distraction ?? 0),
      },
      violations: e.creative.violations.map((v) => ({ ...v })),
      decisions: this.decisions,
      attempts: this.attempts,
      dialogues: this.dialogues,
      npcTotals: {
        calls: this.dialogues.length + this.interactionDialogues.length,
        inputTokens: [...this.dialogues,...this.interactionDialogues].reduce((sum, d) => sum + (d.response?.usage?.inputTokens ?? 0), 0),
        outputTokens: [...this.dialogues,...this.interactionDialogues].reduce((sum, d) => sum + (d.response?.usage?.outputTokens ?? 0), 0),
        realSeconds: round((this.npcRealMs + this.debug.attempts.filter(a=>a.operation==="npc_respond").reduce((sum,a)=>sum+a.durationMs,0)) / 1000),
      },
      events: [...e.world.events],
      trail: e.trail,
      thinkingRealSeconds: round(this.thinkingRealMs / 1000),
      totals,
    };
  }
}
