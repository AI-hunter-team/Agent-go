import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { Engine } from "../src/sim/engine";

export function failedReport() {
  const engine = new Engine(1);
  const runner = new GameRunner(engine, new HeuristicAgent(), async () => ({ mechanic: "unsupported", reason: "", source: "keywords" }));
  engine.world.log("test", "远处设施发生变化", false);
  runner.stop("玩家结束了本局");
  return runner.report();
}

export const analysis = {
  summary: "本局提前结束", primaryCause: "玩家主动终止，无法评估通关策略。", secondaryFactors: [], uncertainties: ["替代策略未经验证"],
  turningPoints: [{ t: 0, knownThen: "刚进入站厅", discoveredAfter: "远处设施发生变化", assessment: "不能据此断言决策错误", decisionIndexes: [], eventIndexes: [0] }],
  strategies: [
    { id: "observe", title: "比较队列", change: "观察后比较队列等待与移动成本", reason: "减少盲目选择", when: "有多个可见通道时", tradeoff: "观察需要时间", recommended: true, decisionIndexes: [], eventIndexes: [0] },
    { id: "steady", title: "减少换队", change: "换队前比较预计总耗时", reason: "减少往返", when: "排队期间", tradeoff: "可能错过更快通道", recommended: false, decisionIndexes: [], eventIndexes: [0] },
  ],
};
