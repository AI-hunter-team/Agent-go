import type { FacilityKind, Vec } from "../shared/types";
import type { Rect } from "./geometry";

/** Pure numeric contracts shared by model generation, rendering and local avoidance. */
export const TVM_MODEL_OFFSET_X = 0.264;
export const SECURITY_POST_OFFSET = 1.11;
export const GATE_CABINET_OFFSET = 0.56;
export const GATE_CABINET_WIDTH = 0.1;
export const GATE_CLEAR_WIDTH = GATE_CABINET_OFFSET * 2 - GATE_CABINET_WIDTH;
export const CONVEYOR = { x: -0.88, y: 0.55, w: 1.4, h: 0.5 } as const;

export function facilitySolids(kind: FacilityKind, pos: Vec, queueDirection?: Vec): Rect[] {
  const local: Rect[] = kind === "tvm" ? [{ x: -0.175, y: -0.425, w: 0.789, h: 0.85 }]
    : kind === "security" ? [CONVEYOR, ...[-SECURITY_POST_OFFSET, SECURITY_POST_OFFSET].map((z) => ({ x: -0.244, y: z - 0.11, w: 0.454, h: 0.22 }))]
    : [-GATE_CABINET_OFFSET, GATE_CABINET_OFFSET].map((z) => ({ x: -0.555, y: z - 0.055, w: 1.11, h: 0.11 }));
  return local.map((r) => kind === "tvm" && queueDirection?.y === 1
    ? { x: pos.x + r.y, y: pos.y - r.x - r.w, w: r.h, h: r.w }
    : { x: pos.x + r.x, y: pos.y + r.y, w: r.w, h: r.h });
}
