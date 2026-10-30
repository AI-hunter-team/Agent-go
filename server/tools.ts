import type Anthropic from "@anthropic-ai/sdk";
import type { AgentAction } from "../src/shared/types";
import { FACILITIES, NAV_NODES } from "../src/sim/layout";

const FACILITY_IDS = FACILITIES.map((f) => f.id);
const TARGETS = [...NAV_NODES.map((n) => n.id), ...FACILITY_IDS];

const reason = {
  type: "string",
  description: "给玩家看的一句话决策理由，不超过 40 字",
} as const;

function tool(name: string, description: string, properties: Record<string, unknown>): Anthropic.Beta.BetaTool {
  return {
    name,
    description,
    strict: true,
    input_schema: {
      type: "object",
      properties: { ...properties, reason },
      required: [...Object.keys(properties), "reason"],
      additionalProperties: false,
    },
  };
}

/** Kept in a fixed order so the prompt prefix stays cacheable. */
export const AGENT_TOOLS: Anthropic.Beta.BetaTool[] = [
  tool("move_to", "走到某个地点或某个设施附近。如果正在排队，会离开队伍并失去位次。", {
    target: { type: "string", enum: TARGETS, description: "地点编号或设施编号" },
  }),
  tool("join_queue", "走到设施的队尾并加入排队；排到队首后自动办理。对当前所在队伍调用表示继续排队。", {
    facility: { type: "string", enum: FACILITY_IDS },
  }),
  tool("leave_queue", "离开当前队伍（失去位次）。", {}),
  tool("wait", "等待若干秒（1–20）后重新评估。正在走路或排队时调用不会打断当前动作。", {
    seconds: { type: "integer", description: "1 到 20 之间的整数" },
  }),
  tool(
    "attempt_creative",
    "尝试常规流程之外的行动，用自然语言描述你想做什么。环境会判断是否可行并按规则结算，可能失败，也可能有后果。",
    { intent: { type: "string", description: "想做的具体行动" } },
  ),
];

/** Convert a tool call into an action, rejecting anything malformed. */
export function parseToolUse(name: string, input: unknown): { action: AgentAction } | { error: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  const why = typeof i.reason === "string" ? i.reason.slice(0, 80) : "";
  switch (name) {
    case "move_to":
      if (typeof i.target === "string" && TARGETS.includes(i.target)) return { action: { type: "move_to", target: i.target, reason: why } };
      return { error: `move_to 的 target 无效：${String(i.target)}` };
    case "join_queue":
      if (typeof i.facility === "string" && FACILITY_IDS.includes(i.facility)) {
        return { action: { type: "join_queue", facility: i.facility, reason: why } };
      }
      return { error: `join_queue 的 facility 无效：${String(i.facility)}` };
    case "leave_queue":
      return { action: { type: "leave_queue", reason: why } };
    case "wait": {
      const s = Number(i.seconds);
      if (!Number.isFinite(s)) return { error: "wait 的 seconds 无效" };
      return { action: { type: "wait", seconds: Math.min(20, Math.max(1, Math.round(s))), reason: why } };
    }
    case "attempt_creative":
      if (typeof i.intent === "string" && i.intent.trim()) {
        return { action: { type: "attempt_creative", intent: i.intent.slice(0, 200), reason: why } };
      }
      return { error: "attempt_creative 缺少 intent" };
    default:
      return { error: `未知工具 ${name}` };
  }
}
