/** Local browser acceptance fixture. No SDK client, dotenv, credentials or paid calls. */
import { setTimeout as delay } from "node:timers/promises";
import { createApp, type LlmService } from "../server/app";
import { SessionStore, type Session } from "../server/sessions";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";

const agents = new WeakMap<Session, HeuristicAgent>();
const llm: LlmService = {
  model: "浏览器验收伪模型（无费用）",
  async review(input) {
    await delay(200);
    const evidence = { decisionIndexes: input.decisions.slice(0, 1).map(d => d.index), eventIndexes: input.events.length ? [input.events.length - 1] : [] };
    return { model: llm.model, usage: { inputTokens: 100, outputTokens: 100, thinkingTokens: 0, cacheReadTokens: 0 }, latencyMs: 200,
      analysis: {
        summary: "验收伪模型复盘：本局未能完成行程。", primaryCause: input.failReason,
        secondaryFactors: ["本报告用于验证交互流程，内容由固定伪响应生成。"], uncertainties: ["替代策略未经重跑验证。"],
        turningPoints: [{ t: input.elapsed, knownThen: "角色依据当时可见情况行动。", discoveredAfter: `赛后可查看 ${input.worldSnapshots.length} 个全局快照与 ${input.events.length} 条事件。`, assessment: "结合实际记录区分技术失败与策略问题。", ...evidence }],
        strategies: [
          { id: "compare", title: "比较通道总耗时", change: "观察队列后，同时比较等待与行走耗时。", reason: "队列人数与移动成本共同影响结果。", when: "有多个可见通道时。", tradeoff: "观察和比较会增加行走时间。", recommended: true, ...evidence },
          { id: "steady", title: "谨慎换队", change: "换队前比较继续等待与绕行的预计耗时。", reason: "减少没有收益的往返。", when: "排队时发现其他选项。", tradeoff: "可能错过更快的通道。", recommended: false, ...evidence },
        ],
      },
    };
  },
  async draftGuidance(guidance, strategies) {
    await delay(200);
    const text = [guidance, ...strategies.map(s => s.change)].filter(Boolean).join("；");
    return { guidance: [...text].slice(0, 300).join(""), model: llm.model, usage: null, latencyMs: 200 };
  },
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
const app = createApp({ llm, sessions });
const port = Number(process.env.PORT ?? 8891);
app.listen(port, "127.0.0.1", () => console.log(`Browser acceptance fixture on 127.0.0.1:${port}. No paid model calls.`));
