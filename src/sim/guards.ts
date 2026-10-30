import type { Vec } from "../shared/types";
import { angleTo, dist, inViewCone, lineOfSight, moveToward } from "./geometry";
import { SIGHT_OCCLUDERS } from "./layout";
import { DT, GUARDS, RULES, type GuardDef } from "./scenario";

export interface Guard {
  def: GuardDef;
  pos: Vec;
  facing: number;
  /** Index of the route point the guard is heading to. */
  target: number;
  pauseLeft: number;
  /** Temporary attention (e.g. after hearing a complaint) overrides patrol facing. */
  lookAt: { point: Vec; remaining: number; resumeFacing: number } | null;
}

export class GuardSystem {
  readonly guards: Guard[];

  constructor(definitions: readonly GuardDef[] = GUARDS) {
    this.guards = definitions.map((def) => ({
      def,
      pos: { ...def.route[0] },
      facing: def.facing,
      target: def.route.length > 1 ? 1 : 0,
      pauseLeft: 0,
      lookAt: null,
    }));
  }

  step() {
    for (const g of this.guards) {
      if (g.lookAt) {
        g.facing = angleTo(g.pos, g.lookAt.point);
        g.lookAt.remaining -= DT;
        if (g.lookAt.remaining <= 1e-9) {
          // Restore the patrol heading even if an endpoint pause is still pending.
          g.facing = g.lookAt.resumeFacing;
          g.lookAt = null;
        }
        continue;
      }
      if (g.def.route.length < 2) {
        g.facing = g.def.facing;
        continue;
      }
      if (g.pauseLeft > 0) {
        g.pauseLeft = Math.max(0, g.pauseLeft - DT);
        continue;
      }
      const dest = g.def.route[g.target];
      g.facing = angleTo(g.pos, dest);
      g.pos = moveToward(g.pos, dest, g.def.speed * DT);
      if (dist(g.pos, dest) < 1e-6) {
        g.target = (g.target + 1) % g.def.route.length;
        g.pauseLeft = g.def.pauseSeconds;
      }
    }
  }

  canSee(g: Guard, p: Vec): boolean {
    return inViewCone(g.pos, g.facing, RULES.guardFovDeg, RULES.guardRange, p) && lineOfSight(g.pos, p, SIGHT_OCCLUDERS);
  }

  /** First guard who can currently see point p, if any. */
  seenBy(p: Vec): Guard | null {
    return this.guards.find((g) => this.canSee(g, p)) ?? null;
  }

  /** Guards within earshot turn to look at a noise for a few seconds. Returns who reacted. */
  attract(point: Vec): Guard[] {
    const reacted = this.guards.filter((g) => dist(g.pos, point) <= RULES.complaintRadius);
    for (const g of reacted) {
      g.lookAt = {
        point: { ...point }, remaining: RULES.attentionSeconds,
        resumeFacing: g.lookAt?.resumeFacing ?? g.facing,
      };
    }
    return reacted;
  }
}
