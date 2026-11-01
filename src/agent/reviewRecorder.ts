import type { Engine } from "../sim/engine";
import type { ReplayMotionFrame, WorldReviewSnapshot } from "../shared/review";

/** Historical world facts only, never attached to a live AgentTurn. */
export class ReviewRecorder {
  private frames: WorldReviewSnapshot[] = [];
  private motion: ReplayMotionFrame[] = [];
  private transfers = -1;
  private statuses = "";
  capture(engine: Engine, force = false) {
    const status=[...engine.world.facilities.values()].map(f=>f.status).join(",");
    const changed=status!==this.statuses;
    this.statuses=status;
    const flight=[...engine.world.items.items.values()].some(i=>i.location.type==="flight");
    const lastMotion=this.motion.at(-1);
    if(force || flight || this.transfers!==engine.world.items.transfers.length || !lastMotion || engine.t-lastMotion.t>=.5-1e-8) {
      this.transfers=engine.world.items.transfers.length;
      if(lastMotion?.t===engine.t)this.motion.pop();
      this.motion.push({t:engine.t,guards:engine.guards.guards.map(g=>({id:g.def.id,position:{...g.pos},facing:g.facing,mode:g.mode})),
        items:[...engine.world.items.items.values()].filter(i=>!i.used && (i.location.type==="flight"||i.location.type==="ground"||i.location.type==="spot"||i.location.type==="held"&&i.location.slot==="hand")).flatMap(i=>{
          const position=engine.world.items.position(i);return position?[{id:i.id,kind:i.kind,position:{...position},holderId:engine.world.items.holderId(i),...(i.location.type==="flight"?{trajectory:structuredClone(i.location.trajectory)}:{})}]:[];
        })});
    }
    const last = this.frames.at(-1);
    if (last && !force && !changed && (engine.t-last.t<5)) return;
    if(last?.t===engine.t)this.frames.pop();
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
  motionSnapshot() { return structuredClone(this.motion); }
}
