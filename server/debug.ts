import { SseDecoder } from "./responsesStream";
import { responseStopReason, responseUsage } from "./responsesTypes";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ModelCallDebug, OperationDebug } from "../src/shared/debug";

const context = new AsyncLocalStorage<OperationDebug>();
/** 计算非负耗时。 */
const elapsed = (start: number) => Math.max(0, performance.now() - start);
/** 只记录真实数值，缺失字段保留未知。 */
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
/** 只接收字符串诊断字段。 */
const string = (value: unknown) => typeof value === "string" ? value : null;

/** 脱敏凭据与推理内容，保留计数和公开诊断信息。 */
export function redactDebug(value: unknown, secrets: string[] = [], depth = 0): unknown {
  if (depth > 30) return "[depth limit]";
  if (typeof value === "string") {
    let text = value;
    for (const secret of secrets.filter(Boolean)) text = text.split(secret).join("[REDACTED]");
    return text.replace(/\bBearer\s+[^\s"']+/gi, "Bearer [REDACTED]").replace(/\bsk-[\w-]{16,}/g, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((v) => redactDebug(v, secrets, depth + 1));
  if (value && typeof value === "object" && ["reasoning", "reasoning_text"].includes(String((value as { type?: unknown }).type))) {
    return { type: (value as { type: string }).type, content: "[REDACTED]" };
  }
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key,
    /authorization|api.?key|auth.?token|password|cookie|secret|signature|encrypted_content|^thinking$|reasoning_content/i.test(key)
      ? "[REDACTED]" : redactDebug(v, secrets, depth + 1),
  ]));
  return value;
}

/** Serialized, rotating JSONL output. Logging failures never fail a model decision. */
export class DebugLogger {
  private queue: Promise<void> = Promise.resolve();
  private part = 0;
  /** 配置日志目录、敏感值和轮转大小。 */
  constructor(readonly enabled = true, private directory = "logs", private secrets: string[] = [], private maxBytes = 10 * 1024 * 1024) {}

  /** 为 API 展示生成脱敏副本。 */
  clean<T>(value: T): T { return redactDebug(value, this.secrets) as T; }

  /** 串行写入脱敏事件，日志故障不影响游戏。 */
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

  /** 为当前轮转片段生成文件名。 */
  private filename() { return join(this.directory, `debug-${new Date().toISOString().slice(0, 10)}-${process.pid}-${this.part}.jsonl`); }
}

/** 将一次业务操作与其上游请求关联，并记录实际模型参数。 */
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

/** Preserve streaming bodies: diagnostics must not buffer the model response. */
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
      maxOutputTokens: number(params.max_output_tokens),
      effort: string(params.reasoning?.effort),
      messageCount: (Array.isArray(params.input) ? params.input.length : typeof params.input === "string" ? 1 : 0) + (params.instructions ? 1 : 0),
      requestBytes: Buffer.byteLength(body), tools: (params.tools ?? []).map((t: any) => t.name),
      toolChoice: params.tool_choice ?? null, schema: string(params.text?.format?.name),
      streaming: params.stream === true, firstBodyByteMs: null,
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
      if (!response.ok) call.error = `HTTP ${response.status}`;
      /** 从完整响应提取有界元数据，绝不保存供应商原始错误文字。 */
      const record = (data: any) => {
        if (!data || typeof data !== "object") return;
        call.returnedModel = string(data.model) ?? call.returnedModel;
        call.stopReason = string(responseStopReason(data)) ?? call.stopReason;
        call.usage = responseUsage(data) ?? call.usage;
        if (Array.isArray(data.output)) call.toolCallCount = data.output.filter((item: any) => item?.type === "function_call").length;
        if (data.status === "failed" || data.error) call.error = "模型接口返回失败";
        if (data.status === "incomplete") call.error = "模型响应不完整";
      };
      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        call.streaming = true;
        const summary: NonNullable<ModelCallDebug["streamSummary"]> = { bytes: 0, events: 0, toolCallDeltas: 0, contentChars: 0, doneReceived: false, usageReceived: false };
        call.streamSummary = summary;
        const parser = new SseDecoder((data) => {
          summary.events++;
          try {
            const chunk = JSON.parse(data);
            if (chunk.type === "response.function_call_arguments.delta") summary.toolCallDeltas++;
            if (chunk.type === "response.output_text.delta" && typeof chunk.delta === "string") summary.contentChars += chunk.delta.length;
            summary.doneReceived ||= ["response.completed", "response.incomplete", "response.failed"].includes(chunk.type);
            summary.usageReceived ||= Boolean(chunk.response?.usage);
            record(chunk.response);
          } catch { /* Metadata never changes stream behavior. */ }
        });
        const reader = response.body.getReader();
        /** 更新累计读取时长，不延迟流式透传。 */
        const finish = () => { call.readBodyMs = elapsed(received!); call.totalMs = elapsed(start); };
        const body = new ReadableStream<Uint8Array>({
          /** 读取一个分块并原样传递，同时提取诊断。 */
          async pull(controller) {
            try {
              const next = await reader.read();
              if (next.done) { parser.end(); finish(); controller.close(); reader.releaseLock(); }
              else {
                if (call.firstBodyByteMs === null) call.firstBodyByteMs = elapsed(start);
                summary.bytes += next.value.byteLength;
                parser.push(next.value); finish(); controller.enqueue(next.value);
              }
            } catch (error) {
              call.error = error instanceof Error ? error.name : "TransportError";
              finish(); controller.error(error);
            }
          },
          /** 终态事件后及时释放上游连接。 */
          async cancel(reason) { try { await reader.cancel(reason); } finally { finish(); reader.releaseLock(); } },
        });
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      const text = await response.text();
      call.readBodyMs = elapsed(received);
      try { record(JSON.parse(text)); } catch { /* No raw response in diagnostics. */ }
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

/** 从环境配置日志；仍脱敏遗留凭据，避免升级时意外泄露。 */
export function debugLoggerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new DebugLogger(env.DEBUG_LOG_ENABLED !== "0", env.DEBUG_LOG_DIR || "logs",
    [env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.ANTHROPIC_AUTH_TOKEN].filter((v): v is string => Boolean(v)));
}
