import type { PassengerKind, Vec } from "../shared/types";
import type { Engine } from "../sim/engine";
import { FACILITIES, GATE_BARRIERS, GATE_X, HEIGHT, NAV_NODES, PILLARS, SECURITY_WALL, SECURITY_X, WIDTH } from "../sim/layout";
import { RULES } from "../sim/scenario";

// Palette follows the chosen visual direction (design/ui-concepts-v3, 方案 02):
// cream and ochre architecture, grey-green and brick-red accents.
export const COLORS = {
  hall: "#f4efe4",
  concourse: "#ece5d5",
  platform: "#e2dccb",
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

const px = (v: number) => v * SCALE;

export type { ViewOptions as RenderOptions } from "./presentation";
import type { ViewOptions as RenderOptions } from "./presentation";

export function drawStation(ctx: CanvasRenderingContext2D, engine: Engine, opts: RenderOptions) {
  const { world, guards, player } = engine;
  ctx.save();
  ctx.clearRect(0, 0, MAP_PX.w, MAP_PX.h);

  // Zones
  ctx.fillStyle = COLORS.hall;
  ctx.fillRect(0, 0, px(SECURITY_X), MAP_PX.h);
  ctx.fillStyle = COLORS.concourse;
  ctx.fillRect(px(SECURITY_X), 0, px(GATE_X - SECURITY_X), MAP_PX.h);
  ctx.fillStyle = COLORS.platform;
  ctx.fillRect(px(GATE_X), 0, MAP_PX.w - px(GATE_X), MAP_PX.h);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 2) line(ctx, { x, y: 0 }, { x, y: HEIGHT });
  for (let y = 0; y <= HEIGHT; y += 2) line(ctx, { x: 0, y }, { x: WIDTH, y });

  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillText("售票厅", px(1), px(1.4));
  ctx.fillText("安检后大厅", px(SECURITY_X + 1), px(1.4));
  ctx.fillText("站台", px(GATE_X + 1.5), px(1.4));
  ctx.fillText("入口 →", px(0.2), px(16.6));

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
  ctx.fillStyle = COLORS.ochre;
  for (const r of SECURITY_WALL) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.fillStyle = "rgba(195,145,47,0.55)";
  for (const r of GATE_BARRIERS) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.fillStyle = COLORS.green;
  for (const r of PILLARS) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));

  // Facilities
  for (const def of FACILITIES) {
    const f = world.facility(def.id)!;
    const color = f.status === "open" ? COLORS.ink : f.status === "broken" ? COLORS.brick : COLORS.inkSoft;
    const size = def.kind === "gate" ? { w: 0.6, h: 1.0 } : def.kind === "security" ? { w: 1.2, h: 1.6 } : { w: 1.0, h: 1.4 };
    const x = px(def.pos.x - size.w / 2);
    const y = px(def.pos.y - size.h / 2);
    ctx.fillStyle = f.status === "open" ? "#fbf8f1" : f.status === "broken" ? "#f1d9d2" : "#dedad1";
    ctx.fillRect(x, y, px(size.w), px(size.h));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, px(size.w), px(size.h));
    if (f.status !== "open") {
      line(ctx, { x: def.pos.x - size.w / 2, y: def.pos.y - size.h / 2 }, { x: def.pos.x + size.w / 2, y: def.pos.y + size.h / 2 });
      line(ctx, { x: def.pos.x + size.w / 2, y: def.pos.y - size.h / 2 }, { x: def.pos.x - size.w / 2, y: def.pos.y + size.h / 2 });
    }
    if (f.serving) {
      ctx.fillStyle = f.serving.recheck ? COLORS.brick : COLORS.ochre;
      ctx.fillRect(x, y - 3, px(size.w), 2);
    }
    ctx.fillStyle = color;
    ctx.font = "bold 10px ui-sans-serif, system-ui";
    const labelX = def.kind === "gate" ? px(def.pos.x + 0.6) : px(def.pos.x - 1);
    ctx.fillText(def.id, labelX, y - 5);
  }

  // Player vision
  if (opts.showVision && !player.onPlatform) {
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
  for (const g of guards.guards) {
    const half = (RULES.guardFovDeg * Math.PI) / 360;
    ctx.fillStyle = g.lookAt ? "rgba(180,83,60,0.20)" : "rgba(110,138,116,0.16)";
    ctx.beginPath();
    ctx.moveTo(px(g.pos.x), px(g.pos.y));
    ctx.arc(px(g.pos.x), px(g.pos.y), px(RULES.guardRange), g.facing - half, g.facing + half);
    ctx.closePath();
    ctx.fill();
  }

  // Trail and current path
  if (opts.showTrail && opts.trail && opts.trail.length > 1) {
    ctx.strokeStyle = "rgba(31,78,121,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    polyline(ctx, opts.trail);
    ctx.setLineDash([]);
  }
  const a = player.activity;
  if (a.kind === "walking" || a.kind === "to_queue") {
    ctx.strokeStyle = "rgba(31,78,121,0.8)";
    ctx.lineWidth = 1;
    polyline(ctx, [player.pos, ...a.path]);
  }

  // People
  for (const p of world.persons.values()) {
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
  for (const g of guards.guards) {
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
  ctx.fillStyle = COLORS.player;
  ctx.strokeStyle = COLORS.ochre;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(px(player.pos.x), px(player.pos.y), 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (player.activity.kind === "creative") {
    ctx.strokeStyle = COLORS.brick;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(player.pos.x), px(player.pos.y), 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (opts.thinking) {
    ctx.fillStyle = "rgba(43,42,39,0.06)";
    ctx.fillRect(0, 0, MAP_PX.w, MAP_PX.h);
    ctx.fillStyle = COLORS.player;
    ctx.font = "bold 13px ui-sans-serif, system-ui";
    ctx.fillText("◼ 子弹时间 · 角色思考中，世界暂停", px(SECURITY_X) - 110, MAP_PX.h - 12);
  }
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
