import type {
  AgentTurn,
  CreativeClassification,
  DecisionResult,
  NormalizedGuidance,
  Observation,
} from "../shared/types";
import { classifyByKeywords } from "../sim/intent";
import type { Agent, Classifier } from "./agent";

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const Api = {
  health: () => api<{ llm: boolean; model: string | null }>("/api/health"),
  normalize: (text: string) => api<{ guidance: NormalizedGuidance | null }>("/api/guidance/normalize", { body: { text } }),
  createSession: (guidance: string, normalized: NormalizedGuidance | null) =>
    api<{ sessionId: string }>("/api/session", { body: { guidance, normalized } }),
  decide: (sessionId: string, turn: AgentTurn) => api<DecisionResult>("/api/agent/decide", { body: { sessionId, turn } }),
  classify: (intent: string, observation: Observation) =>
    api<CreativeClassification>("/api/creative/classify", { body: { intent, observation } }),
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

  async dispose() {
    await Api.deleteSession(this.sessionId).catch(() => undefined);
  }
}

/** Server classifier (model, with keyword fallback server-side); keywords if the server is unreachable. */
export const remoteClassifier: Classifier = (intent, observation) =>
  Api.classify(intent, observation).catch(() => classifyByKeywords(intent));

export const offlineClassifier: Classifier = async (intent) => classifyByKeywords(intent);
