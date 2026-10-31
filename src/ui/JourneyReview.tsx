import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { GameReport, TimeBreakdown } from "../shared/types";
import type { Engine } from "../sim/engine";
import { DecisionTrace } from "./DecisionTrace";
import { EventTimeline, ReportSummary } from "./ReportView";
import { FailureReview } from "./FailureReview";
import type { ReviewSession } from "./reviewSession";
import { TrajectoryReplayView } from "./TrajectoryReplay";
import { decisionAttempts, describeReviewAction, filterDecisions, reportOutcome, type DecisionFilter } from "./reportPresentation";
import "./JourneyReview.css";

const TABS = [{ id: "result", label: "本局结果" }, { id: "replay", label: "回看过程" }, { id: "analysis", label: "决策分析" }] as const;
type ReviewTab = typeof TABS[number]["id"];
const FILTERS: { id: DecisionFilter; label: string }[] = [{ id: "all", label: "全部" }, { id: "failed", label: "失败行动" }, { id: "retry", label: "重试" }, { id: "slow", label: "模型等待 ≥5秒" }, { id: "dialogue", label: "对话" }];
const TIMES: { key: keyof TimeBreakdown; label: string; color: string }[] = [
  { key: "walking", label: "行走", color: "#4c788c" }, { key: "queueing", label: "排队", color: "#e5be37" },
  { key: "service", label: "办理", color: "#729d86" }, { key: "stairs", label: "楼梯", color: "#8f88ab" },
  { key: "escalator", label: "扶梯", color: "#527e91" }, { key: "waiting", label: "等待", color: "#ac9e87" },
  { key: "creative", label: "特殊行动", color: "#ba7763" }, { key: "distraction", label: "关注设施", color: "#aa916b" }, { key: "idle", label: "其他", color: "#aeb8bf" },
];

function exportReport(report: GameReport, review: ReviewSession | null) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ ...report, ...review?.exportData() }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `agent-go-report-seed${report.seed}-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface JourneyReviewProps {
  report: GameReport;
  engine: Engine;
  review: ReviewSession | null;
  open: boolean;
  onClose: () => void;
  previous?: boolean;
  modelAvailable?: boolean;
  onRetry?: () => void;
  onSameScenario?: () => void;
  onEdit?: (guidance?: string) => void;
  onConfigureModel?: () => void;
  onLobby?: () => void;
  onPrevious?: () => void;
}

/** 一次只展示一种阅读目的；长记录不会推走下一局操作。 */
export function JourneyReview({ report, engine, review, open, onClose, previous = false, modelAvailable = false, onRetry, onSameScenario, onEdit, onConfigureModel, onLobby, onPrevious }: JourneyReviewProps) {
  const [tab, setTab] = useState<ReviewTab>("result");
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [seek, setSeek] = useState<{ t: number; key: number }>();
  const [showData, setShowData] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useRef<HTMLElement>(null);
  const outcome = reportOutcome(report);
  const decisions = filterDecisions(report, filter);
  const decision = decisions.find(d => d.index === selected) ?? decisions[0];
  const segments = TIMES.filter(s => (report.timeBreakdown[s.key] ?? 0) > 0);
  const total = Math.max(0.1, segments.reduce((n, s) => n + (report.timeBreakdown[s.key] ?? 0), 0));
  const switchTab = (next: ReviewTab) => { setTab(next); content.current?.scrollTo(0, 0); };
  const inspect = (index: number) => { setSelected(index); setFilter("all"); switchTab("analysis"); };
  const replayAt = (t: number) => { setSeek(s => ({ t, key: (s?.key ?? 0) + 1 })); switchTab("replay"); };

  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="journey-review-backdrop" />
      <Dialog.Content className="journey-review" aria-describedby="journey-review-description" onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}>
        <header className="review-topbar">
          <div><Dialog.Title ref={heading} tabIndex={-1}>{previous ? "上一局报告" : "行程复盘"}</Dialog.Title><Dialog.Description id="journey-review-description">{previous ? "保留在当前页面，刷新后清除" : "看看结果，或继续探索这次旅程"}</Dialog.Description></div>
          <button className="review-export" onClick={() => exportReport(report, review)}>导出报告</button>
          <Dialog.Close aria-label="关闭复盘" className="review-close">×</Dialog.Close>
        </header>
        <div className="review-tabs" role="tablist" aria-label="复盘内容">
          {TABS.map((item, i) => <button key={item.id} id={`review-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`review-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => switchTab(item.id)} onKeyDown={e => {
            const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
            if (next !== null) { e.preventDefault(); switchTab(TABS[next].id); document.getElementById(`review-tab-${TABS[next].id}`)?.focus(); }
          }}>{item.label}</button>)}
        </div>
        <div ref={content} className="review-scroll" role="tabpanel" id={`review-panel-${tab}`} aria-labelledby={`review-tab-${tab}`} tabIndex={0}>
          {tab === "result" && <div className="review-result">
            <div className="review-verdict" data-outcome={outcome.tone}>
              <span className="review-kicker">{report.journey?.sceneName ?? "地铁末班车"} · {report.journey?.characterName ?? "我的角色"}</span>
              <h2>{outcome.title}</h2><p>{outcome.detail}</p>
              <div className="review-score"><strong>{(report.score ?? report.elapsed).toFixed(1)}</strong><span>秒<span>{report.status === "success" ? "到达用时" : "本局已进行"}</span></span></div>
              <p className="muted">世界内时间 · 模型等待与暂停不计入</p>
            </div>
            <div className="review-result-side">
              <div className="review-stats"><div><strong>{report.totals.decisions}</strong><span>次决策</span></div><div><strong>{report.violations.length}</strong><span>次违规行动</span></div><div><strong>{report.settings?.timeLimitSeconds ?? engine.settings.timeLimitSeconds}</strong><span>秒时限</span></div></div>
              <section className="review-time"><h3>时间花在哪里</h3><div className="review-timebar" aria-hidden="true">{segments.map(s => <i key={s.key} style={{ width: `${(report.timeBreakdown[s.key] ?? 0) / total * 100}%`, background: s.color }} />)}</div><div className="review-time-legend">{segments.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.label}<b>{(report.timeBreakdown[s.key] ?? 0).toFixed(1)} 秒</b></span>)}</div></section>
              <button className="review-entry" onClick={() => switchTab("replay")}><strong>回看这次旅程 <span>↗</span></strong><small>地图、关键时刻与实际行动</small></button>
              <button className="review-entry" onClick={() => switchTab("analysis")}><strong>{report.agentKind === "offline" ? "查看行动分析" : "优化下一次指导"} <span>↗</span></strong><small>对照观察、决策和执行结果</small></button>
            </div>
          </div>}
          {tab === "replay" && <div className="review-replay-layout"><section><h2>轨迹回放</h2><p className="muted">角色位置按时间回放；乘客与设施显示终局状态。</p><TrajectoryReplayView report={report} engine={engine} seekRequest={seek} onInspectDecision={inspect} /></section><EventTimeline report={report} onSeek={replayAt} /></div>}
          {tab === "analysis" && <>
            <div className="review-analysis-intro"><h2>从一次决策开始</h2><p>对照当时的观察与实际结果，找到值得调整的指导。</p><p className="muted">本局模型：{report.journey?.model ?? (report.agentKind === "offline" ? "离线固定策略" : "未记录")} · 情景 {report.seed} · 模型等待 {report.thinkingRealSeconds.toFixed(1)} 秒</p>{report.agentKind === "llm" && <p className="muted">输入 {report.totals.inputTokens} / 输出 {report.totals.outputTokens} token · 思考 {report.totals.thinkingTokens ?? "未完整返回"}</p>}<details><summary>本局指导</summary><p className="quote">{report.guidance || "自主决定 / 离线固定策略"}</p></details></div>
            <div className="review-filters" role="group" aria-label="筛选决策">{FILTERS.map(f => <button key={f.id} aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); setSelected(null); }}>{f.label}</button>)}</div>
            <div className="review-analysis-grid">
              <nav className="review-decision-list" aria-label="决策列表">{decisions.length ? decisions.map(d => <button key={d.index} aria-current={decision?.index === d.index ? "true" : undefined} onClick={() => { setSelected(d.index); requestAnimationFrame(() => { if (window.matchMedia("(max-width: 700px)").matches) detail.current?.scrollIntoView({ block: "start", behavior: "auto" }); }); }}><span>#{d.index} · {d.t.toFixed(1)} 秒</span><strong>{d.action ? describeReviewAction(d.action) : "未形成行动"}</strong><small>{d.error || d.result?.ok === false ? "执行或调用失败" : d.fallback ? "保底行动" : "已记录"}</small></button>) : <p className="muted">没有符合条件的决策。</p>}</nav>
              {decision && <section className="review-decision-detail" ref={detail} aria-label={`决策 ${decision.index} 详情`}>
                <div className="row between"><h3>决策 #{decision.index}</h3><button onClick={() => replayAt(decision.t)}>在地图上回看 ↗</button></div>
                <article><span>01 / 当时知道什么</span><p>{decision.observationSummary || "未记录观察摘要，可展开实际输入查看。"}</p><small>来自角色当时的观察，不包含赛后才知道的信息。</small></article>
                <article><span>02 / 提出了什么</span><p>{decision.action ? describeReviewAction(decision.action) : "没有有效行动"}</p><p className="muted">{decision.action?.reason ?? decision.error ?? "未提供行动理由"}</p></article>
                <article><span>03 / 实际发生了什么</span><p>{decision.result?.text ?? "本次输出未执行"}</p>{decision.fallback && <small>本次使用保底行动。</small>}</article>
                <details className="review-raw"><summary>查看实际输入、模型返回与调用详情（{decisionAttempts(report, decision).length} 次）</summary>{decisionAttempts(report, decision).length ? <DecisionTrace attempts={decisionAttempts(report, decision)} /> : <p>这份报告未保存原始调用记录。{decision.thinking}</p>}</details>
              </section>}
            </div>
            {review && onEdit && <div className="review-ai"><FailureReview session={review} report={report} modelAvailable={modelAvailable} onAdopt={onEdit} onConfigureModel={onConfigureModel} /></div>}
            {previous && review?.state.review && <section className="review-ai"><h3>已生成的策略建议</h3><p>{review.state.review.analysis.summary}</p><p>{review.state.review.analysis.primaryCause}</p>{review.state.review.analysis.strategies.map(strategy => <details key={strategy.id}><summary>{strategy.title}</summary><p>{strategy.change}</p><p>{strategy.reason}</p></details>)}</section>}
            <div className="review-data"><button aria-expanded={showData} onClick={() => setShowData(v => !v)}>{showData ? "收起完整数据" : "查看完整数据与世界记录"}</button><p className="muted">包含赛后全局信息、物品、人设和接口诊断，不能视为角色当时已知。</p>{showData && <ReportSummary report={report} mode="data" />}</div>
          </>}
        </div>
        <footer className="review-footer">
          {previous ? <><span className="muted">上一局 · 情景 {report.seed}</span><button className="primary" onClick={onClose}>返回当前旅程</button></> : <>
            <details className="review-more"><summary>更多</summary><div>{onPrevious && <button onClick={onPrevious}>上一局报告</button>}{onSameScenario && <button onClick={onSameScenario}>同情景重试</button>}{onConfigureModel && <button onClick={onConfigureModel}>更换模型</button>}{onLobby && <button onClick={onLobby}>返回大厅</button>}</div></details>
            <button onClick={() => onEdit?.()}>{report.agentKind === "offline" ? "调整开局" : "调整指导"}<small>保留原情景</small></button>
            <button className="primary" onClick={onRetry}>再来一局<small>换一个新情景</small></button>
          </>}
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
