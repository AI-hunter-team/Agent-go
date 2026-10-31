import { TRAIN_CENTRE_X } from "../../sim/layout";
import type { ActorPose } from "../presentation";
import type { Point3 } from "./cameraCollision";
import { METRO_PROFILE } from "../../shared/metro";
import { generatedTrainLayout } from "../../shared/generatedTrain";
import type { WorldDefinition } from "../../shared/world";

/** The existing car's aisle, below its interior ceiling and inside both end walls. */
export function constrainCabinCamera(position: Point3, pose: ActorPose, definition?: WorldDefinition) {
  if (definition?.generatorVersion === "metro-v1" && definition.layout.platformAxis) {
    const axis = definition.layout.platformAxis, horizontal = axis.direction === "x";
    const length = horizontal ? definition.layout.WIDTH : definition.layout.HEIGHT;
    const along = horizontal ? pose.x : pose.z, across = horizontal ? pose.z - axis.center : axis.center - pose.x;
    const layout = generatedTrainLayout(length), centre = layout.centres.reduce((a, b) => Math.abs(a - along) < Math.abs(b - along) ? a : b);
    const side = across < 0 ? -1 : 1, track = side * layout.trackCentre;
    let cameraAlong = horizontal ? position.x : position.z;
    let cameraAcross = horizontal ? position.z - axis.center : axis.center - position.x;
    cameraAcross = Math.max(track - .65, Math.min(track + .65, cameraAcross));
    const direction = along < centre ? 1 : -1;
    if ((cameraAlong - along) * direction < 2.4) cameraAlong = along + direction * 2.4;
    cameraAlong = Math.max(centre - 10.4, Math.min(centre + 10.4, cameraAlong));
    if (horizontal) { position.x = cameraAlong; position.z = axis.center + cameraAcross; }
    else { position.x = axis.center - cameraAcross; position.z = cameraAlong; }
    position.y = Math.max(-5.55, Math.min(-6 + METRO_PROFILE.ceiling - METRO_PROFILE.floor - .2, position.y));
    return;
  }
  position.x = Math.max(TRAIN_CENTRE_X - 0.65, Math.min(TRAIN_CENTRE_X + 0.65, position.x));
  position.y = Math.max(-1.55, Math.min(-2 + METRO_PROFILE.ceiling - METRO_PROFILE.floor - .2, position.y));
  const direction = pose.z < 15 ? 1 : -1;
  if ((position.z - pose.z) * direction < 2.4) position.z = pose.z + direction * 2.4;
  position.z = Math.max(6.8, Math.min(25.7, position.z));
}
