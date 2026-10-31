import { jsonResponse } from "./responsesSupport";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createLlm } from "../server/llm";
import {dialogueFixture} from "./fixtures/dialogue";
const request=dialogueFixture();
const value={decision:"refuse",give:null,want:null,reply:"请去队尾排队。",reason:"重视公平。"};
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("session NPC adapters", () => {
  test("uses the configured session model for NPC replies", async () => {
    const fetcher = vi.fn(async () => Response.json(jsonResponse(value,{model:"fixed-npc"})));
    vi.stubGlobal("fetch", fetcher);
    const npc = createLlm({
      AGENT_PROVIDER: "openai", AGENT_MODEL: "fixed-npc", OPENAI_BASE_URL: "https://npc.test/v1", OPENAI_API_KEY: "npc-secret",
    });
    expect(npc?.model).toBe("fixed-npc");
    expect(await npc!.respond!(request)).toMatchObject({ ...value, model: "fixed-npc", source: "llm" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://npc.test/v1/responses");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer npc-secret");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "fixed-npc", max_output_tokens: 4096, reasoning: { effort: "none" } });
  });

  test("NPC replies use the unified Responses profile regardless of the model name", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if ("reasoning_effort" in body || "thinking" in body || body.reasoning?.effort !== "none") {
        return Response.json({ error: { message: "expected Responses profile" } }, { status: 400 });
      }
      return Response.json(jsonResponse(value, { model: "kimi-k2.6" }));
    });
    vi.stubGlobal("fetch", fetcher);
    const npc = createLlm({ AGENT_PROVIDER: "openai", AGENT_MODEL: "kimi-k2.6", OPENAI_BASE_URL: "https://npc.test/v1", OPENAI_API_KEY: "npc-secret" });
    expect(await npc!.respond!(request)).toMatchObject({ ...value, model: "kimi-k2.6", source: "llm" });
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ model: "kimi-k2.6", max_output_tokens: 4096, reasoning: { effort: "none" }, text: { format: { name: "npc_response", strict: true } } });
    expect(sent).not.toHaveProperty("reasoning_effort");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

});
