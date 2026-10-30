import type { NpcDialogueRecord } from "../shared/types";
import { describeUsage } from "./format";

export function NpcDialogue({ record }: { record: NpcDialogueRecord }) {
  const { request, response } = record;
  const verdict = record.status === "pending" ? "回复中" : record.status === "error" ? "沟通失败" : response?.accepted ? "同意让位" : "拒绝让位";
  return (
    <div className={`npc-dialogue ${response?.accepted ? "accepted" : ""}`}>
      <div className="row between"><strong>{request.npc.id} · {request.npc.trait}</strong><span className="badge">{verdict}</span></div>
      <p className="small muted">{request.npc.facility} · 第 {request.npc.queuePosition} 位 · t={record.t.toFixed(1)}s</p>
      <p><b>Agent：</b>{request.message}</p>
      <p><b>NPC：</b>{response?.reply ?? "正在听取请求并回复……"}</p>
      {response && <p className="small muted">判定说明：{response.reason}</p>}
      {record.execution && <p className="small">执行：{record.execution.text}</p>}
      {record.status !== "pending" && !record.execution && <p className="small muted">本局已结束，这次答复未执行。</p>}
      {response && <div className="meta">{[response.source === "llm" ? "模型 NPC" : "未获得模型答复", response.model, describeUsage(response.usage)].filter(Boolean).join(" · ")}</div>}
      <details><summary>沟通调用记录</summary><pre className="trace-text">{JSON.stringify(record, null, 2)}</pre></details>
    </div>
  );
}
