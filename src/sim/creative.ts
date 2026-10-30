import type { ActionResult, CreativeMechanic, Vec } from "../shared/types";
import { dist } from "./geometry";
import type { GuardSystem } from "./guards";
import { GATE_X, HEIGHT, queueSlot, zoneOf } from "./layout";
import { DT, RULES } from "./scenario";
import { round1, type Person, type World } from "./world";

export interface Violation {
  t: number;
  mechanic: CreativeMechanic;
  detected: boolean;
}

/**
 * Settles creative actions with world rules (docs/MVP技术方案.md §8). Every mechanic
 * here is a violation: if a guard sees the act while it is happening (or during the
 * attention window after a complaint), the run is lost.
 */
export class CreativeSystem {
  readonly violations: Violation[] = [];
  caught: { guard: string; mechanic: CreativeMechanic } | null = null;
  /** Seconds during which a just-finished cut-in can still be noticed. */
  private attentionLeft = 0;
  private current: Violation | null = null;

  constructor(
    private world: World,
    private guards: GuardSystem,
  ) {}

  start(p: Person, mechanic: CreativeMechanic, reason: string): ActionResult {
    if (mechanic === "unsupported") return { ok: false, text: `环境不支持这种行动：${reason}` };
    if (p.activity.kind === "service") return { ok: false, text: "正在办理中，无法进行其他行动" };
    return mechanic === "cut_in_line" ? this.startCutIn(p) : this.startJump(p);
  }

  private startCutIn(p: Person): ActionResult {
    const w = this.world;
    const mine = w.queuePosition(p);
    let target: { id: string; d: number } | null = null;
    for (const f of w.facilities.values()) {
      if (f.status !== "open" || f.queue.length === 0) continue;
      const others = f.queue.filter((id) => id !== p.id);
      const near = Math.min(...others.map((id) => dist(p.pos, w.persons.get(id)!.pos)));
      if (near <= RULES.cutInDistance && (!target || near < target.d)) target = { id: f.def.id, d: near };
    }
    if (!target) return { ok: false, text: `附近 ${RULES.cutInDistance} 米内没有可以插队的队伍` };
    if (mine && mine.facility.def.id === target.id && mine.index <= 1) {
      return { ok: false, text: "你已经在队伍最前部，不需要插队" };
    }
    const f = w.facility(target.id)!;
    const dest = queueSlot(f.def, Math.min(1, f.queue.length));
    if (mine) w.removeFromQueue(p);
    p.activity = { kind: "creative", mechanic: "cut_in_line", remaining: RULES.cutInSeconds, facility: target.id, dest };
    this.begin("cut_in_line");
    return { ok: true, text: `开始插队到 ${target.id} 队伍前部` };
  }

  private startJump(p: Person): ActionResult {
    if (zoneOf(p.pos) !== "concourse" || GATE_X - p.pos.x > RULES.jumpGateDistance) {
      return { ok: false, text: `只能在安检后大厅、距闸机线 ${RULES.jumpGateDistance} 米内翻越闸机` };
    }
    const dest: Vec = { x: GATE_X + 1.4, y: Math.min(HEIGHT - 1, Math.max(1, p.pos.y)) };
    if (this.world.queuePosition(p)) this.world.removeFromQueue(p);
    p.activity = { kind: "creative", mechanic: "jump_gate", remaining: RULES.jumpGateSeconds, facility: "", dest };
    this.begin("jump_gate");
    return { ok: true, text: "开始翻越闸机" };
  }

  private begin(mechanic: CreativeMechanic) {
    this.current = { t: round1(this.world.t), mechanic, detected: false };
    this.violations.push(this.current);
    this.world.log("violation", mechanic === "jump_gate" ? "角色开始翻越闸机" : "角色开始插队", false);
  }

  /** Advance an ongoing act and run detection. Call once per step after guards move. */
  step(p: Person) {
    const a = p.activity;
    if (a.kind === "creative") {
      a.remaining -= DT;
      const frac = Math.min(1, DT / Math.max(a.remaining + DT, DT));
      p.pos = { x: p.pos.x + (a.dest.x - p.pos.x) * frac, y: p.pos.y + (a.dest.y - p.pos.y) * frac };
      this.detect(p);
      if (this.caught) return;
      if (a.remaining <= 1e-9) this.finish(p, a);
      return;
    }
    if (this.attentionLeft > 0) {
      this.attentionLeft -= DT;
      this.detect(p);
      if (this.attentionLeft <= 0) this.current = null;
    }
  }

  private finish(p: Person, a: Extract<Person["activity"], { kind: "creative" }>) {
    const w = this.world;
    p.pos = { ...a.dest };
    if (a.mechanic === "jump_gate") {
      p.onPlatform = true;
      p.activity = { kind: "done" };
      w.gatePassed++;
      w.notifyPlayer("creative_done", "翻越闸机成功，进入站台");
      this.current = null;
      return;
    }
    const f = w.facility(a.facility)!;
    if (f.status !== "open") {
      p.activity = { kind: "idle" };
      w.notifyPlayer("action_failed", `插队途中 ${f.def.id} 停用了`);
      this.current = null;
      return;
    }
    const index = Math.min(1, f.queue.length);
    f.queue.splice(index, 0, p.id);
    p.activity = { kind: "queued", facility: f.def.id };
    w.notifyPlayer("creative_done", `已插队到 ${f.def.id} 第 ${index + 1} 位`);

    const victim = w.persons.get(f.queue[index + 1] ?? "");
    if (victim?.irritable) {
      const heard = this.guards.attract(p.pos);
      w.notifyPlayer("complaint", "身后的乘客大声抱怨你插队" + (heard.length ? "，附近的保安转头看了过来" : ""));
      this.attentionLeft = RULES.attentionSeconds;
      this.detect(p);
    } else {
      this.current = null;
    }
  }

  private detect(p: Person) {
    if (!this.current || this.caught) return;
    const g = this.guards.seenBy(p.pos);
    if (!g) return;
    this.current.detected = true;
    this.caught = { guard: g.def.label, mechanic: this.current.mechanic };
  }
}
