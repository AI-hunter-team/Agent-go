import * as legacyLayout from "./layout";
import type { StationLayout } from "../shared/world";
import type { Percept, Vec } from "../shared/types";
import type { AlertSystem } from "./alert";
import type { EventBus } from "./events";
import { createNavigation } from "./nav";
import { angleTo, dist, inViewCone, lineOfSight } from "./geometry";

import { DT, GUARDS, RULES, type GuardDef } from "./scenario";
import { createMovement, personRadius, type MovingBody } from "./movement";

export interface Guard {
  role: "guard" | "security_staff";
  mode: "patrol" | "investigate" | "watch" | "return";
  incapacitated: number;
  wakeAt: number;
  investigation: { point: Vec; priority: number; remaining: number; arrived: boolean } | null;
  watching: { subjectId: string; lastKnown: Vec } | null;
  path: Vec[];
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
  private spatial;
  private navigation;
  private clock = 0;
  lightAt: (pos: Vec) => number = () => 1;

  constructor(definitions: readonly GuardDef[] = GUARDS, private layout:StationLayout=legacyLayout) {
    this.spatial=createMovement(layout);this.navigation=createNavigation(layout,this.spatial);
    this.guards = definitions.map((def) => ({
      role: def.role ?? "guard", mode: "patrol", incapacitated: 0, wakeAt: 0, investigation: null, watching: null, path: [],
      def,
      pos: { ...def.route[0] },
      facing: def.facing,
      target: def.route.length > 1 ? 1 : 0,
      pauseLeft: 0,
      lookAt: null,
    }));
  }

  step(people: readonly MovingBody[] = [], subject: (id: string) => { pos: Vec } | undefined = () => undefined, now = this.clock + DT) {
    this.clock = now;
    for (const g of this.guards) {
      if (g.incapacitated > 0) {
        g.incapacitated = Math.max(0, g.wakeAt - now);
        if (g.incapacitated > 1e-9) continue;
        g.incapacitated = 0;
        this.investigate(g, g.pos, 1);
      }
      if (g.mode === "watch" && g.watching) {
        const target = subject(g.watching.subjectId);
        if (target && this.canSee(g, target.pos)) g.watching.lastKnown = { ...target.pos };
        g.facing = angleTo(g.pos, g.watching.lastKnown);
        if (dist(g.pos, g.watching.lastKnown) > 3) this.walk(g, g.watching.lastKnown, people);
        continue;
      }
      if (g.mode === "investigate" && g.investigation) {
        const info = g.investigation;
        if (!info.arrived) {
          info.arrived = this.walk(g, info.point, people) || !g.path.length;
        } else {
          g.facing += DT * Math.PI / 2;
          info.remaining -= DT;
          if (info.remaining <= 1e-9) this.returnToPatrol(g);
        }
        continue;
      }
      if (g.mode === "return") {
        if (this.walk(g, g.def.route[g.target], people)) { g.mode = "patrol"; g.path = []; }
        continue;
      }
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
      g.pos = this.spatial.steer(g.pos, dest, g.def.speed * DT, personRadius("guard"), people, false);
      if (dist(g.pos, dest) < 1e-6) {
        g.target = (g.target + 1) % g.def.route.length;
        g.pauseLeft = g.def.pauseSeconds;
      }
    }
  }

  canSee(g: Guard, p: Vec): boolean {
    const { range, fov } = this.vision(g);
    return g.incapacitated <= 0 && inViewCone(g.pos, g.facing, fov, range * Math.min(this.lightAt(g.pos), this.lightAt(p)), p) && lineOfSight(g.pos, p, this.layout.SIGHT_OCCLUDERS);
  }

  /** Staff scan locally while idle, then regain a patrol guard's cone after a cue. */
  vision(g: Guard): { range: number; fov: number } {
    const attentive = g.mode === "investigate" || g.mode === "watch" || Boolean(g.lookAt);
    return {
      range: attentive ? RULES.guardRange : g.def.sightRange ?? RULES.guardRange,
      fov: attentive ? RULES.guardFovDeg : g.def.sightFovDeg ?? RULES.guardFovDeg,
    };
  }

  investigate(g: Guard, point: Vec, priority: number) {
    if (g.incapacitated > 0 || (g.investigation && g.investigation.priority > priority) || (g.mode === "watch" && priority < 3)) return;
    g.mode = "investigate"; g.watching = null; g.lookAt = null;
    g.investigation = { point: { ...point }, priority, remaining: 4, arrived: dist(g.pos, point) < 0.3 };
    g.path = this.navigation.findPath(g.pos, point, personRadius("guard")) ?? [];
  }
  watch(g: Guard, subjectId: string, point: Vec) {
    if (g.incapacitated > 0) return;
    g.mode = "watch"; g.investigation = null; g.lookAt = null;
    g.watching = { subjectId, lastKnown: { ...point } }; g.path = [];
  }
  knockOut(id: string, seconds: number, now = this.clock) {
    const g = this.guards.find((entry) => entry.def.id === id);
    if (!g) return;
    g.incapacitated = seconds; g.wakeAt = now + seconds; g.lookAt = null; g.investigation = null; g.watching = null; g.mode = "patrol"; g.path = [];
  }
  respond(percepts: readonly Percept[], alerts: AlertSystem, bus: EventBus) {
    for (const percept of percepts) {
      const g = this.guards.find((entry) => entry.def.id === percept.observerId);
      if (!g || g.incapacitated > 0) continue;
      const event = bus.get(percept.eventId)!;
      if (percept.channel === "report") this.investigate(g, event.aboutPos ?? event.pos, 3);
      else if (percept.attributedTo && alerts.get(g.def.id, percept.attributedTo)) this.watch(g, percept.attributedTo, percept.pos);
      else if (!percept.attributedTo) this.investigate(g, percept.pos, percept.channel === "hearing" ? 1 : 2);
    }
    for (const g of this.guards) {
      if (g.watching && !alerts.get(g.def.id, g.watching.subjectId)) this.returnToPatrol(g);
    }
  }
  private returnToPatrol(g: Guard) {
    g.mode = "return"; g.investigation = null; g.watching = null;
    g.path = this.navigation.findPath(g.pos, g.def.route[g.target], personRadius("guard")) ?? [];
  }
  private walk(g: Guard, point: Vec, people: readonly MovingBody[]): boolean {
    if (dist(g.pos, point) < 0.2) return true;
    if (!g.path.length || dist(g.path.at(-1)!, point) > 0.5) g.path = this.navigation.findPath(g.pos, point, personRadius("guard")) ?? [];
    const next = g.path[0];
    if (!next) return false;
    g.facing = angleTo(g.pos, next);
    g.pos = this.spatial.steer(g.pos, next, g.def.speed * DT, personRadius("guard"), people);
    if (dist(g.pos, next) < 1e-6) g.path.shift();
    return dist(g.pos, point) < 0.2;
  }

  /** First guard who can currently see point p, if any. */
  seenBy(p: Vec): Guard | null {
    return this.guards.find((g) => this.canSee(g, p)) ?? null;
  }

  /** Guards within earshot turn to look at a noise for a few seconds. Returns who reacted. */
  attract(point: Vec): Guard[] {
    const reacted = this.guards.filter((g) => g.incapacitated <= 0 && dist(g.pos, point) <= RULES.complaintRadius);
    for (const g of reacted) {
      g.lookAt = {
        point: { ...point }, remaining: RULES.attentionSeconds,
        resumeFacing: g.lookAt?.resumeFacing ?? g.facing,
      };
    }
    return reacted;
  }
}
