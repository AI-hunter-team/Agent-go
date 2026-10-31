import { resolveLoadout } from "../src/shared/interaction";
import type { ActionPlan, BossContext, NpcDialogueRequest, NpcResponse } from "../src/shared/types";
import { bossContextValid, validatePlan } from "./boss";
import { dialogueRequestValid, responseFailure, validateResponse } from "./npcDialogue";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { validPlan, type JourneyInput, type JourneyPreparation, type JourneyPlan } from "../src/shared/journey";
import { extname, resolve } from "node:path";
import { countChars, guidanceError } from "../src/shared/guidance";
import { DEFAULT_GAME_SETTINGS, gameSettingsError } from "../src/shared/gameSettings";
import type {
  AgentTurn,
  CreativeClassification,
  CutInDialogueRequest,
  DecisionResult,
  NpcReply,
  NormalizedGuidance,
  Observation,
} from "../src/shared/types";
import { parsePlan } from "../src/sim/intent";
import type { Session, SessionStore } from "./sessions";
import { DebugLogger, traceOperation } from "./debug";
import { ModelConfigError, ModelConfigStore } from "./modelConfig";
import { assertSafeText, SafetyError, validateNormalized } from "./security";
import { ReviewFailure, validateDraft, validateReview, validateReviewInput, validateStrategies, type DraftResult, type ReviewInput, type ReviewResult, type ReviewStrategy } from "../src/shared/review";

/** Model-backed operations. Absent when no credentials are configured. */
export interface LlmService {
  review?(input: ReviewInput): Promise<ReviewResult>;
  draftGuidance?(guidance: string, strategies: ReviewStrategy[]): Promise<DraftResult>;
  readonly model: string;
  prepareJourney?(input: JourneyInput): Promise<JourneyPlan>;
  decide(session: Session, turn: AgentTurn): Promise<DecisionResult>;
  normalize(text: string): Promise<NormalizedGuidance>;
  classify(intent: string, observation: Observation): Promise<CreativeClassification>;
  interpret?(instruction: string, context: BossContext): Promise<ActionPlan>;
  respond?(request: NpcDialogueRequest): Promise<NpcResponse>;
  negotiate?(request: CutInDialogueRequest): Promise<NpcReply>;
}

export interface AppDeps {
  llm: LlmService | null;
  sessions: SessionStore;
  debugLogger?: DebugLogger;
  modelParameters?: Record<string, unknown>;
  modelConfigs?: ModelConfigStore;
  frontendDir?: string;
}

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(h(req, res)).catch(next);

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const boundedText = (value: unknown, max: number): value is string => typeof value === "string" && !!value.trim() && countChars(value) <= max;

export function createApp({ llm, sessions, debugLogger = new DebugLogger(false), modelParameters = {}, modelConfigs = new ModelConfigStore(), frontendDir }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const runId = (value: unknown) => typeof value === "string" && /^[\w-]{1,80}$/.test(value) ? value : null;
  type Runtime = { llm: LlmService | null; parameters: Record<string, unknown>; token: string };
  const bindings = new WeakMap<Session, Runtime>();
  const preparations = new Map<string, { result: JourneyPreparation; input: JourneyInput; runtime: Runtime; created: number }>();
  /** 新请求使用当前页面配置；诊断与实例使用相同的设置。 */
  const runtime = (req: Request): Runtime => {
    const token = req.get("x-model-config") || "";
    if (!token) return { llm, parameters: modelParameters, token };
    const config = modelConfigs.get(token);
    if (!config.llm) throw new ModelConfigError("请先选择模型并验证启用", 409);
    const cfg = config.settings!;
    return { llm: config.llm, parameters: { ...cfg, provider: "responses", model: config.llm.model, effort: cfg.reasoningEffort, timeoutMs: 20_000, transportRetries: 0 }, token };
  };
  /** 已开始的对局使用原实例，且校验其所属配置 token。 */
  const forSession = (req: Request, session: Session): Runtime => {
    const bound = bindings.get(session);
    if (!bound) return runtime(req);
    if (bound.token !== (req.get("x-model-config") || "")) throw new ModelConfigError("该对局不属于当前模型配置", 403);
    if (bound.token) modelConfigs.get(bound.token);
    return bound;
  };

  const requireLlm = (llm: LlmService | null, res: Response): boolean => {
    if (llm) return true;
    res.status(503).json({ error: "请先在模型 API 配置中验证并启用模型，或使用离线规则 Agent" });
    return false;
  };

  app.post("/api/model/verify", wrap(async (req, res) => {
    res.json(await modelConfigs.verify(req.body?.baseUrl, req.body?.apiKey));
  }));
  app.post("/api/model/enable", wrap(async (req, res) => {
    const token = req.get("x-model-config");
    if (!token) throw new ModelConfigError("请先验证 API 配置");
    const { value } = await traceOperation({ operation: "decide", runId: null, sessionId: null },
      { purpose: "model_verification", model: req.body?.model, reasoningEffort: req.body?.reasoningEffort ?? "none" }, debugLogger,
      () => modelConfigs.enable(token, req.body?.model, req.body?.reasoningEffort));
    res.json(value);
  }));
  app.delete("/api/model/config", (req, res) => {
    modelConfigs.delete(req.get("x-model-config") || "");
    res.status(204).end();
  });
  app.get("/api/health", wrap((req, res) => {
    const { llm } = runtime(req);
    res.json({ llm: llm !== null, model: llm?.model ?? null });
  }));

  // Independent analysis calls: the run's session has already been disposed.
  app.post("/api/review", wrap(async (req, res) => {
    const input: unknown = req.body?.input;
    try { validateReviewInput(input); } catch { return void res.status(400).json({ error: "复盘资料格式无效或超出限制" }); }
    assertSafeText(JSON.stringify(input));
    const current = runtime(req);
    if (!current.llm?.review) return void res.status(503).json({ error: "请先连接模型，再生成失败复盘" });
    let returned: ReviewResult | null = null;
    try {
      const { value } = await traceOperation({ operation: "review", runId: null, sessionId: null }, { input, modelParameters: current.parameters }, debugLogger, () => current.llm!.review!(input));
      returned = value;
      validateReview(value.analysis, input);
      assertSafeText(JSON.stringify(value.analysis));
      res.json(value);
    } catch (error) { res.status(502).json({ error: "复盘生成失败，模型可能不可用或返回格式异常，请重试", attempt: error instanceof ReviewFailure ? error.attempt : returned ? { model: returned.model, usage: returned.usage, latencyMs: returned.latencyMs, operation: "review", status: "error" } : null }); }
  }));

  app.post("/api/review/guidance", wrap(async (req, res) => {
    const { guidance, strategies } = req.body ?? {};
    try { if (guidanceError(guidance)) throw new Error(); validateStrategies(strategies); }
    catch { return void res.status(400).json({ error: "请提供原指导并选择 1–3 条有效建议" }); }
    assertSafeText(JSON.stringify({ guidance, strategies }));
    const current = runtime(req);
    if (!current.llm?.draftGuidance) return void res.status(503).json({ error: "请先连接模型，再合并指导草稿" });
    let returned: DraftResult | null = null;
    try {
      const { value } = await traceOperation({ operation: "review_draft", runId: null, sessionId: null }, { guidance, strategies, modelParameters: current.parameters }, debugLogger, () => current.llm!.draftGuidance!(guidance, strategies));
      returned = value;
      validateDraft(value); assertSafeText(value.guidance);
      res.json(value);
    } catch (error) { res.status(502).json({ error: "指导草稿生成失败或超过 300 字，请重试", attempt: error instanceof ReviewFailure ? error.attempt : returned ? { model: returned.model, usage: returned.usage, latencyMs: returned.latencyMs, operation: "draft", status: "error" } : null }); }
  }));

  app.post("/api/journey/prepare", wrap(async (req, res) => {
    const input = req.body as JourneyInput;
    if (!input || input.sceneId !== "metro" || !Number.isInteger(input.seed) || input.seed < 1 || input.seed > 4294967295
      || typeof input.autonomous !== "boolean" || !runId(input.runId) || guidanceError(input.guidance)
      || !input.settings || gameSettingsError(input.settings) || input.settings.extraQueuePeople !== DEFAULT_GAME_SETTINGS.extraQueuePeople) {
      return void res.status(400).json({ error: "准备条件无效，请检查指导、种子与时限" });
    }
    if (Object.keys(input).some(key => !["sceneId", "seed", "settings", "loadout", "guidance", "autonomous", "runId"].includes(key))) {
      return void res.status(400).json({ error: "准备请求包含未知字段" });
    }
    try { resolveLoadout(input.loadout); } catch (error) { return void res.status(400).json({ error: (error as Error).message }); }
    assertSafeText(input.guidance);
    const current = runtime(req);
    if (!requireLlm(current.llm, res)) return;
    if (!current.llm!.prepareJourney) return void res.status(503).json({ error: "当前服务不支持初始规划" });
    const { value: plan, debug } = await traceOperation({ operation: "normalize", runId: input.runId, sessionId: null },
      { input, modelParameters: current.parameters }, debugLogger, () => current.llm!.prepareJourney!(input));
    if (!validPlan(plan)) return void res.status(502).json({ error: "初始方案格式无效，请重试" });
    assertSafeText(JSON.stringify(plan));
    const normalized: NormalizedGuidance = { summary: plan.understanding, priorities: [], risk: "", rules: [], creativeIdeas: [], notExecutable: [], initialPlan: [...plan.actions, plan.adjustment] };
    const result: JourneyPreparation = { id: randomUUID(), model: current.llm!.model, normalized, plan, debug };
    for (const [id, item] of preparations) if (Date.now() - item.created > 600_000) preparations.delete(id);
    if (preparations.size >= 100) preparations.delete(preparations.keys().next().value!);
    preparations.set(result.id, { result, input: structuredClone(input), runtime: current, created: Date.now() });
    res.json(result);
  }));

  app.post(
    "/api/guidance/normalize",
    wrap(async (req, res) => {
      const text = req.body?.text;
      const err = guidanceError(text);
      if (err) return void res.status(400).json({ error: err });
      assertSafeText(text);
      if (!(text as string).trim()) return void res.json({ guidance: null });
      const { llm, parameters: modelParameters } = runtime(req);
      if (!requireLlm(llm, res)) return;
      const { value, debug } = await traceOperation({ operation: "normalize", runId: runId(req.body?.runId), sessionId: null }, { text, modelParameters }, debugLogger, () => llm!.normalize(text));
      res.json({ guidance: value, debug });
    }),
  );

  // 校验可选时限与固定客流，并将本局设置冻结到模型会话。
  app.post("/api/session", wrap((req, res) => {
    let { guidance = "", normalized = null } = req.body ?? {};
    const { settings } = req.body ?? {};
    const binding = runtime(req);
    let loadout;
    try { loadout = resolveLoadout(req.body?.loadout); } catch (error) { return void res.status(400).json({ error: (error as Error).message }); }
    if (req.body?.preparationId !== undefined) {
      const prepared = preparations.get(req.body.preparationId);
      if (!prepared || Date.now() - prepared.created > 600_000 || prepared.runtime.llm !== binding.llm || prepared.runtime.token !== binding.token
        || JSON.stringify(prepared.runtime.parameters) !== JSON.stringify(binding.parameters)
        || prepared.input.seed !== req.body.seed || prepared.input.sceneId !== req.body.sceneId
        || prepared.input.runId !== req.body.runId || prepared.input.settings.timeLimitSeconds !== settings?.timeLimitSeconds
        || prepared.input.settings.extraQueuePeople !== settings?.extraQueuePeople
        || resolveLoadout(prepared.input.loadout).backpack !== loadout.backpack
        || (prepared.input.autonomous ? "" : prepared.input.guidance) !== guidance) {
        return void res.status(409).json({ error: "方案已过期或条件改变，请重新生成初始方案" });
      }
      normalized = prepared.result.normalized;
      preparations.delete(req.body.preparationId);
    }
    const err = guidanceError(guidance);
    if (err) return void res.status(400).json({ error: err });
    assertSafeText(guidance);
    validateNormalized(normalized);
    const settingsError = gameSettingsError(settings);
    if (settingsError) return void res.status(400).json({ error: settingsError });
    if (settings && settings.extraQueuePeople !== DEFAULT_GAME_SETTINGS.extraQueuePeople) {
      return void res.status(400).json({ error: `每条初始开放队列固定额外 ${DEFAULT_GAME_SETTINGS.extraQueuePeople} 人，请刷新页面后重新开局` });
    }
    const s = sessions.create(guidance, normalized, runId(req.body?.runId) ?? undefined, settings, loadout);
    bindings.set(s, binding);
    const { llm, parameters: modelParameters } = binding;
    void debugLogger.write({ event: "session_start", runId: s.runId, sessionId: s.id, settings: s.settings, model: llm?.model ?? null, modelParameters, guidance, normalized });
    res.json({ sessionId: s.id });
  }));

  app.post(
    "/api/agent/decide",
    wrap(async (req, res) => {
      const { sessionId, turn } = req.body ?? {};
      const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
      if (!turn?.observation) return void res.status(400).json({ error: "缺少 turn.observation" });
      assertSafeText(JSON.stringify(turn));
      const { llm, parameters: modelParameters } = forSession(req, session);
      if (!requireLlm(llm, res)) return;
      const { value, debug } = await traceOperation({ operation: "decide", runId: session.runId, sessionId }, { turn, modelParameters }, debugLogger, () => llm!.decide(session, turn as AgentTurn));
      res.json({ ...value, debug });
    }),
  );

  app.post("/api/boss/interpret", wrap(async (req, res) => {
    const session = sessions.get(req.body?.sessionId);
    if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
    const binding = forSession(req, session);
    const { instruction, context } = req.body;
    if (!boundedText(instruction, 200) || !bossContextValid(context)) return void res.status(400).json({ error: "行动或可见上下文无效" });
    assertSafeText(JSON.stringify({ instruction, context }));
    const { value, debug } = await traceOperation({ operation: "interpret", runId: session.runId, sessionId: session.id }, { instruction, context, modelParameters: binding.parameters }, debugLogger, async () => {
      try {
        const plan = await binding.llm?.interpret?.(instruction, context);
        if (plan) {
          const valid = validatePlan(plan, context);
          if (valid) return { ...valid, source: plan.source, usage: plan.usage, model: plan.model };
        }
      } catch (error) { if (error instanceof SafetyError) throw error; }
      return parsePlan(instruction, context);
    });
    res.json({ ...value, debug });
  }));
  app.post("/api/npc/respond", wrap(async (req, res) => {
    const session = sessions.get(req.body?.sessionId);
    if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
    const binding=forSession(req, session);
    const request = req.body?.request;
    if (!dialogueRequestValid(request)) return void res.status(400).json({ error: "NPC 对话资料无效" });
    assertSafeText(JSON.stringify(request));
    if (!binding.llm?.respond) return void res.status(503).json({...responseFailure(),model:null,usage:null});
    const { value, debug } = await traceOperation({ operation: "npc_respond", runId: session.runId, sessionId: session.id }, { request, modelParameters: binding.parameters }, debugLogger, async () => {
      try {
        const response = await binding.llm!.respond!(request);
        return { ...(validateResponse(response, request) ?? responseFailure()), source: response.source, usage: response.usage, model: response.model };
      } catch { return responseFailure(); }
    });
    res.status(value.source === "error" ? 502 : 200).json(debugLogger.clean({ ...value, debug }));
  }));

  app.post("/api/session/:id/report", wrap(async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
    forSession(req, session);
    const report = req.body?.report;
    if (report?.debug?.runId !== session.runId || !["success", "failed"].includes(report?.status)) {
      return void res.status(400).json({ error: "报告与本局不匹配或尚未结束" });
    }
    await debugLogger.write({ event: "run_report", runId: session.runId, sessionId: session.id, clientReported: true, report });
    res.status(204).end();
  }));

  app.delete("/api/session/:id", wrap((req, res) => {
    const session = sessions.get(req.params.id);
    if (session) forSession(req, session);
    if (session) void debugLogger.write({ event: "session_end", sessionId: session.id, runId: session.runId });
    sessions.delete(req.params.id);
    res.status(204).end();
  }));

  if (frontendDir) {
    // Keep API errors and missing assets out of the SPA fallback.
    app.use("/api", (_req, res) => { res.status(404).json({ error: "API 不存在" }); });
    app.use(express.static(frontendDir));
    app.get("*", (req, res, next) => {
      if (extname(req.path) || req.path.startsWith("/assets/") || !req.accepts("html")) return next();
      res.sendFile(resolve(frontendDir, "index.html"));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isObject(err) && err.type === "entity.parse.failed") {
      return void res.status(400).json({ error: "请求正文必须是有效的 JSON 对象" });
    }
    if (err instanceof SafetyError) return void res.status(err.status).json({ error: err.message });
    if (err instanceof ModelConfigError) return void res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "服务暂时不可用，请稍后重试" });
  });

  return app;
}
