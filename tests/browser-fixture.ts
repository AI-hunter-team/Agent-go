/** Local browser acceptance fixture. No SDK client, dotenv, credentials or paid calls. */
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { createApp, type LlmService } from "../server/app";
import { SessionStore, type Session } from "../server/sessions";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";

const agents = new WeakMap<Session, HeuristicAgent>();
const llm: LlmService = {
  model: "浏览器验收伪模型（无费用）",
  async normalize(text) {
    if (text.includes("FAIL-NORMALIZE")) throw new Error("模拟整理失败");
    return { summary: text, priorities: ["按现有规则完成流程"], risk: "守序", rules: [], creativeIdeas: [], notExecutable: [], initialPlan: ["观察、买票、安检、过闸"] };
  },
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
  async classify(intent) { return classifyByKeywords(intent); },
};
const sessions = new SessionStore();
const frontendDir = process.env.BROWSER_FIXTURE_FRONTEND ? resolve(process.env.BROWSER_FIXTURE_FRONTEND) : undefined;
const port = Number(process.env.BROWSER_FIXTURE_PORT ?? 8891);
const app = createApp({ llm, sessions, frontendDir });
app.listen(port, "127.0.0.1", () => console.log(`Browser acceptance fixture on 127.0.0.1:${port}. No paid model calls.`));
