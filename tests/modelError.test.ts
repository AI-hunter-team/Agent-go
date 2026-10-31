import { expect, test } from "vitest";
import { modelHttpError } from "../server/modelError";

test("explains the reproduced account/model rejection without echoing upstream text", async () => {
  const result = await modelHttpError(Response.json({ error: { type: "invalid_request_error", message: "The 'gpt-5.5' model is not supported when using Codex with a ChatGPT account. PRIVATE-KEY" } }, { status: 400 }));
  expect(result).toContain("当前上游账号不支持此模型");
  expect(result).toContain("模型列表不代表实际调用权限");
  expect(result).not.toMatch(/PRIVATE|gpt-5.5/);
});

test.each([
  [{ code: "model_not_found" }, "没有调用权限"],
  [{ code: "unsupported_value", param: "reasoning_effort" }, "推理强度"],
  [{ code: "unsupported_parameter", param: "tools" }, "工具调用"],
])("classifies known parameter/model failures using fixed safe hints %#", async (error, hint) => {
  const result = await modelHttpError(Response.json({ error: { ...error, message: "PRIVATE-KEY" } }, { status: 400 }));
  expect(result).toContain(hint);
  expect(result).not.toContain("PRIVATE");
});

test.each([
  () => Response.json({ error: { message: "PRIVATE-KEY", param: "PRIVATE-KEY", code: "PRIVATE-KEY" } }, { status: 400 }),
  () => new Response("PRIVATE-KEY", { status: 400 }),
  () => Response.json({ error: null }, { status: 422 }),
  () => Response.json({ error: { code: "model_not_found", message: "PRIVATE-KEY" } }, { status: 500 }),
])("unknown and malformed errors remain generic without raw upstream text %#", async (response) => {
  const result = await modelHttpError(response());
  expect(result).toMatch(/^模型接口错误 (400|422|500)，/);
  expect(result).not.toContain("PRIVATE");
});
