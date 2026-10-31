import { Vector3 } from "three";
import type { ActorPose } from "../presentation";
import { cameraFraction } from "./cameraCollision";

/** 平滑起止，不在进入环绕时突然加速。 */
function smooth(value: number) { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }

/** 计算正面低机位长镜头，并复用站厅遮挡约束。 */
export class VictoryCamera {
  readonly position = new Vector3();
  readonly target = new Vector3();
  private readonly start = new Vector3();
  private readonly startTarget = new Vector3();
  private readonly desired = new Vector3();
  private readonly focus = new Vector3();
  private captured = false;

  /** 从当前真实相机视角接入，保留跟随/总览切入时的空间连续性。 */
  capture(position: Vector3, direction: Vector3) {
    this.start.copy(position); this.startTarget.copy(position).addScaledVector(direction, 4.2); this.captured = true;
  }

  /** 用独立展示时间构图；窄画幅适当拉远，完整保留舞蹈的手脚。 */
  update(pose: ActorPose, seconds: number, aspect: number, reducedMotion: boolean, assetRotation = 0) {
    const t = reducedMotion ? 6 : seconds;
    const push = smooth((t - 1.5) / 4.5);
    const angle = t <= 6 ? -35 * (1 - push) : 35 * Math.sin((t - 6) * Math.PI * 2 / 16) * smooth((t - 6) / 2);
    const yaw = pose.yaw + assetRotation * Math.PI / 180 + angle * Math.PI / 180;
    const distance = (4.5 - 0.9 * push) * Math.max(1, 0.85 / Math.max(0.3, aspect));
    this.focus.set(pose.x, pose.y + 0.95, pose.z);
    this.desired.set(pose.x + Math.sin(yaw) * distance, pose.y + 1.75 - push * 0.5, pose.z + Math.cos(yaw) * distance);
    const entrance = reducedMotion || !this.captured ? 1 : smooth(t / 1.5);
    this.position.lerpVectors(this.start, this.desired, entrance);
    this.target.lerpVectors(this.startTarget, this.focus, entrance);
    // 角色到镜头的安全线段优先，避免楼梯扶手、顶板或墙柱遮住主体。
    const fraction = cameraFraction(this.focus, this.position);
    if (fraction < 1) this.position.lerpVectors(this.focus, this.position, fraction);
  }
}
