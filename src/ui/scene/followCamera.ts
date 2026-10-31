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
  update(pose: ActorPose, orbit: CameraOrbit, delta: number, snap = false, reducedMotion = false, definition?:import("../../shared/world").WorldDefinition) {
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
    // Stay above the actual stair/landing under the camera, rather than looking through its lip.
    for(const entry of definition?.entrances??[]){
      const along=(this.position.x-entry.top.x)*entry.inward.x+(this.position.z-entry.top.y)*entry.inward.y;
      const across=-(this.position.x-entry.top.x)*entry.inward.y+(this.position.z-entry.top.y)*entry.inward.x;
      const playerAlong=(pose.x-entry.top.x)*entry.inward.x+(pose.z-entry.top.y)*entry.inward.y;
      if(along>=-4.3&&along<=8&&Math.abs(across)<entry.width/2&&playerAlong<8&&playerAlong>=-.1){
        const floor=along<0?4:along>6?0:4*(1-along/6);
        this.position.y=Math.max(floor+1.65,Math.min(floor+2.35,this.position.y));
      }
    }
    if(definition?.generatorVersion==="metro-v2"){
      const ceiling=pose.y<-.1?pose.y+2.5:3.6;
      this.position.y=Math.min(this.position.y,ceiling-.18);
    }
    const safe = cameraFraction(this.target, this.position, definition);
    if (initial || snap || reducedMotion || safe < this.fraction) {
      this.fraction = safe;
      this.releaseDelay = safe < 1 ? 0.15 : 0;
    } else {
      // Briefly keep a shortened boom across obstacle-edge flicker instead of pumping in/out.
      this.releaseDelay = Math.max(0, this.releaseDelay - dt);
      if (this.releaseDelay === 0) this.fraction += (safe - this.fraction) * (1 - Math.exp(-dt * 4));
    }
    this.position.x = this.target.x + dx * this.fraction;
    this.position.y = this.target.y + (this.position.y - this.target.y) * this.fraction;
    this.position.z = this.target.z + dz * this.fraction;
    this.settled = Math.hypot(this.target.x - pose.x, this.target.y - pose.y - 1.25, this.target.z - pose.z) < 0.001
      && Math.abs(safe - this.fraction) * orbit.distance < 0.001;
  }
}
