import { countChars } from "../shared/guidance";
import { GUIDANCE_MAX_CHARS, type NormalizedGuidance } from "../shared/types";
import type { GameSettings } from "../shared/gameSettings";
import { randomSeed } from "./seed";

export type AgentChoice = "llm" | "offline";

interface SetupProps {
  backpack?: boolean;
  onBackpack?: (value: boolean) => void;
  llmAvailable: boolean;
  model: string | null;
  agentKind: AgentChoice;
  onAgentKind: (k: AgentChoice) => void;
  seed: number;
  onSeed: (s: number) => void;
  settings: Readonly<GameSettings>;
  onTimeLimit: (seconds: number) => void;
  guidance: string;
  onGuidance: (g: string) => void;
  busy: string | null;
  onPrepare: () => void;
  onConfigureModel: () => void;
}

/** 展示开局表单，将截止时间、角色模式、指导和种子交回主界面处理。 */
export function SetupPanel(p: SetupProps) {
  const chars = countChars(p.guidance);
  const over = chars > GUIDANCE_MAX_CHARS;
  return (
    <section className="card setup" aria-busy={p.busy !== null}>
      <h2>出发之前</h2>
      <p className="muted setup-goal">
        {`唯一目标：限时 ${p.settings.timeLimitSeconds} 秒内进入站台，尽可能缩短路径和总用时。常规路线是买票、安检、刷票过闸、下楼到站台；角色依据你的指导自主选择方案，结果由环境判定。`}
      </p>

      <label className="check"><input type="checkbox" checked={p.backpack ?? true} disabled={p.busy !== null} onChange={e => p.onBackpack?.(e.target.checked)} />携带背包（容量 4，安检增加 2 秒；可途中丢弃）</label>
      <div className="field">
        <label htmlFor="game-deadline">截止时间</label>
        <select id="game-deadline" value={p.settings.timeLimitSeconds} disabled={p.busy !== null} onChange={(e) => p.onTimeLimit(Number(e.target.value))}>
          <option value={120}>2 分钟</option>
          <option value={150}>2 分 30 秒（默认）</option>
          <option value={180}>3 分钟</option>
          <option value={240}>4 分钟</option>
          <option value={300}>5 分钟</option>
        </select>
      </div>

      <div className="field" role="group" aria-label="角色驱动方式">
        <span>角色由谁驱动</span>
        <div className="segmented agent-options">
          <button aria-pressed={p.agentKind === "llm"} className={p.agentKind === "llm" ? "on" : ""} disabled={!p.llmAvailable} onClick={() => p.onAgentKind("llm")}>
            大模型
          </button>
          <button aria-pressed={p.agentKind === "offline"} className={p.agentKind === "offline" ? "on" : ""} onClick={() => p.onAgentKind("offline")}>
            离线规则 Agent
          </button>
        </div>
        <p className="muted model-ready">{p.llmAvailable ? `已就绪：${p.model ?? "大模型"}` : "配置你自己的 API，验证后即可开启大模型。"}</p>
        <div className="row model-link">
          <button className="ghost" onClick={p.onConfigureModel}>模型 API 配置</button>
        </div>
      </div>

      <div className="field">
        <span>
          <label htmlFor="player-guidance">你的指导</label>
          <em className={over ? "count over" : "count"}>
            {chars}/{GUIDANCE_MAX_CHARS}
          </em>
        </span>
        <textarea
          id="player-guidance"
          rows={4}
          value={p.guidance}
          placeholder="例如：优先选人少但没有大件行李的队伍；安检通道看效率，不要只看人数；遇到停用立刻换。"
          onChange={(e) => p.onGuidance(e.target.value)}
          disabled={p.agentKind === "offline"}
          aria-invalid={over}
          aria-describedby="guidance-help"
        />
        <small id="guidance-help" className={over ? "over" : "muted"}>{over ? `指导超过 ${GUIDANCE_MAX_CHARS} 字，请删减后继续。` : p.agentKind === "offline" ? "离线规则 Agent 不读取指导，只按默认方案行动。" : "可留空，让角色自主规划。"}</small>
      </div>

      <div className="field">
        <label htmlFor="scenario-seed">情景种子</label>
        <div className="seed-controls">
          <input id="scenario-seed" aria-label="情景种子" type="number" min={1} max={4_294_967_295} step={1} value={p.seed} disabled={p.busy !== null} onChange={(e) => p.onSeed(Math.min(4_294_967_295, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
          <button type="button" disabled={p.busy !== null} onClick={() => p.onSeed(randomSeed(p.seed))}>刷新随机种子</button>
        </div>
        <small className="muted">新局默认随机生成，也可手动填写。相同种子固定初始条件，角色行动会影响后续演化。</small>
      </div>

      <div className="setup-action"><p className="small muted">{`每条初始开放队列额外 ${p.settings.extraQueuePeople} 人。`}</p>
      <button className="primary" disabled={over || p.busy !== null} onClick={p.onPrepare}>
        {p.busy ?? (p.agentKind === "llm" && p.guidance.trim() ? "整理指导" : "准备开局")}
      </button>
      </div>
    </section>
  );
}

/** 展示原始指导及整理结果，供开局确认与复盘阅读。 */
export function GuidanceCard({ guidance, normalized }: { guidance: string; normalized: NormalizedGuidance | null }) {
  if (!guidance.trim()) return <p className="muted">未填写额外策略：以到达站台为目标，角色按所选模式规划路线。</p>;
  if (!normalized) return <p className="quote">「{guidance}」</p>;
  // 仅为有内容的策略分组生成标题和列表。
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

/** 提供兼容二维界面的暂停、倍速、视野与结束操作。 */
export function Controls(p: ControlsProps) {
  return (
    <div className="controls">
      <button onClick={p.onPause}>{p.paused ? "继续" : "暂停"}</button>
      <div className="segmented" role="group" aria-label="播放速度">
        {[1, 2, 4].map((s) => (
          <button key={s} aria-pressed={p.speed === s} className={p.speed === s ? "on" : ""} onClick={() => p.onSpeed(s)}>
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
