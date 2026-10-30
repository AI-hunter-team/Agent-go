import express, { type NextFunction, type Request, type Response } from "express";
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

/** Model-backed operations. Absent when no credentials are configured. */
export interface LlmService {
  readonly model: string;
  decide(session: Session, turn: AgentTurn): Promise<DecisionResult>;
  normalize(text: string): Promise<NormalizedGuidance>;
  classify(intent: string, observation: Observation): Promise<CreativeClassification>;
  negotiate(request: CutInDialogueRequest): Promise<NpcReply>;
}

export interface AppDeps {
  llm: LlmService | null;
  sessions: SessionStore;
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
    "/api/npc/negotiate",
    wrap(async (req, res) => {
      const error = npcRequestError(req.body);
      if (error) return void res.status(400).json({ error });
      if (!llm) return void res.status(503).json(npcFailure("未配置模型，NPC 未答复，未获得插队许可。", null));
      try {
        const reply = await llm.negotiate(req.body as CutInDialogueRequest);
        res.status(reply.source === "error" ? 502 : 200).json(reply);
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
    if (isObject(err) && err.type === "entity.parse.failed") {
      return void res.status(400).json({ error: "请求正文必须是有效的 JSON 对象" });
    }
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });

  return app;
}
