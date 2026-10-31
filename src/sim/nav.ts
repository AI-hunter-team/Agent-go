import type { Vec } from "../shared/types";
import { dist } from "./geometry";
import { NAV_NODES, type NavNode } from "./layout";
import { clearOfScenery, personRadius, SCENERY_OBSTACLES } from "./movement";

const walkable = (a: Vec, b: Vec, radius = personRadius("normal")) => clearOfScenery(a, b, radius);
const graphs = new Map<number, { points: Vec[]; costs: number[][] }>();

function sceneryGraph(radius: number) {
  const cached = graphs.get(radius);
  if (cached) return cached;
  // Store fixture corners in the activity's route. A walker must finish going
  // around the conveyor instead of choosing an opposing local turn each tick.
  const margin = radius + 0.03;
  const points = [...NAV_NODES.map((node) => node.pos), ...SCENERY_OBSTACLES.flatMap((r) => [
    { x: r.x - margin, y: r.y - margin }, { x: r.x + r.w + margin, y: r.y - margin },
    { x: r.x - margin, y: r.y + r.h + margin }, { x: r.x + r.w + margin, y: r.y + r.h + margin },
  ])].filter((point) => walkable(point, point, radius));
  const graph = { points, costs: points.map((a) => points.map((b) => walkable(a, b, radius) ? dist(a, b) : Infinity)) };
  graphs.set(radius, graph);
  return graph;
}

/**
 * Shortest walking path from `from` to `to` over a visibility graph built from the
 * nav nodes and body-inflated fixture corners. Returns the waypoints after `from`
 * (ending at `to`), or null when `to`
 * cannot be reached on foot (e.g. it lies past the security or gate line).
 */
export function findPath(from: Vec, to: Vec, radius = personRadius("normal")): Vec[] | null {
  if (walkable(from, to, radius)) return [to];

  const graph = sceneryGraph(radius);
  const points: Vec[] = [from, ...graph.points, to];
  const n = points.length;
  const target = n - 1;
  const best = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  best[0] = 0;

  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0) return null;
    if (u === target) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const edge = u > 0 && v < target ? graph.costs[u - 1][v - 1]
        : walkable(points[u], points[v], radius) ? dist(points[u], points[v]) : Infinity;
      const d = best[u] + edge;
      if (d < best[v]) {
        best[v] = d;
        prev[v] = u;
      }
    }
  }

  const path: Vec[] = [];
  for (let v = target; v > 0; v = prev[v]) path.unshift(points[v]);
  return path;
}

export function pathLength(from: Vec, path: Vec[]): number {
  let total = 0;
  let cur = from;
  for (const p of path) {
    total += dist(cur, p);
    cur = p;
  }
  return total;
}

/** Nearest nav node reachable in a straight line, for describing where someone is. */
export function nearestNode(p: Vec): NavNode | null {
  let best: NavNode | null = null;
  for (const node of NAV_NODES) {
    if (!walkable(p, node.pos)) continue;
    if (!best || dist(p, node.pos) < dist(p, best.pos)) best = node;
  }
  return best;
}

export function nodeById(id: string): NavNode | undefined {
  return NAV_NODES.find((n) => n.id === id);
}
