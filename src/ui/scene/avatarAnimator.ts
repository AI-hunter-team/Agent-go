import { AnimationClip, AnimationMixer, LoopOnce, PropertyBinding, type AnimationAction, type Object3D } from "three";
import type { Motion } from "../presentation";
import { findAvatarClip } from "../avatarModel";

/** 收集模型自身的舞蹈和问候，兼容导出器的数字后缀。 */
export function findPerformanceClips(clips: AnimationClip[]) {
  return {
    dances: clips.filter((clip) => /dance|victory|celebrat|胜利|舞蹈|庆祝/i.test(clip.name) && clip.duration > 0).map((clip) => clip.name).sort(),
    greeting: clips.find((clip) => /greet|hello|wave|问候|招手|挥手/i.test(clip.name) && clip.duration > 0),
  };
}

/** 由脊柱子树识别上半身，不依赖用户模型的骨骼索引。 */
function upperBodyTracks(model: Object3D, clip: AnimationClip, upper: boolean) {
  const names = new Set<string>();
  model.traverse((bone) => {
    if (!/spine|chest|脊柱|胸/i.test(bone.name)) return;
    bone.traverse((child) => { names.add(child.name); names.add(child.uuid); });
  });
  return clip.tracks.filter((track) => names.has(PropertyBinding.parseTrackName(track.name).nodeName ?? "") === upper);
}

export interface AnimationFrame {
  motion: Motion; delta: number; speed: number; frozen: boolean; reducedMotion: boolean;
  dance: string; victoryTime: number; greetingTime: number | null;
}

/** 显式采样并混合骨架动作：正常步态、完整/上半身问候和无硬切的舞蹈循环。 */
export class AvatarAnimator {
  readonly mixer: AnimationMixer;
  readonly performances: ReturnType<typeof findPerformanceClips>;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly clips = new Map<string, AnimationClip>();
  private readonly normal: Record<Motion, string>;
  private baseTime = 0;
  private base = "";
  private previous = "";
  private transition = 1;
  private walkingBlend = 0;

  /** 为此实例创建播放器及遮罩动作，不改变共享缓存的原始 GLB。 */
  constructor(private readonly model: Object3D, animations: AnimationClip[]) {
    this.mixer = new AnimationMixer(model);
    this.performances = findPerformanceClips(animations);
    this.normal = Object.fromEntries((["idle", "walk", "interact", "jump"] as Motion[]).map((motion) => [motion, findAvatarClip(animations, motion)])) as Record<Motion, string>;
    for (const clip of animations) this.add(clip);
    for (const name of new Set(Object.values(this.normal).filter(Boolean))) {
      const clip = this.clips.get(name)!;
      this.add(new AnimationClip(`${name}:lower`, clip.duration, upperBodyTracks(model, clip, false)));
    }
    for (const name of this.performances.dances) { const duplicate = this.clips.get(name)!.clone(); duplicate.name = `${name}:loop`; this.add(duplicate); }
    const greeting = this.performances.greeting;
    if (greeting) this.add(new AnimationClip(`${greeting.name}:upper`, greeting.duration, upperBodyTracks(model, greeting, true)));
  }

  /** 预先绑定动作；每帧只更新采样时间与权重，不创建新的 Three 对象。 */
  private add(clip: AnimationClip) {
    this.clips.set(clip.name, clip);
    this.bind(clip);
  }

  /** 为首次挂载或 StrictMode 清理后的实例重新建立有效绑定。 */
  private bind(clip: AnimationClip) {
    const action = this.mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
    action.clampWhenFinished = true; action.paused = true; action.enabled = false;
    this.actions.set(clip.name, action);
    return action;
  }

  /** 以指定时间和权重采样；无轨道的遮罩安全跳过。 */
  private sample(name: string, time: number, weight: number, loop = false) {
    const clip = this.clips.get(name);
    if (!clip?.tracks.length || weight <= 0) return;
    const action = this.actions.get(name) ?? this.bind(clip);
    action.play(); action.enabled = true; action.setEffectiveWeight(weight);
    action.time = loop && clip.duration > 0 ? time % clip.duration : Math.min(Math.max(0, time), clip.duration);
  }

  /** 用上一轮尾部与下一轮开头交叠，避免 LoopRepeat 在首尾姿态不同的素材上硬跳。 */
  private danceLoop(name: string, time: number, weight: number) {
    const duration = this.clips.get(name)!.duration, overlap = Math.min(0.25, duration / 4);
    const cycle = duration - overlap, phase = time % cycle;
    const blend = time >= cycle && phase < overlap ? phase / overlap : 1;
    this.sample(name, phase, weight * blend);
    this.sample(`${name}:loop`, cycle + phase, weight * (1 - blend));
  }

  /** 基础动作负责腿部移动；问候按移动状态平滑切换全身或上半身遮罩。 */
  update(frame: AnimationFrame) {
    for (const action of this.actions.values()) action.enabled = false;
    const next = this.normal[frame.motion] || this.normal.idle || this.normal.walk;
    if (next !== this.base) { this.previous = this.base; this.base = next; this.transition = 0; }
    this.transition = Math.min(1, this.transition + frame.delta / 0.16);
    if (!frame.frozen && !frame.reducedMotion) this.baseTime += frame.delta * frame.speed;
    const dance = this.clips.get(frame.dance);
    const danceWeight = dance ? frame.reducedMotion ? 1 : Math.min(1, frame.victoryTime / 0.25) : 0;
    const greeting = this.performances.greeting;
    const greetTime = frame.reducedMotion ? null : frame.greetingTime;
    const greetWeight = greeting && greetTime !== null ? Math.max(0, Math.min(1, greetTime / 0.16, (greeting.duration - greetTime) / 0.18)) * (1 - danceWeight) : 0;
    const walking = frame.motion === "walk" || frame.motion === "jump";
    this.walkingBlend += ((walking ? 1 : 0) - this.walkingBlend) * Math.min(1, frame.delta / 0.12);
    const hasUpper = greeting && this.clips.get(`${greeting.name}:upper`)!.tracks.length > 0;
    const mask = hasUpper ? this.walkingBlend : 0;
    // 任意骨架没有可识别上半身时，移动中保持原步态，避免滑行。
    const safeGreet = walking && !hasUpper ? 0 : greetWeight;
    for (const [name, weight] of [[this.base, this.previous ? this.transition : 1], [this.previous, 1 - this.transition]] as const) {
      this.sample(name, this.baseTime, weight * (1 - danceWeight - safeGreet), true);
      this.sample(`${name}:lower`, this.baseTime, weight * safeGreet * mask, true);
    }
    if (greeting && greetTime !== null) {
      this.sample(greeting.name, greetTime, safeGreet * (1 - mask));
      this.sample(`${greeting.name}:upper`, greetTime, safeGreet * mask);
    }
    if (dance) {
      if (frame.reducedMotion) this.sample(dance.name, Math.min(1, dance.duration * 0.35), 1);
      else this.danceLoop(dance.name, frame.victoryTime, danceWeight);
    }
    this.mixer.update(0);
  }

  /** 卸载时解除动画绑定，防止重建场景累积播放器和骨架引用。 */
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); this.actions.clear(); }
}
