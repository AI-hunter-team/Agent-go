import { ESCALATOR_TOP, FACILITIES, GATE_BARRIERS, HEIGHT, PILLARS, SECURITY_BARRIERS, STAIRS_BOTTOM, STAIRS_TOP, WIDTH } from "../../sim/layout";
import { TVM_MODEL_OFFSET_X } from "../../sim/facilityGeometry";
import { BASE_WALL_HEIGHT, FRAME_HEIGHT, STATION_CEILING } from "../../assets/station-kit/dimensions";

export { STATION_CEILING } from "../../assets/station-kit/dimensions";
export interface Placement {
  id: string; position: [number, number, number]; yaw: number; scale: [number, number, number];
  upper?: boolean; railLength?: number; slope?: number;
  railStartPost?: boolean;
}
export function devicePosition(kind: string, x: number, z: number): [number, number, number] {
  return [x, 0, z - (kind === "tvm" ? TVM_MODEL_OFFSET_X : 0)];
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
  for (const r of [...SECURITY_BARRIERS, ...GATE_BARRIERS]) {
    result.push({ id: "metal-straight", position: [r.x + r.w / 2, 0, r.y + r.h / 2], yaw: -Math.PI / 2, scale: [1, 1, 1], railLength: r.h });
  }
  for (const [start, end] of [[0, STAIRS_TOP.y - 2], [STAIRS_TOP.y + 2, ESCALATOR_TOP.y - 1.5], [ESCALATOR_TOP.y + 1.5, HEIGHT]]) {
    result.push({ id: "glass-straight", position: [STAIRS_TOP.x, 0, (start + end) / 2], yaw: -Math.PI / 2, scale: [1, 1, 1], railLength: end - start + 0.16 });
  }
  for (const z of [STAIRS_TOP.y - 2, STAIRS_TOP.y + 2]) result.push({ id: "glass-stairs", position: [(STAIRS_TOP.x + STAIRS_BOTTOM.x) / 2, 0, z], yaw: 0, scale: [1, 1, 1], railLength: STAIRS_BOTTOM.x - STAIRS_TOP.x + 0.16, railStartPost: false, slope: -2 });
  for (const def of FACILITIES) add("marking-queue", def.head.x, 0.012, def.head.y, def.kind === "tvm" ? 0 : -Math.PI / 2);
  for (const [start, end, elevation] of [[3, 23, 0], [29, 32, 0], [38, 55, 0], [STAIRS_BOTTOM.x + 2, WIDTH - 3, -2]]) {
    for (let x = start; x < end; x += 3) add("route-straight", x, elevation + 0.003, 15, -Math.PI / 2);
  }
  add("route-split", 20, 0.004, 15, -Math.PI / 2);
  for (const [z, yaw] of [[6, -Math.PI / 2], [24, Math.PI]]) add("route-turn", 20, 0.004, z, yaw);
  for (const x of [7, 20, 31, 40, 46]) add("marking-arrow", x, 0.012, 15, -Math.PI / 2);
  for (const x of [6, 18, 30, 42, 60, 66]) for (const z of [5, 15, 25]) add("light-strip", x, STATION_CEILING - 0.015, z, -Math.PI / 2, [1, 1, 1], true);
  add("portal", 0, 0, 15, Math.PI / 2, [1, 1, 1], true);
  add("sign-totem", 0.3, 0, 11.5, -Math.PI / 2);
  return result;
}
