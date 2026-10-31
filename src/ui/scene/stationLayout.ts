import { FACILITIES, GATE_BARRIERS, HEIGHT, PILLARS, SECURITY_BARRIERS, STAIRS_BOTTOM, STAIRS_TOP, WIDTH } from "../../sim/layout";
import { TVM_MODEL_OFFSET_X } from "../../sim/facilityGeometry";

export const STATION_CEILING = 4.25;
export interface Placement {
  id: string; position: [number, number, number]; yaw: number; scale: [number, number, number];
  upper?: boolean; railLength?: number; slope?: number;
}
export function devicePosition(kind: string, x: number, z: number): [number, number, number] {
  return [x + (kind === "tvm" ? TVM_MODEL_OFFSET_X : 0), 0, z];
}
export function stationPlacements(): Placement[] {
  const result: Placement[] = [];
  const add = (id: string, x: number, y: number, z: number, yaw = 0, scale: [number, number, number] = [1, 1, 1], upper = false) => {
    const p = { id, position: [x, y, z] as [number, number, number], yaw, scale, upper }; result.push(p); return p;
  };
  for (const [start, end, elevation] of [[0, STAIRS_TOP.x, 0], [STAIRS_BOTTOM.x, WIDTH, -2]]) {
    for (let x = start; x < end; x += 3) for (let z = 0; z < HEIGHT; z += 3) {
      const w = Math.min(3, end - x), d = Math.min(3, HEIGHT - z);
      add(elevation < 0 || x >= 44 ? "floor-sage" : x >= 26 ? "floor-ivory" : "floor-plain", x + w / 2, elevation, z + d / 2, 0, [w / 3, 1, d / 3]);
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
      add(z < 0 && x % 6 === 0 ? "window-bay" : "wall-straight", x + w / 2, floor, z, 0, [w / 3, (3.5 - floor) / 3.5, 1], true);
      add("ceiling-fascia", x + w / 2, 3.5, z, 0, [w / 3, 1, 1], true);
    }
  }
  // Frame feet stay in the perimeter, never in the walkable hall.
  for (let x = 3; x <= WIDTH - 3; x += 6) for (const z of [-0.22, HEIGHT + 0.22]) {
    const floor = x >= STAIRS_BOTTOM.x ? -2 : 0;
    add("structural-frame", x, floor, z, 0, [1, (4.2 - floor) / 4.2, 1], true);
  }
  for (const p of PILLARS) add("pillar", p.x + p.w / 2, 0, p.y + p.h / 2, 0, [1, 4.2 / 3.5, 1]);
  for (const r of [...SECURITY_BARRIERS, ...GATE_BARRIERS]) {
    result.push({ id: "railing-straight", position: [r.x + r.w / 2, 0, r.y + r.h / 2], yaw: -Math.PI / 2, scale: [1, 1, 1], railLength: r.h });
  }
  for (const [start, end] of [[0, 13], [17, HEIGHT]]) {
    result.push({ id: "railing-straight", position: [STAIRS_TOP.x, 0, (start + end) / 2], yaw: -Math.PI / 2, scale: [1, 1, 1], railLength: end - start });
  }
  for (const z of [13, 17]) result.push({ id: "railing-straight", position: [(STAIRS_TOP.x + STAIRS_BOTTOM.x) / 2, 0, z], yaw: 0, scale: [1, 1, 1], railLength: STAIRS_BOTTOM.x - STAIRS_TOP.x, slope: -2 });
  for (const def of FACILITIES) add("marking-queue", def.head.x, 0.012, def.head.y, -Math.PI / 2);
  for (const [start, end, elevation] of [[3, 23, 0], [29, 32, 0], [38, 44, 0], [60, 66, -2]]) {
    for (let x = start; x < end; x += 3) add("route-straight", x, elevation + 0.003, 15, -Math.PI / 2);
  }
  add("route-split", 20, 0.004, 15, -Math.PI / 2);
  for (const [z, yaw] of [[6, -Math.PI / 2], [24, Math.PI]]) add("route-turn", 20, 0.004, z, yaw);
  for (const x of [7, 20, 31, 40, 46]) add("marking-arrow", x, 0.012, 15, -Math.PI / 2);
  for (const x of [6, 18, 30, 42, 60, 66]) for (const z of [5, 15, 25]) add("light-strip", x, STATION_CEILING - 0.015, z, -Math.PI / 2, [1, 1, 1], true);
  add("portal", 0, 0, 15, Math.PI / 2, [1, 4.2 / 3.5, 1], true);
  add("sign-totem", 0.3, 0, 11.5, -Math.PI / 2);
  return result;
}
