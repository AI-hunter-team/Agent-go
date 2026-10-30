import { useState } from "react";
import type { GameReport, TimeBreakdown } from "../shared/types";
import { MECHANIC_NAME } from "./format";
import { DecisionTrace } from "./DecisionTrace";
import { NpcDialogue } from "./NpcDialogue";
import { DebugPanel } from "./DebugPanel";
import { LEGACY_GAME_SETTINGS } from "../shared/gameSettings";

const SEGMENTS: { key: keyof TimeBreakdown; label: string; color: string }[] = [
  { key: "walking", label: "行走", color: "#1f4e79" },
  { key: "queueing", label: "排队", color: "#c3912f" },
  { key: "service", label: "办理", color: "#6e8a74" },
  { key: "stairs", label: "下楼梯", color: "#7a7194" },
  { key: "waiting", label: "等待", color: "#b8ad94" },
  { key: "creative", label: "创造性行动", color: "#b4533c" },
  { key: "idle", label: "空闲", color: "#d9d3c4" },
];

export function ReportSummary({ report, onRetry, onEdit }: { report: GameReport; onRetry: () => void; onEdit: () => void }) {
  const settings = report.settings ?? LEGACY_GAME_SETTINGS;
  const total = Math.max(0.1, Object.values(report.timeBreakdown).reduce((a, b) => a + b, 0));
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-hunter-report-seed${report.seed}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="card report">
      <div className={report.status === "success" ? "verdict win" : "verdict lose"}>
        {report.status === "success" ? (
          <>
            <span>已下楼到达站台</span>
            <strong>{report.score!.toFixed(1)} 秒</strong>
          </>
        ) : (
          <>
            <span>本局失败 · 无成绩</span>
            <strong className="reason-text">{report.failReason}</strong>
          </>
        )}
      </div>
      <p className="muted">
        种子 {report.seed} · {report.agentKind === "llm" ? "大模型 Agent" : "离线规则 Agent"} · 世界时间 {report.elapsed.toFixed(1)} 秒
        （思考暂停不计入）
      </p>

      <h3>时间花在哪里</h3>
      <p className="small">{`时限 ${settings.timeLimitSeconds} 秒 · 每条开放队列 +${settings.extraQueuePeople} 人`}</p>
      <div className="bar">
        {SEGMENTS.filter((s) => (report.timeBreakdown[s.key] ?? 0) > 0).map((s) => (
          <i
            key={s.key}
            title={`${s.label} ${report.timeBreakdown[s.key]} 秒`}
            style={{ width: `${((report.timeBreakdown[s.key] ?? 0) / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="bar-legend">
        {SEGMENTS.filter((s) => (report.timeBreakdown[s.key] ?? 0) > 0).map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} {(report.timeBreakdown[s.key] ?? 0).toFixed(1)}s
          </span>
        ))}
      </div>

      <h3>违规记录</h3>
      {report.violations.length === 0 ? (
        <p className="muted">无</p>
      ) : (
        <ul className="plain">
          {report.violations.map((v, i) => (
            <li key={i}>
              t={v.t.toFixed(1)}s {MECHANIC_NAME[v.mechanic]} — {v.detected ? "被保安发现" : "未被发现"}
            </li>
          ))}
        </ul>
      )}

      <h3>决策与成本</h3>
      <p className="small">
        决策 {report.totals.decisions} 次 · 现实思考等待 {report.thinkingRealSeconds} 秒
        {report.agentKind === "llm" &&
          ` · 输入 ${report.totals.inputTokens} / 输出 ${report.totals.outputTokens} / 思考 ${report.totals.thinkingTokens ?? "未完整返回"} token`}
      </p>

      {!!report.npcTotals?.calls && <p className="small">NPC 沟通 {report.npcTotals.calls} 次 · 输入 {report.npcTotals.inputTokens} / 输出 {report.npcTotals.outputTokens} token · 现实等待 {report.npcTotals.realSeconds} 秒（另计）</p>}
      <DebugPanel report={report} />

      {report.guidance && (
        <>
          <h3>本局指导</h3>
          <p className="quote">「{report.guidance}」</p>
        </>
      )}

      {report.attempts && report.attempts.length > 0 && (
        <details className="run-trace">
          <summary>{`全部调用记录（${report.attempts.length} 次）`}</summary>
          <p className="muted">保留接口实际返回的内容、重试与执行结果，导出 JSON 可完整保存。</p>
          <DecisionTrace attempts={report.attempts} />
        </details>
      )}

      {!!report.dialogues?.length && <details className="run-trace"><summary>全部 NPC 沟通（{report.dialogues.length} 次）</summary>{report.dialogues.map((record, i) => <NpcDialogue key={i} record={record} />)}</details>}

      <div className="row">
        <button className="primary" onClick={onEdit}>
          修改指导再来一局
        </button>
        <button onClick={onRetry}>同指导同种子重试</button>
        <button className="ghost" onClick={exportJson}>
          导出报告 JSON
        </button>
      </div>
    </section>
  );
}

export function EventTimeline({ report }: { report: GameReport }) {
  const [onlyPerceived, setOnlyPerceived] = useState(true);
  const events = report.events.filter((e) => !onlyPerceived || e.playerVisible);
  return (
    <section className="card timeline">
      <div className="row between">
        <h3>事件时间线</h3>
        <label className="check">
          <input type="checkbox" checked={onlyPerceived} onChange={() => setOnlyPerceived((x) => !x)} /> 只看角色感知到的
        </label>
      </div>
      <ol>
        {events.map((e, i) => (
          <li key={i} className={e.playerVisible ? "" : "unseen"}>
            <span className="time">{e.t.toFixed(1)}s</span> {e.text}
            {!e.playerVisible && <em> （角色未感知）</em>}
          </li>
        ))}
      </ol>
    </section>
  );
}
