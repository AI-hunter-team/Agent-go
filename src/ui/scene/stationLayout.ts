import { ESCALATOR_BOTTOM, ESCALATOR_TOP, FACILITIES, GATE_BARRIERS, HEIGHT, PILLARS, SECURITY_BARRIERS, STAIRS_BOTTOM, STAIRS_TOP, WIDTH } from "../../sim/layout";
import type { Vec } from "../../shared/types";
import { TVM_MODEL_OFFSET_X } from "../../sim/facilityGeometry";
import { BASE_WALL_HEIGHT, FRAME_HEIGHT, STATION_CEILING } from "../../assets/station-kit/dimensions";
import { STAIR_DETAILS } from "./staircase";

export { STATION_CEILING } from "../../assets/station-kit/dimensions";
export interface Placement {
  id: string; position: [number, number, number]; yaw: number; scale: [number, number, number];
  upper?: boolean; railLength?: number; slope?: number;
  railStartPost?: boolean;
  /** Zero mounts posts on a fixed sloping escalator skirt rather than stone treads. */
  railSteps?: number;
}
export function deviceYaw(kind: string, direction?: Vec): number {
  return kind === "tvm" && direction ? Math.atan2(direction.x, direction.y) : -Math.PI / 2;
}
export function devicePosition(kind: string, x: number, z: number, direction: Vec = { x: -1, y: 0 }): [number, number, number] {
  return kind === "tvm" ? [x - direction.x * TVM_MODEL_OFFSET_X, 0, z - direction.y * TVM_MODEL_OFFSET_X] : [x, 0, z];
}
export const ESCALATOR_WIDTH = 3;
/** The imported scene and geometry fallback share the same two clear openings. */
export function stationRailingPlacements(): Placement[] {
  const result: Placement[] = [...SECURITY_BARRIERS, ...GATE_BARRIERS].map((r) => ({
    id: "metal-straight", position: [r.x + r.w / 2, 0, r.y + r.h / 2], yaw: -Math.PI / 2, scale: [1, 1, 1], railLength: r.h,
  }));
  const descents = [
    { top: STAIRS_TOP, bottom: STAIRS_BOTTOM, width: STAIR_DETAILS.width, steps: STAIR_DETAILS.count },
    { top: ESCALATOR_TOP, bottom: ESCALATOR_BOTTOM, width: ESCALATOR_WIDTH, steps: 0 },
  ].sort((a, b) => a.top.y - b.top.y);
  let start = 0;
  for (const { top, bottom, width, steps } of descents) {
    const edge = top.y - width / 2;
    result.push({ id: "glass-straight", position: [top.x, 0, (start + edge) / 2], yaw: -Math.PI / 2, scale: [1, 1, 1], railLength: edge - start + 0.16 });
    for (const z of [edge, top.y + width / 2]) result.push({
      id: "glass-stairs", position: [(top.x + bottom.x) / 2, 0, z], yaw: 0, scale: [1, 1, 1],
      railLength: bottom.x - top.x + 0.16, railStartPost: false, slope: -STAIR_DETAILS.drop, railSteps: steps,
    });
    start = top.y + width / 2;
  }
  result.push({ id: "glass-straight", position: [STAIRS_TOP.x, 0, (start + HEIGHT) / 2], yaw: -Math.PI / 2, scale: [1, 1, 1], railLength: HEIGHT - start + 0.16 });
  return result;
}
export function stationPlacements(): Placement[] {
  const result: Placement[] = [];
  const add = (id: string, x: number, y: number, z: number, yaw = 0, scale: [number, number, number] = [1, 1, 1], upper = false) => {
    const p = { id, position: [x, y, z] as [number, number, number], yaw, scale, upper }; result.push(p); return p;
  };
  for (const [start, end, elevation] of [[0, STAIRS_TOP.x, 0], [STAIRS_BOTTOM.x, WIDTH, -2]]) {
    for (let x = start; x < end; x += 3) for (let z = 0; z < HEIGHT; z += 3) {
      const w = Math.min(3, end - x), d = Math.min(3, HEIGHT - z);
      add("floor-sage", x + w / 2, elevation, z + d / 2, 0, [w / 3, 1, d / 3]);
    }
  }
  // Ceiling remains continuous above the staircase and both levels.
  for (let x = 0; x < WIDTH; x += 3) for (let z = 0; z < HEIGHT; z += 3) {
    const w = Math.min(3, WIDTH - x);
    add("ceiling-panel", x + w / 2, STATION_CEILING, z + 1.5, 0, [w / 3, 1, 1], true);
  }
  for (let x = 0; x < WIDTH; x += 3) {
    const w = Math.min(3, WIDTH - x), floor = x >= STAIRS_BOTTOM.x ? -2 : 0;
    for (const z of [-0.21, HEIGHT + 0.21]) {
      add(z < 0 && x % 6 === 0 ? "window-bay" : "wall-straight", x + w / 2, floor, z, 0, [w / 3, (BASE_WALL_HEIGHT - floor) / BASE_WALL_HEIGHT, 1], true);
      add("ceiling-fascia", x + w / 2, BASE_WALL_HEIGHT, z, 0, [w / 3, 1, 1], true);
    }
  }
  // Frame feet stay in the perimeter, never in the walkable hall.
  for (let x = 3; x <= WIDTH - 3; x += 6) for (const z of [-0.22, HEIGHT + 0.22]) {
    const floor = x >= STAIRS_BOTTOM.x ? -2 : 0;
    add("structural-frame", x, floor, z, 0, [1, (FRAME_HEIGHT - floor) / FRAME_HEIGHT, 1], true);
  }
  for (const p of PILLARS) add("pillar", p.x + p.w / 2, 0, p.y + p.h / 2);
  result.push(...stationRailingPlacements());
  for (const def of FACILITIES) add("marking-queue", def.head.x, 0.012, def.head.y, def.queueDirection ? Math.atan2(def.queueDirection.x, def.queueDirection.y) : -Math.PI / 2);
  for (const [start, end, elevation] of [[3, 23, 0], [29, 32, 0], [38, 44, 0], [47, STAIRS_TOP.x - 2, 0], [STAIRS_BOTTOM.x + 3, WIDTH - 2, -2]]) {
    for (let x = start; x < end; x += 3) add("route-straight", x, elevation + 0.003, 15, -Math.PI / 2);
  }
  add("route-split", 20, 0.004, 15, -Math.PI / 2);
  for (const [z, yaw] of [[6, -Math.PI / 2], [24, Math.PI]]) add("route-turn", 20, 0.004, z, yaw);
  for (const x of [7, 20, 31, 40, 50, 56]) add("marking-arrow", x, 0.012, 15, -Math.PI / 2);
  for (let x = 6; x < WIDTH; x += 12) for (const z of [5, 15, 25]) add("light-strip", x, STATION_CEILING - 0.015, z, -Math.PI / 2, [1, 1, 1], true);
  add("portal", 0, 0, 15, Math.PI / 2, [1, 1, 1], true);
  add("sign-totem", 0.3, 0, 11.5, -Math.PI / 2);
  return result;
}
