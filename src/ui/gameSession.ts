import { generateWorld } from "../sim/worldDefinition";
import type { Agent, Classifier } from "../agent/agent";
import { GameRunner, type RunnerOptions } from "../agent/runner";
import { Engine } from "../sim/engine";
import { DT } from "../sim/scenario";
import { PresentationBuffer } from "./presentation";
import type { GameSettings } from "../shared/gameSettings";

/** Owns simulation time independently of whichever renderer is mounted. */
export class GameSession {
  engine: Engine;
  runner: GameRunner | null = null;
  readonly presentation: PresentationBuffer;
  paused = false;
  speed = 1;
  generation = 0;
  private accumulator = 0;
  private listeners = new Set<() => void>();

  constructor(seed = 1, settings: Partial<GameSettings> = {}, loadout?: import("../shared/interaction").Loadout, readonly generated=false) {
    this.engine = new Engine(seed, settings, undefined, loadout, this.generated ? generateWorld(seed) : undefined);
    this.presentation = new PresentationBuffer(this.engine);
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  notify = () => { for (const listener of this.listeners) listener(); };
  get frozen() { return this.paused || this.runner?.phase !== "running"; }
  get alpha() { return this.frozen ? 1 : Math.min(1, this.accumulator / DT); }
  get visualTime() { return this.presentation.time(this.alpha); }

  preview(seed: number, settings: Partial<GameSettings> = this.engine.settings, loadout = this.engine.loadout, definition?: import("../shared/world").WorldDefinition) {
    if (definition && (definition.seed !== seed || !this.generated)) throw new Error("准备地图与会话不一致");
    this.generation++;
    if (this.runner && this.runner.phase !== "ended") this.runner.stop();
    this.runner = null;
    this.engine = new Engine(seed, settings, undefined, loadout, this.generated ? definition ?? (this.engine.seed===seed?this.engine.world.definition:generateWorld(seed)) : undefined);
    this.accumulator = 0;
    this.paused = false;
    this.presentation.reset(this.engine);
    this.notify();
  }
  start(agent: Agent, classifier: Classifier, opts: RunnerOptions = {}) {
    const seed = this.engine.seed;
    this.preview(seed);
    this.startPrepared(agent, classifier, opts);
  }
  /** Start the frozen prepared engine without resetting the actor or map. */
  startPrepared(agent: Agent, classifier: Classifier, opts: RunnerOptions = {}) {
    if (this.runner || this.engine.t !== 0 || this.engine.status !== "running") throw new Error("本局已启动或需要重新准备");
    const generation = this.generation;
    const interaction = agent as Agent & Pick<RunnerOptions, "interpret" | "respond">;
    this.runner = new GameRunner(this.engine, agent, classifier, {
      interpret: interaction.interpret, respond: interaction.respond,
      ...opts,
      onChange: () => {
        if (generation !== this.generation) return;
        this.accumulator = 0;
        this.presentation.settle(this.engine);
        opts.onChange?.();
        this.notify();
      },
    });
    this.runner.start();
    this.notify();
  }
  setPaused(value: boolean) {
    this.paused = value;
    this.accumulator = 0;
    this.presentation.settle(this.engine);
    this.notify();
  }
  setSpeed(value: number) {
    if (value !== 1 && value !== 2 && value !== 4) return;
    this.speed = value;
    this.notify();
  }
  tick(realSeconds: number) {
    if (this.frozen || !this.runner) return;
    this.accumulator += Math.min(0.25, Math.max(0, realSeconds)) * this.speed;
    while (this.accumulator + 1e-9 >= DT && this.runner.phase === "running" && !this.paused) {
      // Subtract before advance: phase-change callbacks can zero the accumulator.
      this.accumulator = Math.max(0, this.accumulator - DT);
      const before = this.engine.t;
      this.runner.advance(1);
      if (this.engine.t !== before) this.presentation.capture(this.engine);
      else { this.accumulator = 0; break; }
    }
    if (this.frozen) this.accumulator = 0;
  }
  stop() {
    this.runner?.stop();
    this.paused = false;
    this.accumulator = 0;
    this.presentation.settle(this.engine);
    this.notify();
  }
}
