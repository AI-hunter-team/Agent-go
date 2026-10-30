import express, { type NextFunction, type Request, type Response } from "express";
import { extname, resolve } from "node:path";
import { configFromEnv } from "./claude";
import { countChars, guidanceError } from "../src/shared/guidance";
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

/** Model-backed operations. Absent when no credentials are configured. */
export interface LlmService {
  readonly model: string;
  decide(session: Session, turn: AgentTurn): Promise<DecisionResult>;
  normalize(text: string): Promise<NormalizedGuidance>;
  classify(intent: string, observation: Observation): Promise<CreativeClassification>;
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

export function createApp({ llm, sessions, debugLogger = new DebugLogger(false), modelParameters = {}, modelConfigs = new ModelConfigStore(), frontendDir }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const runId = (value: unknown) => typeof value === "string" && /^[\w-]{1,80}$/.test(value) ? value : null;
  type Runtime = { llm: LlmService | null; parameters: Record<string, unknown>; token: string };
  const bindings = new WeakMap<Session, Runtime>();
  const runtime = (req: Request): Runtime => {
    const token = req.get("x-model-config") || "";
    if (!token) return { llm, parameters: modelParameters, token };
    const config = modelConfigs.get(token);
    if (!config.llm) throw new ModelConfigError("请先选择模型并验证启用", 409);
    const cfg = configFromEnv({ ...process.env, AGENT_MODEL: config.llm.model, AGENT_FALLBACK: "off" });
    return { llm: config.llm, parameters: { ...cfg, provider: "openai", model: config.llm.model, effort: cfg.reasoningEffort, timeoutMs: 20_000, transportRetries: 0 }, token };
  };
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
    res.json(await modelConfigs.enable(token, req.body?.model));
  }));
  app.delete("/api/model/config", (req, res) => {
    modelConfigs.delete(req.get("x-model-config") || "");
    res.status(204).end();
  });
  app.get("/api/health", wrap((req, res) => {
    const { llm } = runtime(req);
    res.json({ llm: llm !== null, model: llm?.model ?? null });
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

  app.post("/api/session", wrap((req, res) => {
    const { guidance = "", normalized = null } = req.body ?? {};
    const err = guidanceError(guidance);
    if (err) return void res.status(400).json({ error: err });
    assertSafeText(guidance);
    validateNormalized(normalized);
    const binding = runtime(req);
    const s = sessions.create(guidance, normalized, runId(req.body?.runId) ?? undefined);
    bindings.set(s, binding);
    const { llm, parameters: modelParameters } = binding;
    void debugLogger.write({ event: "session_start", runId: s.runId, sessionId: s.id, model: llm?.model ?? null, modelParameters, guidance, normalized });
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
      const { llm, parameters } = session ? forSession(req, session) : runtime(req);
      if (!llm?.negotiate) return void res.status(503).json(npcFailure("未配置模型，NPC 未答复，未获得插队许可。", null));
      try {
        const request: CutInDialogueRequest = { npc: req.body.npc, message: req.body.message, history: req.body.history };
        const { value: reply, debug } = await traceOperation({ operation: "negotiate", runId: session?.runId ?? null, sessionId: session?.id ?? null }, { request, modelParameters: parameters }, debugLogger, () => llm.negotiate!(request));
        res.status(reply.source === "error" ? 502 : 200).json({ ...reply, debug });
      } catch (error) {
        res.status(502).json(npcFailure(`NPC 对话失败，未获得插队许可：${error instanceof Error ? error.message : String(error)}`, llm.model));
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
