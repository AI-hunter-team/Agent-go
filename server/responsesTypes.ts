import type { DecisionResult, DecisionUsage } from "../src/shared/types";

export interface ResponsePart {
  type: string;
  text?: string;
  refusal?: string;
  [key: string]: unknown;
}

/** 保留供应商返回的 item，包括不透明的加密推理字段。 */
export interface ResponseItem {
  type: string;
  id?: string;
  role?: string;
  status?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: string | ResponsePart[];
  summary?: ResponsePart[];
  encrypted_content?: string;
  output?: string;
  [key: string]: unknown;
}

export interface ModelResponse {
  id?: string;
  model?: string;
  status: string;
  output: ResponseItem[];
  error?: { code?: string; message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  } | null;
}

/** 检查响应外壳；业务层继续检查具体工具和结构化结果。 */
export function parseResponse(value: unknown): ModelResponse {
  if (!value || typeof value !== "object") throw new Error("模型未返回有效的 Responses 对象");
  const response = value as ModelResponse;
  if (typeof response.status !== "string" || !Array.isArray(response.output)
    || response.output.some((item) => !item || typeof item !== "object" || typeof item.type !== "string")) {
    throw new Error("模型未返回有效的 Responses status/output");
  }
  return response;
}

/** 提取真实计费数据；缺少思考明细时保持未知。 */
export function responseUsage(response: ModelResponse): DecisionUsage | null {
  const u = response.usage;
  return u ? {
    inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0,
    thinkingTokens: u.output_tokens_details?.reasoning_tokens ?? null,
    cacheReadTokens: u.input_tokens_details?.cached_tokens ?? 0,
  } : null;
}

/** 将供应商完成状态和失败原因写入现有报告字段。 */
export function responseStopReason(response: ModelResponse): string {
  return response.incomplete_details?.reason ?? response.error?.code ?? response.status;
}

/** 保存 API 原始 output，不从增量或提示词重建模型思考。 */
export function responseOutput(response: ModelResponse): NonNullable<DecisionResult["output"]> {
  return { id: response.id ?? null, stopReason: responseStopReason(response), content: structuredClone(response.output) };
}

/** 读取供应商实际公开的推理文字或摘要，不解密隐藏内容。 */
export function responseThinking(response: ModelResponse): string | null {
  const text = response.output.filter((item) => item.type === "reasoning").flatMap((item) =>
    [...(Array.isArray(item.content) ? item.content : []), ...(Array.isArray(item.summary) ? item.summary : [])]
      .filter((part) => ["reasoning_text", "summary_text"].includes(part.type) && typeof part.text === "string")
      .map((part) => part.text),
  ).join("\n");
  return text || null;
}

/** 失败、拒绝、截断或超预算的内容不能进入模拟器。 */
export function assertCompleted(response: ModelResponse, maxTokens: number): void {
  if (response.output.some((item) => Array.isArray(item.content) && item.content.some((part) => part.type === "refusal"))
    || response.incomplete_details?.reason === "content_filter") throw new Error("模型拒绝了这次请求");
  if (response.status === "incomplete" || response.output.some((item) => item.status === "incomplete")) {
    throw new Error("模型输出被截断（单次总输出上限 " + maxTokens + " token），未执行");
  }
  if (response.status !== "completed" || response.error) throw new Error("模型响应未成功完成，未执行");
  if ((response.usage?.output_tokens ?? 0) > maxTokens) throw new Error("模型超出单次总输出 " + maxTokens + " token 上限，未执行");
  if (response.output.some((item) => item.status === "in_progress")) throw new Error("模型返回了未完成的输出项，未执行");
}

/** 拼接结构化请求的文本部分，拒绝混入工具等其他输出。 */
export function responseText(response: ModelResponse): string {
  if (response.output.some((item) => !["message", "reasoning"].includes(item.type))) throw new Error("模型未返回有效的结构化文本");
  const text = response.output.filter((item) => item.type === "message").flatMap((item) =>
    Array.isArray(item.content) ? item.content.filter((part) => part.type === "output_text" && typeof part.text === "string").map((part) => part.text) : [],
  ).join("");
  if (!text.trim()) throw new Error("模型未返回结构化内容");
  return text;
}
