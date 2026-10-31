import { useEffect, useSyncExternalStore } from "react";
import type { GameReport } from "../shared/types";
import type { ReviewEvidence, ReviewMetadata } from "../shared/review";
import type { ReviewSession } from "./reviewSession";

function Evidence({ refs, report }: { refs: ReviewEvidence; report: GameReport }) {
  return <details className="review-evidence"><summary>查看依据 · {refs.decisionIndexes.length} 次决策 / {refs.eventIndexes.length} 条事件</summary>
    {refs.decisionIndexes.map(id => {
      const d = report.decisions.find(d => d.index === id);
      return d && <p key={`d${id}`}>决策 #{id} · {d.t.toFixed(1)}s：{d.action?.reason ?? d.error ?? "无有效动作"}<br />实际结果：{d.result?.text ?? "未执行"}</p>;
    })}
    {refs.eventIndexes.map(index => {
      const e = report.events[index];
      return e && <p key={`e${index}`}>{e.t.toFixed(1)}s · {e.playerVisible ? "角色可感知" : "赛后全局"}：{e.text}</p>;
    })}
    {!refs.decisionIndexes.length && !refs.eventIndexes.length && <p>参考整局耗时与全局快照，未引用单条记录。</p>}
  </details>;
}
function Cost({ value, label }: { value: ReviewMetadata; label: string }) {
  return <p className="meta">{label} · {value.model} · {(value.latencyMs / 1000).toFixed(1)} 秒{value.usage ? ` · 输入 ${value.usage.inputTokens} / 输出 ${value.usage.outputTokens} token` : " · 用量未返回"}</p>;
}

export function FailureReview({ session, report, onAdopt, active = true, readOnly = false }: { session: ReviewSession; report: GameReport; onAdopt?: (guidance: string) => void; active?: boolean; readOnly?: boolean }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    if (active && !readOnly) void session.checkService(report.agentKind === "llm");
  }, [session, report.agentKind, active, readOnly]);
  useEffect(() => {
    if (!active) return;
    return session.cancelDraft;
  }, [session, active]);
  const analysis = state.review?.analysis;
  const attempts = session.exportData().reviewAttempts ?? [];
  return <section className="failure-review" aria-label="失败复盘">
    <div className="report-section-heading"><h2>下一局怎么走</h2></div>
    {analysis && <>
      <fieldset className="review-strategies" disabled={readOnly}>
        <legend>选择下一轮策略</legend>
        <p className="muted" id="review-strategy-help">{readOnly ? "上一局已生成的策略，仅供回看。" : "勾选想采用的策略，带到下一局的指导中。"}</p>
        {analysis.strategies.map(s => <article className={`review-strategy ${state.selected.includes(s.id) ? "selected" : ""}`} key={s.id}>
          <label className="check"><input type="checkbox" checked={state.selected.includes(s.id)} onChange={() => session.toggle(s.id)} /><strong>{s.title}</strong>{s.recommended && <span className="review-recommended">推荐</span>}</label>
          <p className="review-strategy-prompt">{s.change}</p>
          <details className="review-evidence"><summary>适用情况与依据</summary>
            <p>依据：{s.reason}</p><p>适用：{s.when}<br />代价：{s.tradeoff}</p>
            <Evidence refs={s} report={report} />
          </details>
        </article>)}
      </fieldset>
      {!readOnly && onAdopt && <><button className="primary full-width review-strategy-action" aria-describedby="review-strategy-help" aria-busy={state.draftStatus === "loading"} disabled={!state.selected.length || state.draftStatus === "loading"} onClick={async () => {
        const guidance = await session.generateDraft();
        if (guidance !== null) onAdopt(guidance);
      }}>{state.draftStatus === "loading" ? "正在整理所选策略…" : "使用选中策略再来一局"}</button>
      <p className="muted review-selection-note">{state.selected.length ? `已选 ${state.selected.length} 条策略，进入开局设置后仍可编辑指导。` : "先勾选至少一条策略。"}</p>
      {state.draftStatus === "loading" && <p role="status" className="muted">正在把所选策略整理为下一局的指导…</p>}
      {state.draftError && <p className="error" role="alert">{state.draftError}</p>}</>}

      <details className="review-analysis"><summary>查看本局分析与关键转折</summary>
        <div className="review-content">
          <p className="review-summary">{analysis.summary}</p><p>{analysis.primaryCause}</p>
          {!!analysis.secondaryFactors.length && <><h3>其他影响因素</h3><ul>{analysis.secondaryFactors.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
          <h3>关键转折</h3>
          {analysis.turningPoints.map((p, i) => <article className="review-turn" key={i}>
            <h4>{p.t.toFixed(1)}s</h4><div className="review-perspectives">
              <div><span>当时知道什么</span><p>{p.knownThen}</p></div>
              <div><span>赛后发现什么</span><p>{p.discoveredAfter}</p></div>
            </div><p>{p.assessment}</p><Evidence refs={p} report={report} />
          </article>)}
          <h3>证据限制与待验证部分</h3>
          <p className="muted">替代策略尚未经过重跑验证，效果需要下一局检验。</p>
          {!!analysis.uncertainties.length && <ul>{analysis.uncertainties.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          {!report.worldSnapshots?.length && <p className="muted">这份旧报告没有全局快照，仅能根据已有观察与事件分析。</p>}
          <details className="review-evidence"><summary>查看赛后全局记录（{report.events.length} 条事件 / {report.worldSnapshots?.length ?? 0} 个快照）</summary>
            <p className="muted">快照采集于每 5 秒及关键决策时刻。</p>
            <ol>{report.events.map((e, i) => <li key={i}>{e.t.toFixed(1)}s · {e.playerVisible ? "角色可感知" : "赛后全局"}：{e.text}</li>)}</ol>
            <details><summary>全局快照</summary><pre className="trace-text">{JSON.stringify(report.worldSnapshots ?? [], null, 2)}</pre></details>
          </details>
          {state.review && <Cost value={state.review} label="复盘用量（与局内决策另计）" />}
          {state.draft && <Cost value={state.draft} label="指导整理用量" />}
        </div>
      </details>
    </>}
    {!readOnly && <>
      {state.serviceStatus === "checking" && state.status === "idle" && <p className="muted" role="status">正在连接复盘服务…</p>}
      {["unavailable", "error"].includes(state.serviceStatus) && state.status === "idle" && <><p className="muted" role="status">{state.serviceError ?? "复盘服务暂不可用，请稍后再试。当前报告与回放仍可查看。"}</p><button onClick={() => void session.checkService(report.agentKind === "llm")}>重试连接复盘服务</button></>}
      {state.serviceStatus === "available" && report.agentKind === "offline" && state.status === "idle" && <><p className="muted">回顾本局的关键转折，找到下一次可以尝试的走法。</p><button onClick={session.ensureReview}>生成行程分析</button></>}
      {state.status === "loading" && <p role="status">正在回顾整局记录与全局情况…</p>}
      {state.error && <><p className="error" role="alert">{state.error}</p><button onClick={session.ensureReview}>重试复盘</button></>}
    </>}
    {!!attempts.length && <details className="review-evidence"><summary>复盘调用用量</summary><p className="meta">复盘与指导整理累计 {attempts.length} 次调用 · 输入 {attempts.reduce((n, a) => n + (a.usage?.inputTokens ?? 0), 0)} / 输出 {attempts.reduce((n, a) => n + (a.usage?.outputTokens ?? 0), 0)} token（含失败尝试，用量未返回的调用不估算）</p></details>}
  </section>;
}
