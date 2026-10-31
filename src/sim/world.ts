import type { FacilityStatus, GameEvent, PassengerKind, Trigger, TriggerKind, Vec } from "../shared/types";
import { dist, lineOfSight } from "./geometry";
import { ATTRACTIONS, FACILITIES, SIGHT_OCCLUDERS, STAIRS_BOTTOM, STAIRS_REACH, STAIRS_SECONDS, STAIRS_TOP, QUEUE_SPACING, type FacilityDef } from "./layout";
import { findPath } from "./nav";
import { Rng } from "./rng";
import { DT, PROFILES, RULES, STATUS_LABEL, multiplierOf } from "./scenario";
import { TransitSystem } from "./transit";
import { DEFAULT_GAME_SETTINGS } from "../shared/gameSettings";
import { clearOfPeople, clearServiceExit, detourAroundQueues, personRadius, steer, type MovingBody } from "./movement";

export type Activity =
  | { kind: "idle" }
  | { kind: "walking"; path: Vec[]; label: string }
  | { kind: "to_queue"; facility: string; path: Vec[] }
  | { kind: "queued"; facility: string }
  | { kind: "service"; facility: string }
  | { kind: "waiting"; remaining: number }
  | { kind: "stairs"; remaining: number; start: Vec }
  | { kind: "to_escalator"; path: Vec[] }
  | { kind: "escalator_queue"; joinedAt: number }
  | { kind: "escalator"; remaining: number }
  | { kind: "distracted"; attraction: string; remaining: number; elapsed: number; resume?: { path: Vec[]; label: string } }
  | { kind: "creative"; mechanic: "cut_in_line" | "jump_gate"; remaining: number; facility: string; dest: Vec }
  | { kind: "done" };

export interface Person {
  id: string;
  kind: PassengerKind;
  isPlayer: boolean;
  pos: Vec;
  speed: number;
  hasTicket: boolean;
  screened: boolean;
  passedGate: boolean;
  onPlatform: boolean;
  irritable: boolean;
  activity: Activity;
  transitRoute?: "stairs" | "escalator";
  attentionCooldown: Record<string, number>;
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
  t = 0;
  readonly rng: Rng;
  readonly transit: TransitSystem;
  readonly persons = new Map<string, Person>();
  readonly facilities = new Map<string, Facility>();
  readonly events: GameEvent[] = [];
  /** Decision triggers for the player character, drained by the engine. */
  playerTriggers: Trigger[] = [];
  /** Number of passengers (including the player) who have passed a gate. */
  gatePassed = 0;
  private nextId = 1;
  collisionGuards: MovingBody[] = [];
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
      if (reservation.facility !== f.def.id || this.persons.get(id)?.activity.kind !== "creative") continue;
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
    return { x: f.def.head.x + direction.x * offset, y: f.def.head.y + direction.y * offset };
  }

  /** Move toward a waypoint with body-sized queue/fixture avoidance and swept collision checks. */
  movePerson(p: Person, target: Vec, stride: number, detour = true): boolean {
    const bodies = this.collisionBodies(p.id);
    // Approach an occupied final queue slot directly, then wait instead of circling it.
    // Safe forward progress still matters: stopping early can obstruct the surrounding traffic.
    const occupiedArrival = p.activity.kind === "to_queue" && p.activity.path.length === 1
      && dist(p.pos, target) <= personRadius(p.kind) + stride
      && !clearOfPeople(target, target, personRadius(p.kind), bodies);
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
    const waypoint = detour && !occupiedArrival ? detourAroundQueues(p.pos, target, queues, personRadius(p.kind)) : target;
    p.pos = steer(p.pos, waypoint, stride, personRadius(p.kind), bodies, detour && !occupiedArrival);
    return dist(p.pos, target) < 1e-6;
  }

  constructor(seed: number, readonly timeLimitSeconds = DEFAULT_GAME_SETTINGS.timeLimitSeconds) {
    this.rng = new Rng(seed);
    this.transit = new TransitSystem(this, seed);
    for (const def of FACILITIES) {
      this.facilities.set(def.id, { def, status: "open", note: null, queue: [], serving: null, pendingRecheck: null });
    }
  }

  // ---------------------------------------------------------------- people

  addPerson(kind: PassengerKind, pos: Vec, opts: { isPlayer?: boolean; hasTicket?: boolean; irritable?: boolean } = {}): Person {
    const profile = PROFILES[kind];
    const sample = (r: [number, number]) => this.rng.range(r[0], r[1]);
    const person: Person = {
      id: opts.isPlayer ? "player" : `p${this.nextId++}`,
      kind,
      isPlayer: opts.isPlayer ?? false,
      pos: { ...pos },
      speed: profile.speed,
      hasTicket: opts.hasTicket ?? false,
      screened: false,
      passedGate: false,
      onPlatform: false,
      irritable: opts.irritable ?? false,
      activity: { kind: "idle" },
      attentionCooldown: {},
      serviceTime: { tvm: sample(profile.tvm), security: sample(profile.security), gate: sample(profile.gate) },
    };
    this.persons.set(person.id, person);
    return person;
  }

  get player(): Person | undefined {
    return this.persons.get("player");
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
    const path = findPath(p.pos, to, personRadius(p.kind));
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
    const path = findPath(p.pos, tail, personRadius(p.kind));
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
    if (p.activity.kind === "service" || p.activity.kind === "creative" || p.activity.kind === "stairs" || p.activity.kind === "escalator") return "当前行动尚未完成";
    if (!p.passedGate || p.onPlatform) return "需要先通过闸机，才能下楼梯进入站台";
    if (dist(p.pos, STAIRS_TOP) > STAIRS_REACH) return "请先前往 STAIRS_TOP 下楼梯入口";
    this.finishAttention(p, "选择楼梯");
    this.removeFromQueue(p);
    p.activity = { kind: "stairs", remaining: STAIRS_SECONDS, start: { ...p.pos } };
    return null;
  }

  inspectAttraction(p: Person, id: string, mode: "glance" | "linger"): string | null {
    const def = ATTRACTIONS.find(a => a.id === id);
    if (!def || !["glance", "linger"].includes(mode)) return "无效的关注目标或方式";
    if (!p.screened || p.passedGate || dist(p.pos, def.approach) > RULES.visionRange || !lineOfSight(p.pos, def.approach, SIGHT_OCCLUDERS)) return "只能关注当前可见、可达的大厅设施";
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
  stepPeopleAndFacilities() {
    this.tickStarts.clear();
    for (const p of this.persons.values()) this.tickStarts.set(p.id, { ...p.pos });
    for (const p of this.persons.values()) this.stepPerson(p);
    for (const f of this.facilities.values()) this.stepFacility(f);
    this.transit.step();
  }

  private stepPerson(p: Person) {
    const a = p.activity;
    const stride = p.speed * DT;
    if (this.transit.stepPerson(p, stride)) return;
    switch (a.kind) {
      case "idle": {
        if (!p.isPlayer && p.passedGate && !p.onPlatform) {
          this.transit.routeNpc(p);
        }
        break;
      }
      case "walking": {
        if (this.followPath(p, a.path, stride)) {
          p.activity = { kind: "idle" };
          this.personEvent(p, "arrived", `已到达${a.label}`);
        }
        if (!p.isPlayer && p.passedGate && !p.onPlatform && dist(p.pos, STAIRS_TOP) <= STAIRS_REACH) this.descendStairs(p);
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
        const progress = Math.min(1, (STAIRS_SECONDS - remaining) / STAIRS_SECONDS);
        const next = {
          x: a.start.x + (STAIRS_BOTTOM.x - a.start.x) * progress,
          y: a.start.y + (STAIRS_BOTTOM.y - a.start.y) * progress,
        };
        if (!clearOfPeople(p.pos, next, personRadius(p.kind), this.collisionBodies(p.id))) break;
        p.pos = next;
        a.remaining = remaining;
        if (a.remaining <= 1e-9) {
          p.pos = { ...STAIRS_BOTTOM };
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
        const nominal = f.def.exit ?? { x: f.def.head.x + 1.3, y: f.def.head.y };
        const exits = f.def.kind === "tvm" ? [nominal, { x: f.def.head.x - 1.3, y: f.def.head.y }] : [nominal, { x: nominal.x, y: nominal.y + 0.85 }, { x: nominal.x, y: nominal.y - 0.85 }];
        const exit = p ? exits.find((point) => clearServiceExit(p.pos, point, personRadius(p.kind)) && clearOfPeople(p.pos, point, personRadius(p.kind), this.collisionBodies(p.id))) : nominal;
        if (!exit) return;
        f.serving = null;
        if (p) { this.completeService(f, p); p.pos = exit; }
      }
      return;
    }
    if (f.queue.length === 0) return;
    const head = this.persons.get(f.queue[0]);
    if (!head) {
      f.queue.shift();
      return;
    }
    if (dist(head.pos, f.def.head) > 0.2) return;

    if (f.def.kind === "gate" && !head.hasTicket) {
      f.queue.shift();
      head.activity = { kind: "idle" };
      this.personEvent(head, "service_rejected", `${f.def.id} 拒绝通行：没有有效车票`);
      return;
    }
    f.queue.shift();
    let duration = head.serviceTime[f.def.kind] * multiplierOf(f.def.id);
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
        p.hasTicket = true;
        p.pos = { x: f.def.head.x, y: f.def.head.y + 1.3 };
        p.activity = { kind: "idle" };
        this.personEvent(p, "service_done", `在 ${f.def.id} 买到单程票`);
        break;
      case "security":
        p.screened = true;
        p.pos = { ...f.def.exit! };
        p.activity = { kind: "idle" };
        this.personEvent(p, "service_done", `通过 ${f.def.id} 安检，进入安检后大厅`);
        break;
      case "gate":
        p.pos = { ...f.def.exit! };
        p.passedGate = true;
        p.onPlatform = false;
        p.activity = { kind: "idle" };
        this.gatePassed++;
        this.personEvent(p, "service_done", `刷票通过 ${f.def.id}，到达上层平台；可选择楼梯或扶梯下行进入站台`);
        break;
    }
  }
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
