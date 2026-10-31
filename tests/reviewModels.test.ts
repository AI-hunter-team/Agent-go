import type Anthropic from "@anthropic-ai/sdk";
import { expect, test } from "vitest";
import { reviewRound, draftReviewGuidance } from "../server/review";
import { OpenAIClient, OpenAILlmService } from "../server/openai";
import { buildReviewInput } from "../src/shared/review";
import { analysis, failedReport } from "./reviewFixture";
const cfg = { model: "deepseek-flash", maxTokens: 4096, maxThinkingTokens: 1024, fallback: false };
const input = () => buildReviewInput(failedReport());

test("Anthropic-compatible review uses a separate structured request and real usage", async () => {
  const calls: Record<string, unknown>[] = [];
  const client = { beta: { messages: { create: async (params: Record<string, unknown>) => {
    calls.push(params);
    return { model: "returned-model", stop_reason: "tool_use", usage: { input_tokens: 100, output_tokens: 90 }, content: [{ type: "tool_use", name: "structured_output", input: analysis }] };
  } } } } as unknown as Anthropic;
  const r = await reviewRound(client, cfg, input());
  expect(r.analysis).toEqual(analysis); expect(r.model).toBe("returned-model"); expect(r.usage?.inputTokens).toBe(100);
  expect(calls).toHaveLength(1); expect((calls[0].messages as unknown[]).length).toBe(1);
  expect(String(calls[0].system)).toContain("赛后全局");
});
test("Anthropic structured draft preserves original intent and enforces Unicode limit", async () => {
  const client = (guidance: string) => ({ beta: { messages: { create: async () => ({ model: "m", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: "text", text: JSON.stringify({ guidance }) }] }) } } }) as unknown as Anthropic;
  expect((await draftReviewGuidance(client("稳妥通关，比较队列"), { ...cfg, model: "claude" }, "稳妥通关", [analysis.strategies[0]])).guidance).toContain("稳妥");
  await expect(draftReviewGuidance(client("快".repeat(301)), { ...cfg, model: "claude" }, "稳妥", [analysis.strategies[0]])).rejects.toThrow();
});
test("OpenAI-compatible review uses JSON schema and retains returned model and usage", async () => {
  const calls: Record<string, unknown>[] = [];
  const client = new OpenAIClient("https://example.test/v1", "fake", async (_url, options) => {
    calls.push(JSON.parse(String(options?.body)));
    return Response.json({ model: "returned-model", choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(analysis) } }], usage: { prompt_tokens: 50, completion_tokens: 40 } });
  });
  const service = new OpenAILlmService(client, cfg);
  const r = await service.review(input());
  expect(r.model).toBe("returned-model"); expect(r.usage?.inputTokens).toBe(50);
  expect(calls[0]).not.toHaveProperty("tools"); expect((calls[0].response_format as { type: string }).type).toBe("json_schema");
});
test("refused/truncated/malformed reviews reject instead of fabricating advice", async () => {
  for (const [finish_reason, content] of [["length", JSON.stringify(analysis)], ["stop", "{}"], ["content_filter", ""]]) {
    const service = new OpenAILlmService(new OpenAIClient("https://example.test", "fake", async () => Response.json({ choices: [{ finish_reason, message: { content } }] })), cfg);
    await expect(service.review(input())).rejects.toThrow();
  }
});
test("OpenAI failed output preserves paid usage without exposing raw content", async () => {
  const service = new OpenAILlmService(new OpenAIClient("https://example.test", "fake", async () => Response.json({ model: "returned-model", usage: { prompt_tokens: 95, completion_tokens: 91 }, choices: [{ finish_reason: "length", message: { content: "private raw output" } }] })), cfg);
  await expect(service.review(input())).rejects.toMatchObject({ attempt: { operation: "review", status: "error", model: "returned-model", usage: { inputTokens: 95, outputTokens: 91 } } });
});
test("Anthropic failed output preserves paid usage after structured validation fails", async () => {
  const client = { beta: { messages: { create: async () => ({ model: "returned-model", stop_reason: "max_tokens", usage: { input_tokens: 89, output_tokens: 87 }, content: [] }) } } } as unknown as Anthropic;
  await expect(reviewRound(client, cfg, input())).rejects.toMatchObject({ attempt: { operation: "review", status: "error", model: "returned-model", usage: { inputTokens: 89, outputTokens: 87 } } });
});
