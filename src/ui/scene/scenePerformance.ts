import type { GameSession } from "../gameSession";

export const CAMERA_IDLE_SECONDS = 4;

/** 保存一局的纯展示状态；模拟器、成绩和随机流完全独立。 */
export class ScenePerformance {
  generation = -1;
  time = 0;
  delta = 0;
  victoryAt: number | null = null;
  defeatAt: number | null = null;
  defeatDuration = 0;
  dance = "";
  previousDance = "";
  previousDanceTime = 0;
  private danceAt = 0;
  cinematicDismissed = false;
  private cameraResumeAt: number | null = null;
  private cameraHeld = false;
  greetingAt: number | null = null;
  greetingImmediate = false;
  greetingDuration = 0;
  selectedUntil = 0;
  visible = true;
  private dances: { name: string; duration: number }[] = [];
  private asset = "";
  private skipFrame = true;
  private selectionGreeting: string | undefined;

  /** 通过原会话通知唤醒画面，但不推进世界时间。 */
  constructor(private readonly notify: () => void = () => {}, private readonly random: () => number = Math.random) {}

  /** 新局清理展示；真实胜负各触发一次，主动结束不播放失败动作。 */
  sync(generation: number, success: boolean, failed = false) {
    if (generation !== this.generation) {
      this.generation = generation; this.time = 0; this.delta = 0; this.victoryAt = null;
      this.defeatAt = null;
      this.selectionGreeting = undefined;
      this.dance = ""; this.previousDance = ""; this.previousDanceTime = 0; this.danceAt = 0;
      this.greetingAt = null; this.selectedUntil = 0;
      this.greetingImmediate = false;
      this.cinematicDismissed = false; this.cameraResumeAt = null; this.cameraHeld = false; this.skipFrame = true;
    }
    if (success && this.victoryAt === null) {
      this.victoryAt = this.time; this.greetingAt = null;
      this.chooseDance();
    }
    if (failed && !success && this.defeatAt === null) {
      this.defeatAt = this.time; this.greetingAt = null;
    }
  }

  /** 资源加载后登记自身动作；不把其他角色的动画移植到当前骨架。 */
  setClips(dances: { name: string; duration: number }[], greetingDuration: number, asset = this.asset, defeatDuration = 0) {
    this.setAsset(asset);
    if (this.greetingDuration !== greetingDuration) this.greetingAt = null;
    this.dances = dances.filter((clip) => Number.isFinite(clip.duration) && clip.duration > 0).sort((a, b) => a.name.localeCompare(b.name));
    this.greetingDuration = greetingDuration;
    this.defeatDuration = Number.isFinite(defeatDuration) ? Math.max(0, defeatDuration) : 0;
    if (!this.dances.some((clip) => clip.name === this.dance)) { this.dance = ""; this.previousDance = ""; this.chooseDance(); }
    this.notify();
  }

  /** 只有更换模型才清除其动作能力；同一模型重挂载保留问候进度。 */
  setAsset(asset: string) {
    if (asset === this.asset) return;
    this.asset = asset; this.dances = []; this.dance = ""; this.previousDance = ""; this.previousDanceTime = 0;
    this.defeatDuration = 0;
    this.selectionGreeting = undefined;
    this.greetingDuration = 0; this.greetingAt = null; this.notify();
    this.greetingImmediate = false;
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
  /** 失败动作采样停在末帧，重挂载不会重新播放。 */
  get defeatTime() { return this.defeatAt === null ? null : Math.min(this.defeatDuration, this.time - this.defeatAt); }
  /** 问候播放完成后不再占用渲染调度。 */
  get greetingTime() { return this.greetingAt === null ? null : this.time - this.greetingAt; }
  /** 胜利运镜可被用户接管，舞蹈不受影响。 */
  get cinematic() { return this.victoryAt !== null && !this.cinematicDismissed; }
  /** 只读剩余静置时间；按住拖动期间不启动倒计时。 */
  get cameraResumeIn() { return this.cameraResumeAt === null ? null : Math.max(0, this.cameraResumeAt - this.time); }

  /** 点选时只触发一次问候；减少动态效果只短暂强调脚下标记。 */
  greet(reducedMotion: boolean) {
    if (this.victoryAt !== null || this.defeatAt !== null || this.greetingAt !== null || this.time < this.selectedUntil) return false;
    this.selectedUntil = this.time + 0.6;
    this.greetingImmediate = false;
    if (!reducedMotion && this.greetingDuration > 0) this.greetingAt = this.time;
    this.skipFrame = true; this.notify(); return true;
  }

  /** 选角从问候首帧直接显示；进行中的问候不重置，避免重复点击闪回站姿。 */
  greetSelection(request: string | undefined, reducedMotion: boolean) {
    if (request === undefined || request === this.selectionGreeting) return false;
    this.selectionGreeting = request;
    if (this.greetingDuration <= 0 || this.victoryAt !== null || this.defeatAt !== null || this.greetingAt !== null) return false;
    this.selectedUntil = 0;
    const started = this.greet(reducedMotion);
    this.greetingImmediate = started;
    return started;
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

  /** 仅有可见动态时维持帧循环；失败动作播完后休眠。 */
  needsFrames(reducedMotion: boolean) {
    const defeating = this.defeatAt !== null && this.time - this.defeatAt < this.defeatDuration;
    return this.visible && (this.cameraResumeAt !== null || this.greetingAt !== null || this.time < this.selectedUntil || (!reducedMotion && (this.cinematic || !!this.dance || defeating)));
  }
}

const performances = new WeakMap<GameSession, ScenePerformance>();

/** 同一会话共享展示状态，画质切换和 2D/3D 重挂载仍保留舞蹈选择。 */
export function getScenePerformance(session: GameSession): ScenePerformance {
  let state = performances.get(session);
  if (!state) { state = new ScenePerformance(() => session.notify()); performances.set(session, state); }
  const ended = session.runner?.phase === "ended";
  state.sync(session.generation, ended && session.engine.status === "success",
    ended && session.engine.status === "failed" && session.engine.failReason !== "玩家结束了本局");
  return state;
}
