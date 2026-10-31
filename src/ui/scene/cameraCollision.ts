import { ATTRACTIONS, PILLARS, SECURITY_WALL, WIDTH } from "../../sim/layout";

export interface Point3 { x: number; y: number; z: number; }
const CAMERA_WALLS = [...SECURITY_WALL, ...PILLARS, { x: 0, y: -0.5, w: WIDTH, h: 0.4 }, { x: 0, y: 30.1, w: WIDTH, h: 0.4 }]
  .map(r => ({ ...r, height: 3.6 })).concat(ATTRACTIONS.filter(a => a.body).map(a => ({ ...a.body!, height: a.blocksSight ? 2.8 : 1.5 })));
/** Segment-vs-box clipping. Uses the exact logical wall/column footprints. */
export function cameraFraction(target: Point3, desired: Point3): number {
  const delta = { x: desired.x - target.x, y: desired.y - target.y, z: desired.z - target.z };
  let nearest = 1;
  for (const rect of CAMERA_WALLS) {
    const low = { x: rect.x - 0.18, y: -0.15, z: rect.y - 0.18 };
    const high = { x: rect.x + rect.w + 0.18, y: rect.height, z: rect.y + rect.h + 0.18 };
    let enter = 0;
    let exit = 1;
    for (const axis of ["x", "y", "z"] as const) {
      if (Math.abs(delta[axis]) < 1e-9) {
        if (target[axis] < low[axis] || target[axis] > high[axis]) { exit = -1; break; }
      } else {
        const a = (low[axis] - target[axis]) / delta[axis];
        const b = (high[axis] - target[axis]) / delta[axis];
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit && enter > 0) nearest = Math.min(nearest, Math.max(0.05, enter - 0.04));
  }
  return nearest;
}
