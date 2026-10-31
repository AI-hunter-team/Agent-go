import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { countChars } from "../shared/guidance";
import { describeActivity } from "../sim/observation";
import { ModelConfigPanel } from "./ModelConfigPanel";
import { PerformanceSettingsPanel } from "./PerformanceSettingsPanel";
import { AvatarSettings } from "./AvatarSettings";
import { useAvatarModel } from "./useAvatarModel";
import { usePerformanceSettings } from "./performanceSettings";
import { CHARACTERS, useJourney } from "./useJourney";
import { useBroadcast } from "./useBroadcast";
import { randomSeed } from "./seed";
import { FrameMetrics } from "./frameMetrics";
import { Modal, ProgressBar, TooltipProvider } from "./overlays";
import {
  clampModelProgress,
  modelResourceKey,
  shouldShowModelLoadingOverlay,
  type ModelLoadingState,
} from "./modelLoading";
import { MapCanvas } from "./MapCanvas";
import { DecisionLog } from "./DecisionLog";
import { InteractionPanel } from "./InteractionPanel";
import type { RenderOptions } from "./render";
import { DecisionTrace } from "./DecisionTrace";
import { NpcDialogue } from "./NpcDialogue";
import { DialogueDock } from "./DialogueDock";
import { JourneyReview } from "./JourneyReview";
import { JourneyEnd } from "./JourneyEnd";
import { getSessionHeadMessage, type HeadMessageMode } from "./headMessages";
import styles from "./App.module.css";

const AvatarThumbnail = lazy(() => import("./AvatarThumbnail"));
const GameScene = lazy(() => import("./scene/GameScene"));
class ThumbnailBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** 场景卡片使用轻量车站插画，避免为缩略图再创建三维画布。 */
function StationThumbnail() {
  return (
    <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
      <rect width="96" height="64" fill="#e9e6db" />
      <path d="M0 6h96v23H0z" fill="#f8f7f1" />
      <path d="M0 37 48 25l48 12v27H0z" fill="#d7d8d2" />
      <path d="M0 49 48 26l48 23M18 64 48 26 78 64" fill="none" stroke="#f6f4ec" strokeWidth="1.2" />
      <path d="M9 8h9v34H9zM78 8h9v34h-9z" fill="#f3f0e6" stroke="#d4cfbf" />
      <path d="M17 8v34M78 8v34" stroke="#edbd2d" strokeWidth="1.4" />
      <path d="M23 14h50v11H23z" fill="#252c2d" />
      <path d="M26 17h6v5h-6zM36 18h26M36 21h18" stroke="#f2c927" strokeWidth="1.5" />
      <path d="M25 36h8v12h-8zM38 34h8v12h-8zM51 34h8v12h-8zM64 36h8v12h-8z" fill="#737e7b" stroke="#f4f2e9" />
      <path d="M28 38v6m13-8v6m13-6v6m13-4v6" stroke="#efd255" strokeWidth="1.5" />
      <path d="M0 56 44 38h8L10 64H0z" fill="#e0b84b" opacity=".75" />
    </svg>
  );
}

export function App() {
  const {
    settings: display,
    setSettings: setDisplay,
    reducedMotion,
  } = usePerformanceSettings();
  const j = useJourney(display.lowFrequencyHud ? 500 : 120);
  const {
    session,
    flow,
    health,
    kind,
    guidance,
    seed,
    settings,
    backpack,
    characterId,
    character,
    runner,
    watching,
    ended,
    report,
  } = j;
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [assetError, setAssetError] = useState("");
  const [modelLoading, setModelLoading] = useState<ModelLoadingState>({
    url: null,
    status: "idle",
    progress: 0,
  });
  const loadedModelUrls = useRef(new Set<string>());
  const [reviewState, setReviewState] = useState<{ generation: number; expanded: boolean } | null>(null);
  const [recordState, setRecordState] = useState<{ generation: number; expanded: boolean } | null>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [renderer, setRenderer] = useState<"3d" | "2d">("3d");
  const [metrics] = useState(() => new FrameMetrics());
  const [showVision, setShowVision] = useState(false),
    [showTrail, setShowTrail] = useState(false);
  const [assetPath, setAssetPath] = useState("");
  const [debug] = useState(
    () => new URLSearchParams(location.search).get("debug") === "1",
  );
  const avatar = useAvatarModel("player"),
    guardAvatar = useAvatarModel("guard");
  const engineRef = useRef(session.engine);
  engineRef.current = session.engine;
  const optionsRef = useRef<RenderOptions>({
    showVision: false,
    showTrail: false,
    thinking: false,
  });
  const thought =
    flow.stage === "planning" || (watching && runner?.phase === "thinking")
      ? "thinking"
      : flow.stage === "plan" && kind === "llm"
        ? "ready"
        : null;
  const latest = runner?.decisions.at(-1),
    dialogue = runner?.dialogues.at(-1);
  const interactionDialogue = runner?.interactionDialogues.at(-1);
  const latestText =
    latest?.action?.reason || latest?.result?.text || "等待下一次决定";
  const onModelLoadStart = useCallback((url: string) => {
    const key = modelResourceKey(url);
    if (loadedModelUrls.current.has(key)) {
      setModelLoading({ url: key, status: "loaded", progress: 100 });
      return;
    }
    setModelLoading((current) =>
      current.url === key && current.status === "loading"
        ? current
        : { url: key, status: "loading", progress: 0 },
    );
  }, []);
  const onModelProgress = useCallback((progress: number) => {
    setModelLoading((current) =>
      current.status === "loading"
        ? { ...current, progress: clampModelProgress(progress) }
        : current,
    );
  }, []);
  const onModelLoaded = useCallback((url: string) => {
    const key = modelResourceKey(url);
    loadedModelUrls.current.add(key);
    setModelLoading((current) =>
      current.url === key ? { ...current, status: "loaded", progress: 100 } : current,
    );
  }, []);
  const onAssetError = useCallback(
    (message: string, url?: string) => {
      setAssetError(message);
      if (!url) return;
      const key = modelResourceKey(url);
      setModelLoading((current) =>
        current.url === key ? { ...current, status: "failed" } : current,
      );
    },
    [],
  );
  const onSceneError = useCallback(
    (message = "三维画面暂时不可用") => {
      setSceneError(message);
      setModelLoading((current) =>
        current.status === "loading" ? { ...current, status: "failed" } : current,
      );
    },
    [],
  );
  const retryScene = () => {
    setSceneError(null);
    setAssetError("");
    setSceneAttempt((v) => v + 1);
  };
  const chooseCharacter = (id: string) => {
    j.setCharacterId(id);
    setAssetError("");
  };
  const broadcast = useBroadcast(session, watching);
  const won = report?.status === "success";
  const recordExpanded = recordState?.generation === session.generation ? recordState.expanded : false;
  const expandedReview = !!report && reviewState?.generation === session.generation && reviewState.expanded;
  const messageMode: HeadMessageMode = watching ? recordExpanded ? "icons" : "full" : thought ? "icons" : "hidden";
  optionsRef.current = {
    showVision, showTrail, thinking: runner?.phase === "thinking", trail: session.engine.trail,
    messages: renderer === "2d" ? [...session.presentation.current.actors.keys()].flatMap(actorId => {
      const message = getSessionHeadMessage(session, actorId, messageMode, thought);
      return message ? [{ actorId, message }] : [];
    }) : undefined,
  };
  const closeReview = () => {
    setReviewState({ generation: session.generation, expanded: false });
    requestAnimationFrame(() => reviewTrigger.current?.focus());
  };
  // 胜利展示始终从透视镜头开始；用户之后可自行切换镜头。
  useEffect(() => {
    if (won) j.setCamera((current) => current.mode === "follow" ? current : { ...current, mode: "follow" });
  }, [won, j.setCamera]);

  const remaining = Math.max(
    0,
    session.engine.settings.timeLimitSeconds - session.engine.t,
  );
  const clock = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(remaining % 60)
    .toString()
    .padStart(2, "0")}`;
  const fallback = (
    <section className={styles.sceneFailure} role="alert">
      <h2>三维画面需要恢复</h2>
      <p>{sceneError}</p>
      <button onClick={retryScene}>重试三维</button>
      <button
        onClick={() => {
          setRenderer("2d");
          setSceneError(null);
          j.onCameraReady();
        }}
      >
        使用二维画面
      </button>
    </section>
  );
  const showModelLoading =
    renderer === "3d" &&
    !sceneError &&
    shouldShowModelLoadingOverlay(modelLoading);

  return (
    <TooltipProvider>
      <main
        className={styles.app}
        data-stage={ended ? "review" : flow.stage}
        data-reduced-motion={reducedMotion}
      >
        <div
          className={`${styles.scene} ${flow.stage === "lobby" && sceneIndex === 1 ? styles.scenePlaceholder : ""}`}
          aria-label="三维地铁站场景"
        >
          <div key={renderer} className={styles.sceneLayer}>
            {renderer === "2d" ? (
              <MapCanvas engineRef={engineRef} optionsRef={optionsRef} />
            ) : sceneError ? (
              fallback
            ) : (
              <SceneBoundary key={sceneAttempt} onError={() => onSceneError()}>
                <Suspense
                  fallback={
                    <div className={styles.loading}>正在搭建你的旅程…</div>
                  }
                >
                  <GameScene
                    session={session}
                    camera={j.camera}
                    quality={display.quality}
                    targetFps={display.targetFps}
                    simpleCrowd={display.simpleCrowd}
                    reducedMotion={reducedMotion}
                    assetUrl={
                      characterId === "custom" ? avatar.url : character.url
                    }
                    assetRotation={
                      (characterId === "custom" ? avatar.rotation : 0) +
                      (["character", "guidance", "planning", "plan"].includes(
                        flow.stage,
                      )
                        ? 180
                        : 0)
                    }
                    guardAssetUrl={guardAvatar.url}
                    guardAssetRotation={guardAvatar.rotation}
                    onAssetError={onAssetError}
                    onModelLoadStart={onModelLoadStart}
                    onModelProgress={onModelProgress}
                    onModelLoaded={onModelLoaded}
                    onGuardAssetError={guardAvatar.onError}
                    onStationAssetError={onAssetError}
                    onFailure={onSceneError}
                    metrics={metrics}
                    showVision={showVision}
                    showTrail={showTrail}
                    thought={thought}
                    messageMode={messageMode}
                    onCameraReady={j.onCameraReady}
                  />
                </Suspense>
              </SceneBoundary>
            )}
          </div>
          {showModelLoading && (
            <div className={styles.modelLoadingOverlay} role="status" aria-live="polite">
              <div className={styles.modelLoadingCard}>
                <div className={styles.modelLoadingHeading}>
                  <span>正在加载模型</span>
                  <strong>{modelLoading.progress}%</strong>
                </div>
                <ProgressBar
                  value={modelLoading.progress}
                  label="模型加载进度"
                  className={styles.modelProgress}
                  fillClassName={styles.modelProgressFill}
                />
                <p>正在准备角色形象，请稍候…</p>
              </div>
            </div>
          )}
        </div>
        {!watching && !ended && flow.stage !== "lobby" && (
          <div className={styles.topLeft}>
            <span className={styles.brand}>
              agent-go<span>●</span>
            </span>
            <button
              disabled={flow.stage === "launch"}
              onClick={() =>
                j.navigate(flow.stage === "character" ? "lobby" : "character")
              }
            >
              ← {flow.stage === "character" ? "返回大厅" : "更换角色"}
            </button>
          </div>
        )}
        {!watching && flow.stage !== "launch" && (
          <Dialog.Root open={j.drawer} onOpenChange={j.setDrawer}>
            <Dialog.Trigger asChild>
              <button className={styles.settingsTrigger} aria-label="打开设置" hidden={ended}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M9.8 2.8h4.4l.6 2.1c.5.2.9.4 1.4.6l2-1 3.1 3.1-1 2c.2.5.4.9.6 1.4l2.1.6v4.4l-2.1.6c-.2.5-.4.9-.6 1.4l1 2-3.1 3.1-2-1c-.5.2-.9.4-1.4.6l-.6 2.1H9.8l-.6-2.1c-.5-.2-.9-.4-1.4-.6l-2 1-3.1-3.1 1-2c-.2-.5-.4-.9-.6-1.4L1 15.2v-4.4l2.1-.6c.2-.5.4-.9.6-1.4l-1-2 3.1-3.1 2 1c.5-.2.9-.4 1.4-.6z" transform="translate(1 1) scale(.92)" fill="currentColor" />
                  <circle cx="12" cy="12" r="3.1" fill="white" />
                </svg>
                {flow.stage === "lobby" && <span className={styles.settingsCaption} aria-hidden="true">设置<small>模型可稍后连接</small></span>}
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="drawer-overlay" />
              <Dialog.Content className="settings-drawer">
                <div className="dialog-heading">
                  <Dialog.Title>设置</Dialog.Title>
                  <Dialog.Close asChild>
                    <button aria-label="关闭设置">×</button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="muted">
                  {ended ? "本局复盘沿用开局绑定模型；此处配置用于下一局。" : "画面设置立即生效；模型与开局条件用于下一局。"}
                </Dialog.Description>
                <div className="drawer-body">
                  <details open>
                    <summary>模型连接</summary>
                    <ModelConfigPanel
                      health={health}
                      closeLabel="收起设置"
                      onClose={() => j.setDrawer(false)}
                      onEnabled={j.enabled}
                    />
                  </details>
                  {!ended && <>
                  <details open>
                    <summary>运行方式</summary>
                    <div className="segmented">
                      {(["llm", "offline"] as const).map((value) => (
                        <button
                          key={value}
                          className={kind === value ? "on" : ""}
                          aria-pressed={kind === value}
                          onClick={() => {
                            j.invalidate();
                            j.setKind(value);
                          }}
                        >
                          {value === "llm" ? "模型驱动" : "离线体验"}
                        </button>
                      ))}
                    </div>
                    <p className="small muted">
                      离线体验按固定策略行动，不读取指导。
                    </p>
                  </details>
                  <details>
                    <summary>显示设置</summary>
                    <PerformanceSettingsPanel
                      settings={display}
                      onChange={setDisplay}
                      reducedMotion={reducedMotion}
                    />
                  </details>
                  <details>
                    <summary>开局条件与角色外观</summary>
                    <label className="field">
                      情景种子
                      <div className="row">
                        <input
                          aria-label="情景种子"
                          type="number"
                          min={1}
                          max={4294967295}
                          value={seed}
                          onChange={(e) =>
                            j.changeSeed(
                              Math.min(
                                4294967295,
                                Math.max(
                                  1,
                                  Math.floor(Number(e.target.value)) || 1,
                                ),
                              ),
                            )
                          }
                        />
                        <button onClick={() => j.changeSeed(randomSeed(seed))}>
                          随机生成
                        </button>
                      </div>
                    </label>
                    <label className="field">
                      对局时限
                      <select
                        value={settings.timeLimitSeconds}
                        onChange={(e) =>
                          j.changeDeadline(Number(e.target.value))
                        }
                      >
                        {[120, 150, 180, 240, 300].map((t) => (
                          <option key={t} value={t}>
                            {t === 150 ? "2 分 30 秒（默认）" : `${t / 60} 分钟`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={backpack} onChange={(event) => j.changeBackpack(event.target.checked)} />
                      携带背包（容量 4，安检增加 2 秒；可途中丢弃）
                    </label>
                    <AvatarSettings avatar={guardAvatar} />
                  </details>
                  </>}
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
        {(j.error || assetError) && (
          <div className={styles.alert} role="alert">
            {j.error || assetError}
            <div className="row">
              {j.error && (
                <button onClick={() => j.setDrawer(true)}>查看设置</button>
              )}
              {assetError && (
                <>
                  <button onClick={retryScene}>重试素材</button>
                  <button
                    onClick={() => {
                      chooseCharacter("dafeiyu");
                      retryScene();
                    }}
                  >
                    使用默认角色
                  </button>
                </>
              )}
              <button
                aria-label="关闭提示"
                onClick={() => {
                  j.setError(null);
                  setAssetError("");
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}
        {flow.stage === "lobby" && (
          <section className={styles.lobby} aria-label="选择场景">
            <div className={styles.lobbyCopy}>
              <span className={styles.lobbyKicker}>AGENT GO <i /> WORLD {sceneIndex === 0 ? "01" : "02"}</span>
              <h1>{sceneIndex === 0 ? "地铁末班车" : "新的旅程"}</h1>
              <span className={styles.lobbyAccent} aria-hidden="true" />
              <p>
                {sceneIndex === 0
                  ? "末班车即将离站。用你的指导，让角色找到自己的路。"
                  : "更多世界正在开发中，敬请期待。"}
              </p>
              {sceneIndex === 0 && (
                <span className={styles.goalPill}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg>
                  {settings.timeLimitSeconds} 秒内登上地铁
                </span>
              )}
              <button className={`primary ${styles.enterScene}`} disabled={sceneIndex !== 0} onClick={j.enterScene}>
                {sceneIndex === 0 ? "进入场景" : "敬请期待"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className={styles.carousel} aria-label="场景列表">
              <button
                className={styles.carouselArrow}
                aria-label="上一个场景"
                onClick={() => {
                  j.invalidate();
                  setSceneIndex((v) => 1 - v);
                }}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <div key={sceneIndex} className={styles.sceneCards}>
                {[0, 1].map((index) => (
                <button
                  key={index}
                  className={styles.sceneCard}
                  aria-pressed={sceneIndex === index}
                  onClick={() => {
                    j.invalidate();
                    setSceneIndex(index);
                  }}
                >
                  <span className={styles.sceneThumb} aria-hidden="true">
                    <StationThumbnail />
                    {index === 1 && <span className={styles.sceneLock}><svg viewBox="0 0 24 24" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="15" r="1.2" fill="currentColor" /></svg></span>}
                  </span>
                  <span className={styles.sceneCardLabel}>
                    <strong>{index === 0 ? "地铁末班车" : "开发中场景"}</strong>
                    <small>{index === 0 ? "METRO STATION" : "COMING SOON"}</small>
                  </span>
                </button>
                ))}
              </div>
              <button
                className={styles.carouselArrow}
                aria-label="下一个场景"
                onClick={() => {
                  j.invalidate();
                  setSceneIndex((v) => 1 - v);
                }}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </section>
        )}
        {flow.stage === "character" && (
          <section key="character" className={`${styles.preparation} ${styles.character}`}>
            <span className={styles.eyebrow}>选择你想看谁行动</span>
            <h1>选择角色</h1>
            <h2>{character.name}</h2>
            <p>{character.description}</p>
            <p className="muted">仅改变外观，不影响行动能力。</p>
            <div className={styles.characters}>
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={characterId === c.id}
                  onClick={() => chooseCharacter(c.id)}
                >
                  <span className={styles.portrait}>
                    {c.url && renderer === "3d" && !sceneError ? (
                      <ThumbnailBoundary fallback={c.mark}>
                        <Suspense fallback={c.mark}>
                          <AvatarThumbnail url={c.url} />
                        </Suspense>
                      </ThumbnailBoundary>
                    ) : (
                      c.mark
                    )}
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
            {characterId === "custom" && <AvatarSettings avatar={avatar} />}
            <button
              className="primary full-width"
              disabled={characterId === "custom" && avatar.busy}
              onClick={j.confirmCharacter}
            >
              确认角色 →
            </button>
          </section>
        )}
        {flow.stage === "guidance" && (
          <section key="guidance" className={`${styles.preparation} ${styles.panel}`}>
            <span className={styles.eyebrow}>给角色一个方向</span>
            <h1>这一次，怎么走？</h1>
            <p>目标：{settings.timeLimitSeconds} 秒内登上地铁。</p>
            {kind === "offline" ? (
              <>
                <p>离线体验按固定策略行动，不读取指导。</p>
                <button
                  className="primary full-width"
                  onClick={() => j.navigate("plan")}
                >
                  查看出发说明 →
                </button>
              </>
            ) : (
              <>
                <label className="field">
                  <span>
                    你的指导 <small>{countChars(guidance)} / 300</small>
                  </span>
                  <textarea
                    rows={5}
                    value={guidance}
                    aria-label="你的指导"
                    aria-invalid={countChars(guidance) > 300}
                    placeholder="在这里输入你的想法…"
                    onChange={(e) => {
                      j.invalidate();
                      j.setGuidance(e.target.value);
                    }}
                  />
                </label>
                <button
                  className={styles.example}
                  onClick={() => {
                    j.invalidate();
                    j.setGuidance(
                      "时间不多了，老实排队肯定来不及。想办法钻个空子！",
                    );
                  }}
                >
                  试试：时间不多了，老实排队肯定来不及。想办法钻个空子！
                </button>
                <button
                  className="primary full-width"
                  disabled={countChars(guidance) > 300}
                  onClick={() => void j.prepare(false)}
                >
                  生成初始方案 →
                </button>
                <button
                  className="full-width"
                  onClick={() => void j.prepare(true)}
                >
                  让角色自主决定
                </button>
                <button
                  className="ghost full-width"
                  onClick={() => j.setDrawer(true)}
                >
                  本次使用：{health.model ?? "尚未连接模型"} ›
                </button>
              </>
            )}
          </section>
        )}
        {(flow.stage === "planning" || flow.stage === "plan") && (
          <section
            key={flow.stage}
            className={`${styles.preparation} ${styles.panel}`}
            aria-live="polite"
          >
            <span className={styles.eyebrow}>尚未开始计时</span>
            <h1>
              {flow.stage === "planning"
                ? "正在形成初始方案…"
                : kind === "offline"
                  ? "准备出发"
                  : "初始方案"}
            </h1>
            {flow.stage === "planning" ? (
              <>
                <div className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <p>角色正在接住你的指导。</p>
                <button onClick={() => j.navigate("guidance")}>返回修改</button>
              </>
            ) : (
              <>
                {kind === "offline" ? (
                  <p>
                    离线体验将按固定策略行动，不读取指导。你仍然可以观察现场与回看轨迹。
                  </p>
                ) : (
                  flow.prepared && (
                    <>
                      <section className={styles.planPart}>
                        <h3>我的理解</h3>
                        <p>{flow.prepared.plan.understanding}</p>
                      </section>
                      <section className={styles.planPart}>
                        <h3>准备尝试</h3>
                        <ol>
                          {flow.prepared.plan.actions.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ol>
                      </section>
                      <section className={styles.planPart}>
                        <h3>遇到变化</h3>
                        <p>{flow.prepared.plan.adjustment}</p>
                      </section>
                    </>
                  )
                )}
                <button
                  className="primary full-width"
                  onClick={() => void j.start(renderer === "2d")}
                >
                  Agent Go · 开始行动 →
                </button>
                <button
                  className="ghost full-width"
                  onClick={() => kind === "offline" ? j.setDrawer(true) : j.navigate("guidance")}
                >
                  {kind === "offline" ? "调整开局条件" : "修改指导"}
                </button>
              </>
            )}
          </section>
        )}
        {flow.stage === "launch" && (
          <section key="launch" className={styles.launch} role="status">
            <strong>Agent Go</strong>
            <span>正在就位，尚未开始计时…</span>
            <button onClick={() => j.navigate(kind === "offline" ? "plan" : "guidance")}>取消出发</button>
          </section>
        )}
        {watching && runner && (
          <>
            {broadcast && (
              <div className={styles.broadcast} role="status" data-scene-obstacle>
                ◖ 现场播报：{broadcast}
              </div>
            )}
            <section key={`action-${session.generation}`} className={`${styles.action} ${styles.panel} ${recordExpanded ? "" : styles.actionCollapsed}`} aria-label="行程记录" data-scene-obstacle>
              <div className={styles.currentAction}>
                <span className={styles.eyebrow}>当前行动</span>
                <h2>{describeActivity(session.engine.world, session.engine.player)}</h2>
              </div>
              <button className={styles.recordToggle} aria-expanded={recordExpanded} aria-controls="journey-record-content"
                onClick={() => setRecordState({ generation: session.generation, expanded: !recordExpanded })}>
                <span>{recordExpanded ? "收起行程记录" : "展开行程记录"}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div id="journey-record-content" hidden={!recordExpanded}>
              {latest && (
                <>
                  <h3>最近决策</h3>
                  <p>{latestText}</p>
                  {latest.thinking && <details><summary>模型返回的思考</summary><p>{latest.thinking}</p></details>}
                </>
              )}
              {dialogue && (
                <p className="small">
                  沟通：{dialogue.response?.reply ?? "正在等待答复…"}
                </p>
              )}
              {interactionDialogue && <p className="small">沟通：{interactionDialogue.response.reply}</p>}
              <Modal title="持有物与现场反应" description="查看当前物品、警戒与已发生的事件。" wide trigger={<button className="full-width">持有物与现场反应 ›</button>}>
                <InteractionPanel engine={session.engine} />
              </Modal>
              <Modal
                title="决策与沟通记录"
                description="查看已发生的行动与接口实际返回的内容。"
                wide
                trigger={
                  <button className="full-width">决策与沟通记录 ›</button>
                }
              >
                <DecisionLog decisions={runner.decisions} />
                <details><summary>全部原始调用记录</summary><DecisionTrace attempts={runner.attempts} /></details>
                {runner.dialogues.map((d, i) => (
                  <NpcDialogue key={i} record={d} />
                ))}
                {runner.interactionDialogues.map((d, i) => <p key={i}>{d.t.toFixed(1)}s 对 {d.request.npc.id}：「{d.request.message}」→「{d.response.reply}」· {d.response.decision}</p>)}
              </Modal>
              </div>
            </section>
            <section key={`timer-${session.generation}`} className={`${styles.timer} ${styles.panel}`} data-scene-obstacle>
              <span className={styles.eyebrow}>剩余时间</span>
              <strong>{clock}</strong>
              <progress max={settings.timeLimitSeconds} value={remaining} />
              <span>
                {session.engine.player.onPlatform
                  ? session.engine.player.activity.kind === "boarding" ? "正在登车" : "前往车门登车"
                  : session.engine.player.passedGate
                  ? "前往下层站台"
                  : session.engine.player.screened
                    ? "选择闸机"
                    : session.engine.player.hasTicket
                      ? "选择安检通道"
                      : "前往购票区"}
              </span>
            </section>
            <div className={styles.runDock} data-scene-obstacle>
            <DialogueDock key={`dialogue-${session.generation}`} session={session} />
            <div className={styles.controls}>
              <button
                className="primary"
                onClick={() => session.setPaused(!session.paused)}
              >
                {session.paused ? "继续" : "暂停"}
              </button>
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  aria-pressed={session.speed === speed}
                  onClick={() => session.setSpeed(speed)}
                >
                  {speed}×
                </button>
              ))}
              <button
                onClick={() =>
                  j.setCamera((c) => ({
                    ...c,
                    mode: c.mode === "follow" ? "overview" : "follow",
                    command: (c.command ?? 0) + 1,
                  }))
                }
              >
                {j.camera.mode === "follow" ? "总览" : "跟随"}
              </button>
              <button
                onClick={() =>
                  j.setCamera((c) => ({ ...c, mode: "follow", reset: c.reset + 1, command: (c.command ?? 0) + 1 }))
                }
              >
                回正
              </button>
              <button onClick={() => session.stop()}>结束</button>
            </div>
            <div className={styles.runInfo}>
              <Modal
                title="本局信息"
                description="本局模型已固定，更换模型需结束本局并返回大厅。"
                trigger={<button>ⓘ 本局信息</button>}
              >
                <p>场景：地铁末班车</p>
                <p>角色：{runner.journey?.characterName}</p>
                <p>实际模型：{runner.journey?.model ?? "离线固定策略"}</p>
                <p>情景种子：{seed}</p>
                <p>时限：{settings.timeLimitSeconds} 秒</p>
              </Modal>
            </div>
            </div>
          </>
        )}
        {won && renderer === "3d" && !expandedReview && (
          <div className={styles.victoryControls} aria-label="胜利镜头控制">
            <button onClick={() => j.setCamera((c) => ({ ...c, mode: "follow", reset: c.reset + 1, command: (c.command ?? 0) + 1 }))}>回正</button>
          </div>
        )}
        {report && (
          <>
          <JourneyEnd key={`end-${session.generation}`} ref={reviewTrigger} report={report} hidden={expandedReview}
            onReview={() => setReviewState({ generation: session.generation, expanded: true })}
            onRetry={() => j.retry({ twoDimensional: renderer === "2d" })}
            onEdit={() => { j.edit(); if (kind === "offline") j.setDrawer(true); }} onLobby={j.returnLobby} />
          <JourneyReview key={session.generation} report={report} engine={session.engine} review={j.review} open={expandedReview} onClose={closeReview}
            onEdit={text => { j.edit(text); if (kind === "offline" && text === undefined) j.setDrawer(true); }} />
          </>
        )}
        {debug && (
          <details className={styles.debug}>
            <summary>开发调试</summary>
            <button
              onClick={() => setRenderer((v) => (v === "3d" ? "2d" : "3d"))}
            >
              切换二维 / 三维
            </button>
            <button
              onClick={() => {
                metrics.start();
                session.notify();
              }}
            >
              采样 60 秒
            </button>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(metrics.summary(), null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "agent-go-performance.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              导出性能记录
            </button>
            <label className="check">
              <input
                type="checkbox"
                checked={showVision}
                onChange={(e) => setShowVision(e.target.checked)}
              />
              视距示意
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={showTrail}
                onChange={(e) => setShowTrail(e.target.checked)}
              />
              角色轨迹
            </label>
            <label className="field">
              角色模型路径
              <input
                value={assetPath}
                onChange={(e) => setAssetPath(e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                avatar.applyPath(assetPath);
                chooseCharacter("custom");
              }}
            >
              应用模型路径
            </button>
            <pre>{JSON.stringify(metrics.summary(), null, 2)}</pre>
          </details>
        )}
      </main>
    </TooltipProvider>
  );
}
