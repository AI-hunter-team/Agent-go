import type { ObserverRole, Percept, Vec, WorldEvent } from "../shared/types";
import { dist, inViewCone, lineOfSight } from "./geometry";
import { SIGHT_OCCLUDERS } from "./layout";
import { PERCEPTION_RULES, RULES } from "./scenario";
import type { EventBus } from "./events";

export interface Observer {
  id: string;
  role: ObserverRole;
  pos: Vec;
  facing: number;
  incapacitated?: number;
}

export class PerceptionSystem {
  constructor(readonly bus: EventBus, private actor: (id: string) => { pos: Vec } | undefined) {}

  canSee(observer: Observer, pos: Vec): boolean {
    const npc = observer.role === "npc";
    return !(observer.incapacitated && observer.incapacitated > 0)
      && inViewCone(observer.pos, observer.facing, npc ? PERCEPTION_RULES.npcFovDeg : RULES.guardFovDeg, npc ? PERCEPTION_RULES.npcSightRange : RULES.guardRange, pos)
      && lineOfSight(observer.pos, pos, SIGHT_OCCLUDERS);
  }

  step(observers: readonly Observer[], frame: readonly WorldEvent[] = this.bus.drainFrame()): Percept[] {
    const relevant = new Map(frame.map((event) => [event.id, event]));
    const frameIds = new Set(frame.map((event) => event.id));
    for (const act of this.bus.ongoing.values()) {
      const event = this.bus.get(act.eventId);
      if (event) relevant.set(event.id, event);
    }
    const percepts: Percept[] = [];
    for (const observer of observers) {
      if ((observer.incapacitated ?? 0) > 0) continue;
      for (const event of relevant.values()) {
        if (event.actorId === observer.id) continue;
        const active = event.actorId ? this.bus.ongoing.get(event.actorId)?.eventId === event.id : false;
        const actor = event.actorId ? this.actor(event.actorId) : undefined;
        const pos = active && actor ? actor.pos : event.pos;
        const report = event.kind === "report" && event.aboutId && observer.role !== "npc"
          && (!event.targetId || event.targetId === observer.id)
          && dist(observer.pos, event.pos) <= PERCEPTION_RULES.shoutRadius && lineOfSight(observer.pos, event.pos, SIGHT_OCCLUDERS);
        const sight = this.canSee(observer, pos);
        const audible = frameIds.has(event.id) && dist(observer.pos, event.pos) <= event.loudness * (lineOfSight(observer.pos, event.pos, SIGHT_OCCLUDERS) ? 1 : 0.5);
        if (!report && !sight && !(event.loudness > 0 && audible)) continue;
        const channel = report ? "report" : sight ? "sight" : "hearing";
        percepts.push({ observerId: observer.id, eventId: event.id, t: event.t, channel,
          role: event.targetId === observer.id ? "victim" : channel === "sight" ? "witness" : "bystander",
          attributedTo: report ? event.aboutId! : sight && active && actor && this.canSee(observer, actor.pos) ? event.actorId : null,
          pos: { ...pos },
        });
      }
    }
    return percepts;
  }
}
