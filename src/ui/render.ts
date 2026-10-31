import { displayFloor, worldViewBounds } from "../sim/entranceGeometry";
import { captureScene } from "./presentation";
import type { FacilityStatus, PassengerKind, Vec } from "../shared/types";
import type { Engine } from "../sim/engine";
import { ATTRACTIONS, RAILING_SEGMENTS, ESCALATOR_BOTTOM, ESCALATOR_TOP, FACILITIES, GATE_BARRIERS, GATE_X, HEIGHT, NAV_NODES, PILLARS, PLATFORM_X, SECURITY_BARRIERS, SECURITY_X, STAIRS_BOTTOM, STAIRS_TOP, STAIRS_X, WIDTH, PLAYER_TRAIN_DOORS, type FacilityDef } from "../sim/layout";
import { RULES } from "../sim/scenario";
import { METRO_PROFILE } from "../shared/metro";

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
const MAP_END = WIDTH + METRO_PROFILE.exteriorHalfWidth * 2 + METRO_PROFILE.platformGap + .2;
export const MAP_PX = { w: MAP_END * SCALE, h: HEIGHT * SCALE };

/** Floor changes after the gate are separate visible stages of the journey. */
export const MAP_REGIONS = [
  { label: "售票厅", start: 0, end: SECURITY_X - 5, color: COLORS.hall },
  { label: "安检区", start: SECURITY_X - 5, end: SECURITY_X + 3, color: COLORS.security },
  { label: "商业大厅", start: SECURITY_X + 3, end: GATE_X - 5, color: COLORS.concourse },
  { label: "闸机区", start: GATE_X - 5, end: GATE_X, color: COLORS.gate },
  { label: "上层平台", start: GATE_X, end: STAIRS_X, color: COLORS.landing },
  { label: "楼梯 / 扶梯 ↓", start: STAIRS_X, end: PLATFORM_X, color: COLORS.stairs },
  { label: "下层站台", start: PLATFORM_X, end: WIDTH, color: COLORS.platform },
  { label: "地铁", start: WIDTH, end: MAP_END, color: "#b4ceca" },
];

const px = (v: number) => v * SCALE;

export type { ViewOptions as RenderOptions } from "./presentation";
import type { ViewOptions as RenderOptions } from "./presentation";

export function drawStation(ctx: CanvasRenderingContext2D, engine: Engine, opts: RenderOptions) {
  if(engine.world.definition.generatorVersion!=="legacy-v0"){drawGeneratedStation(ctx,engine,opts);return;}
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
  ctx.strokeStyle = "#247f76";
  ctx.lineWidth = 2;
  ctx.strokeRect(px(WIDTH + METRO_PROFILE.platformGap), px(6.2), px(METRO_PROFILE.width), px(20));
  ctx.fillStyle = "#f4d65a";
  for (const door of PLAYER_TRAIN_DOORS) ctx.fillRect(px(WIDTH - 0.1), px(door.pos.y - 0.65), px(0.5), px(1.3));

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
  for (const r of SECURITY_BARRIERS) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.fillStyle = COLORS.ochre;
  for (const r of GATE_BARRIERS) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.fillStyle = COLORS.green;
  for (const r of PILLARS) ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.font = "bold 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  for (const a of ATTRACTIONS) {
    const label = { toys: "POP MART 玩具机", advert: "广告灯箱", flowers: "鲜花小摊", information: "悬挂信息屏", seating: "等候座椅" }[a.kind];
    if (a.body) {
      ctx.fillStyle = a.kind === "seating" ? COLORS.green : COLORS.ochre;
      ctx.fillRect(px(a.body.x), px(a.body.y), px(a.body.w), px(a.body.h));
    } else {
      ctx.fillStyle = COLORS.inkSoft;
      ctx.fillRect(px(a.pos.x - .9), px(a.pos.y - .2), px(1.8), px(.4));
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(label, px(a.pos.x), px(a.pos.y + (a.pos.y > 20 ? 1.7 : -1.5)));
  }
  ctx.textAlign = "start";

  ctx.strokeStyle=COLORS.ochre;ctx.lineWidth=5;
  for(const s of RAILING_SEGMENTS) line(ctx,{x:SECURITY_X,y:s.minY},{x:SECURITY_X,y:s.maxY});
  if (!replay) for(const region of MAP_REGIONS) if(world.lightAt({x:(region.start+region.end)/2,y:15})<1) { ctx.fillStyle="rgba(18,26,34,.55)";ctx.fillRect(px(region.start),0,px(region.end-region.start),MAP_PX.h); }
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
    const vision = guards.vision(g);
    const half = (vision.fov * Math.PI) / 360;
    const range = vision.range;
    ctx.fillStyle = g.lookAt ? "rgba(180,83,60,0.20)" : "rgba(110,138,116,0.16)";
    ctx.beginPath();
    ctx.moveTo(px(g.pos.x), px(g.pos.y));
    ctx.arc(px(g.pos.x), px(g.pos.y), px(range), g.facing - half, g.facing + half);
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

  if (!replay) {
    const scene=captureScene(engine);
    for(const i of scene.items) { ctx.fillStyle=COLORS.ochre;ctx.fillRect(px(i.x)-3,px(i.z)-3,6,6); }
    for(const a of scene.alerts) {
      const actor=scene.actors.get(a.observerId); if(!actor) continue;
      const color=a.level === "white" ? "#faf7ee":a.level === "yellow" ? COLORS.ochre:COLORS.brick;
      ctx.fillStyle=color;ctx.strokeStyle=COLORS.ink;ctx.beginPath();ctx.arc(px(actor.x),px(actor.z)-12,4,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(a.level!=="red") {ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(actor.x),px(actor.z)-12,7,-Math.PI/2,-Math.PI/2+Math.PI*2*a.ring);ctx.stroke();}
    }
    ctx.fillStyle=COLORS.ink;ctx.font="10px system-ui";
    if (opts.messages) for (const {actorId,message} of opts.messages) {
      const actor=scene.actors.get(actorId);
      if (!actor) continue;
      const x=px(actor.x)+8,y=px(actor.z)-16;
      ctx.fillStyle=actorId==="player"?COLORS.player:COLORS.ochre;
      if (message.text) ctx.fillText(`${actorId==="player"?"Agent":`NPC ${actorId}`} · ${message.text.slice(0,30)}`,x,y);
      else {
        ctx.strokeStyle=actorId==="player"?COLORS.player:COLORS.ochre;ctx.lineWidth=1.4;ctx.beginPath();
        if(message.kind==="speech") {ctx.rect(x,y-9,14,9);ctx.moveTo(x+3,y);ctx.lineTo(x,y+3);}
        else {ctx.arc(x+7,y-5,6,0,Math.PI*2);ctx.moveTo(x+2,y+3);ctx.arc(x+1,y+3,1,0,Math.PI*2);}
        ctx.stroke();
      }
    }
    else for(const s of scene.speech) {const a=scene.actors.get(s.speakerId);if(a) ctx.fillText(s.text.slice(0,30),px(a.x)+8,px(a.z)-16);}
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
  ctx.save();
  ctx.fillStyle = "rgba(133,106,77,0.09)";
  ctx.fillRect(px(STAIRS_X), 0, px(PLATFORM_X - STAIRS_X), px(HEIGHT));
  for (const route of [
    { top: STAIRS_TOP, bottom: STAIRS_BOTTOM, label: "楼梯", detail: "固定 6 秒", escalator: false },
    { top: ESCALATOR_TOP, bottom: ESCALATOR_BOTTOM, label: "扶梯", detail: "站立 10 秒 / 步行 5 秒＋候梯", escalator: true },
  ]) {
    const half = route.escalator ? 1.5 : 2;
    ctx.fillStyle = "#f8f3e9";
    ctx.fillRect(px(route.top.x), px(route.top.y - half), px(route.bottom.x - route.top.x), px(half * 2));
    ctx.strokeStyle = COLORS.stairsEdge;
    ctx.lineWidth = 1;
    for (let x = route.top.x; x < route.bottom.x; x += .65)
      line(ctx, { x, y: route.top.y - half }, { x, y: route.top.y + half });
    ctx.lineWidth = route.escalator ? 3 : 1.5;
    for (const side of [-1, 1]) line(ctx, { x: route.top.x, y: route.top.y + side * half }, { x: route.bottom.x, y: route.bottom.y + side * half });
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 2;
    line(ctx, route.top, route.bottom);
    ctx.fillStyle = COLORS.stairsEdge;
    const middle = (route.top.x + route.bottom.x) / 2;
    ctx.beginPath();
    ctx.moveTo(px(middle + 1), px(route.top.y));
    ctx.lineTo(px(middle), px(route.top.y - .4));
    ctx.lineTo(px(middle), px(route.top.y + .4));
    ctx.closePath(); ctx.fill();
    ctx.textAlign = "center";
    ctx.font = "bold 13px ui-sans-serif, system-ui";
    ctx.fillText(`${route.label} ↓`, px(middle), px(route.top.y - half - 1.2));
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.fillText(route.detail, px(middle), px(route.top.y + half + 1.2));
  }
  ctx.fillStyle = COLORS.inkSoft;
  ctx.textAlign = "center";
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillText("闸机后连接区", px((GATE_X + STAIRS_X) / 2), px(3));
  ctx.fillText("下层站台 · 继续走向车门登车", px((PLATFORM_X + WIDTH) / 2), px(3));
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
    ctx.roundRect(px(-.9), px(-.3), px(1.8), px(.6), 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.securityEdge;
    ctx.fillRect(px(-.6), px(.05), px(1.2), px(.17));
    ctx.fillStyle = COLORS.ochre;
    ctx.fillRect(px(-.3), px(.28), px(.6), px(.06));
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

function drawGeneratedStation(ctx:CanvasRenderingContext2D,engine:Engine,opts:RenderOptions) {
 const d=engine.world.definition,l=d.layout, gap=4,b=worldViewBounds(d);
 ctx.save();ctx.clearRect(0,0,b.w*SCALE,(b.h*2+gap)*SCALE);
 for(const [index,floor] of d.floors.entries()){
  ctx.save();ctx.translate(-b.x*SCALE,(index*(b.h+gap)-b.y)*SCALE);ctx.fillStyle=index?COLORS.platform:COLORS.hall;ctx.fillRect(0,0,l.WIDTH*SCALE,l.HEIGHT*SCALE);
  ctx.fillStyle=COLORS.ink;ctx.font="16px Microsoft YaHei";ctx.fillText(`${d.name} · ${index?"B2 岛式站台":"B1 站厅"}`,10,22);
  const rectangles=index?(l.MOVE_BLOCKERS.filter(r=>r.floorId==="platform")):[...l.SECURITY_BARRIERS,...l.GATE_BARRIERS,...l.PILLARS,...(l.openings??[])];
  ctx.fillStyle=COLORS.inkSoft;for(const r of rectangles)ctx.fillRect(px(r.x),px(r.y),px(r.w),px(r.h));
  for(const f of l.FACILITIES.filter(f=>(f.pos.floorId??"concourse")===floor.id)){ctx.fillStyle=f.kind==="tvm"?COLORS.ochre:f.kind==="security"?COLORS.securityEdge:COLORS.green;ctx.fillRect(px(f.pos.x)-5,px(f.pos.y)-8,10,16);ctx.fillStyle=COLORS.ink;ctx.font="11px sans-serif";ctx.fillText(f.id,px(f.pos.x)+7,px(f.pos.y));}
  for(const p of d.props??[]){if(p.pos.floorId!==floor.id||!p.body)continue;ctx.fillStyle=p.assetId.startsWith('plant')?'#537e58':'#88978a';ctx.fillRect(px(p.body.x),px(p.body.y),px(p.body.w),px(p.body.h));}
  for(const detail of d.details.filter(v=>v.pos.floorId===floor.id)){ctx.fillStyle=COLORS.ochre;const r=detail.body;if(r)ctx.fillRect(px(r.x),px(r.y),px(r.w),px(r.h));}
  for(const item of captureScene(engine).items)if(displayFloor(item.floorId)===floor.id){ctx.fillStyle=COLORS.ochre;ctx.fillRect(px(item.x)-3,px(item.z)-3,6,6);}
  for(const node of l.NAV_NODES.filter(n=>(n.pos.floorId??"concourse")===floor.id)){ctx.fillStyle=COLORS.inkSoft;ctx.font="9px sans-serif";ctx.fillText(node.label,px(node.pos.x),px(node.pos.y)-8);}
  if(!index)for(const e of d.entrances??[]){const r=e.bounds;ctx.fillStyle=COLORS.stairs;ctx.fillRect(px(r.x),px(r.y),px(r.w),px(r.h));ctx.strokeStyle=COLORS.stairsEdge;ctx.strokeRect(px(r.x),px(r.y),px(r.w),px(r.h));for(let i=0;i<24;i++){const x=e.top.x+e.inward.x*i/4,y=e.top.y+e.inward.y*i/4;line(ctx,{x:x-e.inward.y*e.width/2,y:y+e.inward.x*e.width/2},{x:x+e.inward.y*e.width/2,y:y-e.inward.x*e.width/2});}ctx.fillStyle=COLORS.ink;ctx.fillText(`${e.id}口 ↓ 站厅`,px(e.top.x),px(e.top.y)-8);}
  const snapshot=captureScene(engine);
  for(const actor of snapshot.actors.values())if(displayFloor(actor.floorId)===floor.id&&!(actor.id==="player"&&opts.replay)){ctx.fillStyle=actor.id==="player"?COLORS.player:COLORS.inkSoft;ctx.beginPath();ctx.arc(px(actor.x),px(actor.z),actor.id==="player"?6:4,0,Math.PI*2);ctx.fill();}
  const trail=opts.replay?.trail??(opts.showTrail?engine.trail:[]);ctx.strokeStyle=COLORS.brick;ctx.beginPath();let drawing=false;for(const p of trail){if(displayFloor(p.floorId)!==floor.id){drawing=false;continue;}if(drawing)ctx.lineTo(px(p.x),px(p.y));else ctx.moveTo(px(p.x),px(p.y));drawing=true;}ctx.stroke();
  const replay=opts.replay?.position;if(replay&&displayFloor(replay.floorId)===floor.id){ctx.fillStyle=COLORS.player;ctx.beginPath();ctx.arc(px(replay.x),px(replay.y),7,0,Math.PI*2);ctx.fill();}
  ctx.restore();
 }
 ctx.restore();
}
