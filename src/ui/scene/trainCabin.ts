import { TRAIN_CENTRE_X } from "../../sim/layout";
import type { ActorPose } from "../presentation";
import type { Point3 } from "./cameraCollision";
import { METRO_PROFILE } from "../../shared/metro";

/** The existing car's aisle, below its interior ceiling and inside both end walls. */
export function constrainCabinCamera(position: Point3, pose: ActorPose) {
  position.x = Math.max(TRAIN_CENTRE_X - 0.65, Math.min(TRAIN_CENTRE_X + 0.65, position.x));
  position.y = Math.max(-1.55, Math.min(-2 + METRO_PROFILE.ceiling - METRO_PROFILE.floor - .2, position.y));
  const direction = pose.z < 15 ? 1 : -1;
  if ((position.z - pose.z) * direction < 2.4) position.z = pose.z + direction * 2.4;
  position.z = Math.max(6.8, Math.min(25.7, position.z));
}
