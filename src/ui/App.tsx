import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HeuristicAgent } from "../agent/heuristicAgent";
import { Api, RemoteAgent, offlineClassifier } from "../agent/remoteAgent";
import type { OperationDebug } from "../shared/debug";
import { ModelConfigPanel } from "./ModelConfigPanel";
import type { NormalizedGuidance } from "../shared/types";
import { describeActivity } from "../sim/observation";
import { DECISION_LIMITS } from "../sim/scenario";
import { resolveGameSettings } from "../shared/gameSettings";
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
import { Hint, Icon, Modal, TooltipProvider } from "./overlays";
import type { ViewOptions } from "./presentation";
import { useGameSession } from "./useGameSession";
import { randomSeed } from "./seed";
import { usePerformanceSettings } from "./performanceSettings";
import { PerformanceSettingsPanel } from "./PerformanceSettingsPanel";
import styles from "./App.module.css";

const GameScene = lazy(() => import("./scene/GameScene"));
type Stage = "setup" | "confirm" | "playing";
/** 捕获三维渲染错误，让开局和报告仍可操作。 */
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: boolean }> {
  state = { error: false };
  /** 将渲染失败切换为恢复界面。 */
  static getDerivedStateFromError() { return { error: true }; }
  /** 显示正常场景或恢复操作。 */
  render() { return this.state.error ? this.props.fallback : this.props.children; }
}
/** 显示现有交通剧场品牌。 */
function Brand() {
  return <div className={styles.brand}><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 6h26v22l-6 6H13l-6-6V6Zm6 6v11h14V12H13Zm1 16h1m10 0h1M10 37l5-5m15 5-5-5" /></svg><div>agent-go<span>METRO THEATRE</span></div></div>;
}
/** 下载开发调试采样，不参与游戏计分。 */
function downloadMetrics(metrics: FrameMetrics) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(metrics.summary(), null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "transit-performance.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 编排开局、观战和复盘界面；世界状态始终由会话提供。 */
export function App() {
  const { settings: display, setSettings: setDisplay, reducedMotion } = usePerformanceSettings();
  const session = useGameSession(display.lowFrequencyHud ? 500 : 120);
  const [health, setHealth] = useState<{ llm: boolean; model: string | null }>({ llm: false, model: null });
  const [agentKind, setAgentKind] = useState<AgentChoice>("offline");
  const [showModelConfig, setShowModelConfig] = useState(false);
  const preparationRef = useRef<{ runId: string; durationMs: number; server: OperationDebug | null } | null>(null);
  const [seed, setSeed] = useState(session.engine.seed);
  const [settings, setSettings] = useState(session.engine.settings);
  const [guidance, setGuidance] = useState("");
  const [normalized, setNormalized] = useState<NormalizedGuidance | null>(null);
  const [intent, setIntent] = useState<Stage>("setup");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ mode: "follow" | "overview"; reset: number }>({ mode: "follow", reset: 0 });
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
  // 将素材加载失败反馈到开发面板。
  const onAssetError = useCallback((message: string) => setAssetError(message), []);
  // 将三维故障反馈到可恢复的场景状态。
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

  /** 整理指导后进入确认阶段，忽略已经失效的异步请求。 */
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
  /** 创建所选 Agent 并开始新局，让模型会话与预览使用同一截止时间。 */
  const start = async () => {
    if (busy) return;
    const request = ++requests.current;
    setError(null); setBusy("正在开局…");
    const preparation = preparationRef.current;
    const runId = preparation?.runId ?? crypto.randomUUID();
    try {
      const agent = agentKind === "llm" ? await RemoteAgent.create(guidance, normalized, runId, settings) : new HeuristicAgent();
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
  /** 更新截止时间并重建同种子预览，确保离线模拟与远程会话规则一致。 */
  const changeTimeLimit = (timeLimitSeconds: number) => {
    if (busy) return;
    const next = resolveGameSettings({ ...settings, timeLimitSeconds });
    setSettings(next);
    session.preview(seed, next);
  };
  /** 返回开局设置，保留截止时间并生成新种子；同种子重试保留独立入口。 */
  const edit = () => {
    requests.current++; preparationRef.current = null; setIntent("setup"); setError(null);
    const nextSeed = randomSeed(seed);
    setSeed(nextSeed); session.preview(nextSeed, settings);
  };
  /** 重新挂载失败场景并清除素材提示，不重新启动模拟。 */
  const retryScene = () => { setSceneFailure(null); setAssetError(""); setSceneAttempt((value) => value + 1); };
  /** 校验调试模型路径，并用新 URL 触发加载。 */
  const applyAsset = (path: string) => {
    if (path && (!path.startsWith("/models/") || path.includes("..") || !/\.(gltf|glb)$/i.test(path))) { setAssetError("请输入 /models/ 下的 .glb 或 .gltf 文件路径。"); return; }
    setAssetError(""); setAssetInput(path); setAssetUrl(path ? `${path}?v=${Date.now()}` : "");
  };
  const fallback = <div className={styles.sceneError} role="alert"><h2>三维画面需要重新连接</h2><p>{sceneFailure ?? "浏览器无法建立三维画面。对局与报告仍然保留。"}</p><div className="row"><button onClick={retryScene}>重试三维</button><button onClick={() => setRenderer("2d")}>进入二维调试</button></div></div>;

  return <TooltipProvider delayDuration={250}><div className={styles.app} data-reduced-motion={reducedMotion}>
    <header className={styles.header}>
      <Brand />
      <div className={styles.headerCenter}><i className={playing && !session.frozen ? styles.live : styles.dot} />{stageLabel}<span className={styles.slash}>/</span><span>METRO · 01</span></div>
      <Modal title="显示设置" description="调整观战画面，不会改变角色的行动或世界规则。" trigger={<button className={styles.settingsButton}>显示设置 <Icon name="external" /></button>}>
        <PerformanceSettingsPanel settings={display} onChange={setDisplay} reducedMotion={reducedMotion} />
      </Modal>
    </header>
    <main className={styles.layout}>
      <section className={styles.viewport} aria-label={renderer === "3d" ? "三维地铁站场景" : "二维调试地图"}>
        <div className={styles.scene}>
          {renderer === "2d" ? <MapCanvas engineRef={engineRef} optionsRef={optionsRef} /> : sceneFailure ? fallback : <SceneBoundary key={sceneAttempt} fallback={fallback}>
            <Suspense fallback={<div className={styles.loading}><span className={styles.loader} />正在搭建交通剧场…</div>}>
              <GameScene session={session} camera={camera} quality={display.quality} targetFps={display.targetFps} simpleCrowd={display.simpleCrowd} reducedMotion={reducedMotion} assetUrl={assetUrl} onAssetError={onAssetError} onFailure={onSceneFailure} metrics={metrics} showVision={showVision} showTrail={showTrail} />
            </Suspense>
          </SceneBoundary>}
        </div>
        <div className={styles.sceneTop}><span className={styles.stationName}>地铁站</span><span className={styles.sceneTag}>{renderer === "2d" ? "二维调试" : camera.mode === "follow" ? "跟随视角" : "站厅总览"}</span></div>
        {broadcast && <div className={styles.broadcast} role="status">广播 <span>{broadcast.text}</span></div>}
        <div className={styles.cameraTools}>
          <Hint text="切换第三人称跟随和站厅总览"><button aria-pressed={camera.mode === "overview"} onClick={() => setCamera((value) => ({ ...value, mode: value.mode === "follow" ? "overview" : "follow" }))}>{camera.mode === "follow" ? "总览" : "跟随"}</button></Hint>
          <Hint text="恢复角色背后的默认镜头"><button onClick={() => setCamera((value) => ({ mode: "follow", reset: value.reset + 1 }))}>回正 <Icon name="reset" /></button></Hint>
        </div>
        {playing && <div className={styles.sceneBottom}>
          <div className={styles.events} aria-label="最近事件">{recent.map((event, index) => <div key={`${event.t}-${index}`}><time>{event.t.toFixed(1)}s</time><span>{event.text}</span></div>)}</div>
          <div className={`${styles.phaseChip} ${runner?.phase === "thinking" ? styles.thinking : ""}`} role="status"><i />{runner?.phase === "thinking" ? "角色思考中 · 世界暂停" : session.paused ? "已暂停" : "角色自主行动中"}</div>
        </div>}
        {!playing && !ended && <div className={styles.introCaption}><h1>你的指导，<br />它的下一程。</h1><p>买票、安检、过闸、下楼到站台。<br />把计划交给角色，观看它如何应对现场。</p></div>}
        {ended && <div className={styles.endCaption}><h2>{session.engine.status === "success" ? "这一次，顺利抵达。" : "每次出发，都有新的答案。"}</h2><p>查看本次行程记录，再试一种思路。</p></div>}
      </section>
      <aside className={styles.sidebar} aria-label="对局面板">
        <div className={styles.ticketHeading}><span>METRO / JOURNEY</span><span>NO. {String(seed).padStart(4, "0")}</span></div>
        <div className={styles.sidebarBody}>
          {error && <div className="error" role="alert">{error}</div>}
          {assetError && <div className="error" role="status">{assetError}<button onClick={retryScene}>重试三维素材</button></div>}
          {intent === "setup" && showModelConfig && <ModelConfigPanel health={health} onClose={() => setShowModelConfig(false)} onEnabled={(value) => {
            setHealth(value);
            setAgentKind(value.llm ? "llm" : "offline");
            preparationRef.current = null;
            setError(null);
          }} />}
          {intent === "setup" && !showModelConfig && <SetupPanel llmAvailable={health.llm} model={health.model} agentKind={agentKind} onAgentKind={setAgentKind} seed={seed} onSeed={(value) => { setSeed(value); session.preview(value, settings); }} settings={settings} onTimeLimit={changeTimeLimit} guidance={guidance} onGuidance={setGuidance} busy={busy} onPrepare={prepare} onConfigureModel={() => setShowModelConfig(true)} />}
          {intent === "confirm" && <section className="card" aria-busy={busy !== null}><h2>确认这次出发</h2><p className="muted">{agentKind === "llm" ? "角色将依据以下指导自主行动。" : "离线规则 Agent 按默认守序方案行动。"}</p><p className="small">时限 {settings.timeLimitSeconds} 秒 · 每条开放队列额外 {settings.extraQueuePeople} 人</p><GuidanceCard guidance={agentKind === "llm" ? guidance : ""} normalized={normalized} /><div className="row"><button className="primary" disabled={busy !== null} onClick={start}>{busy ?? "出发"} <Icon name="arrow" /></button><button className="ghost" disabled={busy !== null} onClick={() => setIntent("setup")}>返回修改</button></div></section>}
          {intent === "playing" && runner && <>
            <section className={styles.runHeading}>{playing && <><p className={styles.runLabel}>世界时间 · {agentKind === "llm" ? "大模型" : "离线规则"}</p><div className={styles.timer} aria-label="世界时间">{session.engine.t.toFixed(1)}<span> / {session.engine.settings.timeLimitSeconds}s</span></div></>}<JourneyProgress player={player} status={session.engine.status} /></section>
            {playing && <>
              <section className={styles.actionCard} aria-label="当前行动"><h2>{describeActivity(session.engine.world, player)}</h2><p>{latest?.action?.reason ?? "角色正在观察环境，准备作出选择。"}</p><div className={styles.decisionCount}><span>决策 {runner.decisions.length} / {DECISION_LIMITS.maxDecisions}</span><span>{latest ? describeAction(latest.action) : "准备中"}</span></div></section>
              <div className={styles.playControls}><button onClick={() => session.setPaused(!session.paused)}>{session.paused ? "继续" : "暂停"}</button><div className="segmented" role="group" aria-label="播放速度">{[1, 2, 4].map((value) => <button key={value} aria-pressed={session.speed === value} className={session.speed === value ? "on" : ""} onClick={() => session.setSpeed(value)}>{value}×</button>)}</div></div>
              {runner.budgetExhausted && <p className="badge brick">决策次数已用完，世界继续运行。</p>}
              <button className="ghost full-width" onClick={() => session.stop()}>结束本局</button>
            </>}
            {ended && <><ReportSummary report={runner.report()} onRetry={start} onEdit={edit} /><Modal title="轨迹回放" description="回看角色位置、路线与当时决策；NPC 和设施显示终局状态。" wide trigger={<button className="full-width">查看轨迹回放</button>}><TrajectoryReplayView key={session.generation} report={runner.report()} engine={session.engine} /></Modal></>}
            {playing && runner.attempts.at(-1)?.status === "pending" && <details><summary>当前调用（请求中）</summary><DecisionTrace attempts={[runner.attempts.at(-1)!]} /></details>}
            {playing && runner.dialogues.at(-1)?.status === "pending" && <NpcDialogue record={runner.dialogues.at(-1)!} />}
            <Modal title="行程记录" description="查看角色的决策依据、执行结果和已经发生的事件。" wide trigger={<button className={styles.logButton}>查看完整行程记录 <Icon name="external" /></button>}>
              <h3>决策记录</h3><DecisionLog decisions={runner.decisions} />{ended && <EventTimeline report={runner.report()} />}
            </Modal>
          </>}
          {debug && <details className={styles.debug}><summary>开发调试</summary><div className="row"><button onClick={() => setRenderer((value) => value === "3d" ? "2d" : "3d")}>切换到 {renderer === "3d" ? "2D" : "3D"}</button><button onClick={retryScene}>重建三维画面</button></div><label className="check"><input type="checkbox" checked={showVision} onChange={(event) => setShowVision(event.target.checked)} />视距示意（未裁剪遮挡）</label><label className="check"><input type="checkbox" checked={showTrail} onChange={(event) => setShowTrail(event.target.checked)} />角色轨迹</label><label className="field"><span>角色模型路径</span><input value={assetInput} onChange={(event) => setAssetInput(event.target.value)} placeholder="/models/character.glb" /></label><div className="row"><button onClick={() => applyAsset(assetInput)}>应用模型</button><button onClick={() => applyAsset("/models/sample-sculpture.gltf")}>加载样例</button><button onClick={() => applyAsset("")}>几何占位</button></div><div className="row"><button disabled={metrics.active} onClick={() => { metrics.start(); session.notify(); }}>采样 60 秒</button><button onClick={() => downloadMetrics(metrics)}>导出性能记录</button></div><pre>{JSON.stringify(metrics.summary(), null, 2)}</pre></details>}
        </div>
        <div className={styles.ticketFoot}><span>一步一步，直到抵达。</span><span className={styles.ticketMark} aria-hidden="true">AG / 01</span></div>
      </aside>
    </main>
    <footer className={styles.footer}><span>自然语言指导 · 自主行动 · 动态世界</span><span>{playing ? "观看角色，发现计划之外的可能。" : "站厅已接入正式素材，角色模型可在开发调试中替换。"}</span><span>TRANSIT THEATRE / V1</span></footer>
  </div></TooltipProvider>;
}
