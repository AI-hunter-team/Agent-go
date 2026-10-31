import { afterEach, describe, expect, test, vi } from "vitest";
import { createNpcLlm } from "../server/llm";
import type { CutInDialogueRequest } from "../src/shared/types";
import { jsonResponse } from "./responsesSupport";

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
  ])("does not inherit Agent models or credentials: %#", (env) => {
    expect(createNpcLlm(env)).toBeNull();
  });

  test("uses the NPC OpenAI endpoint, model and key independently", async () => {
    const fetcher = vi.fn(async () => Response.json(jsonResponse(value, { model: "fixed-npc" })));
    vi.stubGlobal("fetch", fetcher);
    const npc = createNpcLlm({
      AGENT_PROVIDER: "anthropic", AGENT_MODEL: "agent-model", OPENAI_BASE_URL: "https://agent.test/v1", OPENAI_API_KEY: "agent-secret",
      NPC_PROVIDER: "openai", NPC_MODEL: "fixed-npc", NPC_OPENAI_BASE_URL: "https://npc.test/v1", NPC_OPENAI_API_KEY: "npc-secret",
    });
    expect(npc?.model).toBe("fixed-npc");
    expect(await npc!.negotiate(request)).toMatchObject({ ...value, model: "fixed-npc", source: "llm" });
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
    const npc = createNpcLlm({ NPC_PROVIDER: "openai", NPC_MODEL: "kimi-k2.6", NPC_OPENAI_BASE_URL: "https://npc.test/v1", NPC_OPENAI_API_KEY: "npc-secret" });
    expect(await npc!.negotiate(request)).toMatchObject({ ...value, model: "kimi-k2.6", source: "llm" });
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ model: "kimi-k2.6", max_output_tokens: 4096, reasoning: { effort: "none" }, text: { format: { type: "json_schema", name: "npc_reply", strict: true } } });
    expect(sent).not.toHaveProperty("reasoning_effort");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test.each(["NPC_ANTHROPIC_API_KEY", "NPC_ANTHROPIC_AUTH_TOKEN"])("requires explicit migration of legacy NPC %s", (key) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(() => createNpcLlm({ NPC_PROVIDER: "anthropic", NPC_MODEL: "fixed-claude-npc", [key]: "npc-secret" })).toThrow("NPC Anthropic 原生通道已停用");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("does not inherit the process-wide Agent endpoint or reasoning", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://agent-only.test");
    vi.stubEnv("OPENAI_REASONING_EFFORT", "max");
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(jsonResponse(value, { model: "fixed-npc" })));
    vi.stubGlobal("fetch", fetcher);
    const npc = createNpcLlm({ NPC_MODEL: "fixed-npc", NPC_OPENAI_API_KEY: "npc-secret" });
    expect((await npc!.negotiate(request)).source).toBe("llm");
    expect(String(fetcher.mock.calls[0][0])).toBe("https://api.deepseek.com/responses");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).reasoning.effort).toBe("none");
  });
});
