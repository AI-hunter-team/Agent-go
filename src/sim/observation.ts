import * as legacyLayout from "./layout";
import type { StationLayout } from "../shared/world";
import type { FacilityObservation, Observation, Vec } from "../shared/types";
import { compass, dist, lineOfSight } from "./geometry";
import type { GuardSystem } from "./guards";
import { BOARDING_INTERVAL, ESCALATOR_SECONDS, STAIRS_SECONDS, ZONE_LABEL } from "./layout";

import { PROFILES, RULES, multiplierOf } from "./scenario";
import { round1, type Facility, type Person, type World } from "./world";
import { BAG_CAPACITY } from "./content/items";

/** The player character's sight: 360°, limited range, blocked by walls and pillars. */
export function playerCanSee(from: Vec, to: Vec, lightAt: (pos: Vec) => number = () => 1, layout:StationLayout=legacyLayout): boolean {
  return dist(from, to) <= RULES.visionRange * Math.min(lightAt(from), lightAt(to)) && lineOfSight(from, to, layout.SIGHT_OCCLUDERS);
}

export function visibleFacilities(world: World, from: Vec): Facility[] {
  return [...world.facilities.values()].filter((f) => playerCanSee(from, f.def.pos, world.lightAt, world.layout));
}

function traitOf(p: Person | undefined): string {
  if (!p) return "未知";
  if (p.isPlayer) return "你";
  return PROFILES[p.kind].trait ?? "普通乘客";
}

function efficiencyLabel(id: string): string {
  const m = multiplierOf(id);
  if (m < 1) return `效率较快（耗时 ×${m}）`;
  if (m > 1) return `效率较慢（耗时 ×${m}）`;
  return "效率正常（耗时 ×1）";
}

function observeFacility(world: World, f: Facility, from: Vec): FacilityObservation {
  const m = multiplierOf(f.def.id);
  const base = PROFILES.normal[f.def.kind];
  const serving = f.serving ? world.persons.get(f.serving.personId) : undefined;
  const visibleQueue = f.queue.map((id) => world.persons.get(id)).filter(
    (person): person is Person => Boolean(person && playerCanSee(from, person.pos, world.lightAt, world.layout)),
  );
  return {
    id: f.def.id,
    kind: f.def.kind,
    status: f.status,
    distance: round1(dist(from, f.def.head)),
    efficiency: efficiencyLabel(f.def.id),
    serviceRange: [round1(base[0] * m), round1(base[1] * m)],
    queueLength: visibleQueue.length,
    queue: visibleQueue.map(traitOf),
    people: visibleQueue.filter((p) => !p.isPlayer).map((p) => ({ id: p.id, trait: traitOf(p), distance: round1(dist(from, p.pos)) })),
    serving: f.serving && serving && playerCanSee(from, serving.pos, world.lightAt, world.layout) ? traitOf(serving) + (f.serving.recheck ? "（复检中）" : "") : null,
    note: f.note,
  };
}

export function describeActivity(world: World, p: Person): string {
  const a = p.activity;
  switch (a.kind) {
    case "entering": return `正在从 ${a.entranceId} 口沿楼梯进入站厅（${Math.round(a.progress*100)}%）`;
    case "idle":
      return "空闲，等待指令";
    case "walking":
      return `正在走向${a.label}`;
    case "to_queue":
      return `正在走向 ${a.facility} 队尾`;
    case "queued": {
      const q = world.queuePosition(p);
      return `在 ${a.facility} 排队（第 ${(q?.index ?? 0) + 1} 位）`;
    }
    case "service":
      return `正在 ${a.facility} 办理`;
    case "waiting":
      return `${p.ambient?.label??"原地等待"}（剩余 ${round1(a.remaining)} 秒）`;
    case "creative":
      return a.mechanic === "jump_gate" ? "正在翻越闸机" : `正在插队到 ${a.facility}`;
    case "stairs":
      return `正在${a.route === "escalator" ? "下行扶梯" : "下楼梯"}（剩余 ${round1(a.remaining)} 秒）`;
    case "reacting":
      return ({ glance: "看了一眼", murmur: "小声议论", complain: "抱怨", argue: "争执", expel: "驱赶插队者", keep_distance: "向旁边让开", flee: "惊慌后退", confront: "上前阻拦", report: "朝保安走去" } as Record<string,string>)[a.reaction] ?? "停下观察";
    case "acting":
      return `正在执行 ${a.op}`;
    case "to_escalator": return "正在走向扶梯队尾";
    case "escalator_queue": return `正在候梯（第 ${world.transit.queue.indexOf(p.id) + 1} 位）`;
    case "escalator": return `正在乘扶梯（剩余 ${round1(a.remaining)} 秒）`;
    case "distracted": return `正在关注 ${a.attraction}（剩余 ${round1(a.remaining)} 秒，可继续赶路）`;
    case "done":
      return "已进入站台";
  }
}

export function buildObservation(world: World, guards: GuardSystem): Observation {
  const p = world.player!;
  const node = world.navigation.nearestNode(p.pos);
  const q = world.queuePosition(p);
  return {
    t: round1(world.t),
    self: {
      inventory: world.items.holdings(p.id).map((i) => ({ id: i.id, kind: i.kind, slot: world.items.slot(i) })),
      action: p.activity.kind === "acting" ? {op:p.activity.op,progress:p.activity.progress} : null,
      bag: { has: Boolean(world.items.bag(p.id)), used: world.items.bagUsed(p.id), capacity: BAG_CAPACITY },
      position: { ...p.pos, x: round1(p.pos.x), y: round1(p.pos.y) },
      zone: ZONE_LABEL[world.layout.zoneOf(p.pos)],
      nearestNode: node ? `${node.id}（${node.label}）` : "无",
      activity: describeActivity(world, p),
      hasTicket: p.hasTicket,
      screened: p.screened,
      passedGate: p.passedGate,
      queue: q ? { facility: q.facility.def.id, position: q.index + 1, length: q.facility.queue.length } : null,
      elapsed: round1(world.t),
      timeLeft: round1(Math.max(0, world.timeLimitSeconds - world.t)),
    },
    items: world.items.visibleItems(p.pos, world.lightAt),
    people: [...world.persons.values()].filter((other) => !other.isPlayer && playerCanSee(p.pos, other.pos, world.lightAt, world.layout)).map((other) => ({
      id: other.id, look: other.persona ? `${other.persona.look.build}，${other.persona.look.outfit}，${other.persona.look.manner}` : traitOf(other),
      distance: round1(dist(p.pos,other.pos)), doing: other.incapacitated ? "倒地不动" : describeActivity(world,other),
      towardYou: other.activity.kind === "reacting" && other.activity.subjectId === p.id ? describeActivity(world,other) : null,
      holding: world.items.holdings(other.id).filter((i) => world.items.slot(i) === "hand").map((i) => i.kind),
    })),
    facilities: visibleFacilities(world, p.pos).map((f) => observeFacility(world, f, p.pos)),
    attractions: world.layout.ATTRACTIONS.filter(a => p.screened && !p.passedGate && playerCanSee(p.pos, a.approach, world.lightAt, world.layout)).map(a => ({
      id: a.id, label: a.label, cue: a.cue, distance: round1(dist(p.pos, a.approach)), approach: { ...a.approach }, canLinger: dist(p.pos, a.approach) <= 2.5,
    })),
    routes: [
      { id: "stairs" as const, label: "楼梯", node: "STAIRS_TOP", position: world.layout.STAIRS_TOP, travelSeconds: STAIRS_SECONDS, queueLength: 0, boardingInterval: 0 },
      { id: "escalator" as const, label: "扶梯", node: "ESCALATOR_TOP", position: world.layout.ESCALATOR_APPROACH, travelSeconds: ESCALATOR_SECONDS,
        queueLength: world.transit.queue.filter(id => { const person = world.persons.get(id); return person && playerCanSee(p.pos, person.pos, world.lightAt, world.layout); }).length, boardingInterval: BOARDING_INTERVAL },
    ].filter(r => p.passedGate && playerCanSee(p.pos, r.position, world.lightAt, world.layout)).map(r => ({ ...r, position: { ...r.position }, distance: round1(dist(p.pos, r.position)) })),
    guards: guards.guards
      .filter((g) => playerCanSee(p.pos, g.pos, world.lightAt, world.layout))
      .map((g) => ({
        id: g.def.id,
        doing: g.incapacitated > 0 ? "倒地不动" : g.mode === "watch" ? "盯着目标" : g.mode === "investigate" ? "前往动静处查看" : "巡逻",
        position: { x: round1(g.pos.x), y: round1(g.pos.y) },
        facing: `面朝${compass(g.facing)}`,
        distance: round1(dist(p.pos, g.pos)),
      })),
  };
}

/** One-line summary for the decision log. */
export function summarizeObservation(o: Observation): string {
  const fac = o.facilities
    .map((f) => `${f.id}:${f.status === "open" ? `${f.queueLength}人` : f.status === "broken" ? "故障" : "停用"}`)
    .join(" ");
  const guards = o.guards.length ? ` 保安:${o.guards.map((g) => `${g.distance}m${g.facing}`).join(",")}` : "";
  const additions = [...(o.attractions ?? []).map(a => a.id), ...(o.routes ?? []).map(r => `${r.label}:${r.queueLength}人可见`)].join(" ");
  return `t=${o.t}s ${o.self.zone} ${o.self.activity}${fac ? ` | 可见 ${fac}` : " | 视野内无设施"}${guards}${additions ? ` | ${additions}` : ""}`;
}
