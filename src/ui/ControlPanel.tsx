import { countChars } from "../shared/guidance";
import { GUIDANCE_MAX_CHARS, type NormalizedGuidance } from "../shared/types";

export type AgentChoice = "llm" | "offline";

interface SetupProps {
  llmAvailable: boolean;
  model: string | null;
  agentKind: AgentChoice;
  onAgentKind: (k: AgentChoice) => void;
  seed: number;
  onSeed: (s: number) => void;
  guidance: string;
  onGuidance: (g: string) => void;
  busy: string | null;
  onPrepare: () => void;
  onConfigureModel: () => void;
}

export function SetupPanel(p: SetupProps) {
  const chars = countChars(p.guidance);
  const over = chars > GUIDANCE_MAX_CHARS;
  return (
    <section className="card">
      <h2>出发之前</h2>
      <p className="muted">
        唯一目标：限时 180 秒内进入站台，尽可能缩短路径和总用时。常规路线是买票、安检、刷票过闸、下楼到站台；角色依据你的指导自主选择方案，结果由环境判定。
      </p>

      <div className="field" role="group" aria-label="角色驱动方式">
        <span>角色由谁驱动</span>
        <div className="segmented">
          <button aria-pressed={p.agentKind === "llm"} className={p.agentKind === "llm" ? "on" : ""} disabled={!p.llmAvailable} onClick={() => p.onAgentKind("llm")}>
            大模型 {p.model ? `（${p.model}）` : ""}
          </button>
          <button aria-pressed={p.agentKind === "offline"} className={p.agentKind === "offline" ? "on" : ""} onClick={() => p.onAgentKind("offline")}>
            离线规则 Agent
          </button>
        </div>
        <div className="row between">
          <small className="muted">{p.llmAvailable ? "模型已就绪，可更换接口和模型。" : "配置你自己的 API，验证后即可开启大模型。"}</small>
          <button className="ghost" onClick={p.onConfigureModel}>模型 API 配置</button>
        </div>
      </div>

      <label className="field">
        <span>
          你的指导（可留空，让角色自主规划）
          <em className={over ? "count over" : "count"}>
            {chars}/{GUIDANCE_MAX_CHARS}
          </em>
        </span>
        <textarea
          rows={6}
          value={p.guidance}
          placeholder="例如：优先选人少但没有大件行李的队伍；安检通道看效率，不要只看人数；遇到停用立刻换。"
          onChange={(e) => p.onGuidance(e.target.value)}
          disabled={p.agentKind === "offline"}
        />
        {p.agentKind === "offline" && <small className="muted">离线规则 Agent 不读取指导，只按默认方案行动。</small>}
      </label>

      <label className="field inline">
        <span>情景种子</span>
        <input aria-label="情景种子" type="number" min={1} value={p.seed} onChange={(e) => p.onSeed(Math.max(1, Number(e.target.value) || 1))} />
        <small className="muted">相同种子固定初始条件，角色行动会影响后续演化。</small>
      </label>

      <button className="primary" disabled={over || p.busy !== null} onClick={p.onPrepare}>
        {p.busy ?? (p.agentKind === "llm" && p.guidance.trim() ? "整理指导" : "准备开局")}
      </button>
    </section>
  );
}

export function GuidanceCard({ guidance, normalized }: { guidance: string; normalized: NormalizedGuidance | null }) {
  if (!guidance.trim()) return <p className="muted">未填写额外策略：以到达站台为目标，角色按所选模式规划路线。</p>;
  if (!normalized) return <p className="quote">「{guidance}」</p>;
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <h4>{title}</h4>
        <ul>
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="guidance">
      <p className="quote">「{guidance}」</p>
      <p>
        <strong>要点：</strong>
        {normalized.summary}
      </p>
      <p>
        <strong>风险态度：</strong>
        {normalized.risk}
      </p>
      {list("优先级", normalized.priorities)}
      {list("约定", normalized.rules)}
      {list("想尝试的做法", normalized.creativeIdeas)}
      {list("无法执行（已忽略）", normalized.notExecutable)}
      {list("初始方案", normalized.initialPlan)}
    </div>
  );
}

interface ControlsProps {
  paused: boolean;
  onPause: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  showVision: boolean;
  onShowVision: () => void;
  showTrail: boolean;
  onShowTrail: () => void;
  onAbort: () => void;
}

export function Controls(p: ControlsProps) {
  return (
    <div className="controls">
      <button onClick={p.onPause}>{p.paused ? "继续" : "暂停"}</button>
      <div className="segmented">
        {[1, 2, 4].map((s) => (
          <button key={s} className={p.speed === s ? "on" : ""} onClick={() => p.onSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={p.showVision} onChange={p.onShowVision} /> 视野
      </label>
      <label className="check">
        <input type="checkbox" checked={p.showTrail} onChange={p.onShowTrail} /> 轨迹
      </label>
      <button className="ghost" onClick={p.onAbort}>
        结束本局
      </button>
    </div>
  );
}
