import type { FacilityKind } from "../shared/types";
import { dist } from "./geometry";
import { ENTRANCE, SECURITY_X, queueSlot } from "./layout";
import { RULES, multiplierOf, type NpcSpawn, type Scenario, type ScriptedEvent } from "./scenario";
import type { Person, World } from "./world";
import { clearOfPeople, clearOfScenery, personRadius } from "./movement";

/**
 * Environment-controlled passengers and scripted events. NPCs follow simple program
 * logic (docs/MVP技术方案.md §5.3): pick the open facility with the lowest expected
 * wait, walk there, re-pick when their queue closes.
 */
export class NpcDirector {
  private spawns: NpcSpawn[];
  private events: ScriptedEvent[];

  constructor(
    private world: World,
    scenario: Scenario,
  ) {
    this.spawns = [...scenario.spawns].sort((a, b) => a.t - b.t);
    this.events = [...scenario.events].sort((a, b) => a.t - b.t);
    for (const [id, status] of Object.entries(scenario.initialStatus)) world.setStatus(id, status, "故障");
    this.placeStartingCrowd();
  }

  private placeStartingCrowd() {
    const w = this.world;
    const rest: NpcSpawn[] = [];
    for (const s of this.spawns) {
      if (!s.startQueue) {
        rest.push(s);
        continue;
      }
      const f = w.facility(s.startQueue)!;
      const kind = f.def.kind;
      const p = w.addPerson(s.kind, queueSlot(f.def, f.queue.length), {
        hasTicket: kind !== "tvm" || s.hasCard,
        irritable: s.irritable,
      });
      p.screened = kind === "gate";
      f.queue.push(p.id);
      p.pos = w.queueStandPoint(f, f.queue.length - 1);
      p.activity = { kind: "queued", facility: f.def.id };
    }
    this.spawns = rest;
  }

  step() {
    const w = this.world;
    while (this.spawns.length && this.spawns[0].t <= w.t) {
      const s = this.spawns[0];
      // A crowded entrance delays a spawn instead of creating two models in one place.
      const offsets = [0, 1.1, -1.1, 2.2, -2.2, 3.3, -3.3];
      const pos = offsets.map((offset) => ({ x: ENTRANCE.x, y: ENTRANCE.y + offset })).find((point) => clearOfScenery(point, point, personRadius(s.kind)) && clearOfPeople(point, point, personRadius(s.kind), w.collisionBodies("")));
      if (!pos) break;
      this.spawns.shift();
      w.addPerson(s.kind, pos, { hasTicket: s.hasCard, irritable: s.irritable });
    }
    while (this.events.length && this.events[0].t <= w.t) this.apply(this.events.shift()!);

    for (const p of [...w.persons.values()]) {
      if (p.isPlayer || p.activity.kind !== "idle") continue;
      this.decide(p);
    }
  }

  private apply(e: ScriptedEvent) {
    const w = this.world;
    if (e.type === "recheck") {
      const f = w.facility(e.facility)!;
      f.pendingRecheck = w.rng.range(e.extra[0], e.extra[1]);
      return;
    }
    w.setStatus(e.facility, e.status, e.note);
    if (e.broadcast) {
      const player = w.player;
      if (player && !player.onPlatform && Math.abs(player.pos.x - SECURITY_X) <= RULES.broadcastRadius) {
        w.notifyPlayer("broadcast", e.broadcast);
      } else {
        w.log("broadcast", e.broadcast, false);
      }
    }
  }

  private decide(p: Person) {
    const w = this.world;
    if (p.passedGate && !p.onPlatform) return; // World owns the landing/stairs connection.
    if (p.onPlatform) {
      if (p.pos.x >= 54) w.persons.delete(p.id);
      else w.walkTo(p, { x: 55, y: p.pos.y }, "站台深处");
      return;
    }
    const stage: FacilityKind = !p.hasTicket ? "tvm" : !p.screened ? "security" : "gate";
    let best: { id: string; cost: number } | null = null;
    for (const f of w.facilities.values()) {
      if (f.def.kind !== stage || f.status !== "open") continue;
      const perPerson = { tvm: 8, security: 6.5, gate: 2 }[stage] * multiplierOf(f.def.id);
      const cost = (f.queue.length + (f.serving ? 1 : 0)) * perPerson + dist(p.pos, f.def.head) / p.speed;
      if (!best || cost < best.cost) best = { id: f.def.id, cost };
    }
    if (best) w.joinQueue(p, best.id);
  }
}
