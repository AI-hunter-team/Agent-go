import type { PassengerKind, Vec } from "../shared/types";
import { dist, moveToward, segmentIntersectsRect, type Rect } from "./geometry";
import * as legacyLayout from "./layout";
import type { StationLayout } from "../shared/world";
import { facilitySolids } from "./facilityGeometry";

export interface MovingBody { id: string; pos: Vec; from?: Vec; radius: number }
/** The visible naiwa security model is wider than a passenger; keep its body footprint explicit. */
export const GUARD_COLLISION_RADIUS = 0.84;
export const personRadius = (kind: PassengerKind | "guard") => kind === "guard" ? GUARD_COLLISION_RADIUS : kind === "luggage" ? 0.48 : 0.32;

export function createMovement(layout: StationLayout = legacyLayout) {
const {FACILITIES,PILLARS,ATTRACTIONS,MOVE_BLOCKERS,SECURITY_BARRIERS,GATE_BARRIERS,WIDTH,HEIGHT}=layout;
const furniture: Rect[] = FACILITIES.flatMap((f) => facilitySolids(f.kind, f.pos, f.queueDirection));
const solids = [...(layout.solids??[]), ...PILLARS, ...furniture, ...ATTRACTIONS.flatMap(a => a.body ? [a.body] : [])];
/** Shared by persistent route planning and the per-tick collision sweep. */
const SCENERY_OBSTACLES: readonly Rect[] = [...(layout.openings ? [...MOVE_BLOCKERS,...(layout.openingBlocks??layout.openings)] : MOVE_BLOCKERS.slice(0, 3)), ...solids];

// Static scenery is immutable during a world. Reuse body-inflated rectangles
// instead of filtering and allocating them for every visibility-graph edge.
const sceneryByFloor=new Map<string,Rect[]>(),inflatedScenery=new Map<string,Rect[]>();
for(const r of SCENERY_OBSTACLES){const floor=r.floorId??"concourse",rows=sceneryByFloor.get(floor)??[];rows.push(r);sceneryByFloor.set(floor,rows);}
function sceneryFor(floor:string,radius:number){const key=`${floor}:${radius}`;let rows=inflatedScenery.get(key);if(!rows){rows=(sceneryByFloor.get(floor)??[]).map(r=>({x:r.x-radius,y:r.y-radius,w:r.w+radius*2,h:r.h+radius*2}));inflatedScenery.set(key,rows);}return rows;}
/** Service may cross its scanner/gate opening, but never a solid side barrier. */
function clearServiceExit(from: Vec, to: Vec, radius: number): boolean {
  return [...SECURITY_BARRIERS, ...GATE_BARRIERS, ...solids].filter(r=>(r.floorId??"concourse")===(from.floorId??"concourse")).every((obstacle) => {
    const r = { x: obstacle.x - radius, y: obstacle.y - radius, w: obstacle.w + 2 * radius, h: obstacle.h + 2 * radius };
    return !segmentIntersectsRect(from, to, r);
  });
}
const contains = (r: Rect, p: Vec) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Minimum separation throughout one simultaneous, linearly interpolated tick. */
function sweptDistance(a: Vec, to: Vec, b: Vec, bTo = b): number {
  const x = a.x - b.x, y = a.y - b.y;
  const dx = to.x - a.x - bTo.x + b.x, dy = to.y - a.y - bTo.y + b.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, -(x * dx + y * dy) / denominator)) : 0;
  return Math.hypot(x + dx * t, y + dy * t);
}

function clearOfPeople(from: Vec, to: Vec, radius: number, others: readonly MovingBody[]): boolean {
  return others.every((other) => {
    if ((from.floorId ?? "concourse") !== (other.pos.floorId ?? "concourse")) return true;
    const start = other.from ?? other.pos;
    const gap = radius + other.radius + 0.02;
    // Reject distant swept pairs before the exact relative-motion calculation.
    const x0 = from.x - start.x, x1 = to.x - other.pos.x;
    const y0 = from.y - start.y, y1 = to.y - other.pos.y;
    if ((x0 > gap && x1 > gap) || (x0 < -gap && x1 < -gap)
      || (y0 > gap && y1 > gap) || (y0 < -gap && y1 < -gap)) return true;
    const initial = dist(from, start);
    // Imported/test positions may already touch: permit only an outward recovery.
    return initial < gap - 1e-6
      ? dist(to, other.pos) >= initial + 1e-6 && sweptDistance(from, to, start, other.pos) >= initial - 1e-6
      : sweptDistance(from, to, start, other.pos) >= gap - 1e-6;
  });
}

function clearOfScenery(from: Vec, to: Vec, radius: number): boolean {
  if (to.x < radius || to.x > WIDTH - radius || to.y < radius || to.y > HEIGHT - radius) return false;
  if ((from.floorId ?? "concourse") !== (to.floorId ?? "concourse")) return false;
  const minX=Math.min(from.x,to.x),maxX=Math.max(from.x,to.x),minY=Math.min(from.y,to.y),maxY=Math.max(from.y,to.y);
  return sceneryFor(from.floorId??"concourse",radius).every(r => {
    if(maxX<r.x||minX>r.x+r.w||maxY<r.y||minY>r.y+r.h)return true;
    // Keep existing point-nav corner/fixture positions recoverable, but never cross a wall.
    if (contains(r, from)) return !contains(r, to) || dist(to, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) > dist(from, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    return !segmentIntersectsRect(from, to, r);
  });
}

/** Choose a swept, collision-safe stride; wait when an occupied nearby waypoint cannot be reached. */
function steer(from: Vec, target: Vec, stride: number, radius: number, others: readonly MovingBody[], allowDetour = true): Vec {
  const distance = dist(from, target);
  if (distance < 1e-8) return { ...from };
  const step = Math.min(stride, distance);
  const safe = (to: Vec) => clearOfScenery(from, to, radius) && clearOfPeople(from, to, radius, others);
  const direct = moveToward(from, target, step);
  const horizon = Math.min(distance, Math.max(step, 1.15));
  if (safe(moveToward(from, target, horizon)) && safe(direct)) return direct;
  // Circling a blocked point within one stride causes tiny back-and-forth steps and 180° turns.
  if (distance <= stride) return { ...from };
  if (!allowDetour) return safe(direct) ? direct : { ...from };
  const heading = Math.atan2(target.y - from.y, target.x - from.x);
  // Both oncoming walkers prefer their own right, so their passing sides agree.
  let best: Vec | undefined, bestScore = -Infinity;
  for (const angle of [0, 0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05, 1.31, -1.31, 1.57, -1.57, 1.84, -1.84, 2.1, -2.1, 2.36, -2.36, 2.62, -2.62, Math.PI]) {
    const dx = Math.cos(heading + angle), dy = Math.sin(heading + angle);
    const next = { ...from, x: from.x + dx * step, y: from.y + dy * step };
    if (!safe(next)) continue;
    const probe = { ...from, x: from.x + dx * horizon, y: from.y + dy * horizon };
    const score = Math.cos(angle) + (safe(probe) ? 0.75 : 0) + (angle > 0 ? 0.9 : 0);
    if (score > bestScore) { best = next; bestScore = score; }
  }
  return best ?? { ...from };
}

/** Route around queues and solid fixtures together, so a queue detour cannot lead into a machine. */
function detourAroundQueues(from: Vec, target: Vec, queues: readonly Rect[], radius = personRadius("normal")): Vec {
  const blockers = queues.filter((r) => !contains(r, from) && !contains(r, target));
  // Keep the cheap queue-only route when it is already safe; build a combined graph only at fixtures.
  const queueWaypoint = queueDetour(from, target, blockers);
  if (clearOfScenery(from, queueWaypoint, radius)) return queueWaypoint;
  return queueDetour(from, target, blockers, radius);
}

const detourGraphs = new Map<string, { points: Vec[]; clear: boolean[][] }>();

/** Cache the fixed station geometry by body radius; moving queues are checked separately each tick. */
function detourSceneryGraph(radius: number, floorId="concourse") {
  const cached = detourGraphs.get(`${floorId}:${radius}`);
  if (cached) return cached;
  const margin = radius + 0.03;
  const points = SCENERY_OBSTACLES.filter(r=>(r.floorId??"concourse")===floorId).flatMap((r) => [
    { floorId, x: r.x - margin, y: r.y - margin }, { floorId, x: r.x + r.w + margin, y: r.y - margin },
    { floorId, x: r.x - margin, y: r.y + r.h + margin }, { floorId, x: r.x + r.w + margin, y: r.y + r.h + margin },
  ]).filter((point) => clearOfScenery(point, point, radius));
  const graph = { points, clear: points.map((a) => points.map((b) => clearOfScenery(a, b, radius))) };
  detourGraphs.set(`${floorId}:${radius}`, graph);
  return graph;
}

/** Find the next visible corner; optionally include body-inflated fixture corners and edges. */
function queueDetour(from: Vec, target: Vec, blockers: readonly Rect[], radius?: number): Vec {
  // Every candidate edge must be safe for this passenger's body, not just clear of the queue.
  const visible = (a: Vec, b: Vec) => (radius === undefined || clearOfScenery(a, b, radius)) && blockers.every((r) => !segmentIntersectsRect(a, b, r));
  if (visible(from, target)) return target;
  const corners = blockers.flatMap((r) => [
    { floorId:from.floorId, x: r.x - 0.03, y: r.y - 0.03 }, { floorId:from.floorId, x: r.x + r.w + 0.03, y: r.y - 0.03 },
    { floorId:from.floorId, x: r.x - 0.03, y: r.y + r.h + 0.03 }, { floorId:from.floorId, x: r.x + r.w + 0.03, y: r.y + r.h + 0.03 },
  ]).filter((point) => visible(point, point));
  const graph = radius === undefined ? undefined : detourSceneryGraph(radius,from.floorId);
  const staticStart = 2 + corners.length;
  const points = [from, target, ...corners, ...(graph?.points ?? [])];
  const costs = points.map(() => Infinity), previous = points.map(() => -1), done = new Set<number>();
  costs[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < points.length; i++) if (!done.has(i) && Number.isFinite(costs[i]) && (u < 0 || costs[i] < costs[u])) u = i;
    // Wait for a blocked route to clear instead of feeding an impossible target to local steering.
    if (u < 0) return radius === undefined ? target : from;
    if (u === 1) {
      while (previous[u] > 0) u = previous[u];
      return points[u];
    }
    done.add(u);
    for (let v = 1; v < points.length; v++) {
      const cost = costs[u] + dist(points[u], points[v]);
      if (done.has(v) || cost >= costs[v]) continue;
      const clear = graph && u >= staticStart && v >= staticStart
        ? graph.clear[u - staticStart][v - staticStart] && blockers.every((r) => !segmentIntersectsRect(points[u], points[v], r))
        : visible(points[u], points[v]);
      if (clear) { costs[v] = cost; previous[v] = u; }
    }
  }
}

return {clearServiceExit,sweptDistance,clearOfPeople,clearOfScenery,steer,detourAroundQueues,SCENERY_OBSTACLES};
}
export const {clearServiceExit,sweptDistance,clearOfPeople,clearOfScenery,steer,detourAroundQueues,SCENERY_OBSTACLES}=createMovement();
