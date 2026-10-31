import type { AlertRecord, MemoryEntry, Percept, Vec } from "../shared/types";
import type { AlertSystem } from "./alert";
import { REACTION_RULES as R } from "./content/alertRules";
import type { EventBus } from "./events";
import { angleTo, dist, inViewCone, lineOfSight } from "./geometry";
import type { GuardSystem } from "./guards";


import { DT, INTERACTION_RULES, PERCEPTION_RULES } from "./scenario";
import type { Activity, Person, World } from "./world";

export type Reaction = "glance" | "murmur" | "keep_distance" | "complain" | "argue" | "expel" | "flee" | "confront" | "report";
interface Active { action: Reaction; subjectId: string; point: Vec; causeId: string; remaining: number; resume: Activity; path: Vec[]; reclaimed: boolean }
const words: Record<Reaction, string> = { glance: "看了你一眼", murmur: "小声议论", keep_distance: "向旁边让开", complain: "请别影响别人。", argue: "请停下，讲清楚！", expel: "请到后面排队！", flee: "惊慌后退", confront: "停下，把东西还来！", report: "朝保安走去报告" };

export class NpcBrain {
  readonly memory = new Map<string, MemoryEntry[]>();
  readonly active = new Map<string, Active>();
  private chosen = new Map<string, Reaction>();
  private remembered = new Set<string>();
  private rng;
  private cutRng;
  private cutCheckAt = 0;
  readonly cuts = new Map<string, { targetId: string; facility: string; until: number; eventId: string }>();
  /** The executor supplies a contest-backed reclaim attempt in IV2-08. */
  reclaim: ((npc: Person, subject: Person) => void) | null = null;
  constructor(private world: World, private guards: GuardSystem, private bus: EventBus, private alerts: AlertSystem) { this.rng = world.rng.fork("reaction"); this.cutRng = world.rng.fork("npc-cut-in"); }

  remember(id: string, entry: MemoryEntry) {
    const list = this.memory.get(id) ?? [];
    list.push({ ...entry, text: [...entry.text].slice(0, R.memoryChars).join("") });
    this.memory.set(id, list.slice(-R.memoryLimit));
  }
  perceive(percepts: readonly Percept[]) {
    for (const p of percepts) {
      if (!this.world.persons.get(p.observerId)?.persona) continue;
      const key = `${p.observerId}:${p.eventId}`;
      if (this.remembered.has(key)) continue;
      this.remembered.add(key);
      const e = this.bus.get(p.eventId)!;
      if(!p.attributedTo && !this.active.has(p.observerId)) {
        const observer=this.world.persons.get(p.observerId)!;
        observer.facing=angleTo(observer.pos,p.pos);
      }
      this.remember(p.observerId, { t: this.world.t, about: p.attributedTo, kind: e.kind, text: `${p.channel === "hearing" ? "听到" : "看到"}${e.kind}`, eventId: e.id });
    }
    for (const record of this.alerts.records.values()) {
      const npc = this.world.persons.get(record.observerId), subject = this.world.persons.get(record.subjectId);
      if (!npc?.persona || !subject || npc.incapacitated > 0 || record.reaction) continue;
      // An attributed initial event carries the last actually seen point; later rings
      // can only grow with sight, so their subject point is also known.
      const percept = percepts.find((p) => p.observerId === npc.id && p.attributedTo === subject.id);
      const visible = this.sees(npc, subject.pos);
      const point = visible ? subject.pos : percept?.pos ?? this.bus.get(record.causeEventId)?.pos;
      if (!point) continue;
      this.react(npc, subject, record, point);
    }
  }
  choose(npc: Person, subject: Person, record: AlertRecord): Reaction {
    const key = JSON.stringify([npc.id, subject.id, record.level]);
    const cached = this.chosen.get(key); if (cached) return cached;
    const { courage: c, temper: t, fairness: f, meddling: m } = npc.persona!.traits;
    let scores: [Reaction, number][] = record.level === "white" ? [["glance", .5], ["murmur", .3 + .4*m], ["keep_distance", .3 + .4*(1-c)]]
      : record.level === "yellow" ? [["complain", .4 + .3*t], ["argue", .2 + .5*t + .2*c]]
        : [["flee", .3 + .6*(1-c) + .2*npc.persona!.situation.fatigue], ["confront", .1 + .5*c + .3*t], ["report", .2 + .4*m + .3*f + .3*Number(this.guards.guards.some((g) => dist(g.pos,npc.pos) <= 15 && !g.incapacitated))]];
    const mine = this.world.queuePosition(npc), theirs = this.world.queuePosition(subject);
    const event = this.bus.get(record.causeEventId);
    if (record.level === "yellow" && ((mine && mine.facility === theirs?.facility) || (event?.kind === "force_cut_in" && event.targetId === npc.id))) scores.push(["expel", .3 + .6*f]);
    scores = scores.map(([action, score]) => [action, score + this.rng.range(-R.noise,R.noise)]);
    scores.sort((a,b) => b[1]-a[1]); const action = scores[0][0]; this.chosen.set(key, action); return action;
  }
  react(npc: Person, subject: Person, record: AlertRecord, point: Vec, forced?: Reaction) {
    const action = forced ?? this.choose(npc, subject, record);
    const previous = this.active.get(npc.id);
    const resume = previous?.resume ?? npc.activity;
    if (resume.kind === "entering" || resume.kind === "service" || resume.kind === "stairs" || resume.kind === "done") return;
    record.reaction = action;
    this.bus.endAct(npc.id);
    const moving = ["keep_distance", "flee", "confront", "report"].includes(action);
    if (moving) this.world.removeFromQueue(npc);
    const remaining = action === "glance" ? R.glanceSeconds : action === "argue" || action === "expel" || action === "confront" ? R.argueSeconds : action === "report" ? 30 : action === "flee" ? 10 : 2;
    this.active.set(npc.id, { action, subjectId: subject.id, point: { ...point }, causeId: record.causeEventId, remaining, resume: moving ? { kind: "idle" } : resume, path: [], reclaimed: false });
    npc.activity = { kind: "reacting", reaction: action, subjectId: subject.id };
    this.remember(npc.id, { t: this.world.t, about: subject.id, kind: action, text: words[action], eventId: record.causeEventId });
    if (["murmur","complain","argue","expel","confront"].includes(action)) {
      this.world.log("speech", `${npc.id}：${words[action]}`, this.world.player ? dist(npc.pos,this.world.player.pos) <= 8 && lineOfSight(npc.pos,this.world.player.pos,this.world.layout.SIGHT_OCCLUDERS) : false);
      const event = this.bus.emit({ t: this.world.t, kind: "argument", severity: "odd", actorId: npc.id, targetId: subject.id, pos: { ...npc.pos }, loudness: action === "murmur" ? 2 : 5, causeId: record.causeEventId });
      this.bus.beginAct({ actorId: npc.id, kind: event.kind, severity: event.severity, eventId: event.id });
    }
  }
  blocks(npcId: string, subjectId: string) { const a = this.active.get(npcId); return a?.subjectId === subjectId && (a.action === "expel" || a.action === "confront"); }
  step() {
    this.stepCuts();
    for (const [id, a] of this.active) {
      const npc = this.world.persons.get(id), subject = this.world.persons.get(a.subjectId);
      if (!npc || npc.incapacitated > 0 || npc.activity.kind !== "reacting") { this.finish(id); continue; }
      if (subject && this.sees(npc,subject.pos)) a.point = { ...subject.pos };
      npc.facing = angleTo(npc.pos,a.point);
      a.remaining -= DT;
      if (a.action === "report") {
        const guards = this.guards.guards.filter((g) => !g.incapacitated).sort((x,y) => dist(x.pos,npc.pos)-dist(y.pos,npc.pos));
        const close = guards.find((g) => dist(g.pos,npc.pos) <= PERCEPTION_RULES.shoutRadius && lineOfSight(g.pos,npc.pos,this.world.layout.SIGHT_OCCLUDERS));
        if (close) {
          this.bus.emit({ t: this.world.t, kind: "report", severity: "violation", actorId: id, targetId: close.def.id, aboutId: a.subjectId, aboutPos: { ...a.point }, pos: { ...npc.pos }, loudness: 8, causeId: a.causeId });
          this.finish(id); continue;
        }
        if (guards[0]) this.walk(npc,a,guards[0].pos,2);
      } else if (a.action === "keep_distance" || a.action === "flee") {
        const distance = a.action === "flee" ? R.fleeDistance : R.distance;
        const d = dist(npc.pos,a.point);
        if (d >= distance) { this.finish(id); continue; }
        const dx = (npc.pos.x-a.point.x)/(d || 1), dy = (npc.pos.y-a.point.y)/(d || 1);
        const dest = { x: Math.max(1,Math.min(this.world.layout.WIDTH-1,a.point.x+(d ? dx : -1)*distance)), y: Math.max(1,Math.min(this.world.layout.HEIGHT-1,a.point.y+dy*distance)) };
        this.walk(npc,a,dest,.2);
      } else if (a.action === "confront") {
        this.walk(npc,a,a.point,1.2);
        if (!a.reclaimed && subject && this.sees(npc,subject.pos) && dist(npc.pos,subject.pos) <= 1.6 && this.world.items.holdings(subject.id).some((i) => i.ownerId === id)) {
          a.reclaimed = true; this.reclaim?.(npc,subject);
        }
      }
      if (a.remaining <= 1e-9) this.finish(id);
    }
    // Lost tickets are world facts, not information about the thief's live position.
    for (const npc of this.world.persons.values()) {
      if (npc.isPlayer || npc.incapacitated || npc.hasTicket || npc.passedGate || this.active.has(npc.id) || npc.activity.kind === "service") continue;
      const stolen = [...this.world.items.items.values()].some((i) => i.kind === "ticket" && !i.used && i.ownerId === npc.id && this.world.items.holderId(i) !== npc.id);
      const red = [...this.alerts.records.values()].some((r) => r.observerId === npc.id && r.level === "red");
      if (stolen && !red && (npc.activity.kind === "queued" || npc.activity.kind === "to_queue")) {
        const facility = this.world.facility(npc.activity.facility);
        if (facility?.def.kind !== "tvm") { this.world.removeFromQueue(npc); npc.activity = { kind: "idle" }; }
      }
    }
  }
  private stepCuts() {
    const w = this.world;
    for (const [id, cut] of this.cuts) {
      const p = w.persons.get(id), f = w.facility(cut.facility);
      const valid = p && !p.incapacitated && p.activity.kind === "acting" && f?.status === "open" && f.queue.includes(cut.targetId);
      if (!valid || w.t >= cut.until || this.blocks(cut.targetId, id)) {
        this.bus.endAct(id); w.cutInReservations.delete(id); this.cuts.delete(id);
        if (p?.activity.kind === "acting") { p.activity = { kind: "idle" }; if (f?.status === "open") w.joinQueue(p, f.def.id); }
        continue;
      }
      const dest = w.cutInPoint(p!, f!);
      if (w.movePerson(p!, dest, p!.speed * DT) && w.t >= cut.until - 6) {
        f!.queue.splice(f!.queue.indexOf(cut.targetId), 0, id);
        p!.activity = { kind: "queued", facility: f!.def.id };
        this.bus.endAct(id); w.cutInReservations.delete(id); this.cuts.delete(id);
      }
    }
    if (w.t < this.cutCheckAt) return;
    this.cutCheckAt = w.t + 1;
    for (const p of w.persons.values()) {
      if (p.isPlayer || !p.persona || p.incapacitated || p.activity.kind !== "queued" || p.persona.traits.fairness >= INTERACTION_RULES.npcCutFairnessMax || p.persona.situation.hurry <= INTERACTION_RULES.npcCutHurryMin || !this.cutRng.chance(INTERACTION_RULES.npcCutChancePerSecond)) continue;
      const q = w.queuePosition(p); if (!q || q.index < 1 || q.facility.status !== "open") continue;
      const targetId = q.facility.queue[q.index - 1];
      if (this.cuts.has(targetId)) continue;
      w.removeFromQueue(p); p.activity = { kind: "acting", op: "force_cut_in", progress: 0 };
      w.cutInReservations.set(p.id, { facility: q.facility.def.id, npcId: targetId });
      const event = this.bus.emit({ t: w.t, kind: "force_cut_in", severity: "affecting", actorId: p.id, targetId, pos: { ...p.pos }, loudness: 3 });
      this.bus.beginAct({ actorId: p.id, kind: event.kind, severity: event.severity, eventId: event.id, targetId });
      this.cuts.set(p.id, { targetId, facility: q.facility.def.id, until: w.t + INTERACTION_RULES.npcCutTimeout, eventId: event.id });
    }
  }
  private sees(npc: Person, point: Vec) { return !npc.incapacitated && inViewCone(npc.pos,npc.facing,PERCEPTION_RULES.npcFovDeg,PERCEPTION_RULES.npcSightRange * Math.min(this.world.lightAt(npc.pos), this.world.lightAt(point)),point) && lineOfSight(npc.pos,point,this.world.layout.SIGHT_OCCLUDERS); }
  private walk(npc: Person, a: Active, point: Vec, stop: number) {
    if (dist(npc.pos,point) <= stop) return;
    if (!a.path.length || dist(a.path.at(-1)!,point) > 1) a.path = this.world.navigation.findPath(npc.pos,point) ?? [];
    if (a.path[0] && this.world.movePerson(npc,a.path[0],npc.speed*DT)) a.path.shift();
  }
  private finish(id: string) {
    const a = this.active.get(id), npc = this.world.persons.get(id);
    if (a && npc?.activity.kind === "reacting") {
      npc.activity = a.resume.kind === "queued" && !this.world.queuePosition(npc) ? { kind: "idle" } : a.resume;
    }
    this.bus.endAct(id); this.active.delete(id);
  }
}
