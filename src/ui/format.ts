import type { AgentAction, CreativeMechanic, DecisionUsage } from "../shared/types";

export function describeAction(a: AgentAction | null): string {
  if (!a) return "（无动作）";
  switch (a.type) {
    case "physical_action": {
      const body=`${a.action === "restrain" ? "抓住并控制" : a.action === "release" ? "松开" : a.action === "push" ? "推搡" : a.action === "snatch" ? "抢夺" : a.aim === "knockout" ? "尝试击晕" : "击打"} ${a.npcId}`;
      const speech=a.speech ? `对 ${a.npcId} 说：${a.speech.message}` : "";
      return !speech ? body : a.speechTiming==="after" ? `${body}；然后${speech}` : a.speechTiming==="during" ? `${body}；同时${speech}` : `${speech}；然后${body}`;
    }
    case "act": return `行动：${a.instruction}`;
    case "talk": return `对 ${a.npcId} 说：${a.message}`;
    case "traverse": return a.route === "stairs" ? "下楼梯到站台" : "乘扶梯到站台";
    case "observe": return `观察 ${a.targetId}`;
    case "take": return `拿取 ${a.itemId}`;
    case "give": return `将 ${a.itemId} 给 ${a.npcId}`;
    case "drop": return `放下 ${a.itemId}`;
    case "move_to":
      return `前往 ${a.target}`;
    case "join_queue":
      return `排队 ${a.facility}`;
    case "leave_queue":
      return "离开队伍";
    case "descend_stairs":
      return "下楼梯到站台";
    case "take_escalator":
      return "候梯并乘扶梯到站台";
    case "inspect_attraction":
      return `${a.mode === "glance" ? "减速查看" : "停留欣赏"} ${a.attraction}`;
    case "request_cut_in":
      return `向 ${a.npcId} 请求让位`;
    case "wait":
      return `等待 ${a.seconds} 秒`;
    case "operate_switch":
      return "操作墙边电闸";
    case "attempt_creative":
      return `尝试：${a.intent}`;
  }
}

export const MECHANIC_NAME: Record<CreativeMechanic, string> = {
  cut_in_line: "插队",
  jump_gate: "翻越闸机",
  unsupported: "不支持",
};

export function describeUsage(u: DecisionUsage | null): string {
  if (!u) return "";
  const thinking = u.thinkingTokens === null ? " · 思考用量未返回" : ` · 思考 ${u.thinkingTokens}`;
  return `输入 ${u.inputTokens} · 输出 ${u.outputTokens}${thinking} token`;
}

export const fmtSeconds = (s: number) => `${s.toFixed(1)} 秒`;
