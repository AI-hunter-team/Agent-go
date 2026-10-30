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

  constructor(seed = 1, settings: Partial<GameSettings> = {}) {
    this.engine = new Engine(seed, settings);
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

  preview(seed: number, settings: Partial<GameSettings> = this.engine.settings) {
    this.generation++;
    if (this.runner && this.runner.phase !== "ended") this.runner.stop();
    this.runner = null;
    this.engine = new Engine(seed, settings);
    this.accumulator = 0;
    this.paused = false;
    this.presentation.reset(this.engine);
    this.notify();
  }
  start(agent: Agent, classifier: Classifier, opts: RunnerOptions = {}) {
    const seed = this.engine.seed;
    this.preview(seed);
    const generation = this.generation;
    this.runner = new GameRunner(this.engine, agent, classifier, {
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
