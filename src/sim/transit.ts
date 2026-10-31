import type { Person, World } from "./world";
import { BOARDING_INTERVAL, ESCALATOR_BOTTOM, ESCALATOR_CAPACITY, ESCALATOR_REACH, ESCALATOR_SECONDS, ESCALATOR_WALK_SECONDS, ESCALATOR_TOP, QUEUE_SPACING, STAIRS_REACH, STAIRS_TOP } from "./layout";
import { dist } from "./geometry";
import { findPath } from "./nav";
import { Rng } from "./rng";
import { DT } from "./scenario";
import { clearOfPeople, clearOfScenery, personRadius } from "./movement";

/** A continuous carrier: admission is spaced, but multiple passengers ride together. */
export class TransitSystem {
  readonly queue: string[] = [];
  nextCrowdAt = Infinity;
  private nextAdmissionAt = 0;
  private rng: Rng;
  private crowdInterval = 2;

  constructor(private world: World, seed: number) { this.rng = new Rng(seed ^ 0x68a3d21f); }

  slot(index: number) {
    const spacing = Math.max(1, QUEUE_SPACING);
    let x = ESCALATOR_TOP.x;
    // A later entrant stays behind the predecessor's actual position while the
    // line compresses, even when that predecessor has not reached its new slot.
    for (let i = 1; i <= index; i++) {
      const previous = this.world.persons.get(this.queue[i - 1]);
      x = Math.min(x - spacing, (previous?.pos.x ?? x) - spacing);
    }
    return { x, y: ESCALATOR_TOP.y };
  }

  startCrowd() {
    const initial = 2 + Math.floor(this.rng.range(0, 10));
    this.crowdInterval = this.rng.pick([.6, 1.1, 2.6]);
    for (let i = 0; i < initial; i++) {
      const p = this.passenger(this.slot(i));
      this.queue.push(p.id);
      p.activity = { kind: "escalator_queue", joinedAt: this.world.t };
    }
    this.nextCrowdAt = this.rng.range(.5, 2);
  }

  private passenger(pos: { x: number; y: number }, kind = this.rng.pick(["normal", "elderly", "luggage"] as const)) {
    const p = this.world.addPerson(kind, pos, { hasTicket: true });
    p.screened = p.passedGate = true;
    p.transitRoute = "escalator";
    return p;
  }

  join(p: Person): string | null {
    if (!p.passedGate || p.onPlatform) return "需要先通过闸机，才能乘扶梯进入站台";
    if (["service", "creative", "stairs", "escalator", "distracted"].includes(p.activity.kind)) return "当前行动尚未完成";
    if (p.activity.kind === "escalator_queue" || p.activity.kind === "to_escalator") return null;
    if (dist(p.pos, ESCALATOR_TOP) > ESCALATOR_REACH) return "请先前往 ESCALATOR_TOP 扶梯入口";
    if (this.queue.length >= ESCALATOR_CAPACITY) return "候梯区已满，请等候或选择楼梯";
    const path = findPath(p.pos, this.slot(this.queue.length));
    if (!path) return "无法到达扶梯队尾";
    const atSlot = dist(p.pos, this.slot(this.queue.length)) <= .05;
    this.world.finishAttention(p, "选择扶梯");
    this.queue.push(p.id);
    if (atSlot) {
      p.activity = { kind: "escalator_queue", joinedAt: this.world.t };
      if (p.isPlayer) this.world.notifyPlayer("joined_queue", `已加入扶梯队伍，前面 ${this.queue.length - 1} 人`);
    } else p.activity = { kind: "to_escalator", path };
    return null;
  }

  remove(p: Person) {
    const i = this.queue.indexOf(p.id);
    if (i >= 0) {
      this.queue.splice(i, 1);
      if (p.isPlayer && p.activity.kind === "escalator_queue")
        this.world.log("escalator_wait", `离开扶梯队伍，实际候梯 ${Math.round((this.world.t - p.activity.joinedAt) * 10) / 10} 秒（失去位次）`, true);
    }
  }

  private approachingCount(exceptId?: string) {
    return [...this.world.persons.values()].filter(p => p.id !== exceptId && (p.activity.kind === "to_escalator" || p.activity.kind === "escalator_queue" || (p.transitRoute === "escalator" && p.activity.kind === "walking"))).length;
  }

  routeNpc(p: Person) {
    if (!p.transitRoute) p.transitRoute = this.rng.chance(p.kind === "hurried" ? .25 : .7) ? "escalator" : "stairs";
    if (p.transitRoute === "escalator" && this.approachingCount(p.id) >= ESCALATOR_CAPACITY) p.transitRoute = "stairs";
    const top = p.transitRoute === "escalator" ? { x: ESCALATOR_TOP.x, y: ESCALATOR_TOP.y + 1.2 } : STAIRS_TOP;
    if (dist(p.pos, top) > (p.transitRoute === "escalator" ? .2 : STAIRS_REACH)) this.world.walkTo(p, top, p.transitRoute === "escalator" ? "扶梯入口" : "楼梯入口");
    else if (p.transitRoute === "escalator") this.join(p);
    else this.world.descendStairs(p);
  }

  step() {
    const w = this.world;
    if (w.t >= this.nextCrowdAt) {
      this.nextCrowdAt = w.t + this.crowdInterval * this.rng.range(.8, 1.2);
      if (this.approachingCount() < ESCALATOR_CAPACITY - 1) {
        const pos = { x: this.slot(this.queue.length).x, y: 25 };
        const kind = this.rng.pick(["normal", "elderly", "luggage"] as const);
        const bodies = w.collisionBodies("").map(body => ({ ...body, from: undefined }));
        if (clearOfScenery(pos, pos, personRadius(kind)) && clearOfPeople(pos, pos, personRadius(kind), bodies)) {
          const p = this.passenger(pos, kind);
          this.routeNpc(p);
        }
      }
    }
    // Remove stale memberships defensively; admission never invents or teleports a passenger.
    for (let i = this.queue.length - 1; i >= 0; i--)
      if (!["escalator_queue", "to_escalator"].includes(w.persons.get(this.queue[i])?.activity.kind ?? "")) this.queue.splice(i, 1);
    if (w.t + 1e-9 < this.nextAdmissionAt || !this.queue.length) return;
    const p = w.persons.get(this.queue[0])!;
    if (p.activity.kind !== "escalator_queue" || dist(p.pos, ESCALATOR_TOP) > .2) return;
    const waited = p.activity.kind === "escalator_queue" ? w.t - p.activity.joinedAt : 0;
    this.queue.shift();
    this.nextAdmissionAt = w.t + BOARDING_INTERVAL;
    const duration = p.escalatorWalking ? ESCALATOR_WALK_SECONDS : ESCALATOR_SECONDS;
    p.activity = { kind: "escalator", remaining: duration, duration };
    if (p.isPlayer) w.notifyPlayer("service_done", `进入扶梯，实际候梯 ${Math.round(waited * 10) / 10} 秒；乘坐需 ${duration} 秒`);
  }

  stepPerson(p: Person, stride: number): boolean {
    const a = p.activity;
    if (a.kind === "to_escalator") {
      const index = this.queue.indexOf(p.id);
      if (index < 0) { p.activity = { kind: "idle" }; return true; }
      const target = this.slot(index);
      this.world.movePerson(p, target, stride);
      if (dist(p.pos, target) <= .05) {
        p.activity = { kind: "escalator_queue", joinedAt: this.world.t };
        if (p.isPlayer) this.world.notifyPlayer("joined_queue", `已加入扶梯队伍，前面 ${index} 人`);
      }
      return true;
    }
    if (a.kind === "escalator_queue") {
      const index = this.queue.indexOf(p.id);
      if (index >= 0) this.world.movePerson(p, this.slot(index), stride, false);
      return true;
    }
    if (a.kind === "escalator") {
      const remaining = Math.max(0, a.remaining - DT);
      const duration = a.duration ?? ESCALATOR_SECONDS;
      const progress = (duration - remaining) / duration;
      const next = { x: ESCALATOR_TOP.x + (ESCALATOR_BOTTOM.x - ESCALATOR_TOP.x) * progress, y: ESCALATOR_TOP.y };
      if (!clearOfPeople(p.pos, next, personRadius(p.kind), this.world.collisionBodies(p.id))) return true;
      a.remaining = remaining;
      p.pos = next;
      if (a.remaining <= 1e-9) {
        p.pos = { ...ESCALATOR_BOTTOM };
        p.onPlatform = true;
        p.activity = { kind: p.isPlayer ? "done" : "idle" };
        if (p.isPlayer) this.world.notifyPlayer("arrived", "已乘扶梯到达下层站台");
      }
      return true;
    }
    return false;
  }
}
