import type { AgentAction, CreativeMechanic, DecisionUsage } from "../shared/types";

export function describeAction(a: AgentAction | null): string {
  if (!a) return "（无动作）";
  switch (a.type) {
    case "move_to":
      return `前往 ${a.target}`;
    case "join_queue":
      return `排队 ${a.facility}`;
    case "leave_queue":
      return "离开队伍";
    case "descend_stairs":
      return "下楼梯到站台";
    case "request_cut_in":
      return `向 ${a.npcId} 请求让位`;
    case "wait":
      return `等待 ${a.seconds} 秒`;
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
