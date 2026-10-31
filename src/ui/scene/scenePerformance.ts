import type { GameSession } from "../gameSession";

/** 保存一局的纯展示状态；模拟器、成绩和随机流完全独立。 */
export class ScenePerformance {
  generation = -1;
  time = 0;
  delta = 0;
  victoryAt: number | null = null;
  dance = "";
  cinematicDismissed = false;
  greetingAt: number | null = null;
  greetingDuration = 0;
  selectedUntil = 0;
  visible = true;
  private roll = 0;
  private dances: string[] = [];
  private asset = "";
  private skipFrame = true;

  /** 通过原会话通知唤醒画面，但不推进世界时间。 */
  constructor(private readonly notify: () => void = () => {}, private readonly random: () => number = Math.random) {}

  /** 新局清理展示；第一次胜利只抽取一次，与 Canvas 生命周期无关。 */
  sync(generation: number, success: boolean) {
    if (generation !== this.generation) {
      this.generation = generation; this.time = 0; this.delta = 0; this.victoryAt = null;
      this.dance = ""; this.greetingAt = null; this.selectedUntil = 0;
      this.cinematicDismissed = false; this.skipFrame = true;
    }
    if (success && this.victoryAt === null) {
      this.victoryAt = this.time; this.roll = this.random(); this.greetingAt = null;
      this.chooseDance();
    }
  }

  /** 资源加载后登记自身动作；不把其他角色的动画移植到当前骨架。 */
  setClips(dances: string[], greetingDuration: number, asset = this.asset) {
    this.setAsset(asset);
    if (this.greetingDuration !== greetingDuration) this.greetingAt = null;
    this.dances = [...dances].sort(); this.greetingDuration = greetingDuration;
    this.chooseDance(); this.notify();
  }

  /** 只有更换模型才清除其动作能力；同一模型重挂载保留问候进度。 */
  setAsset(asset: string) {
    if (asset === this.asset) return;
    this.asset = asset; this.dances = []; this.dance = "";
    this.greetingDuration = 0; this.greetingAt = null; this.notify();
  }

  /** 使用本局保存的随机值映射动作，重建画面或换画质不会重抽。 */
  private chooseDance() {
    this.dance = this.victoryAt === null || !this.dances.length ? "" : this.dances[Math.min(this.dances.length - 1, Math.floor(this.roll * this.dances.length))];
  }

  /** 返回胜利展示经过的秒数。 */
  get victoryTime() { return this.victoryAt === null ? 0 : this.time - this.victoryAt; }
  /** 问候播放完成后不再占用渲染调度。 */
  get greetingTime() { return this.greetingAt === null ? null : this.time - this.greetingAt; }
  /** 胜利运镜可被用户接管，舞蹈不受影响。 */
  get cinematic() { return this.victoryAt !== null && !this.cinematicDismissed; }

  /** 点选时只触发一次问候；减少动态效果只短暂强调脚下标记。 */
  greet(reducedMotion: boolean) {
    if (this.victoryAt !== null || this.greetingAt !== null || this.time < this.selectedUntil) return false;
    this.selectedUntil = this.time + 0.6;
    if (!reducedMotion && this.greetingDuration > 0) this.greetingAt = this.time;
    this.skipFrame = true; this.notify(); return true;
  }

  /** 手动镜头操作接管控制权。 */
  dismissCamera() { if (!this.cinematic) return; this.cinematicDismissed = true; this.notify(); }

  /** 隐藏及重新挂载都丢弃首帧间隔，避免后台时长被算进动作。 */
  setVisible(visible: boolean) { this.visible = visible; this.delta = 0; this.skipFrame = true; }

  /** 按可见渲染帧推进秒表，动作固定 1×，绝不修改会话速度。 */
  advance(delta: number) {
    this.delta = !this.visible || this.skipFrame ? 0 : Math.max(0, Math.min(delta, 0.1));
    this.skipFrame = false; this.time += this.delta;
    if (this.greetingTime !== null && this.greetingTime >= this.greetingDuration) this.greetingAt = null;
  }

  /** 仅有可见动态、问候或短暂选中反馈时维持帧循环。 */
  needsFrames(reducedMotion: boolean) {
    return this.visible && (this.greetingAt !== null || this.time < this.selectedUntil || (!reducedMotion && (this.cinematic || !!this.dance)));
  }
}

const performances = new WeakMap<GameSession, ScenePerformance>();

/** 同一会话共享展示状态，画质切换和 2D/3D 重挂载仍保留舞蹈选择。 */
export function getScenePerformance(session: GameSession): ScenePerformance {
  let state = performances.get(session);
  if (!state) { state = new ScenePerformance(() => session.notify()); performances.set(session, state); }
  state.sync(session.generation, session.runner?.phase === "ended" && session.engine.status === "success");
  return state;
}
