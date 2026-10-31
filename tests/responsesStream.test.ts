import { expect, test } from "vitest";
import { readResponsesStream, SseDecoder } from "../server/responsesStream";
import { SessionStore } from "../server/sessions";
import { fake, response, toolCall, turn, cfg } from "./responsesSupport";
import type { ModelResponse } from "../server/responsesTypes";

/** 将多个事件按真实 SSE 帧编码并拆成小块。 */
function stream(values: unknown[], fragment = 7) {
  const bytes = new TextEncoder().encode(values.map((item) => "data: " + JSON.stringify(item) + "\r\n\r\n").join(""));
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += fragment) controller.enqueue(bytes.slice(i, i + fragment));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}
/** 输出增量与终态；终态才是动作和计费的权威数据。 */
function events(final: ModelResponse) {
  return [
    { type: "response.created", response: { id: final.id, status: "in_progress", output: [] } },
    { type: "response.function_call_arguments.delta", delta: '{"facility":' },
    { type: "response.function_call_arguments.delta", delta: '"TVM-1","reason":"先买票"}' },
    { type: "response." + final.status, response: final },
  ];
}

test("SSE framing preserves multiline data, comments and split UTF-8", () => {
  const values: string[] = []; const parser = new SseDecoder((value) => values.push(value));
  for (const byte of new TextEncoder().encode(": keepalive\r\ndata: 中文\r\ndata: 第二行\r\n\r\n")) parser.push(new Uint8Array([byte]));
  parser.end(); expect(values).toEqual(["中文\n第二行"]);
});

test("fragmented tool events use the complete final output exactly once with late usage", async () => {
  const final = response({ output: [{ type: "reasoning", content: [{ type: "reasoning_text", text: "简短判断" }] }, toolCall()] });
  const { service, requests } = fake([stream(events(final))]);
  const result = await service.decide(new SessionStore().create("", null), turn());
  expect(result.action?.type).toBe("join_queue");
  expect(result.thinking).toBe("简短判断");
  expect(result.usage?.outputTokens).toBe(30);
  expect(result.output?.content).toEqual(final.output);
  expect(requests[0].body).not.toHaveProperty("stream_options");
});

test.each(["incomplete", "failed"])("terminal %s retains usage and never executes a tool", async (status) => {
  const final = response({ status, incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null });
  const { service } = fake([stream(events(final))]);
  const result = await service.decide(new SessionStore().create("", null), turn());
  expect(result.action).toBeNull();
  expect(result.error).toBeTruthy();
  expect(result.usage?.outputTokens).toBe(30);
});

test.each([
  { type: "response.function_call_arguments.delta", delta: "{}" },
  { type: "response.completed", response: { status: "failed", output: [] } },
  { type: "error", message: "test-secret" },
  { type: "response.completed", response: { status: "completed" } },
])("missing or malformed terminal event fails closed %#", async (chunk) => {
  const { service } = fake([stream([chunk])]);
  const result = await service.decide(new SessionStore().create("", null), turn());
  expect(result.action).toBeNull(); expect(result.error).toBeTruthy(); expect(result.error).not.toContain("test-secret");
});

test("invalid JSON and transport errors cannot leak upstream text", async () => {
  for (const wire of [
    new Response("data: not-json\n\n", { headers: { "content-type": "text/event-stream" } }),
    new Response(new ReadableStream({ start(controller) { controller.error(new Error("test-secret transport detail")); } }), { headers: { "content-type": "text/event-stream" } }),
  ]) {
    const result = await fake([wire]).service.decide(new SessionStore().create("", null), turn());
    expect(result.action).toBeNull(); expect(result.error).toBeTruthy(); expect(result.error).not.toContain("test-secret");
  }
});

test("logical completion cancels a connection that remains open without DONE", async () => {
  let cancelled = false;
  const final = response();
  const wire = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode("data: " + JSON.stringify({ type: "response.completed", response: final }) + "\n\n"));
  }, cancel() { cancelled = true; } }));
  expect(await readResponsesStream(wire)).toEqual(final);
  expect(cancelled).toBe(true);
});

test("streaming can be disabled and JSON gateways retain the same semantics", async () => {
  const { service, requests } = fake([response()], { ...cfg, openaiStream: false });
  expect((await service.decide(new SessionStore().create("", null), turn())).action).not.toBeNull();
  expect(requests[0].body.stream).toBe(false);
});
