import type { EntranceDefinition } from "../shared/world";
import type { Person, World } from "./world";
import { entranceLength, entrancePoint } from "./entranceGeometry";
import { personRadius } from "./movement";
import { DT } from "./scenario";

/** Continuous entry, including a collision-checked handoff from the stair to the concourse. */
export class EntranceSystem {
  constructor(private world: World) {}

  begin(person: Person, entrance: EntranceDefinition, lane = 0, fromSource = false) {
    person.pos = entrancePoint(entrance, 0, lane, fromSource);
    person.facing = Math.atan2(entrance.inward.y, entrance.inward.x);
    person.entryOrigin = entrance.id;
    person.activity = { kind: "entering", entranceId: entrance.id, progress: 0, lane, fromSource };
  }

  stepPerson(person: Person): boolean {
    const activity = person.activity;
    if (activity.kind !== "entering") return false;
    const e = this.world.definition.entrances?.find(e => e.id === activity.entranceId);
    if (!e) { person.activity = { kind: "idle" }; return true; }
    const progress = Math.min(1, activity.progress + person.speed * DT / entranceLength(e, activity.fromSource));
    const next = entrancePoint(e, progress, activity.lane, activity.fromSource), radius = personRadius(person.kind);
    const from = { ...person.pos, floorId: next.floorId };
    const bodies = this.world.collisionBodies(person.id);
    if (!this.world.spatial.clearOfPeople(from, next, radius, bodies)) return true;
    if (next.floorId === "concourse") {
      const bounds = this.world.definition.floors[0].bounds;
      const inside = next.x >= bounds.x + radius && next.x <= bounds.x + bounds.w - radius && next.y >= bounds.y + radius && next.y <= bounds.y + bounds.h - radius;
      if (inside && !this.world.spatial.clearOfScenery(next, next, radius)) return true;
    }
    person.pos = next;
    activity.progress = progress;
    if (progress === 1) {
      person.activity = { kind: "idle" };
      this.world.log("station_entry", `${person.id} 从${e.label}进入站厅`, person.isPlayer);
      if (person.isPlayer) this.world.notifyPlayer("arrived", `已沿${e.label}下楼，进入站厅`);
    }
    return true;
  }
}
