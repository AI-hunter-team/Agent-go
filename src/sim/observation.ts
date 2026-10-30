import type { FacilityObservation, Observation, Vec } from "../shared/types";
import { compass, dist, lineOfSight } from "./geometry";
import type { GuardSystem } from "./guards";
import { SIGHT_OCCLUDERS, ZONE_LABEL, zoneOf } from "./layout";
import { nearestNode } from "./nav";
import { PROFILES, RULES, multiplierOf } from "./scenario";
import { round1, type Facility, type Person, type World } from "./world";

/** The player character's sight: 360°, limited range, blocked by walls and pillars. */
export function playerCanSee(from: Vec, to: Vec): boolean {
  return dist(from, to) <= RULES.visionRange && lineOfSight(from, to, SIGHT_OCCLUDERS);
}

export function visibleFacilities(world: World, from: Vec): Facility[] {
  return [...world.facilities.values()].filter((f) => playerCanSee(from, f.def.pos));
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
    (person): person is Person => Boolean(person && playerCanSee(from, person.pos)),
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
    serving: f.serving && serving && playerCanSee(from, serving.pos) ? traitOf(serving) + (f.serving.recheck ? "（复检中）" : "") : null,
    note: f.note,
  };
}

export function describeActivity(world: World, p: Person): string {
  const a = p.activity;
  switch (a.kind) {
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
      return `原地等待（剩余 ${round1(a.remaining)} 秒）`;
    case "creative":
      return a.mechanic === "jump_gate" ? "正在翻越闸机" : `正在插队到 ${a.facility}`;
    case "done":
      return "已进入站台";
  }
}

export function buildObservation(world: World, guards: GuardSystem): Observation {
  const p = world.player!;
  const node = nearestNode(p.pos);
  const q = world.queuePosition(p);
  return {
    t: round1(world.t),
    self: {
      position: { x: round1(p.pos.x), y: round1(p.pos.y) },
      zone: ZONE_LABEL[zoneOf(p.pos)],
      nearestNode: node ? `${node.id}（${node.label}）` : "无",
      activity: describeActivity(world, p),
      hasTicket: p.hasTicket,
      screened: p.screened,
      queue: q ? { facility: q.facility.def.id, position: q.index + 1, length: q.facility.queue.length } : null,
      elapsed: round1(world.t),
      timeLeft: round1(Math.max(0, RULES.timeLimit - world.t)),
    },
    facilities: visibleFacilities(world, p.pos).map((f) => observeFacility(world, f, p.pos)),
    guards: guards.guards
      .filter((g) => playerCanSee(p.pos, g.pos))
      .map((g) => ({
        id: g.def.id,
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
  return `t=${o.t}s ${o.self.zone} ${o.self.activity}${fac ? ` | 可见 ${fac}` : " | 视野内无设施"}${guards}`;
}
