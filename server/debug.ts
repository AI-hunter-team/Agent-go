import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ModelCallDebug, OperationDebug } from "../src/shared/debug";

const context = new AsyncLocalStorage<OperationDebug>();
const elapsed = (start: number) => Math.max(0, performance.now() - start);
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const string = (value: unknown) => typeof value === "string" ? value : null;

export function redactDebug(value: unknown, secrets: string[] = [], depth = 0): unknown {
  if (depth > 30) return "[depth limit]";
  if (typeof value === "string") {
    let text = value;
    for (const secret of secrets.filter(Boolean)) text = text.split(secret).join("[REDACTED]");
    return text.replace(/\bBearer\s+[^\s"']+/gi, "Bearer [REDACTED]").replace(/\bsk-[\w-]{16,}/g, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((v) => redactDebug(v, secrets, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key,
    /authorization|api.?key|auth.?token|password|cookie|secret|signature|^thinking$|reasoning_content/i.test(key)
      ? "[REDACTED]" : redactDebug(v, secrets, depth + 1),
  ]));
  return value;
}

/** Serialized, rotating JSONL output. Logging failures never fail a model decision. */
export class DebugLogger {
  private queue: Promise<void> = Promise.resolve();
  private part = 0;
  constructor(readonly enabled = true, private directory = "logs", private secrets: string[] = [], private maxBytes = 10 * 1024 * 1024) {}

  clean<T>(value: T): T { return redactDebug(value, this.secrets) as T; }

  write(event: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    const line = JSON.stringify(redactDebug({ version: 1, timestamp: new Date().toISOString(), ...event }, this.secrets)) + "\n";
    this.queue = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      let file = this.filename();
      const size = await stat(file).then((s) => s.size).catch(() => 0);
      if (size + Buffer.byteLength(line) > this.maxBytes) { this.part++; file = this.filename(); }
      await appendFile(file, line, { encoding: "utf8", mode: 0o600 });
    }).catch(() => { console.warn("Debug 日志写入失败，请检查日志目录权限或磁盘空间"); });
    return this.queue;
  }

  private filename() { return join(this.directory, `debug-${new Date().toISOString().slice(0, 10)}-${process.pid}-${this.part}.jsonl`); }
}

export async function traceOperation<T>(
  details: Pick<OperationDebug, "operation" | "runId" | "sessionId">,
  input: unknown,
  logger: DebugLogger,
  execute: () => Promise<T>,
): Promise<{ value: T; debug: OperationDebug }> {
  const debug: OperationDebug = { ...details, parameters: (input as { modelParameters?: Record<string, unknown> })?.modelParameters ?? {}, id: randomUUID(), startedAt: new Date().toISOString(), durationMs: 0, calls: [], error: null };
  const started = performance.now();
  return context.run(debug, async () => {
    let value: T | undefined;
    try {
      value = await execute();
      debug.error = (value as { error?: string } | null)?.error ?? null;
    } catch (err) {
      debug.error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      debug.durationMs = elapsed(started);
      await logger.write({ event: "model_operation", debug, input, output: value });
    }
    return { value: value as T, debug: logger.clean(debug) };
  });
}

/** Non-streaming transport timing: header wait includes network, queueing and generation. */
export function debugFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const current = context.getStore();
    if (!current) return fetcher(input, init);
    const body = typeof init?.body === "string" ? init.body : "";
    let params: Record<string, any> = {};
    try { params = JSON.parse(body); } catch { /* Request metadata unavailable. */ }
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const call: ModelCallDebug = {
      id: randomUUID(), endpoint: `${url.origin}${url.pathname}`, model: string(params.model),
      maxOutputTokens: number(params.max_completion_tokens ?? params.max_tokens),
      effort: string(params.reasoning_effort ?? params.output_config?.effort),
      messageCount: Array.isArray(params.messages) ? params.messages.length : 0,
      requestBytes: Buffer.byteLength(body), tools: (params.tools ?? []).map((t: any) => t.function?.name ?? t.name),
      toolChoice: params.tool_choice ?? null, schema: string(params.response_format?.json_schema?.name ?? params.output_config?.format?.type),
      status: null, providerRequestId: null, returnedModel: null, stopReason: null, usage: null,
      waitHeadersMs: 0, readBodyMs: 0, totalMs: 0, error: null,
    };
    current.calls.push(call);
    const start = performance.now();
    let received: number | null = null;
    try {
      const response = await fetcher(input, init);
      received = performance.now();
      call.waitHeadersMs = elapsed(start);
      call.status = response.status;
      call.providerRequestId = response.headers.get("x-request-id") ?? response.headers.get("request-id");
      const text = await response.text();
      call.readBodyMs = elapsed(received);
      try {
        const data = JSON.parse(text);
        call.returnedModel = string(data.model);
        call.stopReason = string(data.choices?.[0]?.finish_reason ?? data.stop_reason);
        const u = data.usage;
        call.usage = u ? {
          inputTokens: u.prompt_tokens ?? (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          outputTokens: u.completion_tokens ?? u.output_tokens ?? 0,
          thinkingTokens: u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.thinking_tokens ?? null,
          cacheReadTokens: u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens ?? 0,
        } : null;
      } catch { /* Never log raw response text or private reasoning. */ }
      if (!response.ok) call.error = `HTTP ${response.status}`;
      return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : text, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    } catch (error) {
      if (received === null) call.waitHeadersMs = elapsed(start);
      else call.readBodyMs = elapsed(received);
      call.error = error instanceof Error ? error.name : "TransportError";
      throw error;
    } finally { call.totalMs = elapsed(start); }
  }) as typeof fetch;
}

export function debugLoggerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new DebugLogger(env.DEBUG_LOG_ENABLED !== "0", env.DEBUG_LOG_DIR || "logs",
    [env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.ANTHROPIC_AUTH_TOKEN].filter((v): v is string => Boolean(v)));
}
