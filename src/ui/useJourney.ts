import type { WorldDefinition } from "../shared/world";
import { createdWorld, matchesCreatedWorld, type CreatedWorld, type WorldSeedSource } from "./worldCreation";
import { useWorldLibrary, type SavedWorld } from "./worldLibrary";
import { generateWorld } from "../sim/worldDefinition";
import { descriptor } from "../sim/worldDefinition";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Api, RemoteAgent, offlineClassifier } from "../agent/remoteAgent";
import { HeuristicAgent } from "../agent/heuristicAgent";
import type { Agent } from "../agent/agent";
import type { RunnerOptions } from "../agent/runner";
import { readDefaultCharacter,saveDefaultCharacter } from "./appearancePreferences";
import type { JourneyInput, JourneyMetadata } from "../shared/journey";
import { guidanceError } from "../shared/guidance";
import { resolveGameSettings } from "../shared/gameSettings";
import { useGameSession } from "./useGameSession";
import { initialFlow, journeyReducer, type JourneyStage } from "./journeyFlow";
import type { CameraSettings } from "./scene/GameScene";
import { randomSeed } from "./seed";
import { ReviewSession } from "./reviewSession";
import type { GameRunner } from "../agent/runner";
import type { Engine } from "../sim/engine";

export const CHARACTERS = [
  {
    id: "dafeiyu",
    name: "大肥鱼",
    url: "/models/dafeiyu.glb",
    mark: "鱼",
    description: "圆润轮廓 · 轻装出发",
  },
  {
    id: "naiwa",
    name: "奶蛙",
    url: "/models/naiwa.glb",
    mark: "蛙",
    description: "独特造型 · 自在前行",
  },
  {
    id: "custom",
    name: "自定义角色",
    url: "",
    mark: "+",
    description: "导入你自己的 GLB 形象",
  },
];

/** 准备、异步请求与本局冻结信息独立于三维画布和展示布局。 */
export function useJourney(interval: number) {
  const session = useGameSession(interval);
  const library = useWorldLibrary();
  const currentRecord = useRef<SavedWorld|null>(null);
  const [incompatibleWorld,setIncompatibleWorld] = useState<SavedWorld|null>(null);
  const [launchReady,setLaunchReady] = useState(false);
  const [fastEntry,setFastEntry] = useState(false);
  const [flow, dispatch] = useReducer(journeyReducer, initialFlow);
  const [health, setHealth] = useState<{ llm: boolean; model: string | null }>({
    llm: false,
    model: null,
  });
  const [kind, setKind] = useState<"llm" | "offline">("llm");
  const [guidance, setGuidance] = useState("");
  const [seed, setSeed] = useState(session.engine.seed);
  const [worldDraft, setWorldDraft] = useState<{seed:number;initial:CreatedWorld|null;revision:number}>({seed:session.engine.seed,initial:null,revision:0});
  const selectedWorld=useRef<CreatedWorld|null>(flow.createdWorld);
  selectedWorld.current=flow.createdWorld;
  const [settings, setSettings] = useState(session.engine.settings);
  const [backpack, setBackpack] = useState(session.engine.loadout.backpack);
  const [initialCharacter]=useState(readDefaultCharacter);
  const defaultCharacter=useRef(initialCharacter);
  const [characterId, setCharacterId] = useState<string>(initialCharacter);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousRun, setPreviousRun] = useState<{ generation: number; runner: GameRunner; engine: Engine; review: ReviewSession | null } | null>(null);
  const quickStart = useRef<boolean | null>(null);
  const pendingRetry = useRef<{ worldId: string; autonomous: boolean; twoDimensional: boolean } | null>(null);
  const [camera, setCamera] = useState<CameraSettings>({
    mode: "follow",
    reset: 0,
    shot: "lobby",
  });
  const request = useRef(0),
    abort = useRef<AbortController | null>(null);
  const preparation = useRef<{
    input: JourneyInput;
    durationMs: number;
  } | null>(null);
  const pending = useRef<{
    agent: Agent;
    opts: RunnerOptions;
    epoch: number;
  } | null>(null);
  const cameraReady = useRef(false),
    active = useRef(true);
  const stage = useRef(flow.stage);
  stage.current = flow.stage;
  const runner = session.runner;
  const ended = flow.stage === "watch" && runner?.phase === "ended";
  const watching = flow.stage === "watch" && !ended;
  const working = flow.stage === "planning" || flow.stage === "launch";
  const report = ended && runner ? runner.report() : null;
  const review = useMemo(() => ended && runner?.engine.status === "failed" ? new ReviewSession(runner.report(), Api.forReview(runner.report())) : null, [ended, runner]);
  const preserveRun = () => {
    if (session.runner?.phase === "ended") setPreviousRun({ generation: session.generation, runner: session.runner, engine: session.engine, review });
  };
  const character = CHARACTERS.find((c) => c.id === characterId)!;
  useEffect(() => {
    let live = true;
    Api.health()
      .then((value) => {
        if (live) setHealth(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.abort();
      request.current++;
      void pending.current?.agent.dispose();
    };
  }, []);
  const cancel = () => {
    quickStart.current = null;
    request.current++;
    abort.current?.abort();
    abort.current = null;
    const old = pending.current;
    pending.current = null;
    setLaunchReady(false);
    if (old) void old.agent.dispose();
  };
  const invalidate = () => {
    cancel();
    setError(null);
    preparation.current = null;
    if (["planning", "plan", "launch"].includes(stage.current))
      stage.current = "guidance";
    dispatch({ type: "invalidate" });
  };
  const navigate = (requested: JourneyStage,characterEntry:"lobby"|"journey"="journey") => {
    const appearance=requested==="character"&&characterEntry==="lobby";
    const next=requested!=="lobby"&&requested!=="world"&&!appearance&&!selectedWorld.current?"world":requested;
    if(next==="lobby")setCharacterId(defaultCharacter.current);
    stage.current = next;
    cancel();
    setError(null);
    setDrawer(false);
    dispatch({ type: "navigate", stage: next,characterEntry });
    setCamera((c) => ({
      mode: "follow",
      reset: c.reset + 1,
      shot:
        next === "lobby"
          ? "lobby"
          : next === "character"
            ? "character"
            : next === "guidance"
              ? "guidance"
              : "plan",
    }));
  };
  const openAppearance=()=>navigate("character","lobby");
  const cancelCharacter=()=>navigate("lobby");
  const recoverDefaultAppearance=useCallback(()=>{defaultCharacter.current="dafeiyu";saveDefaultCharacter("dafeiyu");setCharacterId(current=>current==="custom"?"dafeiyu":current);},[]);
  const openWorldCreation = (fresh=false) => {
    preserveRun();
    if(fresh)setCharacterId(defaultCharacter.current);
    if(watching)session.stop();
    invalidate();
    setWorldDraft(previous=>({seed:fresh?randomSeed(seed):seed,initial:fresh?null:selectedWorld.current,revision:previous.revision+1}));
    navigate("world");
  };
  const confirmWorld = (definition:WorldDefinition,source:WorldSeedSource,name:string) => {
    if(stage.current!=="world")return;
    try{
      const choice={...createdWorld(definition,source,name),id:crypto.randomUUID()};
      cancel();preparation.current=null;setError(null);
      session.preview(choice.seed,settings,{backpack},definition);
      if(!matchesCreatedWorld(choice,session.engine.world.definition))throw new Error("预览与创建结果不一致，请重新生成世界。");
      const record:SavedWorld={...choice,id:choice.id,schemaVersion:1,createdAt:Date.now(),updatedAt:Date.now(),preferences:{settings:{...settings},backpack,characterId,kind,guidance}};
      currentRecord.current=record;library.save(record);setIncompatibleWorld(null);
      selectedWorld.current=choice;setSeed(choice.seed);stage.current="character";
      dispatch({type:"world-created",choice});
      setCamera(c=>({mode:"follow",reset:c.reset+1,shot:"character"}));
    }catch(error){setError(`创建世界失败：${(error as Error).message}`);}
  };
  const selectWorld = (record:SavedWorld) => {
    const definition=generateWorld(record.seed);
    if(!matchesCreatedWorld(record,definition)){setIncompatibleWorld(record);setError("这个世界的生成版本已变化。可以保留原记录，用当前版本创建副本。");return;}
    invalidate();currentRecord.current=record;setIncompatibleWorld(null);
    const p=record.preferences;setSettings(resolveGameSettings(p.settings));setBackpack(p.backpack);setCharacterId(p.characterId);setKind(p.kind);setGuidance(p.guidance);setSeed(record.seed);
    session.preview(record.seed,p.settings,{backpack:p.backpack},definition);
    selectedWorld.current=record;stage.current="character";dispatch({type:"world-selected",choice:record});
    setCamera(c=>({mode:"follow",reset:c.reset+1,shot:"character"}));
  };
  const recreateWorld = (record:SavedWorld) => {
    invalidate();setIncompatibleWorld(null);setWorldDraft(previous=>({seed:record.seed,initial:{...record,name:`${record.name.slice(0,43)} 副本`},revision:previous.revision+1}));navigate("world");
  };
  const renameWorld = (record:SavedWorld,name:string) => {
    const next={...record,name:name.trim().slice(0,48)||record.name,updatedAt:Date.now()};library.save(next);
    if(selectedWorld.current?.id===record.id){currentRecord.current=next;selectedWorld.current=next;dispatch({type:"world-renamed",name:next.name});}
  };
  const deleteWorld = (id:string) => {
    library.remove(id);
    if(incompatibleWorld?.id===id)setIncompatibleWorld(null);
    if(selectedWorld.current?.id===id){cancel();preparation.current=null;currentRecord.current=null;selectedWorld.current=null;setCharacterId(defaultCharacter.current);dispatch({type:"world-removed"});stage.current="lobby";setCamera(c=>({mode:"follow",reset:c.reset+1,shot:"lobby"}));}
  };
  useEffect(()=>{
    const record=currentRecord.current;
    if(!record||record.id!==flow.createdWorld?.id||flow.characterEntry==="lobby"||flow.stage==="lobby"||flow.stage==="world")return;
    const preferences={settings:{...settings},backpack,characterId,kind,guidance};
    if(JSON.stringify(record.preferences)===JSON.stringify(preferences))return;
    const timer=setTimeout(()=>{if(currentRecord.current?.id!==record.id)return;const next={...record,preferences,updatedAt:Date.now()};currentRecord.current=next;library.save(next);},250);
    return()=>clearTimeout(timer);
  },[settings,backpack,characterId,kind,guidance,flow.createdWorld?.id,flow.stage,flow.characterEntry,library.save]);
  const changeDeadline = (value: number) => {
    preserveRun();
    const next = resolveGameSettings({ ...settings, timeLimitSeconds: value });
    invalidate();
    setSettings(next);
    session.preview(seed, next, { backpack });
  };
  const changeBackpack = (value: boolean) => {
    preserveRun();
    invalidate();
    setBackpack(value);
    session.preview(seed, settings, { backpack: value });
  };
  const enterScene = () => openWorldCreation(true);
  const editWorld = () => openWorldCreation(false);
  const continueWorld=()=>{if(currentRecord.current)selectWorld(currentRecord.current);else openWorldCreation(true);};
  const confirmCharacter = () => {
    if(flow.characterEntry==="lobby"){
      defaultCharacter.current=characterId as typeof initialCharacter;const saved=saveDefaultCharacter(characterId);navigate("lobby");
      if(!saved)setError("外观已应用；本机存储不可用，刷新后可能无法保留。");return;
    }
    navigate(kind === "offline" || (flow.prepared && preparation.current) ? "plan" : "guidance");
  };
  const prepare = async (autonomous: boolean, options?: { seed: number; twoDimensional: boolean }) => {
    if (!matchesCreatedWorld(selectedWorld.current, session.engine.world.definition)) { openWorldCreation(); return; }
    if (stage.current === "planning" || stage.current === "launch") return;
    if (kind === "offline") {
      navigate("plan");
      if (options) quickStart.current = options.twoDimensional;
      return;
    }
    if (!health.llm) {
      setError("请先连接模型。输入内容已保留。");
      setDrawer(true);
      return;
    }
    const problem = guidanceError(autonomous ? "" : guidance);
    if (problem) {
      setError(problem);
      return;
    }
    cancel();
    if (options) quickStart.current = options.twoDimensional;
    setError(null);
    const epoch = request.current;
    const input: JourneyInput = {
      sceneId: "metro",
      ...(session.engine.world.definition.generatorVersion==="metro-v1"?{world:descriptor(session.engine.world.definition)}:{}),
      seed: options?.seed ?? seed,
      settings: { ...settings },
      loadout: { backpack },
      guidance: autonomous ? "" : guidance,
      autonomous,
      runId: crypto.randomUUID(),
    };
    const controller = new AbortController();
    abort.current = controller;
    const revision = flow.revision + 1;
    stage.current = "planning";
    dispatch({ type: "navigate", stage: "planning" });
    setCamera((c) => ({ mode: "follow", reset: c.reset + 1, shot: "plan" }));
    const started = performance.now();
    try {
      const result = await Api.prepareJourney(input, controller.signal);
      if (epoch !== request.current || !active.current) return;
      preparation.current = { input, durationMs: performance.now() - started };
      dispatch({ type: "prepare", revision, prepared: result });
    } catch (e) {
      if (epoch === request.current && active.current) {
        quickStart.current = null;
        dispatch({ type: "navigate", stage: "guidance" });
        setError(`形成方案失败：${(e as Error).message}`);
      }
    }
  };
  const tryStart = useCallback(() => {
    const ready = pending.current;
    if (
      !ready ||
      !cameraReady.current ||
      ready.epoch !== request.current ||
      !active.current ||
      stage.current !== "launch" ||
      !matchesCreatedWorld(selectedWorld.current,session.engine.world.definition)
    )
      return;
    pending.current = null;
    const agent = ready.agent;
    try{session.startPrepared(agent, offlineClassifier, ready.opts);}
    catch(error){void agent.dispose();preparation.current=null;setLaunchReady(false);stage.current="guidance";dispatch({type:"invalidate"});dispatch({type:"navigate",stage:"guidance"});setCamera(c=>({mode:"follow",reset:c.reset+1,shot:"guidance"}));setError(`开局失败：${(error as Error).message}`);return;}
    dispatch({ type: "navigate", stage: "watch" });
    setCamera((c) => ({ mode: "follow", reset: c.reset }));
  }, [session]);
  const onCameraReady = useCallback(() => {
    cameraReady.current = true;
    tryStart();
  }, [tryStart]);
  const start = async (twoDimensional: boolean) => {
    if (stage.current !== "plan") return;
    if(!matchesCreatedWorld(selectedWorld.current,session.engine.world.definition)){openWorldCreation();setError("请先创建并确认世界。");return;}
    if (kind === "llm" && (!flow.prepared || !preparation.current)) {
      navigate("guidance");
      setError("请重新生成初始方案");
      return;
    }
    cancel();
    const epoch = request.current;
    cameraReady.current = twoDimensional;
    setError(null);
    stage.current = "launch";
    dispatch({ type: "navigate", stage: "launch" });
    setCamera((c) => ({ mode: "follow", reset: c.reset + 1, shot: "launch" }));
    const p = preparation.current,
      prepared = flow.prepared;
    const effectiveGuidance = kind === "llm" ? p!.input.guidance : "";
    const reviewRunId = p?.input.runId ?? crypto.randomUUID();
    const journey: JourneyMetadata = {
      sceneId: "metro",
      sceneName: "地铁末班车",
      worldName: selectedWorld.current?.name,
      worldSeedSource: selectedWorld.current?.source,
      characterId,
      characterName: character.name,
      model: kind === "llm" ? prepared!.model : null,
      plan: prepared?.plan ?? null,
      autonomous: p?.input.autonomous ?? true,
      preparationMs: p?.durationMs ?? 0,
    };
    try {
      if (kind === "offline") void Api.bindReview(reviewRunId).catch(() => undefined);
      const agent =
        kind === "llm"
          ? await RemoteAgent.create(
              effectiveGuidance,
              prepared!.normalized,
              p!.input.runId,
              settings,
              { backpack },
              { preparationId: prepared!.id, sceneId: "metro", seed, world:p!.input.world },
            )
          : new HeuristicAgent();
      if (epoch !== request.current || !active.current) {
        await agent.dispose();
        return;
      }
      pending.current = {
        agent,
        epoch,
        opts: {
          runId: reviewRunId,
          guidance: effectiveGuidance,
          normalizedGuidance: prepared?.normalized ?? null,
          journey,
          preparation: p
            ? { durationMs: p.durationMs, server: prepared?.debug ?? null }
            : undefined,
        },
      };
      setLaunchReady(true);
      // React may not have committed launch yet; its effect will also try the gate.
      tryStart();
    } catch (e) {
      if (epoch === request.current) {
        invalidate();
        navigate("guidance");
        setError(`开局失败：${(e as Error).message}`);
      }
    }
  };
  useEffect(() => {
    if (flow.stage === "launch") tryStart();
  }, [flow.stage, tryStart]);
  useEffect(() => {
    if (flow.stage !== "plan" || quickStart.current === null) return;
    const twoDimensional = quickStart.current;
    quickStart.current = null;
    void start(twoDimensional);
  });
  const edit = (text?: string) => {
    preserveRun();
    if (text !== undefined) {
      setGuidance(text);
      setKind("llm");
    }
    invalidate();
    session.preview(seed, settings, { backpack });
    navigate(text !== undefined || kind === "llm" ? "guidance" : "plan");
  };
  const retry = (options: { sameScenario?: boolean; twoDimensional?: boolean } = {}) => {
    if (working || watching) return;
    const autonomous = report?.journey?.autonomous ?? false;
    // 模型失效时先保持终局，避免丢失报告或悄悄切到离线模式。
    if (kind === "llm" && !health.llm) { setError("请先连接模型，上一局结果已保留。"); setDrawer(true); return; }
    preserveRun();
    const nextSeed = options.sameScenario ? seed : randomSeed(seed);
    if (nextSeed !== seed) {
      const definition = generateWorld(nextSeed);
      const choice = { ...createdWorld(definition, { mode: "random", value: String(nextSeed) }), id: crypto.randomUUID() };
      const record: SavedWorld = { ...choice, id: choice.id, schemaVersion: 1, createdAt: Date.now(), updatedAt: Date.now(), preferences: { settings: { ...settings }, backpack, characterId, kind, guidance } };
      session.preview(nextSeed, settings, { backpack }, definition);
      currentRecord.current = record; selectedWorld.current = choice; library.save(record);
      setSeed(nextSeed);
      pendingRetry.current = { worldId: choice.id, autonomous, twoDimensional: options.twoDimensional ?? false };
      stage.current = "character";
      dispatch({ type: "world-selected", choice });
      return;
    }
    session.preview(nextSeed, settings, { backpack });
    void prepare(autonomous, { seed: nextSeed, twoDimensional: options.twoDimensional ?? false });
  };
  useEffect(() => {
    const retry = pendingRetry.current;
    if (!retry || flow.createdWorld?.id !== retry.worldId) return;
    pendingRetry.current = null;
    void prepare(retry.autonomous, { seed: flow.createdWorld.seed, twoDimensional: retry.twoDimensional });
  }, [flow.createdWorld?.id]);
  const returnLobby = () => {
    if (watching) session.stop();
    preserveRun();
    invalidate();
    session.preview(seed, settings, { backpack });
    navigate("lobby");
  };
  const replaceModel = () => {
    returnLobby();
    setDrawer(true);
  };
  const enabled = (value: typeof health) => {
    invalidate();
    setHealth(value);
    setDrawer(false);
  };
  return {
    session,
    flow,
    health,
    kind,
    setKind,
    guidance,
    setGuidance,
    seed,
    settings,
    backpack,
    characterId,
    setCharacterId,
    character,
    drawer,
    setDrawer,
    error,
    setError,
    camera,
    setCamera,
    runner,
    ended,
    watching,
    working,
    report,
    review,
    previousRun,
    invalidate,
    navigate,
    worldDraft,
    library, selectWorld, renameWorld, deleteWorld, recreateWorld, incompatibleWorld,
    launchReady, fastEntry, setFastEntry,
    confirmWorld,
    editWorld,
    changeDeadline,
    changeBackpack,
    enterScene,
    confirmCharacter,openAppearance,cancelCharacter,continueWorld,recoverDefaultAppearance,initialCharacter,
    prepare,
    onCameraReady,
    start,
    edit,
    retry,
    returnLobby,
    replaceModel,
    enabled,
  };
}
