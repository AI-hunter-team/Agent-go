import type { PublicStationMap } from "../src/shared/world";
import type { AgentAction } from "../src/shared/types";
import { ATTRACTIONS, FACILITIES } from "../src/sim/layout";
import { PUBLIC_MOVE_TARGETS } from "./actionKnowledge";
import { assertSafeText, SafetyError } from "./security";
import { parsePhysicalAction } from "../src/sim/actions/physical";

const reason = {
  type: "string",
  description: "给玩家看的一句话决策理由，不超过 40 字",
} as const;

/** 生成供应商无关的 Responses function schema。 */
function tool(name: string, description: string, properties: Record<string, unknown>) {
  return {
    type: "function" as const,
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      properties: { ...properties, reason },
      required: [...Object.keys(properties), "reason"],
      additionalProperties: false,
    },
  };
}

/** Kept in a fixed order so the prompt prefix stays cacheable. */
export function agentTools(map?:PublicStationMap) {
  const FACILITY_IDS=(map?.facilities??FACILITIES).map(f=>f.id), TARGETS=map?[...map.nodes.map(n=>n.id),...FACILITY_IDS,...map.itemSpots.filter(s=>!s.id.startsWith("confiscated-")).map(s=>s.id)]:PUBLIC_MOVE_TARGETS;
  return [
  tool("move_to", "走到某个地点或某个设施当前队尾；可从入口直接选择公开地图中的设施，无需先经过大厅中部等导航点。如果正在排队，会离开队伍并失去位次。", {
    target: { type: "string", enum: TARGETS, description: "地点编号或设施编号" },
  }),
  tool("join_queue", "直接走到设施的队尾并加入排队；无需先 move_to 导航点或设施附近，设施尚不可见时也可依据公开地图选择，实时状态与能否加入由环境裁定。排到队首后自动办理。对当前所在队伍调用表示继续排队。", {
    facility: { type: "string", enum: FACILITY_IDS },
  }),
  tool("leave_queue", "离开当前队伍（失去位次）。", {}),
  tool("wait", "等待若干秒（1–20）后重新评估。行走、排队或办理时保持当前动作；无短时机策略时优先 20 秒以减少无效轮询，到达、办理完成和设施变化等事件仍会提前唤起。", {
    seconds: { type: "integer", description: "1 到 20 之间的整数" },
  }),
  tool("operate_switch", "走到公开地图中的墙边电闸附近后操作电闸。只有 Agent 主动调用才会触发车站熄灯；熄灯持续一段有限时间。", {}),
  tool("traverse", "过闸后从楼梯或扶梯到下层站台，先靠近入口。", {...(map?.routes.some(r=>r.connectorId)?{connectorId:{type:"string",enum:map.routes.flatMap(r=>r.connectorId?[r.connectorId]:[]).filter(Boolean),description:"公开地图中的具体楼扶梯连接器ID"}}:{}),route:{type:"string",enum:["stairs","escalator"]},walking:{type:"boolean",description:"扶梯上是否步行；楼梯忽略"}}),
  tool("observe", "观察可见乘客或保安的表现。保安返回当前朝向与相对视线，不提供隐藏性格、警戒或未来结果。", {targetId:{type:"string"}}),
  tool("take", "靠近并拿取可见物品。", {itemId:{type:"string"}}),
  tool("give", "把持有物交给可见人物。", {itemId:{type:"string"},npcId:{type:"string"}}),
  tool("drop", "放下或丢下持有物。", {itemId:{type:"string"},mode:{type:"string",enum:["place","drop"]}}),
  tool("throw_item", "向目标坐标投掷实际持有物。按6米能力与障碍计算实际落点，目标太远仍可出手但落得较近；离手、飞行、落地后才产生声音。之后观察保安反应，不保证分心。", {itemId:{type:"string"},x:{type:"number"},y:{type:"number"}}),
  tool("talk", "向可见乘客说话、协商或交换。对方自主回复，实际结果由环境裁定。", {npcId:{type:"string"},message:{type:"string",maxLength:200},goal:{type:"string",enum:["chat","ask_ticket","trade","yield","persuade","threaten","bribe"]},offerItemId:{anyOf:[{type:"string"},{type:"null"}]}}),
  tool("inspect_attraction","自主关注可见商业设施；glance 减速 3 秒，linger 停留 6 秒。",{attraction:{type:"string",enum:(map?.attractions??ATTRACTIONS).map(a=>a.id)},mode:{type:"string",enum:["glance","linger"]}}),
  tool("act", "完整保留本次行动的目标、条件、先后和方法，提出具体尝试。需要道具时自主先找取物点、取得后再使用；条件不明不能当成满足。由环境解释和裁定，不能宣布成功。", {instruction:{type:"string",maxLength:1000}}),
  tool("physical_action", "实际尝试推搡、抢夺、击打或控制人物。speechTiming决定语言在动作前、后或同时，没有固定先对话。复杂组合或条件行动用act完整传递玩家原话，禁止丢失先后、目标和条件。", {
    action: { type: "string", enum: ["push", "snatch", "strike", "restrain", "release"] }, npcId: { type: "string" },
    speechTiming: { anyOf: [{ type: "string", enum: ["before", "after", "during"] }, { type: "null" }] },
    aim: { anyOf: [{ type: "string", enum: ["hurt", "knockout"] }, { type: "null" }] },
    itemId: { anyOf: [{ type: "string" }, { type: "null" }] },
    itemKind: { anyOf: [{ type: "string", enum: ["ticket", "coins", "umbrella", "water_bottle", "can", "snack", "backpack"] }, { type: "null" }] },
    speech: { anyOf: [{ type: "object", properties: { message: { type: "string", maxLength: 200 }, goal: { type: "string", enum: ["chat", "ask_ticket", "trade", "yield", "persuade", "threaten", "bribe"] }, offerItemId: { anyOf: [{ type: "string" }, { type: "null" }] } }, required: ["message", "goal", "offerItemId"], additionalProperties: false }, { type: "null" }] },
  }),
];
}
export const AGENT_TOOLS=agentTools();

/** Convert a tool call into an action, rejecting anything malformed. */
export function parseToolUse(name: string, input: unknown, map?:PublicStationMap): { action: AgentAction } | { error: string } {
  const FACILITY_IDS=(map?.facilities??FACILITIES).map(f=>f.id), TARGETS=map?[...map.nodes.map(n=>n.id),...FACILITY_IDS,...map.itemSpots.filter(s=>!s.id.startsWith("confiscated-")).map(s=>s.id)]:PUBLIC_MOVE_TARGETS;
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "工具参数必须是对象" };
  const i = input as Record<string, unknown>;
  const allowed: Record<string, string[]> = {
    throw_item:["itemId","x","y","reason"],
    inspect_attraction:["attraction","mode","reason"],
    act:["instruction","reason"], talk:["npcId","message","goal","offerItemId","reason"], traverse:["route","walking","connectorId","reason"], observe:["targetId","reason"], take:["itemId","reason"], give:["itemId","npcId","reason"], drop:["itemId","mode","reason"],
    physical_action: ["action", "npcId", "aim", "itemId", "itemKind", "speech", "speechTiming", "reason"],
    move_to: ["target", "reason"], join_queue: ["facility", "reason"], leave_queue: ["reason"],
    wait: ["seconds", "reason"], operate_switch: ["reason"],
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
  const text = (v: unknown): v is string => typeof v === "string" && !!v.trim() && [...v].length <= 200;
  switch (name) {
    case "throw_item": if (text(i.itemId) && typeof i.x === "number" && Number.isFinite(i.x) && typeof i.y === "number" && Number.isFinite(i.y)) return {action:{type:"drop",itemId:i.itemId,mode:"throw",atPosition:{x:i.x,y:i.y},reason:why}}; break;
    case "physical_action": {
      const action = parsePhysicalAction({ ...i, type: "physical_action" });
      return action ? { action } : { error: "肢体行动字段无效；击打需 aim，抢夺需 itemKind；台词与动作分别填写" };
    }
    case "act": if (typeof i.instruction === "string" && !!i.instruction.trim() && [...i.instruction].length <= 1000) return {action:{type:"act",instruction:i.instruction,reason:why}}; break;
    case "traverse": if (i.route === "stairs" || i.route === "escalator") return {action:{type:"traverse",route:i.route,...(typeof i.connectorId==="string"?{connectorId:i.connectorId}:{}),...(typeof i.walking === "boolean" ? {walking:i.walking}:{}),reason:why}}; break;
    case "observe": if (text(i.targetId)) return {action:{type:"observe",targetId:i.targetId,reason:why}}; break;
    case "take": if (text(i.itemId)) return {action:{type:"take",itemId:i.itemId,reason:why}}; break;
    case "give": if (text(i.itemId) && text(i.npcId)) return {action:{type:"give",itemId:i.itemId,npcId:i.npcId,reason:why}}; break;
    case "drop": if (text(i.itemId) && (i.mode === "place" || i.mode === "drop")) return {action:{type:"drop",itemId:i.itemId,mode:i.mode,reason:why}}; break;
    case "talk": if (text(i.npcId) && text(i.message) && typeof i.goal === "string" && ["chat","ask_ticket","trade","yield","persuade","threaten","bribe"].includes(i.goal) && (i.offerItemId == null || text(i.offerItemId))) return {action:{type:"talk",npcId:i.npcId,message:i.message,goal:i.goal as import("../src/shared/types").TalkGoal,...(i.offerItemId ? {offerItemId:i.offerItemId as string}:{}),reason:why}}; break;

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
    case "operate_switch":
      return { action: { type: "operate_switch", reason: why } };
    case "inspect_attraction":
      if (typeof i.attraction === "string" && (map?.attractions??ATTRACTIONS).some(a => a.id === i.attraction) && (i.mode === "glance" || i.mode === "linger"))
        return { action: { type: "inspect_attraction", attraction: i.attraction, mode: i.mode, reason: why } };
      return { error: "inspect_attraction 需要有效设施和 glance 或 linger 方式" };
    case "wait": {
      const s = i.seconds;
      if (typeof s !== "number" || !Number.isFinite(s)) return { error: "wait 的 seconds 无效" };
      return { action: { type: "wait", seconds: Math.min(20, Math.max(1, Math.round(s))), reason: why } };
    }
    default:
      return { error: `未知工具 ${name}` };
  }
  return {error:"工具参数无效"};
}
