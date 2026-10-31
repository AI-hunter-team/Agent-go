import type { DecisionRecord, GameReport, Vec, TrailPoint } from "../shared/types";

export type ReplayPosition=Vec & Partial<Pick<TrailPoint,"connector"|"connectorId"|"entranceId"|"progress">>;

export interface ReplayFrame {
  t: number;
  position: ReplayPosition | null;
  trail: ReplayPosition[];
  decision: DecisionRecord | null;
  events?: GameReport["worldEvents"];
  alerts?: GameReport["alerts"];
  items?: GameReport["items"];
}

export function getReplayFrame(report: Pick<GameReport, "elapsed" | "trail" | "decisions" | "worldEvents" | "alerts" | "items">, time: number): ReplayFrame {
  const t = Math.min(Math.max(0, report.elapsed), Math.max(0, Number.isFinite(time) ? time : 0));
  const samples = report.trail.map((point, index) => ({ ...point, t: point.t ?? index * 0.5 }));
  let position: ReplayPosition | null = null;
  const trail: ReplayPosition[] = [];
  if (samples.length) {
    let index = 0;
    while (index + 1 < samples.length && samples[index + 1].t <= t) index++;
    const before = samples[index];
    const after = samples[index + 1] ?? before;
    const fraction = after.t > before.t ? Math.max(0, Math.min(1, (t - before.t) / (after.t - before.t))) : 0;
    const context=before.connector?before:after.connector&&before.floorId!==after.floorId?after:before;
    const hasElevation=before.elevation!==undefined||after.elevation!==undefined;
    const beforeElevation=before.elevation??(before.floorId==="platform"?-6:0),afterElevation=after.elevation??(after.floorId==="platform"?-6:beforeElevation);
    const start=context===after?0:before.progress??0,end=after.connector===context.connector?after.progress??1:1;
    position = { ...(context.connector?{connector:context.connector}:{}),...(context.connectorId?{connectorId:context.connectorId}:{}),...(context.entranceId?{entranceId:context.entranceId}:{}),...(context.progress!==undefined?{progress:start+(end-start)*fraction}:{}),...(context.floorId?{floorId:context.floorId}:{}),...(hasElevation?{elevation:beforeElevation+(afterElevation-beforeElevation)*fraction}:{}),x:before.x+(after.x-before.x)*fraction,y:before.y+(after.y-before.y)*fraction };
    trail.push(...samples.slice(0,index+1).map(({t:_t,...point})=>point));
    const last = trail.at(-1);
    if (!last || last.x !== position.x || last.y !== position.y) trail.push(position);
  }
  let decision: DecisionRecord | null = null;
  for (const record of report.decisions) if (record.t <= t) decision = record;
  return { t, position, trail, decision, ...(report.worldEvents ? {events: report.worldEvents.filter(e => e.t <= t)} : {}), ...(report.alerts ? {alerts: report.alerts.filter(e => e.t <= t)} : {}), ...(report.items ? {items: report.items.filter(e => e.t <= t)} : {}) };
}
