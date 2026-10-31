import { EntranceSystem } from "./entrance";
import { legacyWorld } from "./worldDefinition";
import type { WorldDefinition } from "../shared/world";
import type { FacilityStatus, GameEvent, PassengerKind, Persona, Trigger, TriggerKind, Vec } from "../shared/types";
import { angleTo, dist, lineOfSight } from "./geometry";
import { generatePersona } from "./persona";
import { type Zone, STAIRS_REACH, STAIRS_SECONDS, QUEUE_SPACING, type FacilityDef } from "./layout";
import { createNavigation } from "./nav";
import { Rng } from "./rng";
import { DT, INTERACTION_RULES, PROFILES, RULES, STATUS_LABEL, multiplierOf } from "./scenario";
import { TransitSystem } from "./transit";
import { DEFAULT_GAME_SETTINGS } from "../shared/gameSettings";
import { DEFAULT_LOADOUT, resolveLoadout, type Loadout } from "../shared/interaction";
import { ITEM_DEFS } from "./content/items";
import { ItemSystem } from "./items";

import { createMovement, personRadius, type MovingBody } from "./movement";

export type Activity =
  | { kind: "entering"; entranceId: string; progress: number; lane: number; fromSource: boolean }
  | { kind: "idle" }
  | { kind: "walking"; path: Vec[]; label: string }
  | { kind: "to_queue"; facility: string; path: Vec[] }
  | { kind: "queued"; facility: string }
  | { kind: "service"; facility: string }
  | { kind: "waiting"; remaining: number }
  | { kind: "stairs"; remaining: number; start: Vec; route?: "stairs" | "escalator"; duration?: number; end?: Vec }
  | { kind: "reacting"; reaction: string; subjectId: string }
  | { kind: "acting"; op: string; progress: number }
  | { kind: "to_escalator"; path: Vec[] }
  | { kind: "escalator_queue"; joinedAt: number }
  | { kind: "escalator"; remaining: number; duration?: number }
  | { kind: "distracted"; attraction: string; remaining: number; elapsed: number; resume?: { path: Vec[]; label: string } }
  | { kind: "creative"; mechanic: "cut_in_line" | "jump_gate"; remaining: number; facility: string; dest: Vec }
  | { kind: "done" };

export interface Person {
  id: string;
  kind: PassengerKind;
  isPlayer: boolean;
  pos: Vec;
  speed: number;
  readonly hasTicket: boolean;
  readonly ticketUsed: boolean;
  screened: boolean;
  passedGate: boolean;
  onPlatform: boolean;
  irritable: boolean;
  activity: Activity;
  persona?: Persona;
  facing: number;
  incapacitated: number;
  transitRoute?: "stairs" | "escalator";
  attentionCooldown: Record<string, number>;
  entryOrigin?: string;
  ambient?: { label:string; point:Vec; remaining:number; started:boolean };
  escalatorWalking?: boolean;
  /** Actual service durations, sampled once from the profile ranges. Hidden from the agent. */
  serviceTime: { tvm: number; security: number; gate: number };
}

export interface Facility {
  def: FacilityDef;
  status: FacilityStatus;
  note: string | null;
  queue: string[];
  serving: { personId: string; remaining: number; recheck: boolean } | null;
  /** Extra seconds to apply to the next non-player passenger served (scripted re-check). */
  pendingRecheck: number | null;
}

export class World {
  readonly layout;
  readonly spatial;
  readonly navigation;
  t = 0;
  readonly outages = new Map<Zone, number>();
  onWorldEvent: ((event: Omit<import("../shared/interaction").WorldEvent, "id">) => void) | null = null;
  lightAt = (pos: Vec) => (this.outages.get(this.layout.zoneOf(pos)) ?? 0) > this.t ? INTERACTION_RULES.darkSightFactor : 1;
  private zoneCenter(zone: Zone): Vec {
    if(this.definition.generatorVersion==="metro-v1") {
      if(zone==="platform")return {...this.layout.STAIRS_BOTTOM};
      if(zone==="stairs")return {...this.layout.STAIRS_TOP,floorId:"transit:stairs",elevation:-3};
      const region=this.definition.regions.find(r=>r.kind===zone)!;
      return {x:region.bounds.x+region.bounds.w/2,y:region.bounds.y+region.bounds.h/2,floorId:region.floorId};
    }
    const x={hall:13,concourse:35,landing:(this.layout.GATE_X+this.layout.STAIRS_TOP.x)/2,stairs:(this.layout.STAIRS_TOP.x+this.layout.STAIRS_BOTTOM.x)/2,platform:(this.layout.STAIRS_BOTTOM.x+this.layout.WIDTH)/2}[zone];
    return {x,y:15};
  }
  powerOut(zone: Zone, duration: number) {
    this.outages.set(zone, this.t + duration);
    const pos = this.zoneCenter(zone);
    this.onWorldEvent?.({ t: this.t, kind: "power_out", actorId: null, severity: "odd", pos, loudness: 12 });
    this.log("power_out", `${zone} 区域断电 ${duration} 秒，视距降低`, true);
  }
  damageFacility(id: string, actorId: string | null = null, causeId?: string) {
    const f = this.facility(id); if (!f) return false;
    this.setStatus(id, "broken", "受损停用");
    this.onWorldEvent?.({ t: this.t, kind: "facility_damaged", actorId, targetId: id, severity: "violation", pos: { ...f.def.pos }, loudness: 10, causeId });
    return true;
  }
  readonly rng: Rng;
  readonly items: ItemSystem;
  private readonly personaRng: Rng;
  private readonly wakeAt = new Map<string, number>();
  readonly transit: TransitSystem;
  readonly entry: EntranceSystem;
  readonly persons = new Map<string, Person>();
  readonly personas: Record<string, Persona> = {};
  readonly facilities = new Map<string, Facility>();
  readonly events: GameEvent[] = [];
  /** Decision triggers for the player character, drained by the engine. */
  playerTriggers: Trigger[] = [];
  /** Number of passengers (including the player) who have passed a gate. */
  gatePassed = 0;
  private nextId = 1;
  collisionGuards: MovingBody[] = [];
  private readonly detourCache=new Map<string,{target:Vec;waypoint:Vec;until:number}>();
  readonly tickStarts = new Map<string, Vec>();
  readonly cutInReservations = new Map<string, { facility: string; npcId: string }>();

  collisionBodies(exceptId: string): MovingBody[] {
    return [...this.persons.values()].filter((p) => p.id !== exceptId).map<MovingBody>((p) => ({ id: p.id, pos: p.pos, from: this.tickStarts.get(p.id), radius: personRadius(p.kind) })).concat(this.collisionGuards.filter((g) => g.id !== exceptId));
  }

  queueStandPoint(f: Facility, index: number, incoming: PassengerKind = "normal"): Vec {
    const ids = this.physicalQueue(f);
    const slot = f.queue[index] ? ids.indexOf(f.queue[index]) : ids.length + index - f.queue.length;
    return this.queuePoint(f, ids, slot, incoming);
  }

  cutInPoint(p: Person, f: Facility): Vec {
    const ids = this.physicalQueue(f);
    return this.queuePoint(f, ids, ids.indexOf(p.id), p.kind);
  }

  private physicalQueue(f: Facility): string[] {
    const ids = [...(f.serving ? [f.serving.personId] : []), ...f.queue];
    for (const [id, reservation] of this.cutInReservations) {
      if (reservation.facility !== f.def.id || !["creative","acting"].includes(this.persons.get(id)?.activity.kind ?? "")) continue;
      const before = ids.indexOf(reservation.npcId);
      if (before >= 0) ids.splice(before, 0, id);
    }
    return ids;
  }

  private queuePoint(f: Facility, ids: string[], slot: number, incoming: PassengerKind): Vec {
    let offset = 0;
    for (let i = 1; i <= slot; i++) {
      const before = this.persons.get(ids[i - 1])?.kind ?? incoming;
      const next = this.persons.get(ids[i])?.kind ?? incoming;
      offset += Math.max(QUEUE_SPACING, personRadius(before) + personRadius(next) + 0.02);
    }
    const direction = f.def.queueDirection ?? { x: -1, y: 0 };
    return { ...f.def.head, x: f.def.head.x + direction.x * offset, y: f.def.head.y + direction.y * offset };
  }

  /** Move toward a waypoint with body-sized queue/fixture avoidance and swept collision checks. */
  movePerson(p: Person, target: Vec, stride: number, detour = true): boolean {
    const bodies = this.collisionBodies(p.id);
    // Approach an occupied final queue slot directly, then wait instead of circling it.
    // Safe forward progress still matters: stopping early can obstruct the surrounding traffic.
    const occupiedArrival = p.activity.kind === "to_queue" && p.activity.path.length === 1
      && dist(p.pos, target) <= personRadius(p.kind) + stride
      && !this.spatial.clearOfPeople(target, target, personRadius(p.kind), bodies);
    const memberships = [...this.facilities.values()].map(f => [...f.queue, ...(f.serving ? [f.serving.personId] : [])]);
    memberships.push(this.transit.queue);
    const queues = memberships.flatMap((ids) => {
      const people = ids.filter(id => id !== p.id).map((id) => this.persons.get(id)).filter((person): person is Person => !!person);
      if (people.length < 2) return [];
      const margin = personRadius(p.kind) + Math.max(...people.map((person) => personRadius(person.kind))) + 0.03;
      const minX = Math.min(...people.map((person) => person.pos.x)), maxX = Math.max(...people.map((person) => person.pos.x));
      const minY = Math.min(...people.map((person) => person.pos.y)), maxY = Math.max(...people.map((person) => person.pos.y));
      return [{ x: minX - margin, y: minY - margin, w: maxX - minX + margin * 2, h: maxY - minY + margin * 2 }];
    });
    let waypoint:Vec=target;
    if(detour&&!occupiedArrival){
      const cached=this.definition.generatorVersion==="metro-v1"?this.detourCache.get(p.id):undefined;
      if(cached&&cached.until>this.t&&dist(cached.target,target)<.75&&dist(p.pos,cached.waypoint)>stride)waypoint=cached.waypoint;
      else {waypoint=this.spatial.detourAroundQueues(p.pos,target,queues,personRadius(p.kind));if(this.definition.generatorVersion==="metro-v1")this.detourCache.set(p.id,{target:{...target},waypoint,until:this.t+.5});}
    }
    const before = { ...p.pos };
    p.pos = this.spatial.steer(p.pos, waypoint, stride, personRadius(p.kind), bodies, detour && !occupiedArrival);
    if (dist(before,p.pos)>1e-8) p.facing=angleTo(before,p.pos);
    return dist(p.pos, target) < 1e-6;
  }

  constructor(seed: number, readonly timeLimitSeconds = DEFAULT_GAME_SETTINGS.timeLimitSeconds, readonly loadout: Readonly<Loadout> = DEFAULT_LOADOUT, readonly definition:WorldDefinition=legacyWorld(seed)) {
    this.layout=definition.layout; this.spatial=createMovement(this.layout); this.navigation=createNavigation(this.layout,this.spatial);
    this.loadout = resolveLoadout(loadout);
    this.rng = new Rng(seed);
    this.personaRng = this.rng.fork("persona");
    this.items = new ItemSystem((id) => this.persons.get(id), () => this.t, this.layout);
    for (const spot of this.layout.ITEM_SPOTS) for (const kind of spot.stock) this.items.spawn(kind, { type: "spot", spotId: spot.id }, null);
    this.transit = new TransitSystem(this, seed);
    this.entry = new EntranceSystem(this);
    for (const def of this.layout.FACILITIES) {
      this.facilities.set(def.id, { def, status: "open", note: null, queue: [], serving: null, pendingRecheck: null });
    }
  }

  // ---------------------------------------------------------------- people

  addPerson(kind: PassengerKind, pos: Vec, opts: { isPlayer?: boolean; hasTicket?: boolean; irritable?: boolean; persona?: Persona; facing?: number } = {}): Person {
    const profile = PROFILES[kind];
    const sample = (r: [number, number]) => this.rng.range(r[0], r[1]);
    const items = this.items;
    const persona = kind === "player" || opts.isPlayer ? undefined : opts.persona ?? generatePersona(this.personaRng, kind, opts.irritable);
    const person: Person = {
      id: opts.isPlayer ? "player" : `p${this.nextId++}`,
      kind,
      isPlayer: opts.isPlayer ?? false,
      pos: { ...pos },
      speed: profile.speed,
      get hasTicket() { return items.hasValidTicket(this.id); },
      get ticketUsed() { return items.holdings(this.id).some((i) => i.kind === "ticket" && i.used === true); },
      screened: false,
      passedGate: false,
      onPlatform: false,
      irritable: persona ? persona.traits.temper > 0.6 : opts.irritable ?? false,
      persona,
      facing: opts.facing ?? 0,
      incapacitated: 0,
      activity: { kind: "idle" },
      attentionCooldown: {},
      serviceTime: { tvm: sample(profile.tvm), security: sample(profile.security), gate: sample(profile.gate) },
    };
    this.persons.set(person.id, person);
    if (persona) this.personas[person.id] = structuredClone(persona);
    if (person.isPlayer) {
      if (this.loadout.backpack) this.items.spawn("backpack", { type: "held", personId: person.id, slot: "bag" }, person.id);
      this.items.spawn("coins", { type: "held", personId: person.id, slot: "pocket" }, person.id);
    }
    if (opts.hasTicket) this.items.spawn("ticket", { type: "held", personId: person.id, slot: "pocket" }, person.id);
    return person;
  }

  get player(): Person | undefined {
    return this.persons.get("player");
  }

  knockOut(p: Person, seconds: number) {
    this.removeFromQueue(p);
    for (const f of this.facilities.values()) if (f.serving?.personId === p.id) f.serving = null;
    p.activity = { kind: "idle" };
    p.incapacitated = seconds;
    this.wakeAt.set(p.id, this.t + seconds);
  }

  facility(id: string): Facility | undefined {
    return this.facilities.get(id);
  }

  // ------------------------------------------------------------ events

  log(kind: string, text: string, playerVisible: boolean) {
    this.events.push({ t: round1(this.t), kind, text, playerVisible });
  }

  notifyPlayer(kind: TriggerKind, text: string) {
    this.playerTriggers.push({ kind, text });
    this.log(kind, text, true);
  }

  private personEvent(p: Person, kind: TriggerKind, text: string) {
    if (p.isPlayer) this.notifyPlayer(kind, text);
  }

  // ------------------------------------------------------------ actions

  /** Walk to a point. Returns an error message when it cannot be reached on foot. */
  walkTo(p: Person, to: Vec, label: string): string | null {
    if (p.activity.kind === "stairs" || p.activity.kind === "escalator") return "正在下行，请等到达站台";
    const path = this.navigation.findPath(p.pos, to, personRadius(p.kind));
    if (!path) return `无法步行到达${label}：需要先通过安检或闸机`;
    this.finishAttention(p, "主动恢复赶路");
    p.activity = { kind: "walking", path, label };
    return null;
  }

  /** Head for the tail of a facility queue. */
  joinQueue(p: Person, facilityId: string): string | null {
    const f = this.facilities.get(facilityId);
    if (!f) return `不存在设施 ${facilityId}`;
    if (p.activity.kind === "stairs" || p.activity.kind === "escalator") return "正在下行，请等到达站台";
    if (p.activity.kind === "queued" || p.activity.kind === "service") return "已经在队伍中，需先离队";
    const tail = this.queueStandPoint(f, f.queue.length, p.kind);
    const path = this.navigation.findPath(p.pos, tail, personRadius(p.kind));
    if (!path) return `无法步行到达 ${facilityId} 的队尾：需要先通过安检或闸机`;
    this.finishAttention(p, "转向排队");
    p.activity = { kind: "to_queue", facility: facilityId, path };
    return null;
  }

  leaveQueue(p: Person): string | null {
    if (p.activity.kind === "escalator_queue" || p.activity.kind === "to_escalator") {
      this.transit.remove(p);
      p.activity = { kind: "idle" };
      return null;
    }
    if (p.activity.kind === "service") return "正在办理中，不能离队";
    if (p.activity.kind !== "queued") return "当前不在任何队伍中";
    this.removeFromQueue(p);
    p.activity = { kind: "idle" };
    return null;
  }

  removeFromQueue(p: Person) {
    this.transit.remove(p);
    for (const f of this.facilities.values()) {
      const i = f.queue.indexOf(p.id);
      if (i >= 0) f.queue.splice(i, 1);
    }
  }

  queuePosition(p: Person): { facility: Facility; index: number } | null {
    for (const f of this.facilities.values()) {
      const i = f.queue.indexOf(p.id);
      if (i >= 0) return { facility: f, index: i };
    }
    return null;
  }

  /** The stable-duration alternative to the queued escalator. */
  descendStairs(p: Person): string | null {
    if (p.activity.kind === "service" || p.activity.kind === "creative" || p.activity.kind === "acting" || p.activity.kind === "stairs" || p.activity.kind === "escalator") return "当前行动尚未完成";
    if (!p.passedGate || p.onPlatform) return "需要先通过闸机，才能下楼梯进入站台";
    if (dist(p.pos, this.layout.STAIRS_TOP) > STAIRS_REACH) return "请先前往 this.layout.STAIRS_TOP 下楼梯入口";
    this.finishAttention(p, "选择楼梯");
    this.removeFromQueue(p);
    if(this.definition.generatorVersion==="metro-v1")p.pos={...p.pos,floorId:"transit:stairs",elevation:0};
    p.activity = { kind: "stairs", remaining: STAIRS_SECONDS, start: { ...p.pos } };
    return null;
  }

  traverse(p: Person, route: "stairs" | "escalator", walking = false): string | null {
    if (route === "stairs") return this.descendStairs(p);
    if (["service", "creative", "acting", "stairs", "escalator"].includes(p.activity.kind)) return "当前行动尚未完成";
    const error=this.transit.join(p);
    if (error) return error;
    p.escalatorWalking=walking;
    return null;
  }

  inspectAttraction(p: Person, id: string, mode: "glance" | "linger"): string | null {
    const def = this.layout.ATTRACTIONS.find(a => a.id === id);
    if (!def || !["glance", "linger"].includes(mode)) return "无效的关注目标或方式";
    if (!p.screened || p.passedGate || dist(p.pos, def.approach) > RULES.visionRange || !lineOfSight(p.pos, def.approach, this.layout.SIGHT_OCCLUDERS)) return "只能关注当前可见、可达的大厅设施";
    if (!["idle", "walking", "waiting"].includes(p.activity.kind)) return "当前活动不能关注设施，请先完成活动或离队";
    if ((p.attentionCooldown[id] ?? 0) > this.t) return "刚刚已经关注过这里，先继续赶路";
    if (mode === "linger" && dist(p.pos, def.approach) > 2.5) return `请先靠近 ${id} 再停留查看`;
    const a = p.activity;
    p.activity = { kind: "distracted", attraction: id, remaining: mode === "glance" ? 3 : 6, elapsed: 0,
      ...(mode === "glance" && a.kind === "walking" ? { resume: { path: a.path.map(v => ({ ...v })), label: a.label } } : {}) };
    if (p.isPlayer) this.log("attention_start", `选择${mode === "glance" ? "减速查看" : "停留欣赏"}${def.label}；可随时继续赶路`, true);
    return null;
  }

  finishAttention(p: Person, reason: string) {
    const a = p.activity;
    if (a.kind !== "distracted") return;
    p.attentionCooldown[a.attraction] = this.t + 30;
    if (p.isPlayer) this.log("attention_end", `${reason}：关注 ${a.attraction}，实际活动 ${round1(a.elapsed)} 秒${a.resume ? "（含减速行走，并非全是净损失）" : ""}`, true);
    p.activity = a.resume?.path.length ? { kind: "walking", ...a.resume } : { kind: "idle" };
  }

  setStatus(facilityId: string, status: FacilityStatus, note: string | null) {
    const f = this.facilities.get(facilityId);
    if (!f) return;
    f.status = status;
    f.note = note;
    this.log("facility_status", `${f.def.label}${STATUS_LABEL[status]}`, false);
    if (status === "open") return;
    this.interruptService(f);
    // Unfinished service and waiting positions are both invalid once a lane stops.
    for (const id of f.queue) {
      const p = this.persons.get(id);
      if (!p) continue;
      p.activity = { kind: "idle" };
      this.personEvent(p, "queue_closed", `你所在的 ${facilityId} 已${STATUS_LABEL[status]}，队伍解散，需要另选`);
    }
    f.queue = [];
  }

  private interruptService(f: Facility) {
    if (!f.serving) return;
    const p = this.persons.get(f.serving.personId);
    f.serving = null;
    if (p?.activity.kind === "service" && p.activity.facility === f.def.id) {
      p.activity = { kind: "idle" };
      this.personEvent(p, "service_rejected", `${f.def.id} 已${STATUS_LABEL[f.status]}，本次办理中断且未完成，请改选其他可用设施`);
    }
  }

  // ------------------------------------------------------------ simulation

  /** Advance people and facilities by one fixed step. */
  stepPeopleAndFacilities(startsCaptured = false) {
    for (const [zone, until] of this.outages) if (until <= this.t) {
      this.outages.delete(zone);
      const pos = this.zoneCenter(zone);
      this.onWorldEvent?.({ t: this.t, kind: "power_restored", actorId: null, severity: "odd", pos, loudness: 4 });
      this.log("power_restored", `${zone} 区域恢复照明`, true);
    }
    if (!startsCaptured) {
      this.tickStarts.clear();
      for (const p of this.persons.values()) this.tickStarts.set(p.id, { ...p.pos });
    }
    for (const p of this.persons.values()) this.stepPerson(p);
    for (const f of this.facilities.values()) this.stepFacility(f);
    this.transit.step();
  }

  private stepPerson(p: Person) {
    if (p.incapacitated > 0) {
      p.incapacitated = Math.max(0, this.wakeAt.has(p.id) ? this.wakeAt.get(p.id)! - this.t : p.incapacitated - DT);
      if (p.incapacitated <= 1e-9) { p.incapacitated = 0; this.wakeAt.delete(p.id); }
      else return;
    }
    const a = p.activity;
    const stride = p.speed * DT;
    if (this.entry.stepPerson(p) || this.transit.stepPerson(p, stride)) return;
    switch (a.kind) {
      case "idle": {
        if (!p.isPlayer && p.passedGate && !p.onPlatform) {
          this.transit.routeNpc(p);
        }
        break;
      }
      case "walking": {
        const connectorArrival=this.definition.generatorVersion==="metro-v1"&&p.passedGate&&a.path.length===1&&[this.layout.STAIRS_TOP,this.layout.ESCALATOR_APPROACH].some(top=>dist(a.path[0],top)<.01&&dist(p.pos,top)<=.2);
        if (connectorArrival || this.followPath(p, a.path, stride)) {
          p.activity = { kind: "idle" };
          this.personEvent(p, "arrived", `已到达${a.label}`);
        }
        if (!p.isPlayer && p.passedGate && !p.onPlatform && dist(p.pos, this.layout.STAIRS_TOP) <= STAIRS_REACH) this.descendStairs(p);
        break;
      }
      case "to_queue": {
        const f = this.facilities.get(a.facility)!;
        const tail = this.queueStandPoint(f, f.queue.length, p.kind);
        const approaching = [...this.persons.values()].filter((other) => other.activity.kind === "to_queue" && other.activity.facility === a.facility)
          .sort((left, right) => dist(left.pos, tail) - dist(right.pos, tail) || left.id.localeCompare(right.id));
        const rank = approaching.findIndex((other) => other.id === p.id);
        // Only the nearest arrival approaches the tail. Others stage behind it,
        // rather than surrounding the same point and blocking it from every side.
        const target = this.queueStandPoint(f, f.queue.length + rank, p.kind);
        if (!a.path.length) a.path.push(target);
        else a.path[a.path.length - 1] = target;
        if (this.followPath(p, a.path, stride) && rank === 0) {
          if (f.status !== "open") {
            p.activity = { kind: "idle" };
            this.personEvent(p, "action_failed", `到达后发现 ${a.facility} ${STATUS_LABEL[f.status]}，无法排队`);
          } else {
            f.queue.push(p.id);
            p.activity = { kind: "queued", facility: a.facility };
            this.personEvent(p, "joined_queue", `已加入 ${a.facility} 队伍，前面还有 ${f.queue.length - 1} 人`);
          }
        }
        break;
      }
      case "queued": {
        const f = this.facilities.get(a.facility)!;
        const i = f.queue.indexOf(p.id);
        if (i >= 0) this.movePerson(p, this.queueStandPoint(f, i), stride, false);
        if (i >= 0 && dist(p.pos, this.queueStandPoint(f, i)) < 0.1) p.facing = angleTo(p.pos, f.def.pos);
        break;
      }
      case "waiting": {
        a.remaining -= DT;
        if (a.remaining <= 1e-9) {
          p.activity = { kind: "idle" };
          this.personEvent(p, "wait_done", "等待结束");
        }
        break;
      }
      case "stairs": {
        const remaining = Math.max(0, a.remaining - DT);
        const duration = a.duration ?? STAIRS_SECONDS, end = a.end ?? this.layout.STAIRS_BOTTOM;
        const progress = Math.min(1, (duration - remaining) / duration);
        const next = {
          ...p.pos,
          x: a.start.x + (end.x - a.start.x) * progress,
          y: a.start.y + (end.y - a.start.y) * progress,
        };
        if (!this.spatial.clearOfPeople(p.pos, next, personRadius(p.kind), this.collisionBodies(p.id))) break;
        p.pos = {...next, ...(this.definition.generatorVersion === "metro-v1" ? {floorId:"transit:stairs",elevation:(a.start.elevation??0)+(-6-(a.start.elevation??0))*progress} : {floorId:p.pos.floorId})};
        a.remaining = remaining;
        if (a.remaining <= 1e-9) {
          p.pos = { ...end };
          p.onPlatform = true;
          p.activity = { kind: p.isPlayer ? "done" : "idle" };
          this.personEvent(p, "arrived", "已下楼梯，到达下层站台");
        }
        break;
      }
      case "distracted": {
        if (a.resume?.path.length) this.followPath(p, a.resume.path, stride * .55);
        a.elapsed = round1(a.elapsed + DT);
        a.remaining = Math.max(0, a.remaining - DT);
        if (a.remaining <= 1e-9) {
          this.finishAttention(p, "关注结束");
          this.personEvent(p, "wait_done", "关注结束，可以继续赶路");
        }
        break;
      }
      default:
        break;
    }
  }

  private followPath(p: Person, path: Vec[], stride: number): boolean {
    let budget = stride;
    while (path.length && budget > 1e-8) {
      const next = path[0];
      const before = { ...p.pos };
      if (!this.movePerson(p, next, budget)) return false;
      budget -= dist(before, p.pos);
      path.shift();
    }
    return path.length === 0;
  }

  private stepFacility(f: Facility) {
    if (f.status !== "open") {
      this.interruptService(f);
      return;
    }
    if (f.serving) {
      f.serving.remaining -= DT;
      if (f.serving.remaining <= 1e-9) {
        const p = this.persons.get(f.serving.personId);
        const q=f.def.queueDirection??{x:-1,y:0}, side={x:q.y,y:-q.x};
        const nominal = f.def.exit ?? { ...f.def.head, x: f.def.head.x + side.x*1.3, y: f.def.head.y+side.y*1.3 };
        const exits = f.def.kind === "tvm" ? [nominal, {...f.def.head,x:f.def.head.x-side.x*1.3,y:f.def.head.y-side.y*1.3}] : [nominal, {...nominal,x:nominal.x+side.x*.85,y:nominal.y+side.y*.85}, {...nominal,x:nominal.x-side.x*.85,y:nominal.y-side.y*.85}];
        const exit = p ? exits.find((point) => this.spatial.clearServiceExit(p.pos, point, personRadius(p.kind)) && this.spatial.clearOfPeople(p.pos, point, personRadius(p.kind), this.collisionBodies(p.id))) : nominal;
        if (!exit) return;
        f.serving = null;
        if (p && this.completeService(f, p)) p.pos = exit;
      }
      return;
    }
    if (f.queue.length === 0) return;
    const head = this.persons.get(f.queue[0]);
    if (!head) {
      f.queue.shift();
      return;
    }
    if (head.incapacitated > 0 || head.activity.kind === "reacting") return;
    if (dist(head.pos, f.def.head) > 0.2) return;

    if (f.def.kind === "gate" && !head.hasTicket) {
      f.queue.shift();
      head.activity = { kind: "idle" };
      this.personEvent(head, "service_rejected", `${f.def.id} 拒绝通行：没有有效车票`);
      return;
    }
    f.queue.shift();
    let duration = head.serviceTime[f.def.kind] * multiplierOf(f.def.id);
    if (f.def.kind === "security") duration += (this.items.bag(head.id) ? INTERACTION_RULES.backpackSecuritySeconds : 0) + this.items.holdings(head.id).filter(i => ITEM_DEFS[i.kind].security === "inspect").length * INTERACTION_RULES.inspectItemSeconds;
    let recheck = false;
    if (f.pendingRecheck !== null && !head.isPlayer) {
      duration += f.pendingRecheck;
      f.pendingRecheck = null;
      recheck = true;
      this.log("recheck", `${f.def.label}有乘客需要复检`, false);
    }
    f.serving = { personId: head.id, remaining: duration, recheck };
    head.activity = { kind: "service", facility: f.def.id };
  }

  private completeService(f: Facility, p: Person) {
    switch (f.def.kind) {
      case "tvm":
        this.items.spawn("ticket", { type: "held", personId: p.id, slot: "pocket" }, p.id);
        p.pos = { x: f.def.head.x, y: f.def.head.y + 1.3 };
        p.activity = { kind: "idle" };
        this.personEvent(p, "service_done", `在 ${f.def.id} 买到单程票`);
        break;
      case "security":
        for (const item of this.items.holdings(p.id)) if (ITEM_DEFS[item.kind].security === "confiscate") this.items.move(item.id, { type: "spot", spotId: `confiscated-${f.def.id}` }, "confiscate");
        p.screened = true;
        p.pos = { ...f.def.exit! };
        p.activity = { kind: "idle" };
        this.personEvent(p, "service_done", `通过 ${f.def.id} 安检，进入安检后大厅`);
        break;
      case "gate":
        if (!this.items.useTicket(p.id)) {
          p.activity = { kind: "idle" };
          this.personEvent(p, "service_rejected", `${f.def.id} 拒绝通行：车票已离开持有人`);
          return false;
        }
        p.pos = { ...f.def.exit! };
        p.passedGate = true;
        p.onPlatform = false;
        p.activity = { kind: "idle" };
        this.gatePassed++;
        this.personEvent(p, "service_done", `刷票通过 ${f.def.id}，到达上层平台；可选择楼梯或扶梯下行进入站台`);
        break;
    }
    return true;
  }
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
