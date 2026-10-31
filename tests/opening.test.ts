import { expect, test } from "vitest";
import { ResponsesClient, ResponsesLlmService } from "../server/responses";
import { SessionStore } from "../server/sessions";
import { GameRunner } from "../src/agent/runner";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { Engine } from "../src/sim/engine";
import { response, toolCall } from "./responsesSupport";

test("the first model request offers direct facility choices and executes the returned queue action", async () => {
  const requests: Record<string, any>[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(init!.body as string));
    return Response.json(response({ model: "opening-test", output: [toolCall(JSON.stringify({ facility: "TVM-3", reason: "直接前往南侧售票机队尾" }), "opening")] }));
  };
  const service = new ResponsesLlmService(new ResponsesClient("https://example.test/v1", "test-secret", fetcher), {
    model: "opening-test", maxTokens: 4096, reasoningEffort: "none" as const, openaiStream: true,
  });
  const session = new SessionStore().create("", null);
  const engine = new Engine(1);
  const runner = new GameRunner(engine, {
    kind: "llm", decide: (turn) => service.decide(session, turn), dispose: async () => {},
  }, offlineClassifier);
  runner.start();
  await runner.pending;
  expect(requests).toHaveLength(1);
  expect(requests[0].instructions).toContain("从入口的第一步起");
  expect(requests[0].instructions).toContain("导航点是可选目的地");
  expect(requests[0].tools.find((t: any) => t.name === "join_queue").description).toContain("无需先 move_to");
  expect(engine.t).toBe(0);
  expect(engine.player.pos).toEqual({ x: 2, y: 15 });
  expect(engine.player.activity).toMatchObject({ kind: "to_queue", facility: "TVM-3" });
  expect(runner.decisions[0]).toMatchObject({ t: 0, action: { type: "join_queue", facility: "TVM-3" }, result: { ok: true } });
  runner.stop();
});
