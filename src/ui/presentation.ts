import type { FacilityKind, FacilityStatus, PassengerKind } from "../shared/types";
import type { Engine } from "../sim/engine";
import { STAIRS_TOP, STAIRS_BOTTOM } from "../sim/layout";
import type { ReplayFrame } from "../replay/trajectory";
import { RULES } from "../sim/scenario";

export type Motion = "idle" | "walk" | "interact" | "jump";
export interface ActorFrame {
  readonly id: string;
  readonly kind: PassengerKind | "guard";
  readonly x: number;
  readonly elevation?: number;
  readonly z: number;
  readonly yaw: number;
  readonly motion: Motion;
  readonly jump: number;
  readonly face?: { readonly x: number; readonly z: number };
}
export interface FacilityFrame {
  readonly id: string;
  readonly kind: FacilityKind;
  readonly status: FacilityStatus;
  readonly queue: number;
  readonly serving: boolean;
}
export interface SceneSnapshot {
  readonly t: number;
  readonly actors: ReadonlyMap<string, ActorFrame>;
  readonly facilities: readonly FacilityFrame[];
  readonly path: readonly { readonly x: number; readonly z: number }[];
}
export interface ViewOptions {
  showVision: boolean;
  showTrail: boolean;
  thinking: boolean;
  replay?: ReplayFrame;
  trail?: readonly { readonly x: number; readonly y: number }[];
}

/** Copies primitives only: a renderer never receives mutable Person/Activity objects. */
export function captureScene(engine: Engine, previous?: SceneSnapshot): SceneSnapshot {
  const actors = new Map<string, ActorFrame>();
  for (const person of engine.world.persons.values()) {
    const a = person.activity;
    const old = previous?.actors.get(person.id);
    const dx = person.pos.x - (old?.x ?? person.pos.x);
    const dz = person.pos.y - (old?.z ?? person.pos.y);
    const moving = Math.hypot(dx, dz) > 0.00001;
    const next = a.kind === "walking" || a.kind === "to_queue" ? a.path[0] : undefined;
    const facility = a.kind === "queued" || a.kind === "service" ? engine.world.facility(a.facility)?.def : undefined;
    const face = facility ? Object.freeze({ x: facility.pos.x, z: facility.pos.y }) : undefined;
    let yaw = face ? Math.atan2(face.x - person.pos.x, face.z - person.pos.y) : moving ? Math.atan2(dx, dz) : old?.yaw ?? (next ? Math.atan2(next.x - person.pos.x, next.y - person.pos.y) : Math.PI / 2);
    // NPCs turn at a human pace; a blocked step must not snap them between opposite headings.
    if (!person.isPlayer && old) {
      const turn = Math.atan2(Math.sin(yaw - old.yaw), Math.cos(yaw - old.yaw));
      const limit = Math.max(0, engine.t - previous!.t) * 4;
      yaw = old.yaw + Math.max(-limit, Math.min(limit, turn));
    }
    const motion: Motion = a.kind === "creative" && a.mechanic === "jump_gate" ? "jump" : a.kind === "service" ? "interact" : moving ? "walk" : "idle";
    actors.set(person.id, Object.freeze({
      id: person.id, kind: person.kind, x: person.pos.x, z: person.pos.y, yaw, motion,
      elevation: platformElevation(person.pos.x),
      face,
      jump: a.kind === "creative" && a.mechanic === "jump_gate" ? Math.max(0, Math.min(1, 1 - a.remaining / RULES.jumpGateSeconds)) : 0,
    }));
  }
  for (const guard of engine.guards.guards) {
    const old = previous?.actors.get(guard.def.id);
    const moving = old && Math.hypot(old.x - guard.pos.x, old.z - guard.pos.y) > 0.00001;
    actors.set(guard.def.id, Object.freeze({ id: guard.def.id, kind: "guard", x: guard.pos.x, z: guard.pos.y, yaw: Math.PI / 2 - guard.facing, motion: moving ? "walk" : "idle", jump: 0 }));
  }
  return Object.freeze({
    t: engine.t,
    actors,
    path: Object.freeze((engine.player.activity.kind === "walking" || engine.player.activity.kind === "to_queue" ? engine.player.activity.path : []).map((point) => Object.freeze({ x: point.x, z: point.y }))),
    facilities: Object.freeze([...engine.world.facilities.values()].map((f) => Object.freeze({ id: f.def.id, kind: f.def.kind, status: f.status, queue: f.queue.length, serving: f.serving !== null }))),
  });
}

export class PresentationBuffer {
  previous: SceneSnapshot;
  current: SceneSnapshot;
  constructor(engine: Engine) {
    this.current = captureScene(engine);
    this.previous = this.current;
  }
  reset(engine: Engine) {
    this.current = captureScene(engine);
    this.previous = this.current;
  }
  capture(engine: Engine) {
    const next = captureScene(engine, this.current);
    if (next.t !== this.current.t) this.previous = this.current;
    this.current = next;
  }
  settle(engine: Engine) {
    this.current = captureScene(engine, this.current);
    this.previous = this.current;
  }
  time(alpha: number) { return this.previous.t + (this.current.t - this.previous.t) * alpha; }
}

/** Rendering height only; this never changes pathfinding or action results. */
export function platformElevation(x: number) {
  return -2 * Math.max(0, Math.min(1, (x - STAIRS_TOP.x) / (STAIRS_BOTTOM.x - STAIRS_TOP.x)));
}

export interface ActorPose { x: number; y: number; z: number; yaw: number; }
/** Reuses an output object; no allocation or React state update in the frame loop. */
export function sampleActor(buffer: PresentationBuffer, id: string, alpha: number, out: ActorPose): ActorFrame | undefined {
  const current = buffer.current.actors.get(id);
  if (!current) return undefined;
  const previous = buffer.previous.actors.get(id) ?? current;
  const a = Math.max(0, Math.min(1, alpha));
  out.x = previous.x + (current.x - previous.x) * a;
  out.z = previous.z + (current.z - previous.z) * a;
  out.yaw = previous.yaw + Math.atan2(Math.sin(current.yaw - previous.yaw), Math.cos(current.yaw - previous.yaw)) * a;
  if (current.face && id === "player") {
    const facing = Math.atan2(current.face.x - out.x, current.face.z - out.z);
    out.yaw = previous.yaw + Math.atan2(Math.sin(facing - previous.yaw), Math.cos(facing - previous.yaw)) * a;
  }
  const jump = current.motion === "jump" ? previous.jump + (current.jump - previous.jump) * a : 0;
  out.y = (previous.elevation ?? 0) + ((current.elevation ?? 0) - (previous.elevation ?? 0)) * a + Math.sin(jump * Math.PI) * 0.85;
  return current;
}
