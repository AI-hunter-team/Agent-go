import express, { type NextFunction, type Request, type Response } from "express";
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
import { DebugLogger, traceOperation } from "./debug";

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
  debugLogger?: DebugLogger;
  modelParameters?: Record<string, unknown>;
}

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(h(req, res)).catch(next);

export function createApp({ llm, sessions, debugLogger = new DebugLogger(false), modelParameters = {} }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const runId = (value: unknown) => typeof value === "string" && /^[\w-]{1,80}$/.test(value) ? value : null;

  const requireLlm = (res: Response): boolean => {
    if (llm) return true;
    res.status(503).json({ error: "未配置模型凭据（OPENAI_API_KEY / ANTHROPIC_API_KEY），请使用离线规则 Agent" });
    return false;
  };

  app.get("/api/health", (_req, res) => {
    res.json({ llm: llm !== null, model: llm?.model ?? null });
  });

  app.post(
    "/api/guidance/normalize",
    wrap(async (req, res) => {
      const text = req.body?.text;
      const err = guidanceError(text);
      if (err) return void res.status(400).json({ error: err });
      if (!(text as string).trim()) return void res.json({ guidance: null });
      if (!requireLlm(res)) return;
      const { value, debug } = await traceOperation({ operation: "normalize", runId: runId(req.body?.runId), sessionId: null }, { text, modelParameters }, debugLogger, () => llm!.normalize(text));
      res.json({ guidance: value, debug });
    }),
  );

  app.post("/api/session", (req, res) => {
    const { guidance = "", normalized = null } = req.body ?? {};
    const err = guidanceError(guidance);
    if (err) return void res.status(400).json({ error: err });
    const s = sessions.create(guidance, normalized, runId(req.body?.runId) ?? undefined);
    void debugLogger.write({ event: "session_start", runId: s.runId, sessionId: s.id, model: llm?.model ?? null, modelParameters, guidance, normalized });
    res.json({ sessionId: s.id });
  });

  app.post(
    "/api/agent/decide",
    wrap(async (req, res) => {
      const { sessionId, turn } = req.body ?? {};
      const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
      if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
      if (!turn?.observation) return void res.status(400).json({ error: "缺少 turn.observation" });
      if (!requireLlm(res)) return;
      const { value, debug } = await traceOperation({ operation: "decide", runId: session.runId, sessionId }, { turn, modelParameters }, debugLogger, () => llm!.decide(session, turn as AgentTurn));
      res.json({ ...value, debug });
    }),
  );

  app.post(
    "/api/creative/classify",
    wrap(async (req, res) => {
      const { intent, observation } = req.body ?? {};
      if (typeof intent !== "string" || !intent.trim()) return void res.status(400).json({ error: "缺少 intent" });
      if (!llm) return void res.json(classifyByKeywords(intent));
      try {
        const session = typeof req.body?.sessionId === "string" ? sessions.get(req.body.sessionId) : undefined;
        const { value, debug } = await traceOperation({ operation: "classify", runId: session?.runId ?? runId(req.body?.runId), sessionId: session?.id ?? null }, { intent, observation, modelParameters }, debugLogger, async () => {
          try { return await llm.classify(intent, observation as Observation); }
          catch (error) { return { ...classifyByKeywords(intent), error: error instanceof Error ? error.message : String(error) }; }
        });
        res.json({ mechanic: value.mechanic, reason: value.reason, source: value.source, debug });
      } catch (e) {
        console.warn("classify failed, using keywords:", e);
        res.json(classifyByKeywords(intent));
      }
    }),
  );

  app.post("/api/session/:id/report", wrap(async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return void res.status(404).json({ error: "会话不存在或已结束" });
    const report = req.body?.report;
    if (report?.debug?.runId !== session.runId || !["success", "failed"].includes(report?.status)) {
      return void res.status(400).json({ error: "报告与本局不匹配或尚未结束" });
    }
    await debugLogger.write({ event: "run_report", runId: session.runId, sessionId: session.id, clientReported: true, report });
    res.status(204).end();
  }));

  app.delete("/api/session/:id", (req, res) => {
    const session = sessions.get(req.params.id);
    if (session) void debugLogger.write({ event: "session_end", sessionId: session.id, runId: session.runId });
    sessions.delete(req.params.id);
    res.status(204).end();
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });

  return app;
}
