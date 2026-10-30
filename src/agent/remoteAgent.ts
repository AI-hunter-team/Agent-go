import type {
  AgentTurn,
  CreativeClassification,
  DecisionResult,
  NormalizedGuidance,
  Observation,
  GameReport,
} from "../shared/types";
import type { OperationDebug } from "../shared/debug";
import { classifyByKeywords } from "../sim/intent";
import type { Agent, Classifier } from "./agent";

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    signal: AbortSignal.timeout(30_000),
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
  normalize: (text: string, runId?: string) => api<{ guidance: NormalizedGuidance | null; debug?: OperationDebug }>("/api/guidance/normalize", { body: { text, runId } }),
  createSession: (guidance: string, normalized: NormalizedGuidance | null, runId?: string) =>
    api<{ sessionId: string }>("/api/session", { body: { guidance, normalized, runId } }),
  decide: (sessionId: string, turn: AgentTurn) => api<DecisionResult>("/api/agent/decide", { body: { sessionId, turn } }),
  classify: (intent: string, observation: Observation, sessionId?: string, runId?: string) =>
    api<CreativeClassification>("/api/creative/classify", { body: { intent, observation, sessionId, runId } }),
  saveReport: (sessionId: string, report: GameReport) => api<void>(`/api/session/${sessionId}/report`, { body: { report } }),
  deleteSession: (sessionId: string) => api<null>(`/api/session/${sessionId}`, { method: "DELETE" }),
};

/** Model-driven agent: each decision is a call to the API server, which holds in-run memory. */
export class RemoteAgent implements Agent {
  readonly kind = "llm" as const;
  private constructor(private sessionId: string, private runId?: string) {}

  static async create(guidance: string, normalized: NormalizedGuidance | null, runId?: string): Promise<RemoteAgent> {
    const { sessionId } = await Api.createSession(guidance, normalized, runId);
    return new RemoteAgent(sessionId, runId);
  }

  decide(turn: AgentTurn): Promise<DecisionResult> {
    return Api.decide(this.sessionId, turn);
  }

  readonly classify: Classifier = (intent, observation) => Api.classify(intent, observation, this.sessionId, this.runId);

  async dispose(report?: GameReport) {
    try { if (report) await Api.saveReport(this.sessionId, report); }
    finally { await Api.deleteSession(this.sessionId).catch(() => undefined); }
  }
}

/** Standalone server classifier; the runner records transport errors and applies keyword fallback. */
export const remoteClassifier: Classifier = (intent, observation) =>
  Api.classify(intent, observation);

export const offlineClassifier: Classifier = async (intent) => classifyByKeywords(intent);
