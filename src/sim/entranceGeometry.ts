import type { EntranceDefinition, StationLayout, WorldDefinition } from "../shared/world";
import type { Vec } from "../shared/types";
import type { Rect } from "./geometry";

export function buildEntrances(layout: StationLayout): EntranceDefinition[] {
  return layout.NAV_NODES.filter(n => n.id === "ENTRANCE" || n.id === "ENTRANCE_B").map(node => {
    const { x, y } = node.pos;
    const sides = [{ distance: x, x: 1, y: 0 }, { distance: layout.WIDTH - x, x: -1, y: 0 }, { distance: y, x: 0, y: 1 }, { distance: layout.HEIGHT - y, x: 0, y: -1 }];
    const inward = sides.sort((a, b) => a.distance - b.distance)[0];
    const id = node.id === "ENTRANCE" ? "A" : "B", width = 3.6;
    const bottom = { ...node.pos, floorId: "concourse", elevation: 0 };
    const foot = { x: x - inward.x * 2, y: y - inward.y * 2, floorId: `entry:${id}`, elevation: 0 };
    const top = { x: x - inward.x * 8, y: y - inward.y * 8, floorId: `entry:${id}`, elevation: 4 };
    const back = { x: top.x - inward.x * 4.5, y: top.y - inward.y * 4.5 };
    return { id, label: `${id}口进站通道`, source:{...top,x:top.x-inward.x*4,y:top.y-inward.y*4}, top, foot, bottom, inward: { x: inward.x, y: inward.y }, width, bounds: {
      x: Math.min(back.x, x) - Math.abs(inward.y) * width / 2,
      y: Math.min(back.y, y) - Math.abs(inward.x) * width / 2,
      w: Math.abs(back.x - x) + Math.abs(inward.y) * width,
      h: Math.abs(back.y - y) + Math.abs(inward.x) * width,
    } };
  });
}

const length = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, (a.elevation ?? 0) - (b.elevation ?? 0));
export const entranceLength = (e: EntranceDefinition, fromSource = false) => (fromSource ? length(e.source, e.top) : 0) + length(e.top, e.foot) + length(e.foot, e.bottom);

/** Arc-length sampling preserves a steady walking speed over the passage, stair and landing. */
export function entrancePoint(e: EntranceDefinition, progress: number, lane = 0, fromSource = false): Vec {
  const points = fromSource ? [e.source, e.top, e.foot, e.bottom] : [e.top, e.foot, e.bottom];
  let distance = Math.max(0, Math.min(1, progress)) * entranceLength(e, fromSource);
  let index = 0;
  while (index < points.length - 2 && distance > length(points[index], points[index + 1])) {
    distance -= length(points[index], points[index + 1]); index++;
  }
  const from = points[index], to = points[index + 1], fraction = Math.min(1, distance / length(from, to));
  const elevation = from.elevation + (to.elevation - from.elevation) * fraction;
  return { x: from.x + (to.x - from.x) * fraction - e.inward.y * lane,
    y: from.y + (to.y - from.y) * fraction + e.inward.x * lane,
    elevation, floorId: elevation > .25 ? `entry:${e.id}` : "concourse" };
}

/** Entry passages share the concourse's display layer, while simulation uses their connector IDs. */
export const displayFloor = (floorId = "concourse") => floorId.startsWith("entry:") ? "concourse" : floorId;

export function worldViewBounds(d: WorldDefinition): Rect {
  const boxes = [d.floors[0].bounds, ...(d.entrances ?? []).map(e => e.bounds)];
  const x = Math.min(...boxes.map(r => r.x)), y = Math.min(...boxes.map(r => r.y));
  return { x, y, w: Math.max(...boxes.map(r => r.x + r.w)) - x, h: Math.max(...boxes.map(r => r.y + r.h)) - y };
}
