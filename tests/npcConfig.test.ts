import { afterEach, describe, expect, test, vi } from "vitest";
import { createLlm } from "../server/llm";
import {dialogueFixture} from "./fixtures/dialogue";
const request=dialogueFixture();
const value={decision:"refuse",give:null,want:null,reply:"请去队尾排队。",reason:"重视公平。"};
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("session NPC adapters", () => {
  test("uses the configured session model for NPC replies", async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
    vi.stubGlobal("fetch", fetcher);
    const npc = createLlm({
      AGENT_PROVIDER: "openai", AGENT_MODEL: "fixed-npc", OPENAI_BASE_URL: "https://npc.test/v1", OPENAI_API_KEY: "npc-secret",
    });
    expect(npc?.model).toBe("fixed-npc");
    expect(await npc!.respond!(request)).toMatchObject({ ...value, model: "fixed-npc", source: "llm" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://npc.test/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer npc-secret");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "fixed-npc", max_completion_tokens: 1024 });
  });

  test("Kimi K2.6 NPC replies disable thinking and omit unsupported reasoning_effort", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if ("reasoning_effort" in body || body.thinking?.type !== "disabled") {
        return Response.json({ error: { message: "K2.6 requires its own thinking parameter" } }, { status: 400 });
      }
      return Response.json({ model: "kimi-k2.6", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const npc = createLlm({ AGENT_PROVIDER: "openai", AGENT_MODEL: "kimi-k2.6", OPENAI_BASE_URL: "https://npc.test/v1", OPENAI_API_KEY: "npc-secret" });
    expect(await npc!.respond!(request)).toMatchObject({ ...value, model: "kimi-k2.6", source: "llm" });
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ model: "kimi-k2.6", max_completion_tokens: 1024, thinking: { type: "disabled" }, response_format: { type: "json_schema", json_schema: { name: "npc_response", strict: true } } });
    expect(sent).not.toHaveProperty("reasoning_effort");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test.each(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"])("supports a separate Anthropic NPC with %s", async (key) => {
    const fetcher = vi.fn(async () => Response.json({ id: "msg-npc", type: "message", role: "assistant", model: "fixed-claude-npc", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(value) }], usage: { input_tokens: 10, output_tokens: 20 } }));
    vi.stubGlobal("fetch", fetcher);
    const npc = createLlm({ AGENT_PROVIDER: "anthropic", AGENT_MODEL: "fixed-claude-npc", ANTHROPIC_BASE_URL: "https://npc-anthropic.test", [key]: "npc-secret" });
    expect(await npc!.respond!(request)).toMatchObject({ ...value, source: "llm", model: "fixed-claude-npc" });
    const [input, init] = fetcher.mock.calls[0] as unknown as [Request, RequestInit];
    const headers = new Headers(init?.headers ?? input.headers);
    expect(String(input)).toContain("https://npc-anthropic.test/v1/messages");
    expect(headers.get("authorization")).toBe("Bearer npc-secret");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "fixed-claude-npc", max_tokens: 1024 });
    expect(JSON.stringify(init)).not.toContain("agent-secret");
  });

});
