import type { PassengerKind, Vec } from "../shared/types";
import { dist, moveToward, segmentIntersectsRect, type Rect } from "./geometry";
import { ATTRACTIONS, FACILITIES, GATE_BARRIERS, HEIGHT, MOVE_BLOCKERS, PILLARS, SECURITY_BARRIERS, WIDTH } from "./layout";
import { facilitySolids } from "./facilityGeometry";

export interface MovingBody { id: string; pos: Vec; from?: Vec; radius: number }
export const personRadius = (kind: PassengerKind | "guard") => kind === "luggage" ? 0.48 : 0.32;
const furniture: Rect[] = FACILITIES.flatMap((f) => facilitySolids(f.kind, f.pos, f.queueDirection));
const solids = [...PILLARS, ...furniture, ...ATTRACTIONS.flatMap(a => a.body ? [a.body] : [])];
/** Shared by persistent route planning and the per-tick collision sweep. */
export const SCENERY_OBSTACLES: readonly Rect[] = [...MOVE_BLOCKERS.slice(0, 3), ...solids];

/** Service may cross its scanner/gate opening, but never a solid side barrier. */
export function clearServiceExit(from: Vec, to: Vec, radius: number): boolean {
  return [...SECURITY_BARRIERS, ...GATE_BARRIERS, ...solids].every((obstacle) => {
    const r = { x: obstacle.x - radius, y: obstacle.y - radius, w: obstacle.w + 2 * radius, h: obstacle.h + 2 * radius };
    return !segmentIntersectsRect(from, to, r);
  });
}
const contains = (r: Rect, p: Vec) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Minimum separation throughout one simultaneous, linearly interpolated tick. */
export function sweptDistance(a: Vec, to: Vec, b: Vec, bTo = b): number {
  const x = a.x - b.x, y = a.y - b.y;
  const dx = to.x - a.x - bTo.x + b.x, dy = to.y - a.y - bTo.y + b.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, -(x * dx + y * dy) / denominator)) : 0;
  return Math.hypot(x + dx * t, y + dy * t);
}

export function clearOfPeople(from: Vec, to: Vec, radius: number, others: readonly MovingBody[]): boolean {
  return others.every((other) => {
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

export function clearOfScenery(from: Vec, to: Vec, radius: number): boolean {
  if (to.x < radius || to.x > WIDTH - radius || to.y < radius || to.y > HEIGHT - radius) return false;
  return SCENERY_OBSTACLES.every((obstacle) => {
    const r = { x: obstacle.x - radius, y: obstacle.y - radius, w: obstacle.w + radius * 2, h: obstacle.h + radius * 2 };
    // Keep existing point-nav corner/fixture positions recoverable, but never cross a wall.
    if (contains(r, from)) return !contains(r, to) || dist(to, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) > dist(from, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    return !segmentIntersectsRect(from, to, r);
  });
}

/** Choose a swept, collision-safe stride; wait when an occupied nearby waypoint cannot be reached. */
export function steer(from: Vec, target: Vec, stride: number, radius: number, others: readonly MovingBody[], allowDetour = true): Vec {
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
    const next = { x: from.x + dx * step, y: from.y + dy * step };
    if (!safe(next)) continue;
    const probe = { x: from.x + dx * horizon, y: from.y + dy * horizon };
    const score = Math.cos(angle) + (safe(probe) ? 0.75 : 0) + (angle > 0 ? 0.9 : 0);
    if (score > bestScore) { best = next; bestScore = score; }
  }
  return best ?? { ...from };
}

/** Route around queues and solid fixtures together, so a queue detour cannot lead into a machine. */
export function detourAroundQueues(from: Vec, target: Vec, queues: readonly Rect[], radius = personRadius("normal")): Vec {
  const blockers = queues.filter((r) => !contains(r, from) && !contains(r, target));
  // Keep the cheap queue-only route when it is already safe; build a combined graph only at fixtures.
  const queueWaypoint = queueDetour(from, target, blockers);
  if (clearOfScenery(from, queueWaypoint, radius)) return queueWaypoint;
  return queueDetour(from, target, blockers, radius);
}

const detourGraphs = new Map<number, { points: Vec[]; clear: boolean[][] }>();

/** Cache the fixed station geometry by body radius; moving queues are checked separately each tick. */
function detourSceneryGraph(radius: number) {
  const cached = detourGraphs.get(radius);
  if (cached) return cached;
  const margin = radius + 0.03;
  const points = SCENERY_OBSTACLES.flatMap((r) => [
    { x: r.x - margin, y: r.y - margin }, { x: r.x + r.w + margin, y: r.y - margin },
    { x: r.x - margin, y: r.y + r.h + margin }, { x: r.x + r.w + margin, y: r.y + r.h + margin },
  ]).filter((point) => clearOfScenery(point, point, radius));
  const graph = { points, clear: points.map((a) => points.map((b) => clearOfScenery(a, b, radius))) };
  detourGraphs.set(radius, graph);
  return graph;
}

/** Find the next visible corner; optionally include body-inflated fixture corners and edges. */
function queueDetour(from: Vec, target: Vec, blockers: readonly Rect[], radius?: number): Vec {
  // Every candidate edge must be safe for this passenger's body, not just clear of the queue.
  const visible = (a: Vec, b: Vec) => (radius === undefined || clearOfScenery(a, b, radius)) && blockers.every((r) => !segmentIntersectsRect(a, b, r));
  if (visible(from, target)) return target;
  const corners = blockers.flatMap((r) => [
    { x: r.x - 0.03, y: r.y - 0.03 }, { x: r.x + r.w + 0.03, y: r.y - 0.03 },
    { x: r.x - 0.03, y: r.y + r.h + 0.03 }, { x: r.x + r.w + 0.03, y: r.y + r.h + 0.03 },
  ]).filter((point) => visible(point, point));
  const graph = radius === undefined ? undefined : detourSceneryGraph(radius);
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
