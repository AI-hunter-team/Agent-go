import type { GameReport } from "../shared/types";

export function DebugPanel({ report }: { report: GameReport }) {
  const debug = report.debug;
  if (!debug) return null;
  const s = debug.summary;
  const seconds = (ms: number) => `${(ms / 1000).toFixed(3)} 秒`;
  const percent = (ms: number) => s.aiWaitMs ? `${(ms / s.aiWaitMs * 100).toFixed(1)}%` : "0%";
  const operations = { decision: "首次决策", retry: "失败重试", classification: "创造性归类" };
  const stages = { ticket: "买票", security: "安检", gate: "过闸" };
  const exportDebug = () => {
    const blob = new Blob([JSON.stringify(debug, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ai-hunter-debug-${debug.runId}.json`; a.click(); URL.revokeObjectURL(url);
  };
  return <details className="debug-panel">
    <summary>Debug 日志与 AI 耗时</summary>
    <p><strong>局内 AI 总等待：{seconds(s.aiWaitMs)}</strong> · 含赛前整理：{seconds(s.includingPreparationMs)}</p>
    <p className="muted">等待包含网络、供应商排队和生成；接口未提供内部推理耗时，不能单独测出纯思考时间。游戏内时间另计。</p>
    <h4>耗时方向</h4>
    <table><thead><tr><th>操作</th><th>耗时</th><th>局内占比</th></tr></thead><tbody>
      {Object.entries(s.byOperationMs).map(([key, ms]) => <tr key={key}><td>{operations[key as keyof typeof operations]}</td><td>{seconds(ms)}</td><td>{percent(ms)}</td></tr>)}
      <tr><td>赛前指导整理（局外）</td><td>{seconds(debug.preparation.durationMs)}</td><td>单独统计</td></tr>
    </tbody></table>
    <h4>任务阶段</h4>
    <table><tbody>{Object.entries(s.byStageMs).map(([key, ms]) => <tr key={key}><th>{stages[key as keyof typeof stages]}</th><td>{seconds(ms)}</td><td>{percent(ms)}</td></tr>)}</tbody></table>
    <h4>接口与本地开销</h4>
    <ul className="plain">
      <li>等待响应头（含网络、排队、生成）：{seconds(s.providerWaitHeadersMs)}</li>
      <li>读取响应体：{seconds(s.providerReadBodyMs)}</li>
      <li>本地、HTTP 往返及未细分开销：{seconds(s.otherMs)}</li>
      <li>有接口细分的调用 {s.measuredRequests} 次；缺少细分 {s.unmeasuredRequests} 次</li>
    </ul>
    {s.slowestAttempt && <p>最慢调用：#{s.slowestAttempt.index}，{seconds(s.slowestAttempt.durationMs)}</p>}
    <p className="meta">本局 ID：{debug.runId}</p>
    <button onClick={exportDebug}>导出 Debug JSON</button>
    <details><summary>逐次调用参数与结果（{debug.attempts.length} 条）</summary>
      {debug.attempts.map((attempt) => <details key={attempt.index}>
        <summary>#{attempt.index} · 决策 {attempt.decisionIndex} · {operations[attempt.operation]} · {stages[attempt.stage]} · {seconds(attempt.durationMs)}{attempt.status === "cancelled" ? " · 已取消" : ""}{attempt.error ? " · 错误" : ""}</summary>
        <pre>{JSON.stringify(attempt, null, 2)}</pre>
      </details>)}
    </details>
  </details>;
}
