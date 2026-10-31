import type { ActionResult, AlertSignals, CreativeMechanic } from "../../shared/types";
import { AlertSystem } from "../alert";
import { DialogueSystem } from "../dialogue";
import { EventBus } from "../events";
import type { GuardSystem } from "../guards";
import { NpcBrain } from "../npcBrain";
import { PerceptionSystem } from "../perception";
import { RULES } from "../scenario";
import type { Person, World } from "../world";
import { ActionExecutor } from "./executor";

/** Compatibility view for the old Runner/report. All settlement uses ActionExecutor. */
export class CreativeSystem {
  readonly violations: {
    t: number;
    mechanic: CreativeMechanic;
    detected: boolean;
  }[] = [];
  caught: {
    guard: string;
    mechanic: CreativeMechanic;
  } | null = null;
  readonly executor: ActionExecutor;
  private check: () => AlertSignals["guardRed"];
  constructor(private world: World, private guards: GuardSystem, private bus = new EventBus(), check?: () => AlertSignals["guardRed"], executor?: ActionExecutor) {
    const alerts = new AlertSystem(bus, id => guards.guards.find(g => g.def.id === id)?.role, () => world.t);
    const perception = new PerceptionSystem(bus, id => world.persons.get(id), world.lightAt, world.layout);
    const brain = new NpcBrain(world, guards, bus, alerts),
      dialogue = new DialogueSystem(world, bus, alerts, brain);
    this.executor = executor ?? new ActionExecutor({
      world,
      guards,
      bus,
      alerts,
      brain,
      dialogue
    });
    this.check = check ?? (() => {
      const observers = guards.guards.map(g => ({
        id: g.def.id,
        role: g.role,
        pos: g.pos,
        facing: g.facing,
        incapacitated: g.incapacitated
      }));
      return alerts.step(perception.step(observers), (id, subject) => {
        const g = guards.guards.find(g => g.def.id === id),
          p = world.persons.get(subject);
        return Boolean(g && p && guards.canSee(g, p.pos));
      }, 0).guardRed;
    });
  }
  start(p: Person, mechanic: CreativeMechanic, reason: string): ActionResult {
    if (mechanic === "unsupported") return {
      ok: false,
      text: `环境不支持这种行动：${reason}`
    };
    if (mechanic === "cut_in_line") return {
      ok: false,
      text: "插队需要先沟通：使用 request_cut_in 向可见的具体 NPC 提出请求"
    };
    const result = this.executor.start({
      status: "plan",
      steps: [{
        op: "vault",
        obstacle: "gate"
      }],
      summary: "开始翻越闸机",
      reason: "",
      source: "keywords"
    });
    if (result.ok) {
      this.violations.push({
        t: this.world.t,
        mechanic,
        detected: false
      });
      p.activity = {
        kind: "creative",
        mechanic: "jump_gate",
        remaining: RULES.jumpGateSeconds,
        facility: "",
        dest: {
          x: 45.4,
          y: p.pos.y
        }
      };
      this.noteRed(this.check());
    }
    return result;
  }
  startConsentedCutIn(_p: Person, npcId: string) {
    return this.executor.startConsentedCutIn(npcId);
  }
  step(_p: Person) {
    this.executor.step();
    this.noteRed(this.check());
    if (!this.caught) this.executor.finishFrame();
  }
  noteRed(red: AlertSignals["guardRed"]) {
    if (!red || red.subjectId !== "player" || this.bus.get(red.causeEventId)?.kind !== "vault") return;
    const current = this.violations.at(-1);
    if (!current) return;
    current.detected = true;
    this.caught = {
      guard: this.guards.guards.find(g => g.def.id === red.guardId)?.def.label ?? red.guardId,
      mechanic: current.mechanic
    };
  }
}
