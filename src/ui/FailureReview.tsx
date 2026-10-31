import { useSyncExternalStore } from "react";
import type { GameReport } from "../shared/types";
import type { ReviewEvidence, ReviewMetadata } from "../shared/review";
import { countChars, guidanceError } from "../shared/guidance";
import { Modal } from "./overlays";
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

export function FailureReview({ session, report, modelAvailable, onAdopt, onConfigureModel }: { session: ReviewSession; report: GameReport; modelAvailable: boolean; onAdopt: (guidance: string) => void; onConfigureModel?: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const analysis = state.review?.analysis;
  const attempts = session.exportData().reviewAttempts ?? [];
  const title = report.failReason === "玩家结束了本局" ? "策略复盘" : "失败复盘";
  return <section className="failure-review" aria-label={title}>
    <h3>{title}</h3>
    {onConfigureModel && <button className="ghost" onClick={onConfigureModel}>连接或更换复盘模型</button>}
    {!modelAvailable && state.status === "idle" && <p className="muted">连接模型后可分析整局并提出策略。当前报告与回放仍可查看。</p>}
    {modelAvailable && state.status === "idle" && <><p className="muted">按需分析本局并提出策略建议，生成复盘会消耗模型额度。</p><button onClick={session.ensureReview}>使用模型生成复盘</button></>}
    {state.status === "loading" && <p role="status">正在回顾整局记录与全局情况…</p>}
    {state.error && <><p className="error" role="alert">{state.error}</p><button onClick={session.ensureReview}>重试复盘</button></>}
    {!!attempts.length && <p className="meta">复盘与草稿累计 {attempts.length} 次调用 · 输入 {attempts.reduce((n, a) => n + (a.usage?.inputTokens ?? 0), 0)} / 输出 {attempts.reduce((n, a) => n + (a.usage?.outputTokens ?? 0), 0)} token（含失败尝试，用量未返回的调用不估算）</p>}
    {analysis && <>
      <p className="review-summary">{analysis.summary}</p><p className="small">{analysis.primaryCause}</p>
      <Modal title={`${title}与下一轮策略`} description="结合整局记录和赛后全局事实分析；策略由你决定是否采纳。" wide trigger={<button className="full-width">查看完整复盘与策略建议</button>}>
        <div className="review-content">
          <p className="review-summary">{analysis.summary}</p>
          <h3>关键原因</h3><p>{analysis.primaryCause}</p>
          {!!analysis.secondaryFactors.length && <ul>{analysis.secondaryFactors.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          <h3>关键转折</h3>
          {analysis.turningPoints.map((p, i) => <article className="review-turn" key={i}>
            <h4>{p.t.toFixed(1)}s</h4><div className="review-perspectives">
              <div><span>当时知道什么</span><p>{p.knownThen}</p></div>
              <div><span>赛后发现什么</span><p>{p.discoveredAfter}</p></div>
            </div><p>{p.assessment}</p><Evidence refs={p} report={report} />
          </article>)}
          <h3>下一轮可以尝试</h3><p className="muted">勾选你想采用的建议，再生成指导草稿。</p>
          <fieldset className="review-strategies"><legend className="muted">选择策略建议</legend>
            {analysis.strategies.map(s => <article className={`review-strategy ${state.selected.includes(s.id) ? "selected" : ""}`} key={s.id}>
              <label className="check"><input type="checkbox" checked={state.selected.includes(s.id)} onChange={() => session.toggle(s.id)} /><strong>{s.title}</strong>{s.recommended && <span className="review-recommended">Agent 推荐</span>}</label>
              <p>{s.change}</p><p className="small">依据：{s.reason}</p><p className="small">适用：{s.when}<br />代价：{s.tradeoff}</p>
              <Evidence refs={s} report={report} />
            </article>)}
          </fieldset>
          <h3>证据限制与待验证部分</h3>
          <p className="muted">替代策略尚未经过重跑验证，效果需要下一局检验。</p>
          {!!analysis.uncertainties.length && <ul>{analysis.uncertainties.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          {!report.worldSnapshots?.length && <p className="muted">这份旧报告没有全局快照，仅能根据已有观察与事件分析。</p>}
          <details className="review-evidence"><summary>查看赛后全局记录（{report.events.length} 条事件 / {report.worldSnapshots?.length ?? 0} 个快照）</summary>
            <p className="muted">快照采集于每 5 秒及关键决策时刻。</p>
            <ol>{report.events.map((e, i) => <li key={i}>{e.t.toFixed(1)}s · {e.playerVisible ? "角色可感知" : "赛后全局"}：{e.text}</li>)}</ol>
            <details><summary>全局快照</summary><pre className="trace-text">{JSON.stringify(report.worldSnapshots ?? [], null, 2)}</pre></details>
          </details>
          <div className="review-draft">
            <h3>生成下一轮指导</h3>
            <button className="primary" disabled={!state.selected.length || state.draftStatus === "loading"} onClick={session.generateDraft}>{state.draftStatus === "loading" ? "正在合并指导…" : "将所选建议合并为指导草稿"}</button>
            {state.draftStatus === "loading" && <p role="status" className="muted">正在保留原指导并融合所选建议…</p>}
            {state.draftError && <p className="error" role="alert">{state.draftError}</p>}
            {state.draft && <>
              <h4>原指导</h4><p className="quote">{session.originalGuidance || "未填写额外指导"}</p>
              <label className="field"><span>新指导草稿 <i className={`count ${guidanceError(state.editedGuidance) ? "over" : ""}`}>{countChars(state.editedGuidance)} / 300 字</i></span>
                <textarea aria-label="新指导草稿" value={state.editedGuidance} onChange={e => session.setEditedGuidance(e.target.value)} />
              </label>
              {guidanceError(state.editedGuidance) && <p className="error" role="alert">{guidanceError(state.editedGuidance)}</p>}
              <button className="primary" disabled={!session.canApply} onClick={() => { if (session.canApply) onAdopt(state.editedGuidance); }}>采用草稿并返回开局设置</button>
              <p className="muted">返回后可以继续修改，再整理指导并确认出发。</p><Cost value={state.draft} label="本次草稿用量" />
            </>}
          </div>
          {state.review && <Cost value={state.review} label="复盘用量（与局内决策另计）" />}
        </div>
      </Modal>
    </>}
  </section>;
}
