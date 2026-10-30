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
}

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(h(req, res)).catch(next);

export function createApp({ llm, sessions }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const requireLlm = (res: Response): boolean => {
    if (llm) return true;
    res.status(503).json({ error: "未配置模型（ANTHROPIC_API_KEY），请使用离线规则 Agent" });
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
      res.json({ guidance: await llm!.normalize(text) });
    }),
  );

  app.post("/api/session", (req, res) => {
    const { guidance = "", normalized = null } = req.body ?? {};
    const err = guidanceError(guidance);
    if (err) return void res.status(400).json({ error: err });
    const s = sessions.create(guidance, normalized);
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
      res.json(await llm!.decide(session, turn as AgentTurn));
    }),
  );

  app.post(
    "/api/creative/classify",
    wrap(async (req, res) => {
      const { intent, observation } = req.body ?? {};
      if (typeof intent !== "string" || !intent.trim()) return void res.status(400).json({ error: "缺少 intent" });
      if (!llm) return void res.json(classifyByKeywords(intent));
      try {
        res.json(await llm.classify(intent, observation as Observation));
      } catch (e) {
        console.warn("classify failed, using keywords:", e);
        res.json(classifyByKeywords(intent));
      }
    }),
  );

  app.delete("/api/session/:id", (req, res) => {
    sessions.delete(req.params.id);
    res.status(204).end();
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });

  return app;
}
