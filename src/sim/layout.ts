import type { FacilityKind, ItemSpot, Vec } from "../shared/types";
import type { Rect } from "./geometry";

// Station layout, in metres. See docs/MVP技术方案.md §5.2.
//
//  x=0        14           26        36        44       49       56       70
//   入口 ── 售票厅(TVM) ── 安检墙(S1-3) ── 大厅(柱) ── 闸机 ── 上层平台 ── 下楼梯 ── 站台

export const WIDTH = 70;
export const HEIGHT = 30;
export const SECURITY_X = 26;
export const GATE_X = 44;
export const STAIRS_X = 49;
export const PLATFORM_X = 56;
export const STAIRS_TOP: Vec = { x: 48, y: 15 };
export const STAIRS_BOTTOM: Vec = { x: 57, y: 15 };
export const STAIRS_SECONDS = 6;
export const STAIRS_REACH = 0.8;
export const QUEUE_SPACING = 0.8;

export const ENTRANCE: Vec = { x: 2, y: 15 };

export const ITEM_SPOTS: ItemSpot[] = [
  { id: "convenience", label: "售票厅便利架", pos: { x: 7, y: 3 }, stock: ["newspaper", "snack", "water_bottle"], takeSeconds: 1.5 },
  { id: "lost-property", label: "长椅旁失物", pos: { x: 8, y: 27 }, stock: ["umbrella"], takeSeconds: 1.5 },
];

export interface FacilityDef {
  id: string;
  kind: FacilityKind;
  label: string;
  /** Machine / scanner / gate position. */
  pos: Vec;
  /** Where the person at the head of the queue stands. Further slots extend toward -x. */
  head: Vec;
  /** Where a person ends up after successful service (null = stays at head). */
  exit: Vec | null;
}

function facility(id: string, kind: FacilityKind, label: string, x: number, y: number): FacilityDef {
  const head = { x: x - 0.8, y };
  const exit = kind === "tvm" ? null : { x: x + 1.4, y };
  return { id, kind, label, pos: { x, y }, head, exit };
}

export const FACILITIES: FacilityDef[] = [
  facility("TVM-1", "tvm", "1号售票机", 14, 6),
  facility("TVM-2", "tvm", "2号售票机", 14, 12),
  facility("TVM-3", "tvm", "3号售票机", 14, 24),
  facility("S1", "security", "1号安检通道", SECURITY_X, 6),
  facility("S2", "security", "2号安检通道", SECURITY_X, 15),
  facility("S3", "security", "3号安检通道", SECURITY_X, 24),
  facility("G1", "gate", "1号闸机", GATE_X, 5),
  facility("G2", "gate", "2号闸机", GATE_X, 10),
  facility("G3", "gate", "3号闸机", GATE_X, 15),
  facility("G4", "gate", "4号闸机", GATE_X, 20),
  facility("G5", "gate", "5号闸机", GATE_X, 25),
];

export function queueSlot(def: FacilityDef, index: number): Vec {
  return { x: def.head.x - QUEUE_SPACING * index, y: def.head.y };
}

export const PILLARS: Rect[] = [
  { x: 35, y: 11, w: 2, h: 2 },
  { x: 35, y: 17, w: 2, h: 2 },
];

/** Wall pieces that block sight: the security wall except at the three lane openings. */
function securityWallPieces(): Rect[] {
  const gaps = FACILITIES.filter((f) => f.kind === "security").map((f) => f.pos.y);
  const pieces: Rect[] = [];
  let start = 0;
  for (const g of gaps) {
    pieces.push({ x: SECURITY_X - 0.2, y: start, w: 0.4, h: g - 1 - start });
    start = g + 1;
  }
  pieces.push({ x: SECURITY_X - 0.2, y: start, w: 0.4, h: HEIGHT - start });
  return pieces;
}

export const SECURITY_WALL = securityWallPieces();

/** Gate barriers between the gates: block movement but not sight. Used for rendering. */
export const GATE_BARRIERS: Rect[] = (() => {
  const ys = FACILITIES.filter((f) => f.kind === "gate").map((f) => f.pos.y);
  const pieces: Rect[] = [];
  let start = 0;
  for (const g of ys) {
    pieces.push({ x: GATE_X - 0.15, y: start, w: 0.3, h: g - 0.6 - start });
    start = g + 0.6;
  }
  pieces.push({ x: GATE_X - 0.15, y: start, w: 0.3, h: HEIGHT - start });
  return pieces;
})();

export const SIGHT_OCCLUDERS: Rect[] = [...SECURITY_WALL, ...PILLARS];

const inflate = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

/**
 * Crossing the security/gate lines requires service (or a creative action).
 * The lower platform is on another level: only the timed stairs action connects it.
 */
export const MOVE_BLOCKERS: Rect[] = [
  { x: SECURITY_X - 0.2, y: -1, w: 0.4, h: HEIGHT + 2 },
  { x: GATE_X - 0.2, y: -1, w: 0.4, h: HEIGHT + 2 },
  { x: STAIRS_X, y: -1, w: PLATFORM_X - STAIRS_X, h: HEIGHT + 2 },
  ...PILLARS.map((p) => inflate(p, 0.3)),
];

export interface NavNode {
  id: string;
  label: string;
  pos: Vec;
}

export const NAV_NODES: NavNode[] = [
  { id: "ENTRANCE", label: "入口", pos: ENTRANCE },
  { id: "HALL_W", label: "售票厅西侧", pos: { x: 7, y: 15 } },
  { id: "HALL_N", label: "售票厅北侧", pos: { x: 19, y: 8 } },
  { id: "HALL_C", label: "售票厅中部", pos: { x: 19, y: 15 } },
  { id: "HALL_S", label: "售票厅南侧", pos: { x: 19, y: 22 } },
  { id: "CONC_N", label: "安检后大厅北侧", pos: { x: 31, y: 7 } },
  { id: "CONC_C", label: "安检后大厅中部", pos: { x: 31, y: 15 } },
  { id: "CONC_S", label: "安检后大厅南侧", pos: { x: 31, y: 23 } },
  { id: "GATE_N", label: "闸机前北侧", pos: { x: 40, y: 8 } },
  { id: "GATE_C", label: "闸机前中部", pos: { x: 40, y: 15 } },
  { id: "GATE_S", label: "闸机前南侧", pos: { x: 40, y: 22 } },
  { id: "STAIRS_TOP", label: "下楼梯入口（上层平台）", pos: STAIRS_TOP },
  { id: "PLATFORM", label: "下层站台", pos: STAIRS_BOTTOM },
];

export type Zone = "hall" | "concourse" | "landing" | "stairs" | "platform";

export function zoneOf(p: Vec): Zone {
  if (p.x < SECURITY_X) return "hall";
  if (p.x < GATE_X) return "concourse";
  if (p.x < STAIRS_X) return "landing";
  if (p.x < PLATFORM_X) return "stairs";
  return "platform";
}

export const ZONE_LABEL: Record<Zone, string> = {
  hall: "售票厅（未安检区）",
  concourse: "安检后大厅（闸机外）",
  landing: "闸机后上层平台（需下楼梯）",
  stairs: "下行楼梯（前往下层站台）",
  platform: "下层站台",
};
