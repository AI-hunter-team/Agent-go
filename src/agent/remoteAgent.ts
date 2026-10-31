import type {
  AgentTurn,
  CreativeClassification,
  DecisionResult,
  NormalizedGuidance,
  Observation,
  NpcReply,
  CutInDialogueRequest,
  GameReport,
} from "../shared/types";
import type { OperationDebug } from "../shared/debug";
import type { GameSettings } from "../shared/gameSettings";
import type { ReasoningEffort } from "../shared/modelConfig";
import { classifyByKeywords } from "../sim/intent";
import type { Agent, Classifier, NpcNegotiator } from "./agent";

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
async function api<T>(path: string, init: { method?: string; body?: unknown; configToken?: string | null } = {}): Promise<T> {
  const token = init.configToken === undefined ? activeModelToken : init.configToken;
  let res: Response;
  let text: string;
  try {
    res = await fetch(path, {
      signal: AbortSignal.timeout(30_000),
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
  if (!res.ok && !(path === "/api/npc/negotiate" && data?.source === "error" && data?.accepted === false)) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const Api = {
  /** 验证凭据并获取模型列表。 */
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
  createSession: async (guidance: string, normalized: NormalizedGuidance | null, runId?: string, settings?: GameSettings) => {
    const token = activeModelToken;
    if (token) tokenUsers.set(token, (tokenUsers.get(token) ?? 0) + 1);
    try {
      const result = await api<{ sessionId: string }>("/api/session", { body: { guidance, normalized, runId, settings }, configToken: token });
      sessionTokens.set(result.sessionId, token);
      return result;
    } catch (error) { await releaseToken(token); throw error; }
  },
  /** 使用本局固定配置请求下一个动作。 */
  decide: (sessionId: string, turn: AgentTurn) => api<DecisionResult>("/api/agent/decide", { body: { sessionId, turn }, configToken: sessionToken(sessionId) }),
  /** 使用本局配置分类创意，赛外调用使用当前配置。 */
  classify: (intent: string, observation: Observation, sessionId?: string, runId?: string) =>
    api<CreativeClassification>("/api/creative/classify", { body: { intent, observation, sessionId, runId }, configToken: sessionToken(sessionId) }),
  /** 将报告保存到创建它的会话。 */
  saveReport: (sessionId: string, report: GameReport) => api<void>("/api/session/" + sessionId + "/report", { body: { report }, configToken: sessionToken(sessionId) }),
  /** 结束会话并释放对应凭据引用。 */
  deleteSession: async (sessionId: string) => {
    const token = sessionToken(sessionId);
    try { return await api<null>("/api/session/" + sessionId, { method: "DELETE", configToken: token }); }
    finally { sessionTokens.delete(sessionId); await releaseToken(token ?? null); }
  },
  /** NPC 对话沿用本局固定的模型配置。 */
  negotiate: (request: CutInDialogueRequest, sessionId?: string) => api<NpcReply>("/api/npc/negotiate", { body: { ...request, sessionId }, configToken: sessionToken(sessionId) }),
};

/** Model-driven agent: each decision is a call to the API server, which holds in-run memory. */
export class RemoteAgent implements Agent {
  readonly kind = "llm" as const;
  /** 持有服务端会话 ID 与报告关联 ID。 */
  private constructor(private sessionId: string, private runId?: string) {}

  /** 创建局内远程 Agent。 */
  static async create(guidance: string, normalized: NormalizedGuidance | null, runId?: string, settings?: GameSettings): Promise<RemoteAgent> {
    const { sessionId } = await Api.createSession(guidance, normalized, runId, settings);
    return new RemoteAgent(sessionId, runId);
  }

  /** 转发单次观察，不在浏览器保存供应商协议历史。 */
  decide(turn: AgentTurn): Promise<DecisionResult> {
    return Api.decide(this.sessionId, turn);
  }

  /** 归类当前对局的创意请求。 */
  readonly classify: Classifier = (intent, observation) => Api.classify(intent, observation, this.sessionId, this.runId);

  /** 请求本局 NPC 答复。 */
  readonly negotiate: NpcNegotiator = (request) => Api.negotiate(request, this.sessionId);

  /** 上传报告并结束局内记忆。 */
  async dispose(report?: GameReport) {
    try { if (report) await Api.saveReport(this.sessionId, report); }
    finally { await Api.deleteSession(this.sessionId).catch(() => undefined); }
  }
}

/** Standalone server classifier; the runner records transport errors and applies keyword fallback. */
export const remoteClassifier: Classifier = (intent, observation) =>
  Api.classify(intent, observation);

/** 离线模式仅使用本地关键词规则。 */
export const offlineClassifier: Classifier = async (intent) => classifyByKeywords(intent);

/** 赛外 NPC 请求使用当前页面模型配置。 */
export const remoteNpcNegotiator: NpcNegotiator = (request) => Api.negotiate(request);
