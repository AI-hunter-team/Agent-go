import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { Engine } from "../src/sim/engine";
import { classifyByKeywords } from "../src/sim/intent";
import { DEFAULT_GAME_SETTINGS, resolveGameSettings } from "../src/shared/gameSettings";

// Exercise the production runner (including its decision budget), without a server
// or model. Keep individual seeds so later tasks can detect changed outcomes.
const settings = resolveGameSettings({ ...DEFAULT_GAME_SETTINGS, timeLimitSeconds: Number(process.env.IV2_TIME_LIMIT ?? DEFAULT_GAME_SETTINGS.timeLimitSeconds) });
const runs = [];
for (let seed = 1; seed <= 50; seed++) {
  const engine = new Engine(seed, settings);
  const runner = new GameRunner(engine, new HeuristicAgent(), async (intent) => classifyByKeywords(intent));
  await runner.runToEnd();
  runs.push({ seed, status: engine.status, elapsed: engine.t, score: engine.score, decisions: runner.decisions.length, failReason: engine.failReason });
}

const successful = runs.filter((run) => run.status === "success");
const mean = (values: number[]) => values.length ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length * 1000) / 1000 : null;
console.log(JSON.stringify({
  settings,
  seeds: { first: 1, last: 50 },
  total: runs.length,
  successes: successful.length,
  successRate: successful.length / runs.length,
  meanSuccessSeconds: mean(successful.map((run) => run.score!)),
  meanElapsedSeconds: mean(runs.map((run) => run.elapsed)),
  runs,
}, null, 2));
