import type { DecisionRecord, GameReport, Vec } from "../shared/types";

export interface ReplayFrame {
  t: number;
  position: Vec | null;
  trail: Vec[];
  decision: DecisionRecord | null;
}

export function getReplayFrame(report: Pick<GameReport, "elapsed" | "trail" | "decisions">, time: number): ReplayFrame {
  const t = Math.min(Math.max(0, report.elapsed), Math.max(0, Number.isFinite(time) ? time : 0));
  const samples = report.trail.map((point, index) => ({ ...point, t: point.t ?? index * 0.5 }));
  let position: Vec | null = null;
  const trail: Vec[] = [];
  if (samples.length) {
    let index = 0;
    while (index + 1 < samples.length && samples[index + 1].t <= t) index++;
    const before = samples[index];
    const after = samples[index + 1] ?? before;
    const fraction = after.t > before.t ? Math.max(0, Math.min(1, (t - before.t) / (after.t - before.t))) : 0;
    position = { x: before.x + (after.x - before.x) * fraction, y: before.y + (after.y - before.y) * fraction };
    trail.push(...samples.slice(0, index + 1).map(({ x, y }) => ({ x, y })));
    const last = trail.at(-1);
    if (!last || last.x !== position.x || last.y !== position.y) trail.push(position);
  }
  let decision: DecisionRecord | null = null;
  for (const record of report.decisions) if (record.t <= t) decision = record;
  return { t, position, trail, decision };
}
