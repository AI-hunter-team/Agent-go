import { expect, test } from "vitest";
import { readChatStream, SseDecoder } from "../server/chatStream";
import { OpenAIClient, OpenAILlmService } from "../server/openai";
import { SessionStore } from "../server/sessions";
import { Engine } from "../src/sim/engine";

const event = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`;
const delta = (value: object, finish_reason: string | null = null) => ({ id: "chat-1", model: "returned", choices: [{ index: 0, delta: value, finish_reason }] });
const chunks = [
  delta({ role: "assistant", reasoning_content: "简短判断" }),
  delta({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "join_queue", arguments: '{"facility":' } }] }),
  delta({ tool_calls: [{ index: 0, function: { arguments: '"TVM-1","reason":"先买票"}' } }] }),
  delta({}, "tool_calls"),
  { choices: [], usage: { prompt_tokens: 200, completion_tokens: 60, completion_tokens_details: { reasoning_tokens: 20 } } },
];
function sse(text: string, fragment = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += fragment) controller.enqueue(bytes.slice(i, i + fragment));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}
const stream = (values: unknown[] = chunks, done = true) => sse(values.map(event).join("") + (done ? "data: [DONE]\n\n" : ""));
const turn = () => ({ triggers: [], lastResult: null, observation: new Engine(1).observe() });
const cfg = { model: "gpt-6-luna", maxTokens: 4096, maxThinkingTokens: 1024, fallback: false, reasoningEffort: "none" as const };

test("SSE framing preserves multi-line data, comments and split UTF-8", () => {
  const values: string[] = []; const parser = new SseDecoder((s) => values.push(s));
  for (const byte of new TextEncoder().encode(': keepalive\r\ndata: 中文\r\ndata: 第二行\r\n\r\n')) parser.push(new Uint8Array([byte]));
  parser.end(); expect(values).toEqual(["中文\n第二行"]);
});

test("fragmented streaming tools, exposed reasoning and late usage become one validated decision", async () => {
  let body: any;
  const client = new OpenAIClient("https://example.test/v1", "test", (async (_url, init) => { body = JSON.parse(init!.body as string); return stream(); }) as typeof fetch);
  const result = await new OpenAILlmService(client, cfg).decide(new SessionStore().create("", null), turn());
  expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true }, reasoning_effort: "none" });
  expect(result.action).toEqual({ type: "join_queue", facility: "TVM-1", reason: "先买票" });
  expect(result.thinking).toBe("简短判断");
  expect(result.usage).toMatchObject({ inputTokens: 200, outputTokens: 60, thinkingTokens: 20 });
  expect(result.output).toMatchObject({ id: "chat-1", stopReason: "tool_calls" });
});

test.each([
  [() => stream(chunks, false), "中断"],
  [() => stream(chunks.slice(0, 3)), "结束"],
  [() => sse("data: not JSON\n\ndata: [DONE]\n\n"), "JSON"],
  [() => stream([{ error: { message: "test-secret" } }]), "接口返回错误"],
  [() => stream([delta({ tool_calls: [{ index: -1 }] })]), "索引"],
  [() => stream([{ choices: [{ index: 1, delta: {} }] }]), "多个候选"],
])("rejects incomplete or invalid streams without executing a partial tool %#", async (response, error) => {
  const client = new OpenAIClient("https://example.test/v1", "test-secret", (async () => response()) as typeof fetch);
  const result = await new OpenAILlmService(client, cfg).decide(new SessionStore().create("", null), turn());
  expect(result.action).toBeNull(); expect(result.error).toContain(error); expect(result.error).not.toContain("test-secret");
});

test("length, multiple tools and reasoning overrun still reject with usage retained", async () => {
  const variants = [
    [...chunks.slice(0, 3), delta({}, "length"), chunks[4]],
    [...chunks.slice(0, 3), delta({ tool_calls: [{ index: 1, id: "call_2", type: "function", function: { name: "wait", arguments: '{"seconds":1,"reason":"等"}' } }] }), ...chunks.slice(3)],
    [...chunks.slice(0, 4), { choices: [], usage: { completion_tokens_details: { reasoning_tokens: 1025 } } }],
  ];
  for (const values of variants) {
    const client = new OpenAIClient("https://example.test/v1", "test", (async () => stream(values)) as typeof fetch);
    const result = await new OpenAILlmService(client, cfg).decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull(); expect(result.error).toBeTruthy(); expect(result.usage).not.toBeNull();
  }
});

test("can disable streaming and accepts JSON-only compatible gateways", async () => {
  let body: any;
  const client = new OpenAIClient("https://example.test/v1", "test", (async (_url, init) => { body = JSON.parse(init!.body as string); return Response.json({ choices: [] }); }) as typeof fetch, { stream: false });
  await client.complete({ model: "x" });
  expect(body).not.toHaveProperty("stream"); expect(body).not.toHaveProperty("stream_options");
});

test("a completed empty stream is diagnosed without inventing usage or poisoning retry history", async () => {
  const client = new OpenAIClient("https://example.test/v1", "test", (async () => stream([
    delta({ role: "assistant" }), delta({ content: "" }, "stop"),
  ])) as typeof fetch);
  const session = new SessionStore().create("", null);
  const result = await new OpenAILlmService(client, cfg).decide(session, turn());
  expect(result.action).toBeNull();
  expect(result.error).toContain("空响应");
  expect(result.usage).toBeNull();
  expect(result.output).toMatchObject({ stopReason: "stop", content: [{ role: "assistant", content: "" }] });
  expect(session.chatMessages.map((message) => message.role)).toEqual(["user"]);
});

test("logical DONE cancels a transport that stays open", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(chunks.map(event).join("") + "data: [DONE]\n\n"));
  }, cancel() { cancelled = true; } }));
  expect((await readChatStream(response)).usage?.completion_tokens).toBe(60);
  expect(cancelled).toBe(true);
});


test("stream read errors do not leak upstream text or credentials", async () => {
  const client = new OpenAIClient("https://example.test/v1", "secret", (async () => new Response(new ReadableStream({ start(controller) {
    controller.error(new Error("secret raw transport detail"));
  } }), { headers: { "content-type": "text/event-stream" } })) as typeof fetch);
  const result = await new OpenAILlmService(client, cfg).decide(new SessionStore().create("", null), turn());
  expect(result.action).toBeNull(); expect(result.error).toContain("连接中断"); expect(result.error).not.toContain("secret");
});
