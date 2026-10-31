import { expect, test, vi } from "vitest";
import { Api } from "../src/agent/remoteAgent";
import { turn } from "./responsesSupport";

test("browser switching and clearing models keep old session tokens until disposal", async () => {
  const calls: { path: string; method: string; token: string | null; body: any }[] = [];
  let nextSession = 0;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({ path, method: init.method!, token: headers.get("x-model-config"), body: init.body ? JSON.parse(String(init.body)) : null });
    if (path === "/api/session") return Response.json({ sessionId: "s" + ++nextSession });
    if (path === "/api/model/enable") return Response.json({ llm: true, model: "test-model" });
    return Response.json({ llm: false, model: null });
  });
  try {
    await Api.enableModel("a", "test-model");
    const first = await Api.createSession("", null);
    await Api.enableModel("b", "test-model", "max");
    const second = await Api.createSession("", null);
    await Api.clearModel();
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([]);
    await Api.decide(first.sessionId, turn());
    await Api.decide(second.sessionId, turn());
    expect(calls.filter((call) => call.path === "/api/agent/decide").map((call) => call.token)).toEqual(["a", "b"]);
    expect(calls.filter((call) => call.path === "/api/model/enable").map((call) => call.body.reasoningEffort)).toEqual(["none", "max"]);
    await Api.deleteSession(first.sessionId);
    await Api.deleteSession(second.sessionId);
    expect(calls.filter((call) => call.path === "/api/model/config").map((call) => call.token)).toEqual(["a", "b"]);
  } finally { vi.unstubAllGlobals(); }
});
