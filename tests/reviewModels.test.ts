import { expect, test } from "vitest";
import { buildReviewInput } from "../src/shared/review";
import { analysis, failedReport } from "./reviewFixture";
import { cfg, fake, jsonResponse, response } from "./responsesSupport";

test("review uses a separate Responses structured request and real usage", async () => {
  const { service, requests } = fake([jsonResponse(analysis, { model: "returned-model" })]);
  const input = buildReviewInput(failedReport());
  const result = await service.review(input);
  expect(result.analysis).toEqual(analysis); expect(result.model).toBe("returned-model");
  expect(result.usage?.inputTokens).toBe(100); expect(requests).toHaveLength(1);
  const body = requests[0].body;
  expect(requests[0].url).toBe("https://api.deepseek.com/responses");
  expect(body.input).toHaveLength(1); expect(body.instructions).toContain("赛后全局");
  expect(body.text.format.type).toBe("json_schema"); expect(body.tools).toBeUndefined();
  expect(body.max_output_tokens).toBe(cfg.maxTokens); expect(body.reasoning.effort).toBe("none");
  expect(body.store).toBe(false);
});

test("draft receives only original guidance and selected strategies through Responses", async () => {
  const { service, requests } = fake([jsonResponse({ guidance: "保留稳妥目标，换队前比较耗时。" })]);
  const result = await service.draftGuidance("稳妥通关", [analysis.strategies[1]]);
  expect(result.guidance).toContain("稳妥");
  const content = requests[0].body.input[0].content as string;
  const data = JSON.parse(content.slice(content.indexOf("\n") + 1));
  expect(data).toEqual({ guidance: "稳妥通关", strategies: [analysis.strategies[1]] });
});

test("incomplete Responses output preserves paid usage without exposing raw output", async () => {
  const { service } = fake([response({ status: "incomplete", model: "returned-model", incomplete_details: { reason: "max_output_tokens" }, output: [] })]);
  await expect(service.review(buildReviewInput(failedReport()))).rejects.toMatchObject({ attempt: {
    operation: "review", status: "error", model: "returned-model", usage: { inputTokens: 100, outputTokens: 30 },
  } });
});

test("invalid review evidence and overlong Unicode drafts reject while retaining usage", async () => {
  const { service } = fake([
    jsonResponse({ ...analysis, turningPoints: [{ ...analysis.turningPoints[0], t: 999 }] }),
    jsonResponse({ guidance: "🚇".repeat(301) }),
  ]);
  await expect(service.review(buildReviewInput(failedReport()))).rejects.toMatchObject({ attempt: { operation: "review", status: "error", usage: { outputTokens: 30 } } });
  await expect(service.draftGuidance("稳妥通关", [analysis.strategies[0]])).rejects.toMatchObject({ attempt: { operation: "draft", status: "error", usage: { outputTokens: 30 } } });
});

test("malformed or refused Responses reviews fail without fabricating advice", async () => {
  for (const value of [jsonResponse({}), response({ output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "refused" }] }] })]) {
    const { service } = fake([value]);
    await expect(service.review(buildReviewInput(failedReport()))).rejects.toThrow();
  }
});
