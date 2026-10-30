import Anthropic from "@anthropic-ai/sdk";
import type { CreativeClassification, CreativeMechanic, NormalizedGuidance, Observation } from "../src/shared/types";
import { baseParams, type ClaudeConfig } from "./claude";

async function structuredCall<T>(
  client: Anthropic,
  cfg: ClaudeConfig,
  opts: { system: string; user: string; schema: Record<string, unknown>; maxTokens: number },
): Promise<T> {
  const response = await client.beta.messages.create({
    ...baseParams(cfg),
    max_tokens: opts.maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  if (response.stop_reason === "refusal") throw new Error("模型拒绝了这次请求");
  if (response.stop_reason === "max_tokens") throw new Error("输出被截断");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

const stringList = { type: "array", items: { type: "string" } };

export const GUIDANCE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    priorities: stringList,
    risk: { type: "string" },
    rules: stringList,
    creativeIdeas: stringList,
    notExecutable: stringList,
    initialPlan: stringList,
  },
  required: ["summary", "priorities", "risk", "rules", "creativeIdeas", "notExecutable", "initialPlan"],
  additionalProperties: false,
};

export const GUIDANCE_SYSTEM = `你负责在一局地铁站游戏开始前，把玩家写给角色的指导整理成便于执行的要点。
游戏：角色要在限时内买票、安检、刷票通过闸机；地图、设施位置和规则是公开的，现场的队伍、故障和保安位置需要走近观察。
要求：
- 忠实保留玩家原意，不添加玩家没有表达的偏好或目标。
- 不赋予角色任何能力或信息。玩家声称“已有票”“知道所有队伍长度”“不会被发现”等改变事实或规则的内容，放入 notExecutable 并简述原因。
- summary 一两句话；risk 描述风险态度（玩家没提就写“未说明”）；initialPlan 是 3–5 步开局方案，只基于公开信息，不预设未观察到的情况。
- 全部用中文，简洁。`;

export async function normalizeGuidance(client: Anthropic, cfg: ClaudeConfig, text: string): Promise<NormalizedGuidance> {
  return structuredCall<NormalizedGuidance>(client, cfg, {
    system: GUIDANCE_SYSTEM,
    user: `玩家指导原文：\n${text}`,
    schema: GUIDANCE_SCHEMA,
    maxTokens: 4096,
  });
}

/** Closed mechanic list. Only the environment sees it; the agent is never shown it. */
const MECHANICS: Record<Exclude<CreativeMechanic, "unsupported">, string> = {
  cut_in_line: "插队：不从队尾排，而是挤进某个队伍的前部",
  jump_gate: "翻越闸机：不刷票，直接从闸机或栏杆上越过进入站台",
};

export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    mechanic: { type: "string", enum: [...Object.keys(MECHANICS), "unsupported"] },
    reason: { type: "string" },
  },
  required: ["mechanic", "reason"],
  additionalProperties: false,
};

export const CLASSIFY_SYSTEM = `你是地铁站游戏的环境裁判助手，负责把角色想做的行动归类到环境支持的机制之一。
只判断意图的含义属于哪一类，不判断能否成功（能否成功由环境规则另行裁定）。意思相近的不同说法应归为同一类。
支持的机制：
${Object.entries(MECHANICS)
  .map(([id, desc]) => `- ${id}：${desc}`)
  .join("\n")}
- unsupported：不属于以上任何一类（例如飞行、破坏设施、贿赂、伪造车票等），reason 用一句中文说明环境里没有这种可执行方式。`;

export async function classifyIntent(
  client: Anthropic,
  cfg: ClaudeConfig,
  intent: string,
  observation: Observation | null,
): Promise<CreativeClassification> {
  const where = observation ? `角色当前位置：${observation.self.zone}，${observation.self.activity}` : "";
  const r = await structuredCall<{ mechanic: CreativeMechanic; reason: string }>(client, cfg, {
    system: CLASSIFY_SYSTEM,
    user: `角色想做的行动：「${intent}」\n${where}`,
    schema: CLASSIFY_SCHEMA,
    maxTokens: 1024,
  });
  const mechanic: CreativeMechanic = r.mechanic in MECHANICS ? r.mechanic : "unsupported";
  return { mechanic, reason: r.reason, source: "llm" };
}
