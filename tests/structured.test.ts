import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { classifyIntent, normalizeGuidance } from "../server/structured";
import { SAFETY_SYSTEM_PROMPT } from "../server/security";

const cfg = { model: "claude-opus-5-5", maxTokens: 4096, maxThinkingTokens: 1024, fallback: false };

function fakeClient(text: string, stop_reason = "end_turn") {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client = {
    beta: {
      messages: {
        create: async (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
          calls.push(p);
          return { stop_reason, content: [{ type: "text", text }] };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe("structured calls", () => {
  test("guidance normalization returns the parsed structure via a JSON schema", async () => {
    const g = { summary: "求稳", priorities: ["稳定"], risk: "保守", rules: [], creativeIdeas: [], notExecutable: [], initialPlan: ["去售票机"] };
    const { client, calls } = fakeClient(JSON.stringify(g));
    expect(await normalizeGuidance(client, cfg, "稳一点")).toEqual(g);
    expect(calls[0].output_config?.format?.type).toBe("json_schema");
    expect(calls[0].fallbacks).toBeUndefined();
    expect(String(calls[0].system).startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
  });

  test("classification is constrained to the closed mechanic list", async () => {
    const { client, calls } = fakeClient(JSON.stringify({ mechanic: "jump_gate", reason: "翻越" }));
    expect(await classifyIntent(client, cfg, "从栏杆上跨过去", null)).toEqual({ mechanic: "jump_gate", reason: "翻越", source: "llm" });
    const schema = calls[0].output_config?.format?.schema as { properties: { mechanic: { enum: string[] } } };
    expect(schema.properties.mechanic.enum).toEqual(["cut_in_line", "jump_gate", "unsupported"]);
    expect(String(calls[0].system).startsWith(SAFETY_SYSTEM_PROMPT)).toBe(true);
  });

  test("refusals and truncation raise so the API falls back to keywords", async () => {
    await expect(classifyIntent(fakeClient("", "refusal").client, cfg, "x", null)).rejects.toThrow();
    await expect(normalizeGuidance(fakeClient("{", "max_tokens").client, cfg, "x")).rejects.toThrow();
  });
});
