import type { DecisionAttempt } from "../shared/types";
import { describeAction, describeUsage } from "./format";

function OutputBlock({ value }: { value: unknown }) {
  const block = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (block.type === "thinking" && typeof block.thinking === "string") {
    return <div><h4>模型返回的思考（原文）</h4><pre className="trace-text">{block.thinking}</pre></div>;
  }
  if (block.type === "text" && typeof block.text === "string") {
    return <div><h4>模型文本（原文）</h4><pre className="trace-text">{block.text}</pre></div>;
  }
  if (block.type === "tool_use") {
    return <div><h4>工具调用：{String(block.name ?? "未知工具")}</h4><pre className="trace-text">{JSON.stringify(block.input, null, 2)}</pre></div>;
  }
  if (block.type === "redacted_thinking") return <p className="muted">服务商未公开这段思考内容。</p>;
  return <pre className="trace-text">{JSON.stringify(value, null, 2)}</pre>;
}

export function DecisionTrace({ attempts }: { attempts: DecisionAttempt[] }) {
  return (
    <ol className="attempt-list">
      {attempts.map((attempt) => {
        const response = attempt.response;
        const content = response?.output?.content ?? [];
        const hasThinking = content.some((value) => value && typeof value === "object" && "type" in value && value.type === "thinking");
        return (
          <li key={`${attempt.decisionIndex}-${attempt.attempt}`} className="attempt">
            <div className="row between">
              <strong>{`第 ${attempt.attempt} 次尝试`}{attempt.input.retry ? " · 重试" : ""}</strong>
              <span className={attempt.status === "error" ? "trace-error" : "muted"}>
                决策 #{attempt.decisionIndex} · {attempt.status === "pending" ? "请求中" : attempt.status === "error" ? "调用失败" : "已返回"}
              </span>
            </div>
            <p className="meta">开始 {attempt.startedAt} · 结束 {attempt.finishedAt ?? "等待返回"}</p>
            <details><summary>当时的输入与观察</summary><pre className="trace-text">{JSON.stringify(attempt.input, null, 2)}</pre></details>
            {content.map((block, index) => <OutputBlock key={index} value={block} />)}
            {!hasThinking && response?.thinking && <div><h4>模型返回的思考（原文）</h4><pre className="trace-text">{response.thinking}</pre></div>}
            {response && !hasThinking && !response.thinking && <p className="muted">这次调用未返回可展示的思考内容。</p>}
            {response?.action && <p className="small"><strong>模型提出：</strong>{describeAction(response.action)}</p>}
            {response?.error && <p className="trace-error">调用错误：{response.error}</p>}
            <p className="small"><strong>执行结果：</strong>{attempt.execution?.text ?? (attempt.status === "pending" ? "尚未执行" : "本次输出未执行")}</p>
            {response?.output && <details><summary>原始返回 JSON</summary><pre className="trace-text">{JSON.stringify(response.output, null, 2)}</pre></details>}
            {response && <p className="meta">{[describeUsage(response.usage), `${(response.latencyMs / 1000).toFixed(2)} 秒`, response.model ?? "", response.output?.stopReason ? `结束原因：${response.output.stopReason}` : ""].filter(Boolean).join(" · ")}</p>}
          </li>
        );
      })}
    </ol>
  );
}
