import { EVENT_LABEL } from "./interactionLabels";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { GameReport } from "../shared/types";
import { getReplayFrame } from "../replay/trajectory";
import { DecisionLog } from "./DecisionLog";
import type { Engine } from "../sim/engine";
import { useRef } from "react";
import { MapCanvas } from "./MapCanvas";
import type { RenderOptions } from "./render";

export function TrajectoryReplay({ report, optionsRef }: { report: GameReport; optionsRef: MutableRefObject<RenderOptions> }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const duration = Math.max(0, report.elapsed);
  const frame = useMemo(() => getReplayFrame(report, time), [report, time]);
  const canPlay = duration > 0 && report.trail.length > 0;
  const previous = [...report.decisions].reverse().find((d) => d.t < frame.t - 1e-6);
  const next = report.decisions.find((d) => d.t > frame.t + 1e-6);

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

  const seek = (target: number) => {
    setPlaying(false);
    setTime(Math.max(0, Math.min(duration, target)));
  };

  return (
    <section className="card replay" aria-label="角色轨迹回放">
      <div className="row between">
        <h2>轨迹回放</h2>
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
      <div className="replay-context">
        {!!frame.events?.length && <details open><summary>截至此时的交互事件</summary>{frame.events.slice(-12).map(e => <p key={e.id}>{e.t.toFixed(1)}s {EVENT_LABEL[e.kind]} · {e.actorId ?? "环境"} → {e.targetId ?? "周围"}</p>)}</details>}
        <p className="muted">警戒变化 {frame.alerts?.length ?? 0} 条 · 物品转移 {frame.items?.length ?? 0} 条。地图中的乘客与设施为终局位置；角色轨迹和上述记录按回放时间展示。</p>
        <h3>当时的决策</h3>
        {frame.decision ? <DecisionLog decisions={[frame.decision]} /> : <p className="muted">此时还没有决策记录。</p>}
      </div>
    </section>
  );
}

export function TrajectoryReplayView({ report, engine }: { report: GameReport; engine: Engine }) {
  const engineRef = useRef<Engine | null>(engine);
  const optionsRef = useRef<RenderOptions>({ showVision: false, showTrail: true, thinking: false });
  engineRef.current = engine;
  return <><MapCanvas engineRef={engineRef} optionsRef={optionsRef} /><TrajectoryReplay report={report} optionsRef={optionsRef} /></>;
}
