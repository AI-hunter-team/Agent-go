import type Anthropic from "@anthropic-ai/sdk";
import type { AgentAction } from "../src/shared/types";
import { ATTRACTIONS, FACILITIES, NAV_NODES } from "../src/sim/layout";
import { assertSafeText, SafetyError } from "./security";
import { allowsCutIn, UNAVAILABLE_STRATEGY } from "../src/shared/strategyPermissions";

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
  tool("descend_stairs", "过闸后走到 STAIRS_TOP 楼梯入口，再下楼到站台；下楼期间不能改向。", {}),
  tool("take_escalator", "过闸后到 ESCALATOR_TOP 扶梯入口候梯。按先到先上排队，候梯可离队，上扶梯后需乘坐至站台。", {}),
  tool("inspect_attraction", "自主关注当前可见的商业大厅设施。glance 为减速查看 3 秒，linger 需靠近后停留 6 秒；可用正常移动恢复赶路。", {
    attraction: { type: "string", enum: ATTRACTIONS.map(a => a.id) },
    mode: { type: "string", enum: ["glance", "linger"] },
  }),
  tool("request_cut_in", "向附近可见的具体排队乘客请求让位，必须说出话术；NPC 将根据性格与请求决定是否同意。只有同意才移动到该乘客前面，拒绝保留当前位次。", {
    npcId: { type: "string", description: "当前观察 facilities.people 中的乘客 id" },
    message: { type: "string", minLength: 1, maxLength: 200, description: "你直接对这位乘客说的话，最多 200 字" },
  }),
  tool(
    "attempt_creative",
    "尝试常规流程之外的行动，用自然语言描述你想做什么。环境会判断是否可行并按规则结算，可能失败，也可能有后果。",
    { intent: { type: "string", description: "想做的具体行动" } },
  ),
];

export function agentToolsForGuidance(guidance: string): Anthropic.Beta.BetaTool[] {
  return AGENT_TOOLS.filter((tool) => tool.name !== "request_cut_in" || allowsCutIn(guidance));
}

/** Convert a tool call into an action, rejecting anything malformed. */
export function parseToolUse(name: string, input: unknown, availableTools: readonly { name: string }[] = AGENT_TOOLS): { action: AgentAction } | { error: string } {
  if (!availableTools.some((tool) => tool.name === name)) return { error: UNAVAILABLE_STRATEGY };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "工具参数必须是对象" };
  const i = input as Record<string, unknown>;
  const allowed: Record<string, string[]> = {
    move_to: ["target", "reason"], join_queue: ["facility", "reason"], leave_queue: ["reason"],
    wait: ["seconds", "reason"], descend_stairs: ["reason"], take_escalator: ["reason"], inspect_attraction: ["attraction", "mode", "reason"], request_cut_in: ["npcId", "message", "reason"], attempt_creative: ["intent", "reason"],
  };
  if (!Object.hasOwn(allowed, name)) return { error: "未知工具，未执行" };
  if (Object.keys(i).some((key) => !allowed[name].includes(key))) return { error: "工具含有未授权参数，未执行" };
  if (i.reason !== undefined && typeof i.reason !== "string") return { error: "工具的 reason 必须是文字" };
  try { assertSafeText(JSON.stringify(i)); }
  catch (error) {
    if (error instanceof SafetyError) return { error: error.message };
    throw error;
  }
  const why = typeof i.reason === "string" ? i.reason.slice(0, 80) : "";
  switch (name) {
    case "move_to":
      if (typeof i.target === "string" && TARGETS.includes(i.target)) return { action: { type: "move_to", target: i.target, reason: why } };
      return { error: "move_to 的 target 无效" };
    case "join_queue":
      if (typeof i.facility === "string" && FACILITY_IDS.includes(i.facility)) {
        return { action: { type: "join_queue", facility: i.facility, reason: why } };
      }
      return { error: "join_queue 的 facility 无效" };
    case "leave_queue":
      return { action: { type: "leave_queue", reason: why } };
    case "descend_stairs":
      return { action: { type: "descend_stairs", reason: why } };
    case "take_escalator":
      return { action: { type: "take_escalator", reason: why } };
    case "inspect_attraction":
      if (typeof i.attraction === "string" && ATTRACTIONS.some(a => a.id === i.attraction) && (i.mode === "glance" || i.mode === "linger"))
        return { action: { type: "inspect_attraction", attraction: i.attraction, mode: i.mode, reason: why } };
      return { error: "inspect_attraction 需要有效设施和 glance 或 linger 方式" };
    case "request_cut_in":
      if (typeof i.npcId === "string" && /^p\d+$/.test(i.npcId) && typeof i.message === "string" && i.message.trim() && [...i.message].length <= 200) {
        return { action: { type: "request_cut_in", npcId: i.npcId, message: i.message, reason: why } };
      }
      return { error: "request_cut_in 需要可见乘客的 npcId 和 1–200 字话术" };
    case "wait": {
      const s = i.seconds;
      if (typeof s !== "number" || !Number.isFinite(s)) return { error: "wait 的 seconds 无效" };
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
