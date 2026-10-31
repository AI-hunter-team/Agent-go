import type { GameStatus } from "../shared/types";
import type { Person } from "../sim/world";

export interface JourneyProgressProps {
  player: Pick<Person, "hasTicket" | "screened" | "passedGate" | "onPlatform" | "activity">;
  status: GameStatus;
}

export function JourneyProgress({ player, status }: JourneyProgressProps) {
  const labels = ["买票", "安检", "过闸机", "下行到站台", "进入站台"];
  const a = player.activity;
  const facility = "facility" in a ? a.facility : "";
  const current = player.onPlatform ? 4 : player.passedGate ? 3 : player.screened || facility.startsWith("G") ? 2 : player.hasTicket || facility.startsWith("S") ? 1 : 0;
  const complete = [player.hasTicket, player.screened, player.passedGate || player.onPlatform, player.onPlatform, player.onPlatform];
  let gateDetail = "前往闸机，排队后验票通行";
  if (facility.startsWith("G")) {
    gateDetail = a.kind === "service" ? `${facility} 验票通行中` : a.kind === "queued" ? `${facility} 排队中` : `前往 ${facility} 队尾`;
  } else if (a.kind === "creative" && a.mechanic === "jump_gate") {
    gateDetail = "正在尝试翻越闸机，结果由环境判定";
  }
  return (
    <section className="card journey" aria-label="本局流程">
      <ol>
        {labels.map((label, index) => {
          const state = complete[index] ? "complete" : index === current && status === "running" ? "active" : index < current ? "skipped" : "waiting";
          const text = complete[index] ? "已完成" : state === "active" ? "进行中" : state === "skipped" ? index === 0 ? "未购票" : "未完成" : "待开始";
          return <li key={label} className={`journey-step ${state}`} aria-label={`${label}：${text}`} aria-current={index === current ? "step" : undefined}>
            <span className="journey-number">{index + 1}</span><strong>{label}</strong><span className="journey-state">{text}</span>
          </li>;
        })}
      </ol>
      <p className="journey-current"><strong>{status === "failed" ? `本局结束，停在：${labels[current]}` : `当前阶段：${labels[current]}`}</strong>
        {current === 2 && <span>{gateDetail} · 常规流程：排队 → 验票 → 通行</span>}
        {current === 3 && <span>{a.kind === "stairs" ? `正在下楼梯（剩余 ${Math.ceil(a.remaining)} 秒）` : a.kind === "escalator" ? `正在乘扶梯（剩余 ${Math.ceil(a.remaining)} 秒）` : a.kind === "escalator_queue" || a.kind === "to_escalator" ? "正在候梯，可离队换走楼梯" : "已过闸机，比较楼梯与扶梯，选择下行路线"}</span>}
        {current === 4 && <span>已下行进入站台，本局完成</span>}
      </p>
      {current === 2 && !player.hasTicket && <p className="journey-warning">未持有效车票，常规验票会拒绝通行；创造性行动由环境单独判定。</p>}
    </section>
  );
}
