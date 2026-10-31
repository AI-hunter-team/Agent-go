import type { ActionResult, CreativeMechanic, Vec } from "../shared/types";
import type { GuardSystem } from "./guards";
import { GATE_X, HEIGHT, zoneOf } from "./layout";
import { DT, RULES } from "./scenario";
import { prepareCutIn } from "./negotiation";
import { round1, type Person, type World } from "./world";
import { EventBus } from "./events";
import { PerceptionSystem } from "./perception";
import { AlertSystem } from "./alert";
import type { AlertSignals } from "../shared/types";

export interface Violation {
  t: number;
  mechanic: CreativeMechanic;
  detected: boolean;
}

/**
 * Settles physical actions. Jumping is a violation; queue movement requires an
 * explicit NPC consent obtained by Runner and is not treated as a violation.
 */
export class CreativeSystem {
  readonly violations: Violation[] = [];
  caught: { guard: string; mechanic: CreativeMechanic } | null = null;
  private consentTarget: string | null = null;
  private current: Violation | null = null;
  private checkVisibility: () => AlertSignals["guardRed"];

  constructor(
    private world: World,
    private guards: GuardSystem,
    private bus = new EventBus(),
    checkVisibility?: () => AlertSignals["guardRed"],
  ) {
    const perception = new PerceptionSystem(bus, (id) => world.persons.get(id));
    const alerts = new AlertSystem(bus, (id) => guards.guards.find((g) => g.def.id === id)?.role, () => world.t);
    this.checkVisibility = checkVisibility ?? (() => {
      const observers = guards.guards.map((g) => ({ id: g.def.id, role: g.role, pos: g.pos, facing: g.facing, incapacitated: g.incapacitated }));
      return alerts.step(perception.step(observers), (observer, subject) => {
        const g = guards.guards.find((entry) => entry.def.id === observer), p = world.persons.get(subject);
        return Boolean(g && p && guards.canSee(g, p.pos));
      }, 0).guardRed;
    });
  }

  start(p: Person, mechanic: CreativeMechanic, reason: string): ActionResult {
    if (mechanic === "unsupported") return { ok: false, text: `环境不支持这种行动：${reason}` };
    if (p.activity.kind === "service") return { ok: false, text: "正在办理中，无法进行其他行动" };
    return mechanic === "cut_in_line"
      ? { ok: false, text: "插队需要先沟通：使用 request_cut_in 向可见的具体 NPC 提出请求，获得同意后才能移动" }
      : this.startJump(p);
  }

  startConsentedCutIn(p: Person, npcId: string): ActionResult {
    const w = this.world;
    const valid = prepareCutIn(w, npcId, "已获得同意", []);
    if (!valid.ok) return valid;
    const mine = w.queuePosition(p);
    const f = w.facility(valid.request.npc.facility)!;
    const dest = w.queueStandPoint(f, f.queue.indexOf(npcId), p.kind);
    if (mine) w.removeFromQueue(p);
    p.activity = { kind: "creative", mechanic: "cut_in_line", remaining: RULES.cutInSeconds, facility: f.def.id, dest };
    w.cutInReservations.set(p.id, { facility: f.def.id, npcId });
    this.consentTarget = npcId;
    this.current = null;
    return { ok: true, text: `${npcId} 同意让位，开始移动到这位乘客前面（${f.def.id}）` };
  }

  private startJump(p: Person): ActionResult {
    if (zoneOf(p.pos) !== "concourse" || GATE_X - p.pos.x > RULES.jumpGateDistance) {
      return { ok: false, text: `只能在安检后大厅、距闸机线 ${RULES.jumpGateDistance} 米内翻越闸机` };
    }
    const dest: Vec = { x: GATE_X + 1.4, y: Math.min(HEIGHT - 1, Math.max(1, p.pos.y)) };
    if (this.world.queuePosition(p)) this.world.removeFromQueue(p);
    p.activity = { kind: "creative", mechanic: "jump_gate", remaining: RULES.jumpGateSeconds, facility: "", dest };
    this.begin("jump_gate");
    // A guard may turn on the very next tick; seeing the start still counts.
    this.perceiveAct();
    return { ok: true, text: "开始翻越闸机" };
  }

  private begin(mechanic: CreativeMechanic) {
    this.current = { t: round1(this.world.t), mechanic, detected: false };
    this.violations.push(this.current);
    this.world.log("violation", mechanic === "jump_gate" ? "角色开始翻越闸机" : "角色开始插队", false);
    const p = this.world.player!;
    const event = this.bus.emit({ t: this.world.t, kind: "vault", severity: "violation", actorId: p.id, pos: { ...p.pos }, loudness: 0 });
    this.bus.beginAct({ actorId: p.id, kind: event.kind, severity: event.severity, eventId: event.id });
  }

  /** Advance an ongoing act and run detection. Call once per step after guards move. */
  step(p: Person) {
    const a = p.activity;
    if (a.kind === "creative") {
      a.remaining -= DT;
      if (a.mechanic === "cut_in_line") {
        const f = this.world.facility(a.facility)!;
        if (f.status !== "open" || !this.consentTarget || !f.queue.includes(this.consentTarget)) {
          this.finish(p, a); return;
        }
        a.dest = this.world.cutInPoint(p, f);
        const arrived = this.world.movePerson(p, a.dest, p.speed * DT);
        if (arrived && a.remaining <= 1e-9) this.finish(p, a);
        return;
      }
      const frac = Math.min(1, DT / Math.max(a.remaining + DT, DT));
      p.pos = { x: p.pos.x + (a.dest.x - p.pos.x) * frac, y: p.pos.y + (a.dest.y - p.pos.y) * frac };
      this.perceiveAct();
      if (this.caught) return;
      if (a.remaining <= 1e-9) this.finish(p, a);
      return;
    }
  }

  private finish(p: Person, a: Extract<Person["activity"], { kind: "creative" }>) {
    const w = this.world;
    if (a.mechanic === "jump_gate") {
      this.bus.endAct(p.id);
      p.pos = { ...a.dest };
      p.passedGate = true;
      p.activity = { kind: "idle" };
      w.gatePassed++;
      w.notifyPlayer("creative_done", "翻越闸机成功，已到闸机内连接区；请前往楼梯入口下楼到站台");
      this.current = null;
      return;
    }
    const f = w.facility(a.facility)!;
    w.cutInReservations.delete(p.id);
    const index = this.consentTarget ? f.queue.indexOf(this.consentTarget) : -1;
    this.consentTarget = null;
    if (f.status !== "open" || index < 0) {
      p.activity = { kind: "idle" };
      w.notifyPlayer("action_failed", "让位已失效：同意的乘客已离队或设施已停用，请重新选择行动");
      this.current = null;
      return;
    }
    f.queue.splice(index, 0, p.id);
    p.activity = { kind: "queued", facility: f.def.id };
    w.notifyPlayer("creative_done", `经乘客同意，已移动到 ${f.def.id} 第 ${index + 1} 位`);
    this.current = null;
  }

  private perceiveAct() {
    if (!this.current || this.caught) return;
    const red = this.checkVisibility();
    const g = red?.subjectId === "player" ? this.guards.guards.find((entry) => entry.def.id === red.guardId) : null;
    if (!g) return;
    this.current.detected = true;
    this.caught = { guard: g.def.label, mechanic: this.current.mechanic };
  }
}
