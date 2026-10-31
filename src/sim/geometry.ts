import type { Vec } from "../shared/types";

/** Axis-aligned rectangle; (x, y) is the minimum corner. */
export interface Rect {
  floorId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });

export const sameFloor = (a: Vec, b: Vec) => (a.floorId ?? "concourse") === (b.floorId ?? "concourse");

export function dist(a: Vec, b: Vec): number {
  return sameFloor(a,b) ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
}

/** Move `from` toward `to` by at most `step`; returns the new point. */
export function moveToward(from: Vec, to: Vec, step: number): Vec {
  const d = dist(from, to);
  if (d <= step || d === 0) return { ...to };
  return { ...from, x: from.x + ((to.x - from.x) / d) * step, y: from.y + ((to.y - from.y) / d) * step };
}

/** Liang–Barsky clip test: does segment a→b pass through the rectangle? */
export function segmentIntersectsRect(a: Vec, b: Vec, r: Rect): boolean {
  if ((a.x < r.x && b.x < r.x) || (a.x > r.x + r.w && b.x > r.x + r.w)
    || (a.y < r.y && b.y < r.y) || (a.y > r.y + r.h && b.y > r.y + r.h)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1;
}

export function lineOfSight(a: Vec, b: Vec, occluders: readonly Rect[]): boolean {
  return sameFloor(a,b) && !occluders.some((r) => (r.floorId ?? "concourse") === (a.floorId ?? "concourse") && segmentIntersectsRect(a, b, r));
}

/** Angle in radians of the vector from a to b. */
export function angleTo(a: Vec, b: Vec): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** Is `target` inside the view cone (range + field of view) of an observer? */
export function inViewCone(origin: Vec, facing: number, fovDeg: number, range: number, target: Vec): boolean {
  if (dist(origin, target) > range) return false;
  return angleDiff(angleTo(origin, target), facing) <= (fovDeg * Math.PI) / 360;
}

/** Eight-way compass label (screen coordinates: +y is south). */
export function compass(angle: number): string {
  const labels = ["东", "东南", "南", "西南", "西", "西北", "北", "东北"];
  const idx = Math.round(((angle + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  return labels[idx];
}
