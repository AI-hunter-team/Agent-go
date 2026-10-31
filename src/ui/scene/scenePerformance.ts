import type { GameSession } from "../gameSession";

export const CAMERA_IDLE_SECONDS = 4;

/** 保存一局的纯展示状态；模拟器、成绩和随机流完全独立。 */
export class ScenePerformance {
  generation = -1;
  time = 0;
  delta = 0;
  victoryAt: number | null = null;
  dance = "";
  previousDance = "";
  previousDanceTime = 0;
  private danceAt = 0;
  cinematicDismissed = false;
  private cameraResumeAt: number | null = null;
  private cameraHeld = false;
  greetingAt: number | null = null;
  greetingDuration = 0;
  selectedUntil = 0;
  visible = true;
  private dances: { name: string; duration: number }[] = [];
  private asset = "";
  private skipFrame = true;

  /** 通过原会话通知唤醒画面，但不推进世界时间。 */
  constructor(private readonly notify: () => void = () => {}, private readonly random: () => number = Math.random) {}

  /** 新局清理展示；第一次胜利开始舞蹈序列，与 Canvas 生命周期无关。 */
  sync(generation: number, success: boolean) {
    if (generation !== this.generation) {
      this.generation = generation; this.time = 0; this.delta = 0; this.victoryAt = null;
      this.dance = ""; this.previousDance = ""; this.previousDanceTime = 0; this.danceAt = 0;
      this.greetingAt = null; this.selectedUntil = 0;
      this.cinematicDismissed = false; this.cameraResumeAt = null; this.cameraHeld = false; this.skipFrame = true;
    }
    if (success && this.victoryAt === null) {
      this.victoryAt = this.time; this.greetingAt = null;
      this.chooseDance();
    }
  }

  /** 资源加载后登记自身动作；不把其他角色的动画移植到当前骨架。 */
  setClips(dances: { name: string; duration: number }[], greetingDuration: number, asset = this.asset) {
    this.setAsset(asset);
    if (this.greetingDuration !== greetingDuration) this.greetingAt = null;
    this.dances = dances.filter((clip) => Number.isFinite(clip.duration) && clip.duration > 0).sort((a, b) => a.name.localeCompare(b.name));
    this.greetingDuration = greetingDuration;
    if (!this.dances.some((clip) => clip.name === this.dance)) { this.dance = ""; this.previousDance = ""; this.chooseDance(); }
    this.notify();
  }

  /** 只有更换模型才清除其动作能力；同一模型重挂载保留问候进度。 */
  setAsset(asset: string) {
    if (asset === this.asset) return;
    this.asset = asset; this.dances = []; this.dance = ""; this.previousDance = ""; this.previousDanceTime = 0;
    this.greetingDuration = 0; this.greetingAt = null; this.notify();
  }

  /** 每段播完重新随机选下一段；多段素材避免紧接着重复，单段素材正常循环。 */
  private chooseDance() {
    if (this.victoryAt === null || !this.dances.length) return;
    const choices = this.dances.length > 1 ? this.dances.filter((clip) => clip.name !== this.dance) : this.dances;
    this.previousDance = this.dance;
    this.previousDanceTime = this.dances.find((clip) => clip.name === this.dance)?.duration ?? 0;
    this.dance = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))].name;
    this.danceAt = this.time;
  }

  /** 当前这一段的播放进度，与不中断的镜头总时钟分开。 */
  get danceTime() { return this.time - this.danceAt; }
  /** 返回胜利展示经过的秒数。 */
  get victoryTime() { return this.victoryAt === null ? 0 : this.time - this.victoryAt; }
  /** 问候播放完成后不再占用渲染调度。 */
  get greetingTime() { return this.greetingAt === null ? null : this.time - this.greetingAt; }
  /** 胜利运镜可被用户接管，舞蹈不受影响。 */
  get cinematic() { return this.victoryAt !== null && !this.cinematicDismissed; }
  /** 只读剩余静置时间；按住拖动期间不启动倒计时。 */
  get cameraResumeIn() { return this.cameraResumeAt === null ? null : Math.max(0, this.cameraResumeAt - this.time); }

  /** 点选时只触发一次问候；减少动态效果只短暂强调脚下标记。 */
  greet(reducedMotion: boolean) {
    if (this.victoryAt !== null || this.greetingAt !== null || this.time < this.selectedUntil) return false;
    this.selectedUntil = this.time + 0.6;
    if (!reducedMotion && this.greetingDuration > 0) this.greetingAt = this.time;
    this.skipFrame = true; this.notify(); return true;
  }

  /** 明确点击总览或回正时保留用户模式，不让临时倒计时覆盖按钮选择。 */
  dismissCamera() {
    if (this.victoryAt === null) return;
    this.cinematicDismissed = true; this.cameraResumeAt = null; this.cameraHeld = false; this.notify();
  }

  /** Return to the cabin shot without restarting the dance or its clock. */
  restoreCamera() {
    if (this.victoryAt === null) return;
    this.cinematicDismissed = false; this.cameraResumeAt = null; this.cameraHeld = false; this.notify();
  }

  /** 拖动临时接管；滚轮每次重置静置时间，按住时不抢回镜头。 */
  interactCamera(held = false) {
    if (this.victoryAt === null) return;
    const changed = this.cinematic;
    this.cinematicDismissed = true; this.cameraHeld = held;
    this.cameraResumeAt = held ? null : this.time + CAMERA_IDLE_SECONDS;
    if (changed || !held) this.notify();
  }

  /** 松开、取消或窗口失焦后才开始恢复倒计时。 */
  releaseCamera() {
    if (!this.cameraHeld) return;
    this.cameraHeld = false; this.cameraResumeAt = this.time + CAMERA_IDLE_SECONDS; this.notify();
  }

  /** 隐藏及重新挂载都丢弃首帧间隔，避免后台时长被算进动作。 */
  setVisible(visible: boolean) { this.visible = visible; this.delta = 0; this.skipFrame = true; }

  /** 按可见渲染帧推进秒表，动作固定 1×，绝不修改会话速度。 */
  advance(delta: number, reducedMotion = false) {
    this.delta = !this.visible || this.skipFrame ? 0 : Math.max(0, Math.min(delta, 0.1));
    this.skipFrame = false; this.time += this.delta;
    if (this.cameraResumeAt !== null && this.time >= this.cameraResumeAt - 1e-8) {
      this.cameraResumeAt = null; this.cinematicDismissed = false; this.notify();
    }
    if (this.greetingTime !== null && this.greetingTime >= this.greetingDuration) this.greetingAt = null;
    if (reducedMotion) this.danceAt += this.delta;
    else {
      const duration = this.dances.find((clip) => clip.name === this.dance)?.duration;
      if (duration && this.danceTime >= duration - 1e-8) this.chooseDance();
    }
  }

  /** 仅有可见动态、问候或短暂选中反馈时维持帧循环。 */
  needsFrames(reducedMotion: boolean) {
    return this.visible && (this.cameraResumeAt !== null || this.greetingAt !== null || this.time < this.selectedUntil || (!reducedMotion && (this.cinematic || !!this.dance)));
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
