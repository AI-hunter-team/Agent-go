/** 汇总主动采样的帧间隔及环境快照，不参与模拟或计分。 */
export class FrameMetrics {
  active = false;
  private samples: number[] = [];
  elapsed = 0;
  environment: Record<string, string | number> = {};
  private measuredEnvironment: Record<string, string | number> | null = null;
  /** 清空旧采样并冻结新一轮的初始环境。 */
  start() { this.samples = []; this.elapsed = 0; this.measuredEnvironment = { ...this.environment }; this.active = true; }
  /** 累计实际渲染间隔，在六十秒时自动结束并标记中途的设置变化。 */
  push(seconds: number) {
    if (!this.active || seconds <= 0) return;
    if (this.samples.length === 0) this.measuredEnvironment = { ...this.environment, actorsStart: this.environment.actors ?? 0 };
    const measured = this.measuredEnvironment!;
    const actors = Number(this.environment.actors ?? 0);
    measured.maxActors = Math.max(Number(measured.maxActors ?? 0), actors);
    measured.actors = actors;
    for (const key of ["width", "height", "dpr", "quality", "gpu", "targetFps", "simpleCrowd"]) {
      if (measured[key] !== this.environment[key]) measured.environmentChanged = "采样期间画面环境发生变化，请重新采样";
    }
    this.samples.push(seconds * 1000);
    this.elapsed += seconds;
    if (this.elapsed >= 60) this.active = false;
  }
  /** 返回可导出的 FPS/P95；限帧值表示绘制频率，不代表 GPU 单帧耗时。 */
  summary() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    return { ...(this.measuredEnvironment ?? this.environment), active: this.active, seconds: +this.elapsed.toFixed(2), frames: sorted.length,
      fps: this.elapsed ? +(sorted.length / this.elapsed).toFixed(2) : 0,
      p95Ms: sorted.length ? +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2) : 0 };
  }
}
