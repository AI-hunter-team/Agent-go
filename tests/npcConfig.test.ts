import { afterEach, describe, expect, test, vi } from "vitest";
import { createNpcLlm } from "../server/llm";
import type { CutInDialogueRequest } from "../src/shared/types";

const request: CutInDialogueRequest = {
  npc: { id: "p2", trait: "普通乘客", temperament: "重视公平", facility: "TVM-1", queuePosition: 1, queueLength: 2 },
  message: "可以让我先吗？", history: [],
};
const value = { accepted: false, reply: "请去队尾排队。", reason: "重视公平。" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("developer NPC model configuration", () => {
  test.each([
    {},
    { AGENT_PROVIDER: "openai", AGENT_MODEL: "user-agent", OPENAI_API_KEY: "agent-secret" },
    { NPC_MODEL: "npc-model", OPENAI_API_KEY: "agent-secret", ANTHROPIC_API_KEY: "agent-secret" },
    { NPC_OPENAI_API_KEY: "npc-secret" },
    { NPC_MODEL: "   ", NPC_OPENAI_API_KEY: "npc-secret" },
    { NPC_MODEL: "npc-model", NPC_PROVIDER: "openai", NPC_ANTHROPIC_API_KEY: "npc-secret" },
    { NPC_MODEL: "npc-model", NPC_PROVIDER: "anthropic", NPC_OPENAI_API_KEY: "npc-secret" },
  ])("does not inherit Agent models or credentials: %#", (env) => {
    expect(createNpcLlm(env)).toBeNull();
  });

  test("uses the NPC OpenAI endpoint, model and key independently", async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
    vi.stubGlobal("fetch", fetcher);
    const npc = createNpcLlm({
      AGENT_PROVIDER: "anthropic", AGENT_MODEL: "agent-model", OPENAI_BASE_URL: "https://agent.test/v1", OPENAI_API_KEY: "agent-secret",
      NPC_PROVIDER: "openai", NPC_MODEL: "fixed-npc", NPC_OPENAI_BASE_URL: "https://npc.test/v1", NPC_OPENAI_API_KEY: "npc-secret",
    });
    expect(npc?.model).toBe("fixed-npc");
    expect(await npc!.negotiate(request)).toMatchObject({ ...value, model: "fixed-npc", source: "llm" });
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
    const npc = createNpcLlm({ NPC_PROVIDER: "openai", NPC_MODEL: "kimi-k2.6", NPC_OPENAI_BASE_URL: "https://npc.test/v1", NPC_OPENAI_API_KEY: "npc-secret" });
    expect(await npc!.negotiate(request)).toMatchObject({ ...value, model: "kimi-k2.6", source: "llm" });
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ model: "kimi-k2.6", max_completion_tokens: 1024, thinking: { type: "disabled" }, response_format: { type: "json_schema", json_schema: { name: "npc_reply", strict: true } } });
    expect(sent).not.toHaveProperty("reasoning_effort");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test.each(["NPC_ANTHROPIC_API_KEY", "NPC_ANTHROPIC_AUTH_TOKEN"])("supports a separate Anthropic NPC with %s", async (key) => {
    const fetcher = vi.fn(async () => Response.json({ id: "msg-npc", type: "message", role: "assistant", model: "fixed-claude-npc", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(value) }], usage: { input_tokens: 10, output_tokens: 20 } }));
    vi.stubGlobal("fetch", fetcher);
    const npc = createNpcLlm({ NPC_PROVIDER: "anthropic", NPC_MODEL: "fixed-claude-npc", NPC_ANTHROPIC_BASE_URL: "https://npc-anthropic.test", [key]: "npc-secret", ANTHROPIC_BASE_URL: "https://agent.test", ANTHROPIC_API_KEY: "agent-secret" });
    expect(await npc!.negotiate(request)).toMatchObject({ ...value, source: "llm", model: "fixed-claude-npc" });
    const [input, init] = fetcher.mock.calls[0] as unknown as [Request, RequestInit];
    const headers = new Headers(init?.headers ?? input.headers);
    expect(String(input)).toContain("https://npc-anthropic.test/v1/messages");
    expect(headers.get("authorization")).toBe("Bearer npc-secret");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "fixed-claude-npc", max_tokens: 1024 });
    expect(JSON.stringify(init)).not.toContain("agent-secret");
  });

  test("does not inherit the process-wide Anthropic endpoint", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://agent-only.test");
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "msg", type: "message", role: "assistant", model: "fixed-npc", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(value) }], usage: { input_tokens: 1, output_tokens: 1 } }));
    vi.stubGlobal("fetch", fetcher);
    const npc = createNpcLlm({ NPC_PROVIDER: "anthropic", NPC_MODEL: "fixed-npc", NPC_ANTHROPIC_API_KEY: "npc-secret" });
    expect((await npc!.negotiate(request)).source).toBe("llm");
    expect(String(fetcher.mock.calls[0][0])).toContain("https://api.anthropic.com/v1/messages");
  });
});
