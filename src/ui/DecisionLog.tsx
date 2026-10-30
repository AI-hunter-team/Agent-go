import type { DecisionRecord } from "../shared/types";
import { MECHANIC_NAME, describeAction, describeUsage } from "./format";

export function DecisionLog({ decisions, limit }: { decisions: DecisionRecord[]; limit?: number }) {
  const shown = [...decisions].reverse().slice(0, limit ?? decisions.length);
  if (shown.length === 0) return <p className="muted">还没有决策。</p>;
  return (
    <ol className="decisions">
      {shown.map((d) => (
        <li key={d.index} className={d.fallback || d.result?.ok === false ? "decision bad" : "decision"}>
          <div className="decision-head">
            <span className="tag">#{d.index}</span>
            <span className="time">t={d.t.toFixed(1)}s</span>
            <span className="triggers">{d.triggers.map((t) => t.text).join("；") || "—"}</span>
          </div>
          <div className="decision-action">
            <strong>{describeAction(d.action)}</strong>
            {d.action?.reason && <span className="reason">“{d.action.reason}”</span>}
            {d.fallback && <span className="badge brick">保底</span>}
          </div>
          {d.classification && (
            <div className="small">
              归类：{MECHANIC_NAME[d.classification.mechanic]}（{d.classification.source === "llm" ? "模型" : "关键词"}）
            </div>
          )}
          {d.result && <div className={d.result.ok ? "result ok" : "result rejected"}>{d.result.text}</div>}
          {d.error && <div className="result rejected">决策错误：{d.error}</div>}
          {d.thinking && (
            <details>
              <summary>思考摘要</summary>
              <p className="thinking">{d.thinking}</p>
            </details>
          )}
          <div className="meta">
            {[describeUsage(d.usage), d.latencyMs ? `${(d.latencyMs / 1000).toFixed(1)} 秒` : "", d.model ?? ""].filter(Boolean).join(" · ")}
          </div>
        </li>
      ))}
    </ol>
  );
}
