/** Local browser acceptance fixture. No SDK client, dotenv, credentials or paid calls. */
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { createApp, type LlmService } from "../server/app";
import { SessionStore, type Session } from "../server/sessions";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { ModelConfigStore } from "../server/modelConfig";
import { randomUUID } from "node:crypto";

const agents = new WeakMap<Session, HeuristicAgent>();
const llm: LlmService = {
  model: "浏览器验收伪模型（无费用）",
  /** 生成固定的赛前指导，支持故障验收开关。 */
  async normalize(text) {
    if (text.includes("FAIL-NORMALIZE")) throw new Error("模拟整理失败");
    return { summary: text, priorities: ["按现有规则完成流程"], risk: "守序", rules: [], creativeIdeas: [], notExecutable: [], initialPlan: ["观察、买票、安检、过闸"] };
  },
  /** 用离线 Agent 产生无费用动作，保留原浏览器验收场景。 */
  async decide(session, turn) {
    await delay(session.guidance.includes("SLOW") ? 10000 : 80);
    if (session.guidance.includes("FAIL-DECISION")) return { action: null, thinking: null, usage: null, model: llm.model, latencyMs: 80, error: "模拟决策失败" };
    let agent = agents.get(session);
    if (!agent) { agent = new HeuristicAgent(); agents.set(session, agent); }
    const result = await agent.decide(turn);
    if (session.guidance.includes("JUMP") && turn.observation.self.screened) {
      const self = turn.observation.self;
      if (self.position.x >= 42.3) result.action = { type: "attempt_creative", intent: "翻越闸机", reason: "伪模型动作演示" };
      else if (turn.observation.facilities.some((f) => f.id === "G1")) result.action = { type: "join_queue", facility: "G1", reason: "伪模型动作演示" };
      else result.action = { type: "move_to", target: "GATE_N", reason: "伪模型动作演示" };
    }
    return { ...result, model: llm.model, thinking: "这是固定规则的浏览器验收响应，不是真实模型。", latencyMs: 80 };
  },
  /** 用本地规则完成意图分类。 */
  async classify(intent) { return classifyByKeywords(intent); },
};
/** 页面设置的所有上游请求都在此拦截，任何输入地址都不会产生真实模型调用。 */
const fixtureFetch: typeof fetch = async (url, init) => {
  if (String(url).endsWith("/models")) return Response.json({ data: [{ id: "deepseek-flash" }, { id: "fixture-other" }] });
  const request = JSON.parse(String(init?.body));
  const name = request.text?.format?.name;
  const value = name === "guidance" ? await llm.normalize("浏览器验收")
    : name === "npc_reply" ? { accepted: false, reply: "这是无费用验收。", reason: "保持排队" }
      : { mechanic: "unsupported", reason: "无费用验收" };
  console.log("Fixture Responses:", request.model, request.reasoning?.effort, request.max_output_tokens);
  return Response.json({
    id: randomUUID(), model: request.model, status: "completed",
    output: request.tools ? [{ type: "function_call", call_id: randomUUID(), name: "wait", arguments: JSON.stringify({ seconds: 1, reason: "无费用验收" }) }]
      : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
    usage: { input_tokens: 10, output_tokens: 10, output_tokens_details: { reasoning_tokens: 0 } },
  });
};
const sessions = new SessionStore();
const frontend = process.env.FIXTURE_FRONTEND_DIR ?? process.env.BROWSER_FIXTURE_FRONTEND;
const frontendDir = frontend ? resolve(frontend) : undefined;
const port = Number(process.env.FIXTURE_PORT ?? process.env.BROWSER_FIXTURE_PORT ?? 8891);
const app = createApp({ llm, sessions, modelConfigs: new ModelConfigStore(fixtureFetch), frontendDir });
app.listen(port, "127.0.0.1", () => console.log(`Browser acceptance fixture on 127.0.0.1:${port}. No paid model calls.`));
