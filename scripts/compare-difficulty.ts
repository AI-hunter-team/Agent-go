import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { Engine } from "../src/sim/engine";

const count = Number(process.argv.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 30);
if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error("--seeds 须为 1–200 的整数");
const cases = [[180, 0], [120, 0], [100, 0], [90, 0], [80, 0], [120, 2], [100, 2], [90, 2], [120, 4], [100, 4], [90, 4], [180, 8]];
const rows = [];
for (const [timeLimitSeconds, extraQueuePeople] of cases) {
  const scores: number[] = []; let queueSeconds = 0; let exhausted = 0;
  for (let seed = 1; seed <= count; seed++) {
    const runner = new GameRunner(new Engine(seed, { timeLimitSeconds, extraQueuePeople }), new HeuristicAgent(), offlineClassifier);
    await runner.runToEnd();
    const report = runner.report(); if (report.score !== null) scores.push(report.score);
    queueSeconds += report.timeBreakdown.queueing;
    if (runner.budgetExhausted) exhausted++;
  }
  scores.sort((a, b) => a - b);
  const median = scores.length ? scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2 : null;
  rows.push({ timeLimitSeconds, extraQueuePeople, seeds: count, successes: scores.length,
    successRatePercent: Math.round(scores.length / count * 1000) / 10, medianSuccessfulSeconds: median === null ? null : Math.round(median * 10) / 10,
    meanQueueingSeconds: Math.round(queueSeconds / count * 10) / 10, decisionBudgetExhausted: exhausted });
}
console.log(JSON.stringify({ agent: "offline orderly heuristic", seeds: `1–${count}`, facilityFailureInterruptsService: true, rows }, null, 2));
