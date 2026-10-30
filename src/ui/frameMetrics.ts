export class FrameMetrics {
  active = false;
  private samples: number[] = [];
  elapsed = 0;
  environment: Record<string, string | number> = {};
  private measuredEnvironment: Record<string, string | number> | null = null;
  start() { this.samples = []; this.elapsed = 0; this.measuredEnvironment = { ...this.environment }; this.active = true; }
  push(seconds: number) {
    if (!this.active || seconds <= 0) return;
    if (this.samples.length === 0) this.measuredEnvironment = { ...this.environment, actorsStart: this.environment.actors ?? 0 };
    const measured = this.measuredEnvironment!;
    const actors = Number(this.environment.actors ?? 0);
    measured.maxActors = Math.max(Number(measured.maxActors ?? 0), actors);
    measured.actors = actors;
    for (const key of ["width", "height", "dpr", "quality", "gpu"]) {
      if (measured[key] !== this.environment[key]) measured.environmentChanged = "采样期间画面环境发生变化，请重新采样";
    }
    this.samples.push(seconds * 1000);
    this.elapsed += seconds;
    if (this.elapsed >= 60) this.active = false;
  }
  summary() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    return { ...(this.measuredEnvironment ?? this.environment), active: this.active, seconds: +this.elapsed.toFixed(2), frames: sorted.length,
      fps: this.elapsed ? +(sorted.length / this.elapsed).toFixed(2) : 0,
      p95Ms: sorted.length ? +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2) : 0 };
  }
}
