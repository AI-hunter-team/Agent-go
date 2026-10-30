import type { ActionResult, CreativeMechanic, Vec } from "../shared/types";
import type { GuardSystem } from "./guards";
import { GATE_X, HEIGHT, queueSlot, zoneOf } from "./layout";
import { DT, RULES } from "./scenario";
import { prepareCutIn } from "./negotiation";
import { round1, type Person, type World } from "./world";

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

  constructor(
    private world: World,
    private guards: GuardSystem,
  ) {}

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
    const dest = queueSlot(f.def, f.queue.indexOf(npcId));
    if (mine) w.removeFromQueue(p);
    p.activity = { kind: "creative", mechanic: "cut_in_line", remaining: RULES.cutInSeconds, facility: f.def.id, dest };
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
    this.detect(p);
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
  }

  private finish(p: Person, a: Extract<Person["activity"], { kind: "creative" }>) {
    const w = this.world;
    p.pos = { ...a.dest };
    if (a.mechanic === "jump_gate") {
      p.passedGate = true;
      p.activity = { kind: "idle" };
      w.gatePassed++;
      w.notifyPlayer("creative_done", "翻越闸机成功，已到闸机内连接区；请前往楼梯入口下楼到站台");
      this.current = null;
      return;
    }
    const f = w.facility(a.facility)!;
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

  private detect(p: Person) {
    if (!this.current || this.caught) return;
    const g = this.guards.seenBy(p.pos);
    if (!g) return;
    this.current.detected = true;
    this.caught = { guard: g.def.label, mechanic: this.current.mechanic };
  }
}
