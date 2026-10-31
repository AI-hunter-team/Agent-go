/** 隔离浏览器验收：仅伪模型，不读取生产环境凭据。 */
import { resolve } from "node:path";
import { createApp, type LlmService } from "../../server/app";
import { SessionStore } from "../../server/sessions";
import { HeuristicAgent } from "../../src/agent/heuristicAgent";
const agent = new HeuristicAgent();
const llm: LlmService = {
  model: "browser-fixture",
  async prepareJourney(input) {
    await new Promise((r) => setTimeout(r, 800));
    if (input.guidance.includes("模拟失败")) throw new Error("伪模型失败");
    return {
      understanding: input.autonomous ? "自主选择通行策略" : input.guidance,
      actions: ["先观察入口附近的设施与队伍", "根据现场情况选择路线"],
      adjustment: "发现停用或拥堵后重新判断",
    };
  },
  normalize: async (text) => ({
    summary: text,
    priorities: [],
    risk: "",
    rules: [],
    creativeIdeas: [],
    notExecutable: [],
    initialPlan: [],
  }),
  decide: async (_session, turn) => {
    await new Promise((r) => setTimeout(r, 100));
    return { ...(await agent.decide(turn)), model: "browser-fixture" };
  },
  classify: async () => ({
    mechanic: "cut_in_line",
    reason: "fixture",
    source: "llm",
  }),
};
createApp({
  llm,
  sessions: new SessionStore(),
  frontendDir: resolve("dist"),
}).listen(8899, "127.0.0.1", () =>
  console.log("Journey fixture ready on 8899"),
);
