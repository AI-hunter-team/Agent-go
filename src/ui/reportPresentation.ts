import type { AgentAction, DecisionRecord, GameReport } from "../shared/types";
import { NAV_NODES, FACILITIES, ATTRACTIONS } from "../sim/layout";
import { describeAction } from "./format";

export type DecisionFilter = "all" | "failed" | "retry" | "slow" | "dialogue";

const placeNames = new Map([...NAV_NODES, ...FACILITIES, ...ATTRACTIONS].map(place => [place.id, place.label]));
export function describeReviewAction(action: AgentAction) {
  if (action.type === "move_to") return `前往${placeNames.get(action.target) ?? action.target}`;
  if (action.type === "join_queue") return `在${placeNames.get(action.facility) ?? action.facility}排队`;
  if (action.type === "inspect_attraction") return `${action.mode === "glance" ? "查看" : "停留欣赏"}${placeNames.get(action.attraction) ?? action.attraction}`;
  return describeAction(action);
}

export function reportOutcome(report: GameReport) {
  if (report.status === "success") return { title: "顺利到站", detail: "已下楼到达站台", tone: "success" };
  if (report.failReason === "玩家结束了本局") return { title: "本局已结束", detail: "你主动结束了这次旅程", tone: "stopped" };
  return { title: "这次没能到站", detail: report.failReason ?? "未完成旅程", tone: "failed" };
}

export function decisionAttempts(report: GameReport, decision: DecisionRecord) {
  const attempts = report.attempts?.filter(a => a.decisionIndex === decision.index);
  return attempts?.length ? attempts : decision.attempts ?? [];
}

export function filterDecisions(report: GameReport, filter: DecisionFilter) {
  return report.decisions.filter(d => {
    const attempts = decisionAttempts(report, d);
    if (filter === "failed") return !!d.error || d.result?.ok === false || attempts.some(a => a.status === "error");
    if (filter === "retry") return attempts.some(a => a.attempt > 1 || a.input.retry);
    if (filter === "slow") return d.latencyMs >= 5000 || attempts.some(a => (a.response?.latencyMs ?? 0) >= 5000);
    if (filter === "dialogue") return !!d.dialogue || d.action?.type === "talk" || d.action?.type === "request_cut_in";
    return true;
  });
}
