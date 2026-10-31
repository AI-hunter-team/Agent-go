import type { FacilityKind, Vec } from "../shared/types";
import type { Rect } from "./geometry";

// Station layout, in metres. See docs/MVP技术方案.md §5.2.
//
//  x=0     6/10/14       26             44             62       72       90
//   入口 ── 并排售票机 ── 安检 ── 商业大厅 ── 闸机 ── 分流候梯 ── 楼梯/扶梯 ── 站台

export const WIDTH = 90;
export const HEIGHT = 30;
export const SECURITY_X = 26;
export const GATE_X = 44;
export const STAIRS_X = 62;
export const PLATFORM_X = 72;
export const STAIRS_TOP: Vec = { x: 61, y: 9 };
export const STAIRS_BOTTOM: Vec = { x: 73, y: 9 };
export const ESCALATOR_TOP: Vec = { x: 61, y: 22 };
export const ESCALATOR_BOTTOM: Vec = { x: 73, y: 22 };
export const STAIRS_SECONDS = 6;
export const ESCALATOR_SECONDS = 4;
export const BOARDING_INTERVAL = 1;
export const ESCALATOR_CAPACITY = 14;
export const STAIRS_REACH = 0.8;
export const QUEUE_SPACING = 0.8;

export const ENTRANCE: Vec = { x: 2, y: 15 };

export interface FacilityDef {
  id: string;
  kind: FacilityKind;
  label: string;
  /** Machine / scanner / gate position. */
  pos: Vec;
  /** Queue head; subsequent slots follow queueDirection (westward by default). */
  head: Vec;
  /** Where a person ends up after successful service (null = stays at head). */
  exit: Vec | null;
  /** Queue extends into the hall; omitted lanes retain their westward direction. */
  queueDirection?: Vec;
}

function facility(id: string, kind: FacilityKind, label: string, x: number, y: number): FacilityDef {
  const head = kind === "tvm" ? { x, y: y + 1.1 } : { x: x - 0.8, y };
  const exit = kind === "tvm" ? null : { x: x + 1.4, y };
  return { id, kind, label, pos: { x, y }, head, exit, ...(kind === "tvm" ? { queueDirection: { x: 0, y: 1 } } : {}) };
}

export const FACILITIES: FacilityDef[] = [
  facility("TVM-1", "tvm", "1号自动售票机", 6, 4),
  facility("TVM-2", "tvm", "2号自动售票机", 10, 4),
  facility("TVM-3", "tvm", "3号自动售票机", 14, 4),
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
  const direction = def.queueDirection ?? { x: -1, y: 0 };
  return { x: def.head.x + direction.x * QUEUE_SPACING * index, y: def.head.y + direction.y * QUEUE_SPACING * index };
}

export const PILLARS: Rect[] = [
  { x: 35, y: 11, w: 2, h: 2 },
  { x: 35, y: 17, w: 2, h: 2 },
];

export interface AttractionDef {
  id: string;
  kind: "toys" | "advert" | "flowers" | "information" | "seating";
  label: string;
  pos: Vec;
  approach: Vec;
  body: Rect | null;
  blocksSight: boolean;
  cue: string;
}

export const ATTRACTIONS: AttractionDef[] = [
  { id: "TOYS", kind: "toys", label: "POP MART 玩具售卖机", pos: { x: 30.5, y: 2.5 }, approach: { x: 30.5, y: 4.5 }, body: { x: 29, y: 1.5, w: 3, h: 2 }, blocksSight: true, cue: "发光橱窗里陈列着不同造型的盲盒玩偶，可以靠近欣赏。" },
  { id: "ADVERT", kind: "advert", label: "广告灯箱", pos: { x: 38.5, y: 2.5 }, approach: { x: 38.5, y: 4.5 }, body: { x: 37, y: 2, w: 3, h: 1 }, blocksSight: true, cue: "动态画面轮播城市展览与新品海报，吸引经过的人阅读。" },
  { id: "FLOWERS", kind: "flowers", label: "鲜花小摊", pos: { x: 30.5, y: 27.5 }, approach: { x: 30.5, y: 25 }, body: { x: 29, y: 26.5, w: 3, h: 2 }, blocksSight: false, cue: "花束摆在小推车上，摊主招呼：今天的花开得很好，要看看吗？" },
  { id: "INFO", kind: "information", label: "站内信息屏", pos: { x: 32, y: 15 }, approach: { x: 32, y: 15 }, body: null, blocksSight: false, cue: "公开导向：前方闸机，过闸后北侧楼梯、南侧扶梯通往同一站台；具体客流请到现场观察。" },
  { id: "SEATS", kind: "seating", label: "等候座椅", pos: { x: 39, y: 27.5 }, approach: { x: 39, y: 25 }, body: { x: 37.5, y: 26.5, w: 3, h: 1.5 }, blocksSight: false, cue: "座椅边有人等候、聊天，可以停下来休息片刻。" },
];

/** Fixed railings between security openings: block walking, permit sight. */
function securityBarrierPieces(): Rect[] {
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

export const SECURITY_BARRIERS = securityBarrierPieces();

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

export const SIGHT_OCCLUDERS: Rect[] = [...PILLARS, ...ATTRACTIONS.filter(a => a.blocksSight && a.body).map(a => a.body!)];

const inflate = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

/**
 * Crossing the security/gate lines requires service (or a creative action).
 * The lower platform is on another level: timed stairs/escalator actions connect it.
 */
export const MOVE_BLOCKERS: Rect[] = [
  { x: SECURITY_X - 0.2, y: -1, w: 0.4, h: HEIGHT + 2 },
  { x: GATE_X - 0.2, y: -1, w: 0.4, h: HEIGHT + 2 },
  { x: STAIRS_X, y: -1, w: PLATFORM_X - STAIRS_X, h: HEIGHT + 2 },
  ...PILLARS.map((p) => inflate(p, 0.3)),
  ...ATTRACTIONS.filter(a => a.body).map(a => inflate(a.body!, 0.3)),
];

export interface NavNode {
  id: string;
  label: string;
  pos: Vec;
}

export const NAV_NODES: NavNode[] = [
  { id: "ENTRANCE", label: "入口", pos: ENTRANCE },
  { id: "HALL_W", label: "售票厅西侧", pos: { x: 7, y: 15 } },
  { id: "TICKETS_C", label: "自动售票机前比较点", pos: { x: 10, y: 10 } },
  { id: "HALL_N", label: "售票厅北侧", pos: { x: 19, y: 8 } },
  { id: "HALL_C", label: "售票厅中部", pos: { x: 19, y: 15 } },
  { id: "HALL_S", label: "售票厅南侧", pos: { x: 19, y: 22 } },
  { id: "CONC_N", label: "安检后大厅北侧", pos: { x: 31, y: 7 } },
  { id: "CONC_C", label: "安检后大厅中部", pos: { x: 31, y: 15 } },
  { id: "CONC_S", label: "安检后大厅南侧", pos: { x: 31, y: 23 } },
  { id: "GATE_N", label: "闸机前北侧", pos: { x: 40, y: 8 } },
  { id: "GATE_C", label: "闸机前中部", pos: { x: 40, y: 15 } },
  { id: "GATE_S", label: "闸机前南侧", pos: { x: 40, y: 22 } },
  { id: "LANDING_C", label: "闸机后路线观察点", pos: { x: 54, y: 15 } },
  { id: "LANDING_N", label: "闸机后北侧", pos: { x: 54, y: 9 } },
  { id: "LANDING_S", label: "闸机后南侧", pos: { x: 54, y: 22 } },
  { id: "STAIRS_TOP", label: "下楼梯入口（上层平台）", pos: STAIRS_TOP },
  { id: "ESCALATOR_TOP", label: "下行扶梯入口", pos: ESCALATOR_TOP },
  { id: "PLATFORM", label: "下层站台", pos: STAIRS_BOTTOM },
  ...ATTRACTIONS.map(a => ({ id: a.id, label: a.label, pos: a.approach })),
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
  concourse: "安检后商业大厅（闸机前）",
  landing: "闸机后连接区（选择楼梯或扶梯）",
  stairs: "下行连接（楼梯或扶梯）",
  platform: "下层站台",
};
