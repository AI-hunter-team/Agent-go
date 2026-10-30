import type {
  AgentTurn,
  CreativeClassification,
  DecisionResult,
  NormalizedGuidance,
  Observation,
} from "../shared/types";
import { classifyByKeywords } from "../sim/intent";
import type { Agent, Classifier } from "./agent";

let activeModelToken: string | null = null;

async function api<T>(path: string, init: { method?: string; body?: unknown; configToken?: string | null } = {}): Promise<T> {
  const token = init.configToken === undefined ? activeModelToken : init.configToken;
  const res = await fetch(path, {
    signal: AbortSignal.timeout(30_000),
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...(token ? { "x-model-config": token } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { throw new Error("API 服务返回格式异常，请检查服务是否已启动"); }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const Api = {
  verifyModel: (baseUrl: string, apiKey: string) => api<{ token: string; baseUrl: string; models: string[] }>("/api/model/verify", { body: { baseUrl, apiKey }, configToken: null }),
  discardModel: (token: string) => api<null>("/api/model/config", { method: "DELETE", configToken: token }),
  enableModel: async (token: string, model: string) => {
    const health = await api<{ llm: boolean; model: string | null }>("/api/model/enable", { body: { model }, configToken: token });
    const previous = activeModelToken;
    activeModelToken = token;
    if (previous && previous !== token) void Api.discardModel(previous).catch(() => undefined);
    return health;
  },
  clearModel: async () => {
    if (activeModelToken) await Api.discardModel(activeModelToken);
    activeModelToken = null;
    return Api.health();
  },
  health: () => api<{ llm: boolean; model: string | null }>("/api/health"),
  normalize: (text: string) => api<{ guidance: NormalizedGuidance | null }>("/api/guidance/normalize", { body: { text } }),
  createSession: (guidance: string, normalized: NormalizedGuidance | null) =>
    api<{ sessionId: string }>("/api/session", { body: { guidance, normalized } }),
  decide: (sessionId: string, turn: AgentTurn) => api<DecisionResult>("/api/agent/decide", { body: { sessionId, turn } }),
  classify: (intent: string, observation: Observation, sessionId?: string) =>
    api<CreativeClassification>("/api/creative/classify", { body: { intent, observation, sessionId } }),
  deleteSession: (sessionId: string) => api<null>(`/api/session/${sessionId}`, { method: "DELETE" }),
};

/** Model-driven agent: each decision is a call to the API server, which holds in-run memory. */
export class RemoteAgent implements Agent {
  readonly kind = "llm" as const;
  private constructor(private sessionId: string) {}

  static async create(guidance: string, normalized: NormalizedGuidance | null): Promise<RemoteAgent> {
    const { sessionId } = await Api.createSession(guidance, normalized);
    return new RemoteAgent(sessionId);
  }

  decide(turn: AgentTurn): Promise<DecisionResult> {
    return Api.decide(this.sessionId, turn);
  }

  readonly classify: Classifier = (intent, observation) => Api.classify(intent, observation, this.sessionId);

  async dispose() {
    await Api.deleteSession(this.sessionId).catch(() => undefined);
  }
}

/** Server classifier (model, with keyword fallback server-side); keywords if the server is unreachable. */
export const remoteClassifier: Classifier = (intent, observation) =>
  Api.classify(intent, observation).catch(() => classifyByKeywords(intent));

export const offlineClassifier: Classifier = async (intent) => classifyByKeywords(intent);
