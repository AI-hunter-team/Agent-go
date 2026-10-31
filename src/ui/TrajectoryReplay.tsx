import { StationMapWidget } from "./MiniMap";
import { stationAtlas, replayMapFrame } from "./stationMap";
import { legacyWorld } from "../sim/worldDefinition";
import { Engine as ReplayEngine } from "../sim/engine";
import { hydrateWorld } from "../sim/worldDefinition";
import { EVENT_LABEL } from "./interactionLabels";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { GameReport } from "../shared/types";
import { getReplayFrame } from "../replay/trajectory";
import { DecisionLog } from "./DecisionLog";
import type { Engine } from "../sim/engine";
import { useRef } from "react";
import { MapCanvas } from "./MapCanvas";
import type { RenderOptions } from "./render";

/** 控制历史轨迹的播放、倍速及决策跳转，不推进实时世界。 */
export function TrajectoryReplay({ report, optionsRef, seekRequest, onInspectDecision }: { report: GameReport; optionsRef: MutableRefObject<RenderOptions>; seekRequest?: { t: number; key: number }; onInspectDecision?: (index: number) => void }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const duration = Math.max(0, report.elapsed);
  const frame = useMemo(() => getReplayFrame(report, time), [report, time]);
  const atlas=useMemo(()=>stationAtlas(report.world?hydrateWorld(report.world):legacyWorld(report.seed)),[report.world,report.seed]);
  const mapFrame=useMemo(()=>replayMapFrame(atlas,frame),[atlas,frame]);
  const canPlay = duration > 0 && report.trail.length > 0;
  const previous = [...report.decisions].reverse().find((d) => d.t < frame.t - 1e-6);
  const next = report.decisions.find((d) => d.t > frame.t + 1e-6);

  useEffect(() => {
    if (seekRequest) {
      setPlaying(false);
      setTime(Math.max(0, Math.min(duration, seekRequest.t)));
    }
  }, [seekRequest, duration]);

  // App mounts a fresh controller for each ended run. Late request records may
  // refresh this run's report, and must not reset the user's replay position.

  useEffect(() => {
    optionsRef.current.replay = frame;
  }, [frame, optionsRef]);

  useEffect(() => () => { delete optionsRef.current.replay; }, [optionsRef]);

  useEffect(() => {
    if (!playing || !canPlay) return;
    let raf = 0;
    let last: number | null = null;
    // 按真实帧间隔推进回放时钟，长帧限制为 0.25 秒。
    const tick = (now: number) => {
      if (last !== null) {
        const delta = Math.min(0.25, Math.max(0, (now - last) / 1000));
        setTime((current) => Math.min(duration, current + delta * speed));
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration, canPlay]);

  useEffect(() => {
    if (time >= duration) setPlaying(false);
  }, [time, duration]);

  // 跳转时暂停播放，并将目标约束在本局时长内。
  const seek = (target: number) => {
    setPlaying(false);
    setTime(Math.max(0, Math.min(duration, target)));
  };

  return (
    <section className="card replay" aria-label="角色轨迹回放">
      <div className="row between">
        <h3>播放进度</h3>
        <output className="replay-clock" aria-label="回放时间">{frame.t.toFixed(1)}s <span>/ {duration.toFixed(1)}s</span></output>
      </div>
      <p className="muted replay-note">
        {report.trail.length === 0 ? "本局没有可回放的轨迹。" : duration === 0 ? "本局尚未推进，可查看角色起点。" : "回看角色位置、已走路线和当时的决策。"}
      </p>
      <input
        className="replay-progress"
        type="range"
        aria-label="回放进度"
        min={0}
        max={duration}
        step={0.1}
        value={frame.t}
        aria-valuetext={`${frame.t.toFixed(1)} 秒，共 ${duration.toFixed(1)} 秒`}
        disabled={!canPlay}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <div className="row replay-controls">
        <button className="primary" disabled={!canPlay} onClick={() => {
          if (!playing && time >= duration) setTime(0);
          setPlaying((value) => !value);
        }}>{playing ? "暂停回放" : "播放回放"}</button>
        <button onClick={() => seek(0)} disabled={frame.t === 0}>回到起点</button>
        <div className="segmented" role="group" aria-label="回放速度">
          {[1, 2, 4].map((value) => <button key={value} aria-pressed={speed === value} className={speed === value ? "on" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}
        </div>
        <div className="row replay-jump">
          <button disabled={!previous} onClick={() => previous && seek(previous.t)}>上一决策</button>
          <button disabled={!next} onClick={() => next && seek(next.t)}>下一决策</button>
        </div>
      </div>
      {frame.position&&<div style={{maxWidth:320,marginBlock:16}}><StationMapWidget atlas={atlas} frame={mapFrame} replay/></div>}
      <div className="replay-context">
        {!!frame.events?.length && <details open><summary>截至此时的交互事件</summary>{frame.events.slice(-12).map(e => <p key={e.id}>{e.t.toFixed(1)}s {EVENT_LABEL[e.kind]} · {e.actorId ?? "环境"} → {e.targetId ?? "周围"}</p>)}</details>}
        <p className="muted">警戒变化 {frame.alerts?.length ?? 0} 条 · 物品转移 {frame.items?.length ?? 0} 条。地图中的乘客与设施为终局位置；角色轨迹和上述记录按回放时间展示。</p>
        <h3>当时的决策</h3>
        {frame.decision ? onInspectDecision ? <div className="replay-decision"><p>{frame.decision.action?.reason ?? frame.decision.error ?? "未形成有效行动"}</p><p className="muted">{frame.decision.result?.text ?? "未执行"}</p><button onClick={() => onInspectDecision(frame.decision!.index)}>分析这次决策 →</button></div> : <DecisionLog decisions={[frame.decision]} /> : <p className="muted">此时还没有决策记录。</p>}
      </div>
    </section>
  );
}

/** 组合历史地图与回放控制器，共享只读回放帧。 */
export function TrajectoryReplayView({ report, engine, seekRequest, onInspectDecision }: { report: GameReport; engine: Engine; seekRequest?: { t: number; key: number }; onInspectDecision?: (index: number) => void }) {
  const engineRef = useRef<Engine | null>(engine);
  const optionsRef = useRef<RenderOptions>({ showVision: false, showTrail: true, thinking: false });
  const resolved=useMemo(()=>{
    const recordedHash=report.world?.layoutHash??"legacy-v0";
    return engine.world.definition.layoutHash===recordedHash?engine:new ReplayEngine(report.seed,report.settings,{seed:report.seed,spawns:[],events:[],initialStatus:{}},report.loadout,report.world?hydrateWorld(report.world):undefined);
  },[report.world,report.seed,report.settings,report.loadout,engine]);
  engineRef.current = resolved;
  return <><MapCanvas engineRef={engineRef} optionsRef={optionsRef} /><TrajectoryReplay report={report} optionsRef={optionsRef} seekRequest={seekRequest} onInspectDecision={onInspectDecision} /></>;
}
