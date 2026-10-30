import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HeuristicAgent } from "../agent/heuristicAgent";
import { Api, RemoteAgent, offlineClassifier } from "../agent/remoteAgent";
import type { OperationDebug } from "../shared/debug";
import { ModelConfigPanel } from "./ModelConfigPanel";
import type { NormalizedGuidance } from "../shared/types";
import { describeActivity } from "../sim/observation";
import { DECISION_LIMITS, RULES } from "../sim/scenario";
import { GuidanceCard, SetupPanel, type AgentChoice } from "./ControlPanel";
import { DecisionTrace } from "./DecisionTrace";
import { NpcDialogue } from "./NpcDialogue";
import { JourneyProgress } from "./JourneyProgress";
import { TrajectoryReplayView } from "./TrajectoryReplay";
import { DecisionLog } from "./DecisionLog";
import { EventTimeline, ReportSummary } from "./ReportView";
import { MapCanvas } from "./MapCanvas";
import { describeAction } from "./format";
import { FrameMetrics } from "./frameMetrics";
import { Hint, Modal, TooltipProvider } from "./overlays";
import type { ViewOptions } from "./presentation";
import { useGameSession } from "./useGameSession";
import styles from "./App.module.css";

const GameScene = lazy(() => import("./scene/GameScene"));
type Stage = "setup" | "confirm" | "playing";
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? this.props.fallback : this.props.children; }
}
function Brand() {
  return <div className={styles.brand}><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 6h26v22l-6 6H13l-6-6V6Zm6 6v11h14V12H13Zm1 16h1m10 0h1M10 37l5-5m15 5-5-5" /></svg><div>AI 猎人<span>METRO · 交通剧场</span></div></div>;
}
function downloadMetrics(metrics: FrameMetrics) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(metrics.summary(), null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "transit-performance.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const session = useGameSession();
  const [health, setHealth] = useState<{ llm: boolean; model: string | null }>({ llm: false, model: null });
  const [agentKind, setAgentKind] = useState<AgentChoice>("offline");
  const [showModelConfig, setShowModelConfig] = useState(false);
  const preparationRef = useRef<{ runId: string; durationMs: number; server: OperationDebug | null } | null>(null);
  const [seed, setSeed] = useState(1);
  const [guidance, setGuidance] = useState("");
  const [normalized, setNormalized] = useState<NormalizedGuidance | null>(null);
  const [intent, setIntent] = useState<Stage>("setup");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ mode: "follow" | "overview"; reset: number }>({ mode: "follow", reset: 0 });
  const [quality, setQuality] = useState<"standard" | "low">("standard");
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [renderer, setRenderer] = useState<"3d" | "2d">("3d");
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [sceneFailure, setSceneFailure] = useState<string | null>(null);
  const [showVision, setShowVision] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const [assetInput, setAssetInput] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [assetError, setAssetError] = useState("");
  const [metrics] = useState(() => new FrameMetrics());
  const [debug] = useState(() => new URLSearchParams(window.location.search).get("debug") === "1");
  const requests = useRef(0);
  const engineRef = useRef(session.engine);
  const optionsRef = useRef<ViewOptions>({ showVision: false, showTrail: false, thinking: false });
  engineRef.current = session.engine;
  optionsRef.current = { showVision, showTrail, thinking: session.runner?.phase === "thinking", trail: session.engine.trail };
  const onAssetError = useCallback((message: string) => setAssetError(message), []);
  const onSceneFailure = useCallback((message: string) => setSceneFailure(message), []);
  const runner = session.runner;
  const ended = intent === "playing" && runner?.phase === "ended";
  const playing = intent === "playing" && !ended;
  const stageLabel = ended ? "行程结束" : playing ? "观战中" : intent === "confirm" ? "确认出发" : "出发之前";
  const player = session.engine.player;
  const latest = runner?.decisions.at(-1);
  const recent = session.engine.world.events.filter((event) => event.playerVisible && event.t <= session.engine.t).slice(-3).reverse();
  const broadcast = recent.find((event) => event.kind === "broadcast");

  useEffect(() => {
    let active = true;
    Api.health().then((value) => { if (active) setHealth(value); }).catch(() => undefined);
    return () => { active = false; requests.current++; };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  const prepare = async () => {
    if (busy) return;
    const request = ++requests.current;
    setError(null); setBusy("正在整理指导…");
    const runId = crypto.randomUUID();
    preparationRef.current = null;
    try {
      const started = performance.now();
      const result = agentKind === "llm" && guidance.trim() ? await Api.normalize(guidance, runId) : null;
      if (request !== requests.current) return;
      if (result) preparationRef.current = { runId, durationMs: performance.now() - started, server: result.debug ?? null };
      setNormalized(result?.guidance ?? null); setIntent("confirm");
    } catch (failure) { if (request === requests.current) setError(`整理指导失败：${(failure as Error).message}`); }
    finally { if (request === requests.current) setBusy(null); }
  };
  const start = async () => {
    if (busy) return;
    const request = ++requests.current;
    setError(null); setBusy("正在开局…");
    const preparation = preparationRef.current;
    const runId = preparation?.runId ?? crypto.randomUUID();
    try {
      const agent = agentKind === "llm" ? await RemoteAgent.create(guidance, normalized, runId) : new HeuristicAgent();
      if (request !== requests.current) { await agent.dispose(); return; }
      session.start(agent, agent instanceof RemoteAgent ? agent.classify : offlineClassifier, {
        runId,
        negotiate: agent instanceof RemoteAgent ? agent.negotiate : undefined,
        preparation: agentKind === "llm" && preparation ? { durationMs: preparation.durationMs, server: preparation.server } : undefined,
        guidance: agentKind === "llm" ? guidance : "",
        normalizedGuidance: agentKind === "llm" ? normalized : null,
      });
      preparationRef.current = null;
      setIntent("playing"); setCamera((value) => ({ mode: "follow", reset: value.reset + 1 }));
    } catch (failure) { if (request === requests.current) setError(`开局失败：${(failure as Error).message}`); }
    finally { if (request === requests.current) setBusy(null); }
  };
  const edit = () => { requests.current++; preparationRef.current = null; setIntent("setup"); setError(null); session.preview(seed); };
  const retryScene = () => { setSceneFailure(null); setSceneAttempt((value) => value + 1); };
  const applyAsset = (path: string) => {
    if (path && (!path.startsWith("/models/") || path.includes("..") || !/\.(gltf|glb)$/i.test(path))) { setAssetError("请输入 /models/ 下的 .glb 或 .gltf 文件路径。"); return; }
    setAssetError(""); setAssetInput(path); setAssetUrl(path ? `${path}?v=${Date.now()}` : "");
  };
  const fallback = <div className={styles.sceneError} role="alert"><span className={styles.eyebrow}>画面暂不可用</span><h2>三维画面需要重新连接</h2><p>{sceneFailure ?? "浏览器无法建立三维画面。对局与报告仍然保留。"}</p><div className="row"><button onClick={retryScene}>重试三维</button><button onClick={() => setRenderer("2d")}>进入二维调试</button></div></div>;

  return <TooltipProvider delayDuration={250}><div className={styles.app} data-reduced-motion={reducedMotion}>
    <header className={styles.header}>
      <Brand />
      <div className={styles.headerCenter}><i className={playing && !session.frozen ? styles.live : styles.dot} />{stageLabel}<span className={styles.slash}>/</span><span>METRO · 01</span></div>
      <Modal title="显示设置" description="调整观战画面，不会改变角色的行动或世界规则。" trigger={<button className={styles.settingsButton}>显示设置 <span aria-hidden="true">↗</span></button>}>
        <label className="field"><span>画面质量</span><select aria-label="画面质量" value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}><option value="standard">标准 · 动态阴影</option><option value="low">低画质 · 关闭阴影</option></select></label>
        <label className="check"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> 减少镜头缓动与角色装饰动效</label>
        <p className="small muted">拖动画面环绕角色，滚轮调整距离。点击“回正”恢复跟随镜头。</p>
      </Modal>
    </header>
    <main className={styles.layout}>
      <section className={styles.viewport} aria-label={renderer === "3d" ? "三维地铁站场景" : "二维调试地图"}>
        <div className={styles.scene}>
          {renderer === "2d" ? <MapCanvas engineRef={engineRef} optionsRef={optionsRef} /> : sceneFailure ? fallback : <SceneBoundary key={sceneAttempt} fallback={fallback}>
            <Suspense fallback={<div className={styles.loading}><span className={styles.loader} />正在搭建交通剧场…</div>}>
              <GameScene session={session} camera={camera} quality={quality} reducedMotion={reducedMotion} assetUrl={assetUrl} onAssetError={onAssetError} onFailure={onSceneFailure} metrics={metrics} showVision={showVision} showTrail={showTrail} />
            </Suspense>
          </SceneBoundary>}
        </div>
        <div className={styles.sceneTop}><div><span className={styles.eyebrow}>STATION 01 / 地铁站</span><span className={styles.location}>一段行程，多种选择。</span></div><span className={styles.sceneTag}>{renderer === "2d" ? "二维调试" : camera.mode === "follow" ? "跟随视角" : "站厅总览"}</span></div>
        {broadcast && <div className={styles.broadcast} role="status">广播 <span>{broadcast.text}</span></div>}
        <div className={styles.cameraTools}>
          <Hint text="切换第三人称跟随和站厅总览"><button aria-pressed={camera.mode === "overview"} onClick={() => setCamera((value) => ({ ...value, mode: value.mode === "follow" ? "overview" : "follow" }))}>{camera.mode === "follow" ? "总览" : "跟随"}</button></Hint>
          <Hint text="恢复角色背后的默认镜头"><button onClick={() => setCamera((value) => ({ mode: "follow", reset: value.reset + 1 }))}>回正 <span aria-hidden="true">↺</span></button></Hint>
        </div>
        {playing && <div className={styles.sceneBottom}>
          <div className={styles.events}><span className={styles.eyebrow}>最近事件</span>{recent.map((event, index) => <div key={`${event.t}-${index}`}><time>{event.t.toFixed(1)}s</time><span>{event.text}</span></div>)}</div>
          <div className={`${styles.phaseChip} ${runner?.phase === "thinking" ? styles.thinking : ""}`} role="status"><i />{runner?.phase === "thinking" ? "角色思考中 · 世界暂停" : session.paused ? "已暂停" : "角色自主行动中"}</div>
        </div>}
        {!playing && !ended && <div className={styles.introCaption}><span className={styles.eyebrow}>YOUR WORDS. THEIR WAY.</span><h1>你的指导，<br />它的下一程。</h1><p>买票、安检、过闸、下楼到站台。<br />把计划交给角色，观看它如何应对现场。</p></div>}
        {ended && <div className={styles.endCaption}><span className={styles.eyebrow}>JOURNEY COMPLETE</span><h2>{session.engine.status === "success" ? "这一次，顺利抵达。" : "每次出发，都有新的答案。"}</h2><p>在右侧查看本次行程记录。</p></div>}
      </section>
      <aside className={styles.sidebar} aria-label="对局面板">
        <div className={styles.ticketHeading}><span>METRO / JOURNEY</span><span>NO. {String(seed).padStart(4, "0")}</span></div>
        <div className={styles.sidebarBody}>
          {error && <div className="error" role="alert">{error}</div>}
          {intent === "setup" && showModelConfig && <ModelConfigPanel health={health} onClose={() => setShowModelConfig(false)} onEnabled={(value) => {
            setHealth(value);
            setAgentKind(value.llm ? "llm" : "offline");
            preparationRef.current = null;
            setError(null);
          }} />}
          {intent === "setup" && !showModelConfig && <SetupPanel llmAvailable={health.llm} model={health.model} agentKind={agentKind} onAgentKind={setAgentKind} seed={seed} onSeed={(value) => { setSeed(value); session.preview(value); }} guidance={guidance} onGuidance={setGuidance} busy={busy} onPrepare={prepare} onConfigureModel={() => setShowModelConfig(true)} />}
          {intent === "confirm" && <section className="card"><span className={styles.eyebrow}>READY TO DEPART</span><h2>确认这次出发</h2><p className="muted">{agentKind === "llm" ? "角色将依据以下指导自主行动。" : "离线规则 Agent 按默认守序方案行动。"}</p><GuidanceCard guidance={agentKind === "llm" ? guidance : ""} normalized={normalized} /><div className="row"><button className="primary" disabled={busy !== null} onClick={start}>{busy ?? "出发"} <span aria-hidden="true">→</span></button><button className="ghost" disabled={busy !== null} onClick={() => setIntent("setup")}>返回修改</button></div></section>}
          {intent === "playing" && runner && <>
            <section className={styles.runHeading}><span className={styles.eyebrow}>本次行程 / {agentKind === "llm" ? "大模型" : "离线规则"}</span><div className={styles.timer} aria-label="世界时间">{session.engine.t.toFixed(1)}<span> / {RULES.timeLimit}s</span></div><JourneyProgress player={player} status={session.engine.status} /></section>
            {playing && <>
              <section className={styles.actionCard}><span className={styles.eyebrow}>当前行动</span><h2>{describeActivity(session.engine.world, player)}</h2><p>{latest?.action?.reason ?? "角色正在观察环境，准备作出选择。"}</p><div className={styles.decisionCount}><span>决策 {runner.decisions.length} / {DECISION_LIMITS.maxDecisions}</span><span>{latest ? describeAction(latest.action) : "准备中"}</span></div></section>
              <div className={styles.playControls}><button onClick={() => session.setPaused(!session.paused)}>{session.paused ? "继续" : "暂停"}</button><div className="segmented" aria-label="播放速度">{[1, 2, 4].map((value) => <button key={value} aria-pressed={session.speed === value} className={session.speed === value ? "on" : ""} onClick={() => session.setSpeed(value)}>{value}×</button>)}</div></div>
              {runner.budgetExhausted && <p className="badge brick">决策次数已用完，世界继续运行。</p>}
              <button className="ghost full-width" onClick={() => session.stop()}>结束本局</button>
            </>}
            {ended && <><ReportSummary report={runner.report()} onRetry={start} onEdit={edit} /><Modal title="轨迹回放" description="回看角色位置、路线与当时决策；NPC 和设施显示终局状态。" wide trigger={<button className="full-width">查看轨迹回放</button>}><TrajectoryReplayView key={session.generation} report={runner.report()} engine={session.engine} /></Modal></>}
            {playing && runner.attempts.at(-1)?.status === "pending" && <details><summary>当前调用（请求中）</summary><DecisionTrace attempts={[runner.attempts.at(-1)!]} /></details>}
            {playing && runner.dialogues.at(-1)?.status === "pending" && <NpcDialogue record={runner.dialogues.at(-1)!} />}
            <Modal title="行程记录" description="查看角色的决策依据、执行结果和已经发生的事件。" wide trigger={<button className={styles.logButton}>查看完整行程记录 <span aria-hidden="true">↗</span></button>}>
              <h3>决策记录</h3><DecisionLog decisions={runner.decisions} />{ended && <EventTimeline report={runner.report()} />}
            </Modal>
          </>}
          {debug && <details className={styles.debug}><summary>开发调试</summary><div className="row"><button onClick={() => setRenderer((value) => value === "3d" ? "2d" : "3d")}>切换到 {renderer === "3d" ? "2D" : "3D"}</button><button onClick={retryScene}>重建三维画面</button></div><label className="check"><input type="checkbox" checked={showVision} onChange={(event) => setShowVision(event.target.checked)} />视距示意（未裁剪遮挡）</label><label className="check"><input type="checkbox" checked={showTrail} onChange={(event) => setShowTrail(event.target.checked)} />角色轨迹</label><label className="field"><span>角色模型路径</span><input value={assetInput} onChange={(event) => setAssetInput(event.target.value)} placeholder="/models/character.glb" /></label><div className="row"><button onClick={() => applyAsset(assetInput)}>应用模型</button><button onClick={() => applyAsset("/models/sample-sculpture.gltf")}>加载样例</button><button onClick={() => applyAsset("")}>几何占位</button></div>{assetError && <p role="status" className="error">{assetError}</p>}<div className="row"><button disabled={metrics.active} onClick={() => { metrics.start(); session.notify(); }}>采样 60 秒</button><button onClick={() => downloadMetrics(metrics)}>导出性能记录</button></div><pre>{JSON.stringify(metrics.summary(), null, 2)}</pre></details>}
        </div>
        <div className={styles.ticketFoot}><span>一步一步，直到抵达。</span><div className={styles.barcode} aria-hidden="true" /></div>
      </aside>
    </main>
    <footer className={styles.footer}><span>自然语言指导 · 自主行动 · 动态世界</span><span>{playing ? "观看角色，发现计划之外的可能。" : "场景与角色使用几何占位，后续接入正式资产。"}</span><span>TRANSIT THEATRE / V1</span></footer>
  </div></TooltipProvider>;
}
