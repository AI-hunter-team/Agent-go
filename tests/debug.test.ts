import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { DebugLogger, debugFetch, redactDebug, traceOperation } from "../server/debug";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });
async function directory() { const dir = await mkdtemp(join(tmpdir(), "agent-debug-")); directories.push(dir); return dir; }
const details = { operation: "decide" as const, runId: "run-1", sessionId: "session-1" };

describe("debug persistence and redaction", () => {
  test("redacts nested credentials, bearer values and private reasoning", () => {
    const text = JSON.stringify(redactDebug({ authorization: "credential", apiKey: "custom", nested: ["Bearer topsecret", "custom credential"], thinking: "private chain", signature: "sig", thinkingTokens: 10 }, ["custom credential"]));
    expect(text).not.toMatch(/topsecret|custom credential|private chain|credential|"sig"/);
    expect(text).toContain('"thinkingTokens":10');
  });

  test("writes ordered sanitized JSONL and rotates files", async () => {
    const dir = await directory();
    const logger = new DebugLogger(true, dir, ["sensitive-value"], 180);
    await Promise.all(Array.from({ length: 5 }, (_, index) => logger.write({ event: "test", index, error: "sensitive-value" })));
    const files = (await readdir(dir)).sort();
    expect(files.length).toBeGreaterThan(1);
    const text = (await Promise.all(files.map((file) => readFile(join(dir, file), "utf8")))).join("");
    const records = text.trim().split("\n").map((line) => JSON.parse(line));
    expect(records.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
    expect(text).not.toContain("sensitive-value");
  });

  test("disabled logging creates no files; write failures do not reject operations", async () => {
    const dir = await directory();
    await new DebugLogger(false, join(dir, "disabled")).write({ event: "test" });
    expect(await readdir(dir)).toEqual([]);
    const file = join(dir, "file"); await writeFile(file, "not a directory");
    await expect(new DebugLogger(true, file).write({ event: "test" })).resolves.toBeUndefined();
  });
});

describe("model transport diagnostics", () => {
  test("captures parameters, timing and usage without headers, prompt or raw response", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ model: "luna-returned", choices: [{ finish_reason: "tool_calls", message: { reasoning_content: "PRIVATE" } }], usage: { prompt_tokens: 30, completion_tokens: 10, completion_tokens_details: { reasoning_tokens: 5 } } }), { headers: { "x-request-id": "provider-123" } })) as typeof fetch;
    const fetch = debugFetch(fetcher);
    const { value, debug } = await traceOperation(details, { modelParameters: { maxThinkingTokens: 1024 } }, new DebugLogger(false), async () => {
      const response = await fetch("https://example.test/v1/chat/completions?key=secret", { headers: { authorization: "Bearer secret" }, body: JSON.stringify({ model: "luna", max_completion_tokens: 4096, reasoning_effort: "low", messages: [{ role: "system", content: "PRIVATE PROMPT" }], tools: [{ function: { name: "wait" } }], tool_choice: "required" }) });
      return response.json();
    });
    expect(value.model).toBe("luna-returned");
    expect(debug.calls[0]).toMatchObject({ endpoint: "https://example.test/v1/chat/completions", model: "luna", maxOutputTokens: 4096, effort: "low", messageCount: 1, tools: ["wait"], status: 200, providerRequestId: "provider-123", returnedModel: "luna-returned", stopReason: "tool_calls", usage: { thinkingTokens: 5 } });
    expect(debug.calls[0].totalMs).toBeGreaterThanOrEqual(debug.calls[0].waitHeadersMs);
    expect(debug.durationMs).toBeGreaterThanOrEqual(debug.calls[0].totalMs);
    expect(JSON.stringify(debug)).not.toMatch(/secret|PRIVATE/);
    expect(debug.parameters.maxThinkingTokens).toBe(1024);
  });

  test("concurrent operations keep request IDs and records isolated", async () => {
    const fetch = debugFetch((async (_input, init) => Response.json({ model: JSON.parse(init!.body as string).model })) as typeof globalThis.fetch);
    const results = await Promise.all(["a", "b"].map((id) => traceOperation({ ...details, runId: id }, {}, new DebugLogger(false), () => fetch("https://example.test/v1", { body: JSON.stringify({ model: id }) }))));
    expect(results.map((r) => [r.debug.runId, r.debug.calls.length, r.debug.calls[0].model])).toEqual([["a", 1, "a"], ["b", 1, "b"]]);
  });

  test("failed requests retain elapsed time and sanitize errors persisted and returned", async () => {
    const dir = await directory();
    const logger = new DebugLogger(true, dir, ["custom-key"]);
    const fetch = debugFetch((async () => { throw new Error("custom-key network failure"); }) as typeof globalThis.fetch);
    await expect(traceOperation(details, {}, logger, () => fetch("https://example.test/v1"))).rejects.toThrow();
    const log = JSON.parse((await readFile(join(dir, (await readdir(dir))[0]), "utf8")).trim());
    expect(log.debug.calls[0].error).toBe("Error");
    expect(log.debug.calls[0].totalMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(log)).not.toContain("custom-key");
    const result = await traceOperation(details, {}, logger, async () => ({ error: "custom-key" }));
    expect(result.debug.error).toBe("[REDACTED]");
  });
});
