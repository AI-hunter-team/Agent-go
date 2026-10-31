import { publicMap, restoreWorld } from "../src/sim/worldDefinition";
import type { WorldDescriptor } from "../src/shared/world";
import { resolveLoadout } from "../src/shared/interaction";
import type { ActionPlan, BossContext, NpcDialogueRequest, NpcResponse } from "../src/shared/types";
import { bossContextValid, validatePlan } from "./boss";
import { dialogueRequestValid, responseFailure, validateResponse } from "./npcDialogue";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { planToNormalized, validPlan, type JourneyInput, type JourneyPreparation, type JourneyPlan } from "../src/shared/journey";
import { basename, extname, resolve } from "node:path";
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
  reviewLlm?: Pick<LlmService, "model" | "review" | "draftGuidance"> | null;
  reviewModelParameters?: Record<string, unknown>;
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

const YEAR_SECONDS = 31536000;
const DAY_SECONDS = 86400;
const WEEK_SECONDS = DAY_SECONDS * 7;

/** Vite emits content hashes in production asset names, making these safe to cache for a year. */
const isFingerprintedAsset = (filePath: string): boolean =>
  /[/\\]assets[/\\][^/\\]+[.-][a-z0-9_-]{8,}\.[a-z0-9]+$/i.test(filePath);

const setStaticCacheHeaders = (res: Response, filePath: string) => {
  res.setHeader("Vary", "Accept-Encoding");
  if (isFingerprintedAsset(filePath)) {
    res.setHeader("Cache-Control", `public, max-age=${YEAR_SECONDS}, immutable`);
    return;
  }
  if (basename(filePath).toLowerCase() === "index.html" || extname(filePath).toLowerCase() === ".html") {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    return;
  }
  res.setHeader("Cache-Control", `public, max-age=${DAY_SECONDS}, s-maxage=${WEEK_SECONDS}, stale-while-revalidate=${DAY_SECONDS}`);
};

export function createApp({ llm, reviewLlm = llm, sessions, debugLogger = new DebugLogger(false), modelParameters = {}, reviewModelParameters = modelParameters, modelConfigs = new ModelConfigStore(), frontendDir }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // Sessions, model discovery, health and model responses must never be cached.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "X-Model-Config");
    next();
  });
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
  type Reviewer = { llm: AppDeps["reviewLlm"]; parameters: Record<string, unknown> };
  const reviewBindings = new Map<string, { runtime: Reviewer; lastUsed: number }>();
  const sweepReviews = () => {
    for (const [token, binding] of reviewBindings) {
      if (Date.now() - binding.lastUsed >= 30 * 60_000) reviewBindings.delete(token);
    }
  };
  /** 复盘引用开局模型的独立短期句柄，局后清理/更换页面模型不改变这份绑定。 */
  const bindReview = (binding: Runtime): string | undefined => {
    if (!binding.token) return undefined;
    sweepReviews();
    if (reviewBindings.size >= 256) reviewBindings.delete(reviewBindings.keys().next().value!);
    const token = randomUUID();
    reviewBindings.set(token, { runtime: { llm: binding.llm, parameters: binding.parameters }, lastUsed: Date.now() });
    return token;
  };
  const reviewer = (req: Request): Reviewer => {
    sweepReviews();
    const token = req.get("x-review-config");
    if (token) {
      const binding = reviewBindings.get(token);
      if (!binding) throw new ModelConfigError("本局复盘已过期，请重新开始一局", 410);
      binding.lastUsed = Date.now();
      return binding.runtime;
    }
    // 兼容直接通过业务 API 提供用户配置的调用方；无用户配置才用服务端默认。
    if (req.get("x-model-config")) return runtime(req);
    return { llm: reviewLlm, parameters: reviewModelParameters };
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

  app.get("/api/review/status", wrap((req, res) => {
    const { llm } = reviewer(req);
    res.json({ available: Boolean(llm?.review && llm?.draftGuidance) });
  }));
  // 离线对局也可以保留已填写的用户配置供局后分析，不调用供应商模型。
  app.post("/api/review/binding", wrap((req, res) => {
    res.json({ reviewToken: bindReview(runtime(req)) ?? null });
  }));

  app.post("/api/review", wrap(async (req, res) => {
    const input: unknown = req.body?.input;
    try { validateReviewInput(input); } catch { return void res.status(400).json({ error: "复盘资料格式无效或超出限制" }); }
    assertSafeText(JSON.stringify(input));
    const { llm: reviewLlm, parameters: reviewModelParameters } = reviewer(req);
    if (!reviewLlm?.review) return void res.status(503).json({ error: "复盘服务暂不可用，请稍后重试" });
    let returned: ReviewResult | null = null;
    try {
      const { value } = await traceOperation({ operation: "review", runId: null, sessionId: null }, { input, modelParameters: reviewModelParameters }, debugLogger, () => reviewLlm.review!(input));
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
    const { llm: reviewLlm, parameters: reviewModelParameters } = reviewer(req);
    if (!reviewLlm?.draftGuidance) return void res.status(503).json({ error: "复盘服务暂不可用，请稍后重试" });
    let returned: DraftResult | null = null;
    try {
      const { value } = await traceOperation({ operation: "review_draft", runId: null, sessionId: null }, { guidance, strategies, modelParameters: reviewModelParameters }, debugLogger, () => reviewLlm.draftGuidance!(guidance, strategies));
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
    if (Object.keys(input).some(key => !["sceneId", "seed", "settings", "loadout", "guidance", "autonomous", "runId", "world"].includes(key))) {
      return void res.status(400).json({ error: "准备请求包含未知字段" });
    }
    try { resolveLoadout(input.loadout); } catch (error) { return void res.status(400).json({ error: (error as Error).message }); }
    try { requestedMap(input.seed,input.world); } catch { return void res.status(409).json({error:"车站版本或布局已变化，请刷新后重新准备"}); }
    assertSafeText(input.guidance);
    const current = runtime(req);
    if (!requireLlm(current.llm, res)) return;
    if (!current.llm!.prepareJourney) return void res.status(503).json({ error: "当前服务不支持初始规划" });
    const { value: plan, debug } = await traceOperation({ operation: "normalize", runId: input.runId, sessionId: null },
      { input, modelParameters: current.parameters }, debugLogger, () => current.llm!.prepareJourney!(input));
    if (!validPlan(plan, input.autonomous ? "" : input.guidance)) return void res.status(502).json({ error: "初始方案格式无效，请重试" });
    assertSafeText(JSON.stringify(plan));
    const normalized = planToNormalized(plan, input.autonomous ? "" : input.guidance);
    validateNormalized(normalized);
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
    let preparationId: string | undefined;
    if (req.body?.preparationId !== undefined) {
      const prepared = preparations.get(req.body.preparationId);
      if (!prepared || Date.now() - prepared.created > 600_000 || prepared.runtime.llm !== binding.llm || prepared.runtime.token !== binding.token
        || JSON.stringify(prepared.runtime.parameters) !== JSON.stringify(binding.parameters)
        || JSON.stringify(prepared.input.world)!==JSON.stringify(req.body.world)
        || prepared.input.seed !== req.body.seed || prepared.input.sceneId !== req.body.sceneId
        || prepared.input.runId !== req.body.runId || prepared.input.settings.timeLimitSeconds !== settings?.timeLimitSeconds
        || prepared.input.settings.extraQueuePeople !== settings?.extraQueuePeople
        || resolveLoadout(prepared.input.loadout).backpack !== loadout.backpack
        || (prepared.input.autonomous ? "" : prepared.input.guidance) !== guidance) {
        return void res.status(409).json({ error: "方案已过期或条件改变，请重新生成初始方案" });
      }
      normalized = prepared.result.normalized;
      preparationId = req.body.preparationId;
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
    let stationMap;
    try { stationMap=requestedMap(req.body.seed,req.body.world); } catch {return void res.status(409).json({error:"车站版本或布局不匹配，请重新准备"});}
    const s = sessions.create(guidance, normalized, runId(req.body?.runId) ?? undefined, settings, loadout);
    s.publicMap=stationMap;
    if (preparationId !== undefined) preparations.delete(preparationId);
    bindings.set(s, binding);
    const { llm, parameters: modelParameters } = binding;
    void debugLogger.write({ event: "session_start", runId: s.runId, sessionId: s.id, settings: s.settings, model: llm?.model ?? null, modelParameters, guidance, normalized });
    res.json({ sessionId: s.id, reviewToken: bindReview(binding) });
  }));

  app.post(
    "/api/agent/decide",
    wrap(async (req, res) => {
      const { sessionId, turn } = req.body ?? {};
      const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
      if (!turn?.observation) return void res.status(400).json({ error: "缺少 turn.observation" });
      if(session.publicMap && (turn.observation.publicMap?.layoutHash!==session.publicMap.layoutHash || turn.observation.publicMap?.generatorVersion!==session.publicMap.generatorVersion))return void res.status(409).json({error:"观察与当前车站不匹配"});
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
    const { instruction } = req.body;
    const context={...req.body.context,publicMap:session.publicMap};
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
    app.use(express.static(frontendDir, { setHeaders: setStaticCacheHeaders }));
    app.get("*", (req, res, next) => {
      if (extname(req.path) || req.path.startsWith("/assets/") || !req.accepts("html")) return next();
      setStaticCacheHeaders(res, resolve(frontendDir, "index.html"));
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

function requestedMap(seed:number, world?:WorldDescriptor) {
  if(world===undefined)return undefined;
  if(!world||Object.keys(world).some(k=>!["generatorVersion","layoutHash"].includes(k))||!["metro-v1","metro-v2"].includes(world.generatorVersion))throw new Error("未知世界版本");
  const d=restoreWorld(seed,world);if(!d)throw new Error("地图摘要不一致");return publicMap(d);
}
