import type { Engine } from "../sim/engine";
import type { WorldReviewSnapshot } from "../shared/review";

/** Historical world facts only, never attached to a live AgentTurn. */
export class ReviewRecorder {
  private frames: WorldReviewSnapshot[] = [];
  capture(engine: Engine, force = false) {
    const last = this.frames.at(-1);
    if (last && ((!force && engine.t - last.t < 5) || engine.t === last.t)) return;
    this.frames.push({
      t: engine.t, player: { ...engine.player.pos },
      facilities: [...engine.world.facilities.values()].map(f => ({ id: f.def.id, status: f.status,
        queue: f.queue.map(id => `${id}:${engine.world.persons.get(id)?.kind ?? "unknown"}`),
        serving: f.serving ? { personId: f.serving.personId, remaining: f.serving.remaining } : null,
      })),
      guards: engine.guards.guards.map(g => ({ id: g.def.id, position: { ...g.pos }, facing: g.facing })),
      transit: { queue: engine.world.transit.queues().flat(), riders: [...engine.world.persons.values()]
        .flatMap(p => p.activity.kind === "escalator" ? [{ id: p.id, remaining: p.activity.remaining }] : []) },
    });
  }
  snapshot() { return structuredClone(this.frames); }
}
