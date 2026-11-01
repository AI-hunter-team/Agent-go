import { useEffect, useState } from "react";
import type { LabRun } from "./controller";
import { REACTIONS, stepLabel } from "./feedback";

/** Schematic playback of captured positions and real executor phases, never a new simulation. */
export function LabStage({ run, active }: { run: LabRun; active: boolean }) {
  const start = run.frames[0]?.t ?? 0, end = run.frames.at(-1)?.t ?? start;
  const [playhead, setPlayhead] = useState(start), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const live = run.state === "running";
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    if (!live && active && end > start) { setPlayhead(start); setPlaying(true); }
  }, [run.state, run.id]);
  useEffect(() => {
    if (!playing || live) return;
    const begun = performance.now(), from = playhead;
    const timer = setInterval(() => {
      const next = Math.min(end, from + (performance.now() - begun) / 1000 * speed);
      setPlayhead(next);
      if (next >= end) setPlaying(false);
    }, 40);
    return () => clearInterval(timer);
  }, [playing, live, run.id, speed]);
  if (!run.frames.length) return null;
  const frame = live ? run.frames.at(-1)! : [...run.frames].reverse().find(f => f.t <= playhead + .001) ?? run.frames[0];
  const player = frame.actors.find(a => a.player)!;
  const actors = [player, ...frame.actors.filter(a => !a.player && Math.hypot(a.position.x - player.position.x, a.position.y - player.position.y) <= 9)].slice(0, 10);
  const minX = Math.min(...actors.map(a => a.position.x)) - 2, maxX = Math.max(...actors.map(a => a.position.x)) + 2;
  const minY = Math.min(...actors.map(a => a.position.y)) - 2, maxY = Math.max(...actors.map(a => a.position.y)) + 2;
  const width = Math.max(8, maxX - minX), height = Math.max(6, maxY - minY), scale = Math.min(580 / width, 160 / height);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const point = (p: { x: number; y: number }) => ({ x: 310 + (p.x - center.x) * scale, y: 100 + (p.y - center.y) * scale });
  const source = point(player.position), target = frame.action?.target ? point(frame.action.target) : null;
  const latest = [...run.steps].reverse().find(s => s.t <= frame.t + .001 && s.phase !== "skipped");
  const state = frame.action ? `${stepLabel(frame.action.step)} · ${frame.action.phase === "perform" ? `执行中 ${Math.round(frame.action.progress * 100)}%` : frame.action.phase === "dialogue" ? "等待回复" : "正在接近"}` : latest ? `${stepLabel(latest.step)} · ${latest.phase === "completed" ? latest.step.op === "talk" ? "交谈已结束，具体答复见台词记录" : latest.text : latest.phase === "interrupted" ? `中断：${latest.text}` : "已暂停"}` : "等待行动";
  return <section className="lab-stage" aria-label={`测试${run.id}现场动作回放`}>
    <div className="row"><strong>{live ? "实时现场" : playing ? "正在回放实际过程" : "现场动作回放"}</strong><span>{frame.t.toFixed(1)} 秒</span></div>
    <svg viewBox="0 0 620 210" role="img" aria-label={state}>
      <rect width="620" height="210" rx="10" fill="#eef4f0" />
      <path d="M0 52H620M0 105H620M0 158H620M103 0V210M206 0V210M310 0V210M414 0V210M517 0V210" stroke="#e0e9e3" />
      {frame.action?.op === "strike" && <circle cx={source.x} cy={source.y} r={1.6 * scale} fill="none" stroke="#c28a76" strokeDasharray="4 4" />}
      {actors.map(actor => {
        const p = point(actor.position), past = run.frames.filter(f => f.t >= frame.t - 1.5 && f.t <= frame.t).flatMap(f => f.actors.filter(a => a.id === actor.id).map(a => point(a.position)));
        const color = actor.player ? "#246956" : actor.incapacitated ? "#839089" : actor.alert === "red" ? "#b7614a" : actor.alert === "yellow" ? "#ba923b" : "#748e7d";
        return <g key={actor.id}>
          {past.length > 1 && <polyline points={past.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeOpacity=".3" strokeWidth="3" />}
          <circle cx={p.x} cy={p.y} r="14" fill={color} opacity={actor.incapacitated ? .55 : 1} />
          <path d={actor.incapacitated ? `M${p.x - 8} ${p.y}h16` : `M${p.x} ${p.y - 8}v16M${p.x - 7} ${p.y}h14`} stroke="white" strokeWidth="2" />
          <text x={p.x} y={p.y - 23} textAnchor="middle" fontSize="12" fill="#2d4f3c">{actor.player ? "你" : actor.id}</text>
          {!actor.player && <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize="11" fill="#526b59">{actor.incapacitated ? "失能" : REACTIONS[actor.reaction ?? ""] ?? (actor.activity === "walking" ? "行走" : actor.activity === "queued" ? "排队" : "")}</text>}
        </g>;
      })}
      {target && frame.action?.phase === "perform" && ["strike", "snatch", "push"].includes(frame.action.op) && <g>
        <line x1={source.x} y1={source.y} x2={source.x + (target.x - source.x) * (.3 + .6 * Math.sin(Math.PI * frame.action.progress))} y2={source.y + (target.y - source.y) * (.3 + .6 * Math.sin(Math.PI * frame.action.progress))} stroke="#b4583e" strokeWidth="6" strokeLinecap="round" />
        <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 16} textAnchor="middle" fontSize="11" fill="#a34f37">{frame.action.op === "strike" ? "挥击中" : frame.action.op === "snatch" ? "抢夺中" : "推搡中"}</text>
      </g>}
    </svg>
    <p className="stage-state" aria-live="off">{state}</p>
    {!live && end > start && <div className="replay-controls"><button type="button" aria-label={`播放或暂停测试${run.id}回放`} onClick={() => { if (playhead >= end) setPlayhead(start); setPlaying(p => !p); }}>{playing ? "暂停回放" : "播放过程"}</button><input aria-label={`测试${run.id}回放进度`} type="range" min={start} max={end} step="0.1" value={Math.min(end, playhead)} onChange={e => { setPlaying(false); setPlayhead(Number(e.target.value)); }} /><select aria-label={`测试${run.id}回放速度`} value={speed} onChange={e => { setPlaying(false); setSpeed(Number(e.target.value)); }}><option value="1">1倍</option><option value="2">2倍</option><option value="4">4倍</option></select></div>}
    <small>位置、退避和动作阶段取自实际记录；挥击中不代表已经命中。回放不会重新调用模型。</small>
  </section>;
}
