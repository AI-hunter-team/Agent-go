import { Vector3 } from "three";
import type { ActorPose } from "../presentation";
import { cameraFraction } from "./cameraCollision";
import { constrainCabinCamera } from "./trainCabin";

interface Shot { azimuth: number; distance: number; height: number; focus: number; offset: number; fov: number }
const SHOT_SECONDS = 6;
// 36秒闭合轨迹：环境揭示、低位推进、侧向掠过、升高拉远、英雄近景、斜向回收。
const SHOTS: readonly Shot[] = [
  { azimuth: -55, distance: 5.6, height: 2.6, focus: 0.95, offset: -0.15, fov: 48 },
  { azimuth: -12, distance: 3.5, height: 1.05, focus: 1, offset: 0.05, fov: 42 },
  { azimuth: 68, distance: 4.2, height: 1.65, focus: 1.05, offset: 0.18, fov: 44 },
  { azimuth: 32, distance: 5.4, height: 3.4, focus: 0.9, offset: -0.12, fov: 47 },
  { azimuth: -38, distance: 3.6, height: 0.88, focus: 1, offset: 0.15, fov: 40 },
  { azimuth: -70, distance: 4.9, height: 1.95, focus: 0.95, offset: -0.12, fov: 46 },
];
const SHOT_FIELDS = ["azimuth", "distance", "height", "focus", "offset", "fov"] as const;

/** 接管恢复时从零速度起步，到轨迹处无速度突变。 */
function smooth(value: number) { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }

/** 相邻镜头参数使用同一条三次曲线，穿过节拍时持续运动而非逐段停顿。 */
function cubic(a: number, b: number, c: number, d: number, t: number) {
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
}

/** 循环采样角度、景别、高度及焦距，复用输出对象避免逐帧分配。 */
function sampleShot(seconds: number, out: Shot) {
  const phase = Math.max(0, seconds) / SHOT_SECONDS, index = Math.floor(phase), t = phase - index, n = SHOTS.length;
  const a = SHOTS[(index + n - 1) % n], b = SHOTS[index % n], c = SHOTS[(index + 1) % n], d = SHOTS[(index + 2) % n];
  for (const field of SHOT_FIELDS) out[field] = cubic(a[field], b[field], c[field], d[field], t);
  out.azimuth = Math.max(-76, Math.min(76, out.azimuth));
}

/** 以不同景别和机位编排连续长镜头，并从手动视角平滑恢复。 */
export class VictoryCamera {
  readonly position = new Vector3();
  readonly target = new Vector3();
  fov = 45;
  private readonly start = new Vector3();
  private readonly startTarget = new Vector3();
  private readonly desired = new Vector3();
  private readonly focus = new Vector3();
  private readonly shot = { ...SHOTS[0] };
  private captured = false;
  private capturedAt = 0;
  private startFov = 45;

  /** 保存当前镜头与本次恢复时间，不重启已经播放的舞蹈或电影轨迹。 */
  capture(position: Vector3, direction: Vector3, seconds = 0, fov = 45, focusDistance = 4.2) {
    this.start.copy(position); this.startTarget.copy(position).addScaledVector(direction, focusDistance);
    this.capturedAt = seconds; this.startFov = fov; this.captured = true;
  }

  /** 将导演轨迹转换为场景坐标，保留完整主体、窄屏构图及碰撞约束。 */
  update(pose: ActorPose, seconds: number, aspect: number, reducedMotion: boolean, assetRotation = 0, onTrain = false, viewportHeight = 720) {
    if (onTrain) {
      const t = reducedMotion ? 0 : Math.max(0, seconds - 1.5);
      const direction = pose.z < 15 ? 1 : -1;
      // Reserve the top result and bottom actions, including short landscape screens.
      const visibleFraction = Math.min(.72, Math.max(160, viewportHeight - (viewportHeight <= 500 ? 190 : 270)) / viewportHeight);
      const fitDistance = 2.05 / (2 * Math.tan(23 * Math.PI / 180) * visibleFraction);
      const distance = Math.max(fitDistance, (3.2 + Math.sin(t / 5) * 0.15) * Math.max(1, 0.65 / Math.max(0.3, aspect)));
      this.focus.set(pose.x, pose.y + 0.85, pose.z);
      this.desired.set(pose.x + Math.sin(t / 7) * 0.04, pose.y + 1.15 + Math.sin(t / 6) * 0.16, pose.z + direction * distance);
      const entrance = reducedMotion || !this.captured ? 1 : smooth((seconds - this.capturedAt) / 1.5);
      this.position.lerpVectors(this.start, this.desired, entrance);
      constrainCabinCamera(this.position, pose);
      // Keep the subject centred while the initial view enters the narrow aisle.
      this.target.copy(this.focus);
      this.fov = 46;
      return;
    }
    sampleShot(reducedMotion ? 6 : Math.max(0, seconds - 1.5), this.shot);
    const shot = this.shot, yaw = pose.yaw + assetRotation * Math.PI / 180 + shot.azimuth * Math.PI / 180;
    const distance = shot.distance * Math.max(1, 0.85 / Math.max(0.3, aspect));
    this.focus.set(pose.x + Math.cos(yaw) * shot.offset, pose.y + shot.focus, pose.z - Math.sin(yaw) * shot.offset);
    this.desired.set(pose.x + Math.sin(yaw) * distance, pose.y + shot.height, pose.z + Math.cos(yaw) * distance);
    const entrance = reducedMotion || !this.captured ? 1 : smooth((seconds - this.capturedAt) / 1.5);
    this.position.lerpVectors(this.start, this.desired, entrance);
    this.target.lerpVectors(this.startTarget, this.focus, entrance);
    this.fov = this.startFov + (shot.fov - this.startFov) * entrance;
    const fraction = cameraFraction(this.focus, this.position);
    if (fraction < 1) this.position.lerpVectors(this.focus, this.position, fraction);
  }
}
