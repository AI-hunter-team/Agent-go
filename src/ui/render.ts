import type { FacilityStatus, PassengerKind, Vec } from "../shared/types";
import type { Engine } from "../sim/engine";
import { FACILITIES, GATE_BARRIERS, GATE_X, HEIGHT, NAV_NODES, PILLARS, PLATFORM_X, SECURITY_WALL, SECURITY_X, STAIRS_BOTTOM, STAIRS_TOP, STAIRS_X, WIDTH, type FacilityDef } from "../sim/layout";
import { RULES } from "../sim/scenario";

// Palette follows the chosen visual direction (design/ui-concepts-v3, 方案 02):
// cream and ochre architecture, grey-green and brick-red accents.
export const COLORS = {
  hall: "#f4efe4",
  concourse: "#ece5d5",
  security: "#e4eef2",
  securityEdge: "#527e91",
  gate: "#f1e1b8",
  landing: "#f2ecdc",
  stairs: "#e1d6c5",
  stairsEdge: "#856a4d",
  platform: "#e3eadf",
  ink: "#2b2a27",
  inkSoft: "#6f6a60",
  ochre: "#c3912f",
  green: "#6e8a74",
  brick: "#b4533c",
  player: "#1f4e79",
  grid: "rgba(43,42,39,0.05)",
};

const NPC_COLOR: Record<PassengerKind, string> = {
  normal: "#8c867a",
  elderly: "#b8ad94",
  luggage: "#7d6a4f",
  hurried: "#5f7f8f",
  player: COLORS.player,
};

export const SCALE = 16;
export const MAP_PX = { w: WIDTH * SCALE, h: HEIGHT * SCALE };

/** Floor changes after the gate are separate visible stages of the journey. */
export const MAP_REGIONS = [
  { label: "售票厅", start: 0, end: SECURITY_X - 5, color: COLORS.hall },
  { label: "安检区", start: SECURITY_X - 5, end: SECURITY_X + 3, color: COLORS.security },
  { label: "候闸大厅", start: SECURITY_X + 3, end: GATE_X - 5, color: COLORS.concourse },
  { label: "闸机区", start: GATE_X - 5, end: GATE_X, color: COLORS.gate },
  { label: "上层平台", start: GATE_X, end: STAIRS_X, color: COLORS.landing },
  { label: "下楼梯 ↓", start: STAIRS_X, end: PLATFORM_X, color: COLORS.stairs },
  { label: "下层站台", start: PLATFORM_X, end: WIDTH, color: COLORS.platform },
];

const px = (v: number) => v * SCALE;

export type { ViewOptions as RenderOptions } from "./presentation";
import type { ViewOptions as RenderOptions } from "./presentation";

export function drawStation(ctx: CanvasRenderingContext2D, engine: Engine, opts: RenderOptions) {
  const { world, guards, player } = engine;
  const replay = opts.replay;
  const playerPos = replay ? replay.position : player.pos;
  ctx.save();
  ctx.clearRect(0, 0, MAP_PX.w, MAP_PX.h);

  // Zones
  for (const region of MAP_REGIONS) {
    ctx.fillStyle = region.color;
    ctx.fillRect(px(region.start), 0, px(region.end - region.start), MAP_PX.h);
  }

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 2) line(ctx, { x, y: 0 }, { x, y: HEIGHT });
  for (let y = 0; y <= HEIGHT; y += 2) line(ctx, { x: 0, y }, { x: WIDTH, y });

  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillText("入口 →", px(0.2), px(16.6));

  drawStairs(ctx);

  // Nav nodes (faint markers so players can read agent targets)
  ctx.fillStyle = "rgba(43,42,39,0.25)";
  ctx.font = "9px ui-monospace, monospace";
  for (const n of NAV_NODES) {
    ctx.beginPath();
    ctx.arc(px(n.pos.x), px(n.pos.y), 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(n.id, px(n.pos.x) + 4, px(n.pos.y) - 3);
  }

  // Structures
  ctx.fillStyle = COLORS.securityEdge;
  for (const r of SECURITY_WALL) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.fillStyle = COLORS.ochre;
  for (const r of GATE_BARRIERS) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.fillStyle = COLORS.green;
  for (const r of PILLARS) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));

  // Facilities
  for (const def of FACILITIES) {
    const f = world.facility(def.id)!;
    drawFacility(ctx, def, replay ? "open" : f.status, !replay && Boolean(f.serving), Boolean(replay));
  }

  // Player vision
  if (!replay && opts.showVision && !player.onPlatform) {
    ctx.fillStyle = "rgba(31,78,121,0.06)";
    ctx.strokeStyle = "rgba(31,78,121,0.25)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(px(player.pos.x), px(player.pos.y), px(RULES.visionRange), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Guard view cones
  if (!replay) for (const g of guards.guards) {
    const half = (RULES.guardFovDeg * Math.PI) / 360;
    ctx.fillStyle = g.lookAt ? "rgba(180,83,60,0.20)" : "rgba(110,138,116,0.16)";
    ctx.beginPath();
    ctx.moveTo(px(g.pos.x), px(g.pos.y));
    ctx.arc(px(g.pos.x), px(g.pos.y), px(RULES.guardRange), g.facing - half, g.facing + half);
    ctx.closePath();
    ctx.fill();
  }

  // Trail and current path
  const trail = replay?.trail ?? opts.trail;
  if ((opts.showTrail || replay) && trail && trail.length > 1) {
    ctx.strokeStyle = "rgba(31,78,121,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    polyline(ctx, trail);
    ctx.setLineDash([]);
  }
  const a = player.activity;
  if (!replay && (a.kind === "walking" || a.kind === "to_queue")) {
    ctx.strokeStyle = "rgba(31,78,121,0.8)";
    ctx.lineWidth = 1;
    polyline(ctx, [player.pos, ...a.path]);
  }

  // People
  if (!replay) for (const p of world.persons.values()) {
    if (p.isPlayer) continue;
    ctx.fillStyle = NPC_COLOR[p.kind];
    ctx.beginPath();
    ctx.arc(px(p.pos.x), px(p.pos.y), p.kind === "hurried" ? 3.5 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === "luggage") {
      ctx.fillStyle = "#4f4130";
      ctx.fillRect(px(p.pos.x) + 3, px(p.pos.y) - 1, 4, 4);
    }
    if (p.kind === "elderly") {
      ctx.strokeStyle = COLORS.inkSoft;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Guards
  if (!replay) for (const g of guards.guards) {
    ctx.save();
    ctx.translate(px(g.pos.x), px(g.pos.y));
    ctx.rotate(g.facing);
    ctx.fillStyle = "#2f4a36";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Player
  if (playerPos) {
  ctx.fillStyle = COLORS.player;
  ctx.strokeStyle = COLORS.ochre;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(px(playerPos.x), px(playerPos.y), 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!replay && player.activity.kind === "creative") {
    ctx.strokeStyle = COLORS.brick;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(player.pos.x), px(player.pos.y), 11, 0, Math.PI * 2);
    ctx.stroke();
  }
  }

  if (!replay && opts.thinking) {
    ctx.fillStyle = "rgba(43,42,39,0.06)";
    ctx.fillRect(0, 0, MAP_PX.w, MAP_PX.h);
    ctx.fillStyle = COLORS.player;
    ctx.font = "bold 13px ui-sans-serif, system-ui";
    ctx.fillText("◼ 子弹时间 · 角色思考中，世界暂停", px(SECURITY_X) - 110, MAP_PX.h - 12);
  }
  ctx.restore();
}

function drawStairs(ctx: CanvasRenderingContext2D) {
  const top = 11;
  const bottom = 19;
  ctx.save();
  // The connection is a flight between two levels, with one shared entrance.
  ctx.fillStyle = "rgba(133,106,77,0.09)";
  ctx.fillRect(px(STAIRS_X), 0, px(PLATFORM_X - STAIRS_X), px(top - 0.8));
  ctx.fillRect(px(STAIRS_X), px(bottom + 0.8), px(PLATFORM_X - STAIRS_X), px(HEIGHT - bottom - 0.8));
  ctx.fillStyle = "#f8f3e9";
  ctx.fillRect(px(STAIRS_X), px(top), px(PLATFORM_X - STAIRS_X), px(bottom - top));
  ctx.strokeStyle = COLORS.stairsEdge;
  ctx.lineWidth = 1.4;
  for (let x = STAIRS_X + 0.4; x < PLATFORM_X; x += 0.55) line(ctx, { x, y: top }, { x, y: bottom });
  ctx.lineWidth = 3;
  line(ctx, { x: STAIRS_X, y: top }, { x: PLATFORM_X, y: top });
  line(ctx, { x: STAIRS_X, y: bottom }, { x: PLATFORM_X, y: bottom });
  // Landings and a high-contrast direction arrow stay legible behind the actor.
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  line(ctx, { x: STAIRS_TOP.x, y: STAIRS_TOP.y }, { x: STAIRS_BOTTOM.x, y: STAIRS_BOTTOM.y });
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.stairsEdge;
  ctx.beginPath();
  ctx.moveTo(px(55.2), px(15));
  ctx.lineTo(px(54.2), px(14.35));
  ctx.lineTo(px(54.2), px(15.65));
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = "center";
  ctx.font = "bold 13px ui-sans-serif, system-ui";
  ctx.fillText("下楼梯 ↓", px((STAIRS_X + PLATFORM_X) / 2), px(9.3));
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillText("约 6 秒 · 下行至站台", px((STAIRS_X + PLATFORM_X) / 2), px(20.7));
  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.fillText("闸机后", px((GATE_X + STAIRS_X) / 2), px(4));
  ctx.fillText("上层", px((GATE_X + STAIRS_X) / 2), px(5));
  ctx.font = "bold 13px ui-sans-serif, system-ui";
  ctx.fillText("下层站台", px(63), px(4));
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillText("下楼梯到达此处后完成", px(63), px(5.4));
  ctx.restore();
}

function drawFacility(ctx: CanvasRenderingContext2D, def: FacilityDef, status: FacilityStatus, busy: boolean, schematic: boolean) {
  const unavailable = status !== "open";
  const accent = unavailable ? COLORS.brick : def.kind === "security" ? COLORS.securityEdge : def.kind === "gate" ? "#9b6c16" : COLORS.ink;
  const height = def.kind === "security" ? 2.5 : def.kind === "gate" ? 2 : 1.8;
  ctx.save();
  ctx.translate(px(def.pos.x), px(def.pos.y));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.8;

  if (def.kind === "security") {
    // A broad inspection gantry with a clear passage and a scanning line.
    ctx.fillStyle = unavailable ? "#ecd2ca" : "#b9d1dd";
    ctx.fillRect(px(-1.15), px(-1.25), px(2.3), px(2.5));
    ctx.strokeRect(px(-1.15), px(-1.25), px(2.3), px(2.5));
    ctx.fillStyle = "#f7fbfc";
    ctx.fillRect(px(-0.95), px(-0.83), px(1.9), px(1.66));
    ctx.strokeStyle = busy ? COLORS.green : COLORS.securityEdge;
    ctx.setLineDash([3, 3]);
    line(ctx, { x: 0, y: -0.8 }, { x: 0, y: 0.8 });
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.fillRect(px(-0.9), px(1.48), px(1.8), px(0.32));
    ctx.fillStyle = "#7798a8";
    ctx.fillRect(px(-0.28), px(1.28), px(0.56), px(0.42));
  } else if (def.kind === "gate") {
    // Paired turnstile housings; the central flaps open during valid passage.
    ctx.fillStyle = unavailable ? "#ecd2ca" : "#d9bd79";
    for (const y of [-1, 0.65]) {
      ctx.beginPath();
      ctx.roundRect(px(-0.95), px(y), px(1.9), px(0.35), 3);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = busy ? "#86a38b" : unavailable ? "#c77964" : "#bd9345";
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(px(-0.06), px(sign * 0.65));
      ctx.lineTo(px(busy ? 0.65 : 0.25), px(sign * (busy ? 0.55 : 0.06)));
      ctx.lineTo(px(busy ? 0.65 : -0.06), px(sign * (busy ? 0.33 : 0.06)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#31464e";
    ctx.fillRect(px(-0.58), px(-0.94), px(0.4), px(0.2));
  } else {
    ctx.fillStyle = unavailable ? "#ecd2ca" : "#fffaf0";
    ctx.beginPath();
    ctx.roundRect(px(-0.6), px(-0.9), px(1.2), px(1.8), 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.securityEdge;
    ctx.fillRect(px(-0.4), px(-0.66), px(0.8), px(0.62));
    ctx.fillStyle = COLORS.ochre;
    ctx.fillRect(px(-0.3), px(0.35), px(0.6), px(0.12));
  }

  if (unavailable) {
    ctx.strokeStyle = COLORS.brick;
    ctx.lineWidth = 2;
    line(ctx, { x: -0.6, y: -0.6 }, { x: 0.6, y: 0.6 });
    line(ctx, { x: 0.6, y: -0.6 }, { x: -0.6, y: 0.6 });
  }
  if (def.kind !== "tvm") {
    ctx.fillStyle = schematic ? "#a8a296" : unavailable ? COLORS.brick : COLORS.green;
    ctx.beginPath();
    ctx.arc(px(0.7), px(-height / 2 + 0.18), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = accent;
  ctx.font = "bold 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillText(def.kind === "gate" ? `${def.id} 验票闸机` : def.kind === "security" ? `${def.id} 安检通道` : def.id, 0, px(-height / 2) - 7);
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, a: Vec, b: Vec) {
  ctx.beginPath();
  ctx.moveTo(px(a.x), px(a.y));
  ctx.lineTo(px(b.x), px(b.y));
  ctx.stroke();
}

function polyline(ctx: CanvasRenderingContext2D, pts: readonly Vec[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.x), px(p.y)) : ctx.lineTo(px(p.x), px(p.y))));
  ctx.stroke();
}
