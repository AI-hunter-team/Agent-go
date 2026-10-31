import type { EntranceDefinition } from "../shared/world";
import { entrancePoint } from "./entranceGeometry";
import type { FacilityKind, Vec } from "../shared/types";
import { dist } from "./geometry";
import { TRAIN_BOARDING_X, TRAIN_DOOR_Z, queueSlot } from "./layout";
import { generatedTrainDoors } from "../shared/generatedTrain";
import { Rng } from "./rng";
import { RULES, multiplierOf, type NpcSpawn, type Scenario, type ScriptedEvent } from "./scenario";
import type { Person, World } from "./world";
import { personRadius } from "./movement";

/**
 * Environment-controlled passengers and scripted events. NPCs follow simple program
 * logic (docs/MVP技术方案.md §5.3): pick the open facility with the lowest expected
 * wait, walk there, re-pick when their queue closes.
 */
export class NpcDirector {
  private spawns: NpcSpawn[];
  private ambientRng: Rng;
  private entryRng: Rng;
  private pendingEntrance: string | null = null;
  private events: ScriptedEvent[];

  constructor(
    private world: World,
    scenario: Scenario,
    backgroundCrowd = true,
  ) {
    this.ambientRng=new Rng(scenario.seed).fork("ambient");
    this.entryRng=new Rng(scenario.seed).fork("entrance-flow");
    this.spawns = [...scenario.spawns].sort((a, b) => a.t - b.t);
    this.events = [...scenario.events].sort((a, b) => a.t - b.t);
    for (const [id, status] of Object.entries(scenario.initialStatus)) world.setStatus(id, status, "故障");
    this.placeStartingCrowd();
    const localCrowd = new Rng(scenario.seed ^ 0x3e17591);
    for (const attraction of (backgroundCrowd ? this.world.layout.ATTRACTIONS : []).filter(a => a.kind !== "information")) {
      const p = world.addPerson("normal", { x: attraction.approach.x + 1.3, y: attraction.approach.y }, { hasTicket: true });
      p.screened = true;
      p.activity = { kind: "waiting", remaining: localCrowd.range(20, 60) };
    }
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
      // A delayed arrival keeps its selected entrance and never appears inside the station.
      let pos: Vec | undefined, entrance: EntranceDefinition | undefined, lane = 0;
      const entries = w.definition.entrances ?? [];
      if (entries.length) {
        this.pendingEntrance ??= this.entryRng.pick(entries).id;
        entrance = entries.find(e => e.id === this.pendingEntrance)!;
        for (const candidate of [.9, -.9, 0]) {
          const point = entrancePoint(entrance, 0, candidate, true);
          if (w.spatial.clearOfPeople(point, point, personRadius(s.kind), w.collisionBodies(""))) { pos = point; lane = candidate; break; }
        }
      } else {
        const offsets = [0, 1.1, -1.1, 2.2, -2.2, 3.3, -3.3];
        pos = offsets.map(offset => ({ x: w.layout.ENTRANCE.x, y: w.layout.ENTRANCE.y + offset })).find(point => w.spatial.clearOfScenery(point, point, personRadius(s.kind)) && w.spatial.clearOfPeople(point, point, personRadius(s.kind), w.collisionBodies("")));
      }
      if (!pos) break;
      this.spawns.shift(); this.pendingEntrance = null;
      const p=w.addPerson(s.kind, pos, { hasTicket: s.hasCard, irritable: s.irritable });
      if (entrance) w.entry.begin(p, entrance, lane, true);
      if(w.definition.generatorVersion==="metro-v1"&&this.ambientRng.chance(.2)) {
        const detail=w.definition.details.find(d=>d.family==="entrance")!;
        const node={pos:{...detail.pos,x:detail.pos.x+2,y:detail.pos.y-1}};
        p.ambient={label:this.ambientRng.pick(["查看入口信息","短暂停留休息","等候同行者"]),point:node.pos,remaining:this.ambientRng.range(8,20),started:false};
      }
    }
    while (this.events.length && this.events[0].t <= w.t) this.apply(this.events.shift()!);

    for (const p of [...w.persons.values()]) {
      if (!p.isPlayer && p.activity.kind === "to_queue" && w.facility(p.activity.facility)?.status !== "open") p.activity = { kind: "idle" };
      if (p.isPlayer || p.incapacitated || (p.activity.kind !== "idle" && !p.onPlatform)) continue;
      if(p.activity.kind === "idle" && p.ambient) {
        if(p.ambient.started){delete p.ambient;}
        else if(dist(p.pos,p.ambient.point)<.6){p.ambient.started=true;p.activity={kind:"waiting",remaining:p.ambient.remaining};continue;}
        else {if(!w.walkTo(p,p.ambient.point,p.ambient.label))continue;delete p.ambient;}
      }
      this.decide(p);
    }
  }

  private apply(e: ScriptedEvent) {
    const w = this.world;
    if (e.type === "power") { w.powerOut(e.zone, e.duration); return; }
    if (e.type === "damage") { w.damageFacility(e.facility); return; }
    if (e.type === "recheck") {
      const f = w.facility(e.facility)!;
      f.pendingRecheck = w.rng.range(e.extra[0], e.extra[1]);
      return;
    }
    w.setStatus(e.facility, e.status, e.note);
    if (e.broadcast) {
      const player = w.player;
      if (player && !player.onPlatform && (w.definition.generatorVersion==="metro-v1"?dist(player.pos,w.facility(e.facility)!.def.pos):Math.abs(player.pos.x-this.world.layout.SECURITY_X)) <= RULES.broadcastRadius) {
        w.notifyPlayer("broadcast", e.broadcast);
      } else {
        w.log("broadcast", e.broadcast, false);
      }
    }
  }

  private decide(p: Person) {
    const w = this.world;
    if (p.passedGate && !p.onPlatform) return; // World owns the landing/stairs connection.
    if (p.onPlatform && w.definition.generatorVersion === "metro-v1") {
      const doors = generatedTrainDoors(w.definition);
      if (p.boardingDoor === undefined) {
        const nearest = doors.map((door, index) => ({ index, distance: dist(p.pos, door.pos) })).sort((a, b) => a.distance - b.distance).slice(0, 3);
        const numeric = Number.parseInt(p.id.slice(1), 10);
        p.boardingDoor = nearest[(Number.isFinite(numeric) ? numeric : 0) % nearest.length].index;
      }
      const door = doors[p.boardingDoor];
      if (dist(p.pos, door.pos) <= .65) w.boardNpc(p);
      else if (p.activity.kind !== "walking" || p.activity.label !== door.id) w.walkTo(p, door.pos, door.id);
      return;
    }
    if (p.onPlatform) {
      // Keep each NPC assigned to a stable door and remove it only after it
      // reaches the corresponding boarding threshold.
      const door = this.boardingDoor(p);
      if (p.pos.x >= TRAIN_BOARDING_X - 0.8 && Math.abs(p.pos.y - door.y) <= 0.65) w.boardNpc(p);
      else if (p.activity.kind !== "walking" || p.activity.label !== "列车车门") w.walkTo(p, door, "列车车门");
      return;
    }
    // World owns NPC route selection after the gate; never send them back to a gate.
    if (p.passedGate) return;
    const stage: FacilityKind = !p.hasTicket ? "tvm" : !p.screened ? "security" : "gate";
    let best: { id: string; cost: number } | null = null;
    for (const f of w.facilities.values()) {
      if (f.def.kind !== stage || f.status !== "open") continue;
      if(w.definition.archetype==="dual"){
        const other=w.layout.NAV_NODES.find(n=>n.id==="ENTRANCE_B")!.pos;
        const group=p.entryOrigin??(dist(p.pos,w.layout.ENTRANCE)<=dist(p.pos,other)?"A":"B");
        if(f.def.ingress!==group)continue;
      }
      const perPerson = { tvm: 8, security: 6.5, gate: 2 }[stage] * multiplierOf(f.def.id);
      const cost = (f.queue.length + (f.serving ? 1 : 0)) * perPerson + dist(p.pos, f.def.head) / p.speed;
      if (!best || cost < best.cost) best = { id: f.def.id, cost };
    }
    if (best) w.joinQueue(p, best.id);
  }

  /** Spread passengers across the visible platform doors so one doorway does
   * not become a permanent collision point for everyone behind it. */
  private boardingDoor(p: Person) {
    if (p.boardingDoor !== undefined) return { x: TRAIN_BOARDING_X, y: TRAIN_DOOR_Z[p.boardingDoor] };
    // The person id is monotonic, so modulo assignment spreads a burst of
    // arrivals across the visible doors even though each NPC is removed as
    // soon as it reaches the platform.
    const numericId = Number.parseInt(p.id.slice(1), 10);
    const index = Number.isFinite(numericId) ? numericId % TRAIN_DOOR_Z.length : 0;
    p.boardingDoor = index;
    return { x: TRAIN_BOARDING_X, y: TRAIN_DOOR_Z[index] };
  }
}
