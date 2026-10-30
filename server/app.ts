import express, { type NextFunction, type Request, type Response } from "express";
import { extname, resolve } from "node:path";
import { guidanceError } from "../src/shared/guidance";
import type {
  AgentTurn,
  CreativeClassification,
  DecisionResult,
  NormalizedGuidance,
  Observation,
} from "../src/shared/types";
import { classifyByKeywords } from "../src/sim/intent";
import type { Session, SessionStore } from "./sessions";
import { ModelConfigError, ModelConfigStore } from "./modelConfig";

/** Model-backed operations. Absent when no credentials are configured. */
export interface LlmService {
  readonly model: string;
  decide(session: Session, turn: AgentTurn): Promise<DecisionResult>;
  normalize(text: string): Promise<NormalizedGuidance>;
  classify(intent: string, observation: Observation): Promise<CreativeClassification>;
}

export interface AppDeps {
  llm: LlmService | null;
  sessions: SessionStore;
  modelConfigs?: ModelConfigStore;
  frontendDir?: string;
}

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(h(req, res)).catch(next);

export function createApp({ llm, sessions, modelConfigs = new ModelConfigStore(), frontendDir }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  type Runtime = { llm: LlmService | null; token: string };
  const bindings = new WeakMap<Session, Runtime>();
  const runtime = (req: Request): Runtime => {
    const token = req.get("x-model-config") || "";
    if (!token) return { llm, token };
    const config = modelConfigs.get(token);
    if (!config.llm) throw new ModelConfigError("请先选择模型并验证启用", 409);
    return { llm: config.llm, token };
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
      if (!(text as string).trim()) return void res.json({ guidance: null });
      const { llm } = runtime(req);
      if (!requireLlm(llm, res)) return;
      res.json({ guidance: await llm!.normalize(text) });
    }),
  );

  app.post("/api/session", wrap((req, res) => {
    const { guidance = "", normalized = null } = req.body ?? {};
    const err = guidanceError(guidance);
    if (err) return void res.status(400).json({ error: err });
    const binding = runtime(req);
    const s = sessions.create(guidance, normalized);
    bindings.set(s, binding);
    res.json({ sessionId: s.id });
  }));

  app.post(
    "/api/agent/decide",
    wrap(async (req, res) => {
      const { sessionId, turn } = req.body ?? {};
      const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
      if (!turn?.observation) return void res.status(400).json({ error: "缺少 turn.observation" });
      const { llm } = forSession(req, session);
      if (!requireLlm(llm, res)) return;
      res.json(await llm!.decide(session, turn as AgentTurn));
    }),
  );

  app.post(
    "/api/creative/classify",
    wrap(async (req, res) => {
      const { intent, observation } = req.body ?? {};
      if (typeof intent !== "string" || !intent.trim()) return void res.status(400).json({ error: "缺少 intent" });
      const sessionId = req.body?.sessionId;
      const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (sessionId && !session) return void res.status(404).json({ error: "会话不存在或已结束" });
      const { llm } = session ? forSession(req, session) : runtime(req);
      if (!llm) return void res.json(classifyByKeywords(intent));
      try {
        res.json(await llm.classify(intent, observation as Observation));
      } catch (e) {
        console.warn("classify failed, using keywords:", e);
        res.json(classifyByKeywords(intent));
      }
    }),
  );

  app.delete("/api/session/:id", wrap((req, res) => {
    const session = sessions.get(req.params.id);
    if (session) forSession(req, session);
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
    if (err instanceof ModelConfigError) return void res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });

  return app;
}
