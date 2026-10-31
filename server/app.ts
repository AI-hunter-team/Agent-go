import express, { type NextFunction, type Request, type Response } from "express";
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
import { classifyByKeywords } from "../src/sim/intent";
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
  decide(session: Session, turn: AgentTurn): Promise<DecisionResult>;
  normalize(text: string): Promise<NormalizedGuidance>;
  classify(intent: string, observation: Observation): Promise<CreativeClassification>;
  negotiate?(request: CutInDialogueRequest): Promise<NpcReply>;
}

/** Developer-owned NPC model; never resolved from a browser's Agent config. */
export interface NpcService {
  readonly model: string;
  negotiate(request: CutInDialogueRequest): Promise<NpcReply>;
}

export interface AppDeps {
  llm: LlmService | null;
  npcLlm?: NpcService | null;
  sessions: SessionStore;
  debugLogger?: DebugLogger;
  modelParameters?: Record<string, unknown>;
  npcModelParameters?: Record<string, unknown>;
  modelConfigs?: ModelConfigStore;
  frontendDir?: string;
}

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(h(req, res)).catch(next);

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const boundedText = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && countChars(value) <= max;

function npcRequestError(value: unknown): string | null {
  if (!isObject(value)) return "缺少 NPC 对话请求";
  if (!boundedText(value.message, 200)) return "对话 message 必须是 1–200 字的非空字符串";
  const npc = value.npc;
  if (!isObject(npc)) return "缺少 npc 信息";
  if (!boundedText(npc.id, 80) || !boundedText(npc.facility, 80)) return "npc.id 和 npc.facility 必须是 1–80 字的非空字符串";
  if (!boundedText(npc.trait, 200) || !boundedText(npc.temperament, 500)) return "npc.trait 或 npc.temperament 缺失或超长";
  if (!Number.isSafeInteger(npc.queuePosition) || !Number.isSafeInteger(npc.queueLength)
    || (npc.queuePosition as number) < 1 || (npc.queueLength as number) < 1
    || (npc.queuePosition as number) > (npc.queueLength as number)) return "排队位置和队长必须为正整数，且位置不能超过队长";
  if (!Array.isArray(value.history) || value.history.length > 3) return "history 必须是至多 3 条的数组";
  if (!value.history.every((item) => isObject(item) && boundedText(item.message, 200) && boundedText(item.reply, 500) && typeof item.accepted === "boolean")) {
    return "history 中每条记录须包含有效的 message、reply 和布尔值 accepted";
  }
  return null;
}

function npcFailure(reason: string, model: string | null): NpcReply {
  return { accepted: false, reply: "暂时无法答复，请保持原来的排队位置。", reason, source: "error", model, usage: null };
}

/** 装配独立 Agent/NPC 路由，并把 Agent 配置固定到每局会话。 */
export function createApp({ llm, npcLlm = null, sessions, debugLogger = new DebugLogger(false), modelParameters = {}, npcModelParameters = {}, modelConfigs = new ModelConfigStore(), frontendDir }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const runId = (value: unknown) => typeof value === "string" && /^[\w-]{1,80}$/.test(value) ? value : null;
  type Runtime = { llm: LlmService | null; parameters: Record<string, unknown>; token: string };
  const bindings = new WeakMap<Session, Runtime>();
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
    const { guidance = "", normalized = null, settings } = req.body ?? {};
    const err = guidanceError(guidance);
    if (err) return void res.status(400).json({ error: err });
    assertSafeText(guidance);
    validateNormalized(normalized);
    const settingsError = gameSettingsError(settings);
    if (settingsError) return void res.status(400).json({ error: settingsError });
    if (settings && settings.extraQueuePeople !== DEFAULT_GAME_SETTINGS.extraQueuePeople) {
      return void res.status(400).json({ error: `每条初始开放队列固定额外 ${DEFAULT_GAME_SETTINGS.extraQueuePeople} 人，请刷新页面后重新开局` });
    }
    const binding = runtime(req);
    const s = sessions.create(guidance, normalized, runId(req.body?.runId) ?? undefined, settings);
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

  app.post(
    "/api/npc/negotiate",
    wrap(async (req, res) => {
      const error = npcRequestError(req.body);
      if (error) return void res.status(400).json({ error });
      const sessionId = req.body?.sessionId;
      const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (sessionId && !session) return void res.status(404).json({ error: "会话不存在或已结束" });
      if (!session) return void res.status(403).json(npcFailure("NPC 对话需要有效的对局会话。", null));
      forSession(req, session);
      if (!npcLlm) return void res.status(503).json(npcFailure("开发者未配置模型，NPC 未答复，未获得插队许可。", null));
      try {
        const request: CutInDialogueRequest = { npc: req.body.npc, message: req.body.message, history: req.body.history };
        const { value: reply, debug } = await traceOperation({ operation: "negotiate", runId: session.runId, sessionId: session.id }, { request, modelParameters: npcModelParameters }, debugLogger, () => npcLlm.negotiate(request));
        res.status(reply.source === "error" ? 502 : 200).json(debugLogger.clean({ ...reply, debug }));
      } catch (error) {
        res.status(502).json(debugLogger.clean(npcFailure(`NPC 对话失败，未获得插队许可：${error instanceof Error ? error.message : String(error)}`, npcLlm.model)));
      }
    }),
  );

  app.post(
    "/api/creative/classify",
    wrap(async (req, res) => {
      const { intent, observation } = req.body ?? {};
      if (typeof intent !== "string" || !intent.trim()) return void res.status(400).json({ error: "缺少 intent" });
      if (intent.length > 1000) return void res.status(400).json({ error: "intent 不能超过 1000 字符" });
      assertSafeText(intent);
      if (observation) assertSafeText(JSON.stringify(observation));
      const sessionId = req.body?.sessionId;
      const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (sessionId && !session) return void res.status(404).json({ error: "会话不存在或已结束" });
      const { llm, parameters: modelParameters } = session ? forSession(req, session) : runtime(req);
      if (!llm) return void res.json(classifyByKeywords(intent));
      try {
        const { value, debug } = await traceOperation({ operation: "classify", runId: session?.runId ?? runId(req.body?.runId), sessionId: session?.id ?? null }, { intent, observation, modelParameters }, debugLogger, async () => {
          try { return await llm.classify(intent, observation as Observation); }
          catch (error) {
            if (error instanceof SafetyError) throw error;
            return { ...classifyByKeywords(intent), error: error instanceof Error ? error.message : String(error) };
          }
        });
        res.json({ mechanic: value.mechanic, reason: value.reason, source: value.source, debug });
      } catch (e) {
        if (e instanceof SafetyError) throw e;
        console.warn("classify failed, using keywords:", e);
        res.json(classifyByKeywords(intent));
      }
    }),
  );

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
