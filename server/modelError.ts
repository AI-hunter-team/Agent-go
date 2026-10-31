/** Classify known errors without returning arbitrary upstream text or credentials. */
export async function modelHttpError(response: Response, fallback = `模型接口错误 ${response.status}，请检查接口配置或稍后重试`): Promise<string> {
  if (![400, 404, 422].includes(response.status)) return fallback;
  let error: { code?: unknown; param?: unknown; message?: unknown };
  try { error = (await response.json())?.error ?? {}; }
  catch { return fallback; }
  const message = typeof error.message === "string" ? error.message : "";
  const prefix = `模型接口错误 ${response.status}：`;
  if (/not supported when using Codex with a ChatGPT account/i.test(message)) {
    return `${prefix}当前上游账号不支持此模型。模型列表不代表实际调用权限，请选择其他对话模型`;
  }
  if (error.code === "model_not_found") {
    return `${prefix}模型不存在或当前账号没有调用权限，请检查模型 ID 或选择其他模型`;
  }
  if (["reasoning_effort", "reasoning.effort", "reasoning"].includes(String(error.param)) && ["unsupported_parameter", "unsupported_value"].includes(String(error.code))) {
    return `${prefix}此模型不支持当前推理强度参数，请使用支持该参数的模型或调整推理配置`;
  }
  if (["tools", "tool_choice", "parallel_tool_calls"].includes(String(error.param)) && error.code === "unsupported_parameter") {
    return `${prefix}此模型不支持所需的工具调用参数，请选择支持工具调用的对话模型`;
  }
  return fallback;
}
