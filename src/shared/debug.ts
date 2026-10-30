import type { AgentTurn, AgentAction, DecisionUsage, CreativeClassification } from "./types";

export type AiStage = "ticket" | "security" | "gate" | "stairs";
export type AiOperation = "decision" | "retry" | "classification" | "negotiation";

export interface ModelCallDebug {
  id: string;
  endpoint: string;
  model: string | null;
  maxOutputTokens: number | null;
  effort: string | null;
  messageCount: number;
  requestBytes: number;
  tools: string[];
  toolChoice: unknown;
  schema: string | null;
  status: number | null;
  providerRequestId: string | null;
  returnedModel: string | null;
  stopReason: string | null;
  usage: DecisionUsage | null;
  waitHeadersMs: number;
  readBodyMs: number;
  totalMs: number;
  error: string | null;
}

export interface OperationDebug {
  parameters: Record<string, unknown>;
  id: string;
  runId: string | null;
  sessionId: string | null;
  operation: "normalize" | "decide" | "classify" | "negotiate";
  startedAt: string;
  durationMs: number;
  calls: ModelCallDebug[];
  error: string | null;
}

export interface DebugAttempt {
  index: number;
  decisionIndex: number;
  operation: AiOperation;
  stage: AiStage;
  startedAt: string;
  durationMs: number;
  status: "pending" | "completed" | "cancelled";
  turn: AgentTurn;
  action: AgentAction | null;
  classification: Pick<CreativeClassification, "mechanic" | "reason" | "source"> | null;
  error: string | null;
  usage: DecisionUsage | null;
  server: OperationDebug | null;
}

export interface RunDebug {
  version: 1;
  runId: string;
  startedAt: string;
  endedAt: string | null;
  parameters: { seed: number; agentKind: "llm" | "offline"; maxDecisions: number; timeLimitSeconds: number; extraQueuePeople?: number; stepSeconds: number; simulationRules: Record<string, number>; decisionLimits: Record<string, number> };
  preparation: { durationMs: number; server: OperationDebug | null };
  attempts: DebugAttempt[];
  summary: {
    aiWaitMs: number;
    includingPreparationMs: number;
    byOperationMs: Record<AiOperation, number>;
    byStageMs: Record<AiStage, number>;
    providerWaitHeadersMs: number;
    providerReadBodyMs: number;
    otherMs: number;
    measuredRequests: number;
    unmeasuredRequests: number;
    slowestAttempt: { index: number; durationMs: number } | null;
    internalReasoningMs: null;
  };
}

export function summarizeDebug(attempts: DebugAttempt[], preparationMs = 0): RunDebug["summary"] {
  const summary: RunDebug["summary"] = {
    aiWaitMs: 0, includingPreparationMs: preparationMs,
    byOperationMs: { decision: 0, retry: 0, classification: 0, negotiation: 0 },
    byStageMs: { ticket: 0, security: 0, gate: 0, stairs: 0 },
    providerWaitHeadersMs: 0, providerReadBodyMs: 0, otherMs: 0,
    measuredRequests: 0, unmeasuredRequests: 0, slowestAttempt: null,
    internalReasoningMs: null,
  };
  for (const attempt of attempts) {
    summary.aiWaitMs += attempt.durationMs;
    summary.byOperationMs[attempt.operation] += attempt.durationMs;
    summary.byStageMs[attempt.stage] += attempt.durationMs;
    if (!summary.slowestAttempt || attempt.durationMs > summary.slowestAttempt.durationMs) {
      summary.slowestAttempt = { index: attempt.index, durationMs: attempt.durationMs };
    }
    if (attempt.server?.calls.length) {
      summary.measuredRequests++;
      for (const call of attempt.server.calls) {
        summary.providerWaitHeadersMs += call.waitHeadersMs;
        summary.providerReadBodyMs += call.readBodyMs;
      }
    } else summary.unmeasuredRequests++;
  }
  summary.includingPreparationMs += summary.aiWaitMs;
  summary.otherMs = Math.max(0, summary.aiWaitMs - summary.providerWaitHeadersMs - summary.providerReadBodyMs);
  return summary;
}
