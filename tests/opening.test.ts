import { expect, test } from "vitest";
import { OpenAIClient, OpenAILlmService } from "../server/openai";
import { SessionStore } from "../server/sessions";
import { GameRunner } from "../src/agent/runner";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { Engine } from "../src/sim/engine";

test("the first model request offers direct facility choices and executes the returned queue action", async () => {
  const requests: Record<string, any>[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(init!.body as string));
    return Response.json({
      model: "opening-test", choices: [{ finish_reason: "tool_calls", message: {
        role: "assistant", content: null, tool_calls: [{
          id: "opening", type: "function", function: {
            name: "join_queue", arguments: JSON.stringify({ facility: "TVM-3", reason: "直接前往南侧售票机队尾" }),
          },
        }],
      } }],
    });
  };
  const service = new OpenAILlmService(new OpenAIClient("https://example.test/v1", "test-secret", fetcher), {
    model: "opening-test", maxTokens: 4096, maxThinkingTokens: 1024, fallback: false,
  });
  const session = new SessionStore().create("", null);
  const engine = new Engine(1);
  const runner = new GameRunner(engine, {
    kind: "llm", decide: (turn) => service.decide(session, turn), dispose: async () => {},
  }, offlineClassifier);
  runner.start();
  await runner.pending;
  expect(requests).toHaveLength(1);
  expect(requests[0].messages[0].content).toContain("从入口的第一步起");
  expect(requests[0].messages[0].content).toContain("导航点是可选目的地");
  expect(requests[0].tools.find((t: any) => t.function.name === "join_queue").function.description).toContain("无需先 move_to");
  expect(engine.t).toBe(0);
  expect(engine.player.pos).toEqual({ x: 2, y: 15 });
  expect(engine.player.activity).toMatchObject({ kind: "to_queue", facility: "TVM-3" });
  expect(runner.decisions[0]).toMatchObject({ t: 0, action: { type: "join_queue", facility: "TVM-3" }, result: { ok: true } });
  runner.stop();
});
