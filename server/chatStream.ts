/** Incremental SSE framing, including split UTF-8, CRLF and multi-line data. */
export class SseDecoder {
  private decoder = new TextDecoder();
  private buffer = "";
  private data: string[] = [];
  constructor(private onData: (data: string) => void) {}

  push(bytes: Uint8Array) { this.lines(this.decoder.decode(bytes, { stream: true })); }
  end() {
    this.lines(this.decoder.decode());
    if (this.buffer) this.line(this.buffer.replace(/\r$/, ""));
    this.buffer = "";
    this.dispatch();
  }
  private lines(text: string) {
    this.buffer += text;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.line(line);
    }
  }
  private line(line: string) {
    if (!line) this.dispatch();
    else if (line.startsWith("data:")) this.data.push(line.slice(5).replace(/^ /, ""));
  }
  private dispatch() {
    if (!this.data.length) return;
    const data = this.data.join("\n"); this.data = [];
    this.onData(data);
  }
}

export interface ChatCompletion {
  id?: string;
  model?: string;
  choices?: { finish_reason: string; message: {
    role: "assistant"; content: string | null; refusal?: string | null;
    reasoning_content?: string; reasoning?: string;
    tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  } }[];
  usage?: {
    prompt_tokens?: number; completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

/** Assemble one completed choice. Never expose a partial action to the simulator. */
export async function readChatStream(response: Response): Promise<ChatCompletion> {
  if (!response.body) throw new Error("模型流式响应为空");
  const result: ChatCompletion = { choices: [] };
  const message: NonNullable<ChatCompletion["choices"]>[number]["message"] = { role: "assistant", content: null };
  const tools = new Map<number, NonNullable<typeof message.tool_calls>[number]>();
  let finish: string | null = null;
  let done = false;
  const parser = new SseDecoder((data) => {
    if (done) throw new Error("模型流式终止后仍返回数据");
    if (data === "[DONE]") { done = true; return; }
    let chunk;
    try { chunk = JSON.parse(data); } catch { throw new Error("模型流式响应包含无效 JSON"); }
    if (chunk.error) throw new Error("模型流式接口返回错误");
    if (chunk.id) result.id = chunk.id;
    if (chunk.model) result.model = chunk.model;
    if (chunk.usage) result.usage = chunk.usage;
    for (const choice of chunk.choices ?? []) {
      if (choice.index !== 0) throw new Error("模型流式返回了多个候选，未执行");
      if (choice.finish_reason != null) finish = choice.finish_reason;
      const delta = choice.delta ?? {};
      for (const key of ["content", "refusal", "reasoning_content", "reasoning"] as const) {
        if (typeof delta[key] === "string") message[key] = (message[key] ?? "") + delta[key];
      }
      for (const part of delta.tool_calls ?? []) {
        if (!Number.isInteger(part.index) || part.index < 0) throw new Error("模型流式工具索引无效");
        const tool = tools.get(part.index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
        if (part.type != null && part.type !== "function") throw new Error("模型流式工具类型无效");
        if (typeof part.id === "string") tool.id += part.id;
        if (typeof part.function?.name === "string") tool.function.name += part.function.name;
        if (typeof part.function?.arguments === "string") tool.function.arguments += part.function.arguments;
        tools.set(part.index, tool);
      }
    }
  });
  const reader = response.body.getReader();
  try {
    for (;;) {
      const next = await reader.read().catch(() => { throw new Error("模型流式连接中断，未执行"); });
      if (next.done) break;
      parser.push(next.value);
      // [DONE] closes the logical response; do not wait for a gateway to close TCP.
      if (done) { await reader.cancel().catch(() => undefined); break; }
    }
    parser.end();
    if (!done || !finish) throw new Error("模型流式响应中断或缺少结束标记，未执行");
    if (tools.size) message.tool_calls = [...tools.entries()].sort(([a], [b]) => a - b).map(([, tool]) => tool);
    result.choices = [{ finish_reason: finish, message }];
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
