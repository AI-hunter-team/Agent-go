import type {
  AgentTurn,
  DecisionResult,
  NormalizedGuidance,
  GameReport,
} from "../shared/types";
import type { OperationDebug } from "../shared/debug";
import type { GameSettings } from "../shared/gameSettings";
import type { ReasoningEffort } from "../shared/modelConfig";
import type { JourneyInput, JourneyPreparation } from "../shared/journey";
import type { DraftResult, ReviewInput, ReviewResult, ReviewStrategy } from "../shared/review";
import { ReviewFailure } from "../shared/review";
import { classifyByKeywords } from "../sim/intent";
import type { Agent, Classifier, Interpreter, NpcResponder } from "./agent";

let activeModelToken: string | null = null;
const sessionTokens = new Map<string, string | null>();
const tokenUsers = new Map<string, number>();

/** 仅撤销已没有对局使用的旧配置，避免换模型中断旧局。 */
async function discardUnused(token: string | null): Promise<void> {
  if (token && token !== activeModelToken && !tokenUsers.get(token)) await api("/api/model/config", { method: "DELETE", configToken: token }).catch(() => undefined);
}

/** 释放一局对凭据的引用，最后一局结束后清理旧配置。 */
async function releaseToken(token: string | null): Promise<void> {
  if (!token) return;
  const count = (tokenUsers.get(token) ?? 1) - 1;
  if (count > 0) tokenUsers.set(token, count);
  else tokenUsers.delete(token);
  await discardUnused(token);
}

/** 选择本局创建时的凭据，未绑定的辅助请求使用当前页面配置。 */
function sessionToken(sessionId?: string): string | null | undefined {
  return sessionId && sessionTokens.has(sessionId) ? sessionTokens.get(sessionId) : undefined;
}

/** 统一调用本地业务 API，凭据由服务端临时 token 引用。 */
async function api<T>(path: string, init: { method?: string; body?: unknown; configToken?: string | null; signal?: AbortSignal } = {}): Promise<T> {
  const token = init.configToken === undefined ? activeModelToken : init.configToken;
  let res: Response;
  let text: string;
  try {
    res = await fetch(path, {
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", ...(token ? { "x-model-config": token } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    text = await res.text();
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new Error("本地服务或模型响应超时，请稍后重试");
    }
    throw new Error("无法连接本地 API 服务，请确认前后端服务正在运行后重试");
  }
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { throw new Error("API 服务返回格式异常，请检查服务是否已启动"); }
  // NPC failures also carry their raw model response and paid usage for the run log.
  if (!res.ok && !((path === "/api/npc/negotiate" || path === "/api/npc/respond") && data?.source === "error")) {
    if (path.startsWith("/api/review")) throw new ReviewFailure(data?.error ?? `HTTP ${res.status}`, data?.attempt ?? null);
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const Api = {
  prepareJourney: (input: JourneyInput, signal?: AbortSignal) => api<JourneyPreparation>("/api/journey/prepare", { body: input, signal }),
  /** 验证凭据并获取模型列表。 */
  review: (input: ReviewInput) => api<ReviewResult>("/api/review", { body: { input } }),
  draftGuidance: (guidance: string, strategies: ReviewStrategy[]) => api<DraftResult>("/api/review/guidance", { body: { guidance, strategies } }),
  verifyModel: (baseUrl: string, apiKey: string) => api<{ token: string; baseUrl: string; models: string[] }>("/api/model/verify", { body: { baseUrl, apiKey }, configToken: null }),
  /** 释放尚未使用的配置；活跃对局的凭据保留到局后。 */
  discardModel: (token: string) => discardUnused(token),
  /** 启用所选模型与思考档位，只改变后续请求的默认配置。 */
  enableModel: async (token: string, model: string, reasoningEffort: ReasoningEffort = "none") => {
    const health = await api<{ llm: boolean; model: string | null }>("/api/model/enable", { body: { model, reasoningEffort }, configToken: token });
    const previous = activeModelToken;
    activeModelToken = token;
    await discardUnused(previous);
    return health;
  },
  /** 清除新对局的页面默认配置，保留已运行对局。 */
  clearModel: async () => {
    const previous = activeModelToken;
    activeModelToken = null;
    await discardUnused(previous);
    return Api.health();
  },
  /** 查询当前默认模型状态，不发起供应商请求。 */
  health: () => api<{ llm: boolean; model: string | null }>("/api/health"),
  /** 以当前配置整理开局指导。 */
  normalize: (text: string, runId?: string) => api<{ guidance: NormalizedGuidance | null; debug?: OperationDebug }>("/api/guidance/normalize", { body: { text, runId } }),
  /** 创建会话前就引用凭据，避免并发换模型使正在创建的对局失效。 */
  createSession: async (guidance: string, normalized: NormalizedGuidance | null, runId?: string, settings?: GameSettings, loadout?: import("../shared/interaction").Loadout, prepared?: { preparationId: string; sceneId: string; seed: number }) => {
    const token = activeModelToken;
    if (token) tokenUsers.set(token, (tokenUsers.get(token) ?? 0) + 1);
    try {
      const result = await api<{ sessionId: string }>("/api/session", { body: { guidance, normalized, runId, settings, loadout, ...prepared }, configToken: token });
      sessionTokens.set(result.sessionId, token);
      return result;
    } catch (error) { await releaseToken(token); throw error; }
  },
  decide: (sessionId: string, turn: AgentTurn) => api<DecisionResult>("/api/agent/decide", { body: { sessionId, turn }, configToken: sessionToken(sessionId) }),
  interpret: (sessionId: string, instruction: string, context: import("../shared/types").BossContext) => api<import("../shared/types").ActionPlan>("/api/boss/interpret", { body: {sessionId,instruction,context}, configToken: sessionToken(sessionId) }),
  respond: (sessionId: string, request: import("../shared/types").NpcDialogueRequest) => api<import("../shared/types").NpcResponse>("/api/npc/respond", {body:{sessionId,request}, configToken: sessionToken(sessionId)}),
  saveReport: (sessionId: string, report: GameReport) => api<void>(`/api/session/${sessionId}/report`, { body: { report }, configToken: sessionToken(sessionId) }),
  deleteSession: async (sessionId: string) => {
    const token = sessionToken(sessionId);
    try { return await api<null>(`/api/session/${sessionId}`, { method: "DELETE", configToken: token }); }
    finally { sessionTokens.delete(sessionId); await releaseToken(token ?? null); }
  },
};

/** Model-driven agent: each decision is a call to the API server, which holds in-run memory. */
export class RemoteAgent implements Agent {
  readonly kind = "llm" as const;
  private constructor(private sessionId: string) {}

  /** 创建局内远程 Agent。 */
  static async create(guidance: string, normalized: NormalizedGuidance | null, runId?: string, settings?: GameSettings, loadout?: import("../shared/interaction").Loadout, prepared?: { preparationId: string; sceneId: string; seed: number }): Promise<RemoteAgent> {
    const { sessionId } = await Api.createSession(guidance, normalized, runId, settings, loadout, prepared);
    return new RemoteAgent(sessionId);
  }

  /** 转发单次观察，不在浏览器保存供应商协议历史。 */
  decide(turn: AgentTurn): Promise<DecisionResult> {
    return Api.decide(this.sessionId, turn);
  }

  readonly interpret: Interpreter = (instruction, context) => Api.interpret(this.sessionId, instruction, context);
  readonly respond: NpcResponder = request => Api.respond(this.sessionId, request);



  /** 上传报告并结束局内记忆。 */
  async dispose(report?: GameReport) {
    try { if (report) await Api.saveReport(this.sessionId, report); }
    finally { await Api.deleteSession(this.sessionId).catch(() => undefined); }
  }
}

export const offlineClassifier: Classifier = async (intent) => classifyByKeywords(intent);
