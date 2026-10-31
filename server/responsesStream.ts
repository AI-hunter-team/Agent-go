import { parseResponse, type ModelResponse } from "./responsesTypes";

/** Incremental SSE framing, including split UTF-8, CRLF and multi-line data. */
export class SseDecoder {
  private decoder = new TextDecoder();
  private buffer = "";
  private data: string[] = [];
  /** 注册每个完整 SSE data 事件的接收函数。 */
  constructor(private onData: (data: string) => void) {}

  /** 接收字节片段，保留未完成的 UTF-8 字符。 */
  push(bytes: Uint8Array) { this.lines(this.decoder.decode(bytes, { stream: true })); }
  /** 刷新最后一行及尚未分发的事件。 */
  end() {
    this.lines(this.decoder.decode());
    if (this.buffer) this.line(this.buffer.replace(/\r$/, ""));
    this.buffer = "";
    this.dispatch();
  }
  /** 按换行切分输入，并保留跨分块的半行。 */
  private lines(text: string) {
    this.buffer += text;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.line(line);
    }
  }
  /** 收集 data 行，忽略注释与其他 SSE 字段。 */
  private line(line: string) {
    if (!line) this.dispatch();
    else if (line.startsWith("data:")) this.data.push(line.slice(5).replace(/^ /, ""));
  }
  /** 分发一个完整事件，允许多行 data。 */
  private dispatch() {
    if (!this.data.length) return;
    const data = this.data.join("\n"); this.data = [];
    this.onData(data);
  }
}

/** 只采用终态事件携带的完整响应，不将半个动作或重复增量交给模拟器。 */
export async function readResponsesStream(response: Response): Promise<ModelResponse> {
  if (!response.body) throw new Error("模型流式响应为空");
  let result: ModelResponse | null = null;
  const parser = new SseDecoder((data) => {
    if (result) throw new Error("模型流式终止后仍返回数据");
    let chunk;
    try { chunk = JSON.parse(data); } catch { throw new Error("模型流式响应包含无效 JSON"); }
    if (!chunk || typeof chunk.type !== "string") throw new Error("模型流式事件格式无效");
    if (chunk.type === "error") throw new Error("模型流式接口返回错误");
    if (["response.completed", "response.incomplete", "response.failed"].includes(chunk.type)) {
      result = parseResponse(chunk.response);
      if (chunk.type !== "response." + result.status) throw new Error("模型流式结束状态不一致，未执行");
    }
  });
  const reader = response.body.getReader();
  try {
    for (;;) {
      const next = await reader.read().catch(() => { throw new Error("模型流式连接中断，未执行"); });
      if (next.done) break;
      parser.push(next.value);
      // 终态事件结束逻辑响应，不等待网关关闭 TCP。
      if (result) { await reader.cancel().catch(() => undefined); break; }
    }
    parser.end();
    if (!result) throw new Error("模型流式响应中断或缺少结束事件，未执行");
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
