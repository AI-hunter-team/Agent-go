import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import { createLlm } from "../server/llm";
import { configFromEnv } from "../server/claude";
import { SessionStore } from "../server/sessions";
import { debugLoggerFromEnv } from "../server/debug";
import type { OperationDebug } from "../src/shared/debug";
import type { Agent } from "../src/agent/agent";
import { GameRunner } from "../src/agent/runner";
import type { CreativeClassification, DecisionResult, GameReport, NormalizedGuidance } from "../src/shared/types";
import { Engine } from "../src/sim/engine";

// Opt-in paid integration test. Never included in npm test.
const llm = createLlm();
const budgets = configFromEnv({ ...process.env, AGENT_MODEL: llm?.model ?? process.env.AGENT_MODEL });
if (!llm) throw new Error("请先在 .env 配置模型凭据");
const sessions = new SessionStore();
const server = createApp({ llm, sessions, debugLogger: debugLoggerFromEnv(), modelParameters: { ...budgets, model: llm.model, effort: (process.env.AGENT_PROVIDER === "openai" || process.env.OPENAI_API_KEY) ? budgets.reasoningEffort : "low", timeoutMs: 20_000 } }).listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
async function api<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(base + path, {
    method, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

const testedAt = new Date().toISOString();
const requests: DecisionResult[] = [];
const cases: { name: string; report: GameReport }[] = [];
const classifications: { intent: string; expected: string; result: CreativeClassification }[] = [];
try {
  console.log(JSON.stringify({ stage: "health", ...await api("/api/health", undefined, "GET") as object }));
  const compare = process.argv.includes("--compare");
  const seedArg = process.argv.find((arg) => arg.startsWith("--seeds="));
  const seeds = (seedArg?.split("=")[1] ?? "1").split(",").map(Number);
  if (!seeds.length || seeds.some((s) => !Number.isSafeInteger(s))) throw new Error("--seeds 必须为逗号分隔的整数");
  const configs = seeds.map((seed) => ({ name: `default-seed-${seed}`, seed, guidance: "" }));
  if (compare) configs.push({ name: `guided-seed-${seeds[0]}`, seed: seeds[0], guidance: "全程守序。买票时优先选择 TVM-2，即使另一台队伍更短也不换；买票后正常选择合适的安检通道和闸机。" });
  for (const config of configs) {
    const runId = crypto.randomUUID();
    const preparedAt = performance.now();
    const { guidance: normalized, debug: preparationDebug } = await api<{ guidance: NormalizedGuidance | null; debug?: OperationDebug }>("/api/guidance/normalize", { text: config.guidance, runId });
    const preparationMs = config.guidance ? performance.now() - preparedAt : 0;
    const { sessionId } = await api<{ sessionId: string }>("/api/session", { guidance: config.guidance, normalized, runId });
    let disposal: Promise<void> | null = null;
    const agent: Agent = {
      kind: "llm",
      decide: async (turn) => {
        const result = await api<DecisionResult>("/api/agent/decide", { sessionId, turn });
        requests.push(result);
        console.log(JSON.stringify({ case: config.name, worldTime: turn.observation.t, action: result.action, model: result.model, usage: result.usage, latencyMs: result.latencyMs, error: result.error }));
        return result;
      },
      dispose: (report) => disposal ??= (async () => {
        try { if (report) await api(`/api/session/${sessionId}/report`, { report }); }
        finally { await api(`/api/session/${sessionId}`, undefined, "DELETE"); }
      })(),
    };
    const runner = new GameRunner(new Engine(config.seed), agent,
      (intent, observation) => api("/api/creative/classify", { intent, observation, sessionId, runId }),
      { guidance: config.guidance, normalizedGuidance: normalized, runId, preparation: { durationMs: preparationMs, server: preparationDebug ?? null } });
    try {
      await runner.runToEnd();
      const report = runner.report();
      cases.push({ name: config.name, report });
      console.log(JSON.stringify({ stage: "game-complete", case: config.name, status: report.status, score: report.score, failReason: report.failReason, totals: report.totals, thinkingRealSeconds: report.thinkingRealSeconds }));
    } finally { await agent.dispose(); }
  }
  for (const [intent, expected] of [["从栏杆上翻过闸机", "jump_gate"], ["挤到队伍最前面插队", "cut_in_line"], ["长出翅膀飞过去", "unsupported"]]) {
    const result = await api<CreativeClassification>("/api/creative/classify", { intent, observation: new Engine(seeds[0]).observe() });
    classifications.push({ intent, expected, result });
    console.log(JSON.stringify({ stage: "classification", intent, expected, result }));
  }
} finally {
  const outputDir = "docs/model-tests";
  await mkdir(outputDir, { recursive: true });
  const filename = `${outputDir}/${testedAt.replace(/[:.]/g, "-")}.json`;
  const summary = {
    testedAt, model: llm.model, provider: process.env.AGENT_PROVIDER,
    baseURL: process.env.OPENAI_BASE_URL, decisionMaxTokens: budgets.maxTokens,
    thinkingMaxTokens: budgets.maxThinkingTokens,
    thinkingEnforcement: "prompt-and-usage-check; no provider-side numeric reasoning cap",
    requestCount: requests.length,
    requestErrors: requests.filter((r) => r.error).length,
    reportedModels: [...new Set(requests.map((r) => r.model).filter(Boolean))],
    maxDecisionOutputTokens: Math.max(0, ...requests.map((r) => r.usage?.outputTokens ?? 0)),
    maxReportedThinkingTokens: Math.max(0, ...requests.map((r) => r.usage?.thinkingTokens ?? 0)),
    unverifiedThinkingRequests: requests.filter((r) => r.usage?.thinkingTokens == null).length,
    // Auxiliary normalization/classification calls are outside the gameplay token totals.
    auxiliaryUsageIncluded: false,
    cases, classifications, requests,
  };
  await writeFile(filename, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ stage: "saved", filename, requests: summary.requestCount, errors: summary.requestErrors }));
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}
if (!cases.length || cases.some((c) => c.report.status !== "success") || requests.some((r) => r.error || r.model !== llm.model || (r.usage?.thinkingTokens ?? 0) > budgets.maxThinkingTokens) || classifications.some((c) => c.result.source !== "llm" || c.result.mechanic !== c.expected)) process.exitCode = 1;
