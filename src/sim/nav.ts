import type { Vec } from "../shared/types";
import { dist, lineOfSight } from "./geometry";
import { MOVE_BLOCKERS, NAV_NODES, type NavNode } from "./layout";

const walkable = (a: Vec, b: Vec) => lineOfSight(a, b, MOVE_BLOCKERS);

/**
 * Shortest walking path from `from` to `to` over a visibility graph built from the
 * nav nodes. Returns the waypoints after `from` (ending at `to`), or null when `to`
 * cannot be reached on foot (e.g. it lies past the security or gate line).
 */
export function findPath(from: Vec, to: Vec): Vec[] | null {
  if (walkable(from, to)) return [to];

  const points: Vec[] = [from, ...NAV_NODES.map((n) => n.pos), to];
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
      const d = best[u] + dist(points[u], points[v]);
      if (d < best[v] && walkable(points[u], points[v])) {
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
