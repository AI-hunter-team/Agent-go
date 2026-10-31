import { GATE_BARRIERS, HEIGHT, PILLARS, SECURITY_BARRIERS, WIDTH } from "../../sim/layout";
import { STATION_CEILING } from "./stationLayout";

export interface Point3 { x: number; y: number; z: number }
interface CameraBox { low: Point3; high: Point3 }
const bounds = (x: number, y: number, z: number, w: number, h: number, d: number): CameraBox => ({ low: { x, y, z }, high: { x: x + w, y: y + h, z: z + d } });
const CAMERA_BOXES: CameraBox[] = [
  ...PILLARS.map((r) => bounds(r.x, -0.15, r.y, r.w, 4.35, r.h)),
  ...[...SECURITY_BARRIERS, ...GATE_BARRIERS].map((r) => bounds(r.x + r.w / 2 - 0.08, 0, r.y, 0.16, 1.1, r.h)),
  bounds(0, -2.2, -0.41, WIDTH, 6.4, 0.4), bounds(0, -2.2, HEIGHT + 0.01, WIDTH, 6.4, 0.4),
  bounds(0, STATION_CEILING, 0, WIDTH, 0.12, HEIGHT),
  ...[13, 17].flatMap((z) => Array.from({ length: 9 }, (_, i) => bounds(48 + i, -2 * (i + 1) / 9, z - 0.08, 1, 1.1 + 2 / 9, 0.16))),
];
/** Height-aware clipping: transparent low railings do not behave like full-height walls. */
export function cameraFraction(target: Point3, desired: Point3): number {
  const delta = { x: desired.x - target.x, y: desired.y - target.y, z: desired.z - target.z };
  let nearest = 1;
  for (const box of CAMERA_BOXES) {
    const low = { x: box.low.x - 0.12, y: box.low.y - 0.08, z: box.low.z - 0.12 };
    const high = { x: box.high.x + 0.12, y: box.high.y + 0.08, z: box.high.z + 0.12 };
    let enter = 0, exit = 1;
    for (const axis of ["x", "y", "z"] as const) {
      if (Math.abs(delta[axis]) < 1e-9) {
        if (target[axis] < low[axis] || target[axis] > high[axis]) { exit = -1; break; }
      } else {
        const a = (low[axis] - target[axis]) / delta[axis], b = (high[axis] - target[axis]) / delta[axis];
        enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit && enter > 0) nearest = Math.min(nearest, Math.max(0.05, enter - 0.04));
  }
  return nearest;
}
