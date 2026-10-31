import type { PassengerKind, Vec } from "../shared/types";
import { dist, moveToward, segmentIntersectsRect, type Rect } from "./geometry";
import { FACILITIES, GATE_BARRIERS, HEIGHT, MOVE_BLOCKERS, PILLARS, SECURITY_WALL, WIDTH } from "./layout";

export interface MovingBody { id: string; pos: Vec; from?: Vec; radius: number }
export const personRadius = (kind: PassengerKind | "guard") => kind === "luggage" ? 0.48 : 0.32;
const furniture: Rect[] = FACILITIES.flatMap((f) => f.kind === "tvm"
  ? [{ x: f.pos.x - 0.175, y: f.pos.y - 0.41, w: 0.35, h: 0.82 }]
  : f.kind === "security" ? [{ x: f.pos.x - 0.88, y: f.pos.y + 0.55, w: 1.4, h: 0.5 }] : []);
const floorEdges: Rect[] = [
  { x: 48, y: -1, w: 9, h: 14 }, { x: 48, y: 17, w: 9, h: HEIGHT - 16 },
];
const solids = [...PILLARS, ...furniture, ...floorEdges];
/** Shared by persistent route planning and the per-tick collision sweep. */
export const SCENERY_OBSTACLES: readonly Rect[] = [...MOVE_BLOCKERS.slice(0, 3), ...solids];

/** Service may cross its scanner/gate opening, but never a solid side barrier. */
export function clearServiceExit(from: Vec, to: Vec, radius: number): boolean {
  return [...SECURITY_WALL, ...GATE_BARRIERS, ...solids].every((obstacle) => {
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

/** Local steering uses look-ahead to choose a clear route, then sweeps the actual stride. */
export function steer(from: Vec, target: Vec, stride: number, radius: number, others: readonly MovingBody[], allowDetour = true): Vec {
  const distance = dist(from, target);
  if (distance < 1e-8) return { ...from };
  const step = Math.min(stride, distance);
  const safe = (to: Vec) => clearOfScenery(from, to, radius) && clearOfPeople(from, to, radius, others);
  const direct = moveToward(from, target, step);
  const horizon = Math.min(distance, Math.max(step, 1.15));
  if (safe(moveToward(from, target, horizon)) && safe(direct)) return direct;
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

/** Route around a whole waiting line, so local steering does not oscillate between its passengers. */
export function detourAroundQueues(from: Vec, target: Vec, queues: readonly Rect[]): Vec {
  const blockers = queues.filter((r) => !contains(r, from) && !contains(r, target));
  const visible = (a: Vec, b: Vec) => blockers.every((r) => !segmentIntersectsRect(a, b, r));
  if (visible(from, target)) return target;
  const points = [from, target, ...blockers.flatMap((r) => [
    { x: r.x - 0.03, y: r.y - 0.03 }, { x: r.x + r.w + 0.03, y: r.y - 0.03 },
    { x: r.x - 0.03, y: r.y + r.h + 0.03 }, { x: r.x + r.w + 0.03, y: r.y + r.h + 0.03 },
  ])];
  const costs = points.map(() => Infinity), previous = points.map(() => -1), done = new Set<number>();
  costs[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < points.length; i++) if (!done.has(i) && Number.isFinite(costs[i]) && (u < 0 || costs[i] < costs[u])) u = i;
    if (u < 0) return target;
    if (u === 1) {
      while (previous[u] > 0) u = previous[u];
      return points[u];
    }
    done.add(u);
    for (let v = 1; v < points.length; v++) {
      const cost = costs[u] + dist(points[u], points[v]);
      if (!done.has(v) && cost < costs[v] && visible(points[u], points[v])) { costs[v] = cost; previous[v] = u; }
    }
  }
}
