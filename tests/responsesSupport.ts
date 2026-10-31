import { ResponsesClient, ResponsesLlmService } from "../server/responses";
import { configFromEnv, type ModelSettings } from "../server/modelSettings";
import type { ModelResponse, ResponseItem } from "../server/responsesTypes";
import { Engine } from "../src/sim/engine";

export const cfg = configFromEnv({});
let serial = 0;
/** 生成带唯一 call_id 的动作，便于验证多轮协议。 */
export function toolCall(args = '{"facility":"TVM-1","reason":"先买票"}', id = "call-" + ++serial, name = "join_queue"): ResponseItem {
  return { type: "function_call", call_id: id, name, arguments: args, status: "completed" };
}
/** 构造官方形状的终态响应，覆盖真实 usage 字段。 */
export function response(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return { id: "resp-" + ++serial, status: "completed", model: cfg.model, output: [toolCall()],
    usage: { input_tokens: 100, output_tokens: 30, input_tokens_details: { cached_tokens: 50 }, output_tokens_details: { reasoning_tokens: 10 } }, ...overrides };
}
/** 将结构化业务结果包装为 Responses 文本消息。 */
export function jsonResponse(value: unknown, overrides: Partial<ModelResponse> = {}): ModelResponse {
  return response({ output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value) }] }], ...overrides });
}
/** 提供固定种子的角色观察。 */
export function turn() { return { triggers: [], lastResult: null, observation: new Engine(1).observe() }; }
/** 拦截上游请求，测试绝不接触真实服务或付费模型。 */
export function fake(responses: (ModelResponse | Response | object)[], settings: ModelSettings = cfg) {
  const requests: { url: string; init: RequestInit; body: Record<string, any> }[] = [];
  const fetcher = (async (url, init) => {
    requests.push({ url: String(url), init: init!, body: JSON.parse(init!.body as string) });
    const next = responses.shift();
    return next instanceof Response ? next : Response.json(next);
  }) as typeof fetch;
  return { requests, service: new ResponsesLlmService(new ResponsesClient("https://api.deepseek.com/", "test-secret", fetcher, { stream: settings.openaiStream }), settings) };
}
