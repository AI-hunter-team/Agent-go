import { EVENT_LABEL, LEVEL_LABEL } from "./interactionLabels";
import { ITEM_DEFS } from "../sim/content/items";
import { useState, type ReactNode } from "react";
import type { GameReport, TimeBreakdown } from "../shared/types";
import { MECHANIC_NAME } from "./format";
import { DecisionTrace } from "./DecisionTrace";
import { NpcDialogue } from "./NpcDialogue";
import { DebugPanel } from "./DebugPanel";
import { LEGACY_GAME_SETTINGS } from "../shared/gameSettings";
import { Api } from "../agent/remoteAgent";
import { FailureReview } from "./FailureReview";
import { ReviewSession } from "./reviewSession";

const SEGMENTS: { key: keyof TimeBreakdown; label: string; color: string }[] = [
  { key: "walking", label: "行走", color: "var(--blue)" },
  { key: "queueing", label: "排队", color: "var(--ochre)" },
  { key: "service", label: "办理", color: "var(--green)" },
  { key: "stairs", label: "下楼梯", color: "#7a7194" },
  { key: "escalator", label: "乘扶梯", color: "#527e91" },
  { key: "distraction", label: "关注设施", color: "#a66a56" },
  { key: "waiting", label: "等待", color: "#b8ad94" },
  { key: "creative", label: "创造性行动", color: "var(--brick)" },
  { key: "idle", label: "空闲", color: "#d9d3c4" },
];

/** 汇总真实终局成绩、耗时与调用记录，策略采纳入口位于下一局建议模块。 */
export function ReportSummary({ report, onAdopt, replay, records, active = true }: { report: GameReport; onAdopt?: (guidance: string) => void; replay?: ReactNode; records?: ReactNode; active?: boolean }) {
  const [review] = useState(() => report.status === "failed" ? new ReviewSession(report, Api.forReview(report)) : null);
  const settings = report.settings ?? LEGACY_GAME_SETTINGS;
  const total = Math.max(0.1, Object.values(report.timeBreakdown).reduce((a, b) => a + b, 0));
  const segments = SEGMENTS.filter((s) => (report.timeBreakdown[s.key] ?? 0) > 0);
  const mainSegment = [...segments].sort((a, b) => (report.timeBreakdown[b.key] ?? 0) - (report.timeBreakdown[a.key] ?? 0))[0];
  // 原样导出当前报告，不改变存档字段或计分数据。
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...report, ...review?.exportData() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `agent-go-report-seed${report.seed}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="card report">
      <div className="report-content">
      <div className="report-result">
      <div className={report.status === "success" ? "verdict win" : "verdict lose"}>
        {report.status === "success" ? (
          <>
            <span>已下楼到达站台</span>
            <strong>{report.score!.toFixed(1)} 秒</strong>
          </>
        ) : (
          <>
            <span>本次未抵达站台 · 无成绩</span>
            <strong className="reason-text">{report.failReason}</strong>
          </>
        )}
      </div>
      <dl className="report-metrics" aria-label="行程概况">
        <div><dt>行程用时</dt><dd>{report.elapsed.toFixed(1)}<small> 秒</small></dd></div>
        <div><dt>行动决策</dt><dd>{report.totals.decisions}<small> 次</small></dd></div>
        <div><dt>违规记录</dt><dd>{report.violations.length}<small> 次</small></dd></div>
      </dl>
      </div>

      <section className="report-section report-time" aria-labelledby="report-time-title">
      <div className="report-section-heading"><h2 id="report-time-title">时间花在哪里</h2><span className="muted">时限 {settings.timeLimitSeconds} 秒</span></div>
      {mainSegment ? <p className="report-takeaway">主要耗时在<strong>{mainSegment.label}</strong>，共 {(report.timeBreakdown[mainSegment.key] ?? 0).toFixed(1)} 秒。</p> : <p className="muted">本局尚未产生耗时记录。</p>}
      {(report.timeBreakdown.distraction ?? 0) > 0 && <p className="small">关注用时可能包含减速行走；它不是全部净损失，可结合事件时间线复盘。</p>}
      <div className="bar" aria-hidden="true">
        {segments.map((s) => (
          <i
            key={s.key}
            title={`${s.label} ${report.timeBreakdown[s.key]} 秒`}
            style={{ width: `${((report.timeBreakdown[s.key] ?? 0) / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="bar-legend">
        {segments.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} {(report.timeBreakdown[s.key] ?? 0).toFixed(1)}s
          </span>
        ))}
      </div>

      <p className="report-footnote">按世界时间统计，思考时暂停计时。</p>
      </section>

      {review && onAdopt && <FailureReview session={review} report={report} onAdopt={onAdopt} active={active} />}
      {report.guidance && <details className="report-guidance"><summary>本局指导</summary><p className="quote">「{report.guidance}」</p></details>}

      <div className="report-disclosures">
      {replay && <details className="report-disclosure"><summary><span>轨迹回放<small>回看路线与当时的决策</small></span></summary><div className="report-disclosure-body">{replay}</div></details>}
      <details className="report-disclosure"><summary><span>完整行程记录<small>事件、决策、模型用量与本局设置</small></span></summary><div className="report-disclosure-body">
      <button className="ghost report-export" onClick={exportJson}>导出报告 JSON</button>
      <h3>本局设置</h3>
      <p className="small">场景：{report.journey?.sceneName ?? "未记录"} · 角色：{report.journey?.characterName ?? "未记录"}</p>
      <p className="small">种子 {report.seed} · {report.agentKind === "llm" ? "大模型 Agent" : "离线规则 Agent"} · 模型：{report.journey ? (report.journey.model ?? "离线体验") : "未记录"}</p>
      <p className="small">时限 {settings.timeLimitSeconds} 秒 · 每条开放队列 +{settings.extraQueuePeople} 人</p>

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
      {report.operationUsage && <details><summary>分操作调用与用量</summary>{Object.entries(report.operationUsage).map(([op, row]) => <p key={op}>{op}：{row.calls} 次 · 输入 {row.inputTokens} / 输出 {row.outputTokens} token · {row.realSeconds.toFixed(1)} 秒 · {row.unknownUsage} 次未返回用量</p>)}</details>}
      {!!report.worldEvents?.length && <details><summary>交互事件与因果链（{report.worldEvents.length}）</summary>{report.worldEvents.map(e => <p key={e.id}>{e.t.toFixed(1)}s · {e.id} {EVENT_LABEL[e.kind]} · {e.actorId ?? "环境"} → {e.targetId ?? "周围"}{e.causeId ? ` · 起因 ${e.causeId}` : ""}</p>)}</details>}
      {!!report.alerts?.length && <details><summary>警戒变化</summary>{report.alerts.map((a,i) => <p key={i}>{a.t.toFixed(1)}s {a.observerId} 对 {a.subjectId}：{LEVEL_LABEL[a.from]} → {LEVEL_LABEL[a.to]} · {a.cause}</p>)}</details>}
      {!!report.items?.length && <details><summary>物品流转</summary>{report.items.map((a,i) => <p key={i}>{a.t.toFixed(1)}s {ITEM_DEFS[a.kind].label}（{a.itemId}）：{a.from} → {a.to} · {a.how}</p>)}</details>}
      {!!report.boss?.length && <details><summary>Boss 计划与执行结果</summary>{report.boss.map((a,i) => <div key={i}><p>{a.t.toFixed(1)}s 「{a.instruction}」· {a.plan.summary}（{a.plan.source}）</p>{a.outcomes.map((r,j) => <p key={j}>{r.ok ? "完成" : "失败"}：{r.text} · {r.eventIds.join("、")}</p>)}</div>)}</details>}
      {!!report.interactionDialogues?.length && <details><summary>自由对话</summary>{report.interactionDialogues.map((a,i) => <p key={i}>{a.t.toFixed(1)}s 对 {a.request.npc.id}：「{a.request.message}」→「{a.response.reply}」· {a.response.decision}</p>)}</details>}
      {report.personas && <details><summary>乘客人设（复盘可见）</summary>{Object.entries(report.personas).map(([id,p]) => <p key={id}>{id} · {p.look.outfit} · 胆量 {p.traits.courage.toFixed(2)} / 公平 {p.traits.fairness.toFixed(2)} / 赶时间 {p.situation.hurry.toFixed(2)}</p>)}</details>}
      <DebugPanel report={report} />

      {report.attempts && report.attempts.length > 0 && (
        <details className="run-trace">
          <summary>{`全部调用记录（${report.attempts.length} 次）`}</summary>
          <p className="muted">保留接口实际返回的内容、重试与执行结果，导出 JSON 可完整保存。</p>
          <DecisionTrace attempts={report.attempts} />
        </details>
      )}

      {!!report.dialogues?.length && <details className="run-trace"><summary>全部 NPC 沟通（{report.dialogues.length} 次）</summary>{report.dialogues.map((record, i) => <NpcDialogue key={i} record={record} />)}</details>}

      {records}
      </div></details>
      </div>
      </div>

    </section>
  );
}

/** 按时间展示事件，允许用户切换角色感知过滤。 */
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
            <span className="time">{e.t.toFixed(1)}s</span><span>{e.text}
            {!e.playerVisible && <em> （角色未感知）</em>}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
