import type { ActorPose } from "../presentation";
import { cameraFraction, type Point3 } from "./cameraCollision";

export interface CameraOrbit { yaw: number; pitch: number; distance: number }

/** Follow position without inheriting avoidance/interaction turns; only reset realigns behind the actor. */
export class FollowCamera {
  readonly target: Point3 = { x: 0, y: 0, z: 0 };
  readonly position: Point3 = { x: 0, y: 0, z: 0 };
  settled = false;
  private bearing: number | undefined;
  private fraction = 1;
  private releaseDelay = 0;

  /** A new game or the explicit recenter control adopts the actor's current heading. */
  reset() { this.bearing = undefined; }

  /** Reuse numeric output each frame; retract before obstacles and release slowly after clearance. */
  update(pose: ActorPose, orbit: CameraOrbit, delta: number, snap = false, reducedMotion = false) {
    const initial = this.bearing === undefined;
    if (initial) this.bearing = pose.yaw;
    const dt = Math.max(0, Math.min(0.1, delta));
    const blend = initial || snap || reducedMotion ? 1 : 1 - Math.exp(-dt * 12);
    this.target.x += (pose.x - this.target.x) * blend;
    this.target.y += (pose.y + 1.25 - this.target.y) * blend;
    this.target.z += (pose.z - this.target.z) * blend;
    const yaw = this.bearing! + orbit.yaw;
    const dx = -Math.sin(yaw) * orbit.distance;
    const dy = 0.65 + Math.sin(orbit.pitch) * orbit.distance;
    const dz = -Math.cos(yaw) * orbit.distance;
    this.position.x = this.target.x + dx;
    this.position.y = this.target.y + dy;
    this.position.z = this.target.z + dz;
    const safe = cameraFraction(this.target, this.position);
    if (initial || snap || safe < this.fraction) {
      this.fraction = safe;
      this.releaseDelay = safe < 1 ? 0.15 : 0;
    } else {
      // Briefly keep a shortened boom across obstacle-edge flicker instead of pumping in/out.
      this.releaseDelay = Math.max(0, this.releaseDelay - dt);
      if (this.releaseDelay === 0) this.fraction += (safe - this.fraction) * (1 - Math.exp(-dt * 4));
    }
    this.position.x = this.target.x + dx * this.fraction;
    this.position.y = this.target.y + dy * this.fraction;
    this.position.z = this.target.z + dz * this.fraction;
    this.settled = Math.hypot(this.target.x - pose.x, this.target.y - pose.y - 1.25, this.target.z - pose.z) < 0.001
      && Math.abs(safe - this.fraction) * orbit.distance < 0.001;
  }
}
