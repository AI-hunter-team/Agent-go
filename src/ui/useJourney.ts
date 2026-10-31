import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Api, RemoteAgent, offlineClassifier } from "../agent/remoteAgent";
import { HeuristicAgent } from "../agent/heuristicAgent";
import type { Agent } from "../agent/agent";
import type { RunnerOptions } from "../agent/runner";
import type { JourneyInput, JourneyMetadata } from "../shared/journey";
import { guidanceError } from "../shared/guidance";
import { resolveGameSettings } from "../shared/gameSettings";
import { useGameSession } from "./useGameSession";
import { initialFlow, journeyReducer, type JourneyStage } from "./journeyFlow";
import type { CameraSettings } from "./scene/GameScene";

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
  const [flow, dispatch] = useReducer(journeyReducer, initialFlow);
  const [health, setHealth] = useState<{ llm: boolean; model: string | null }>({
    llm: false,
    model: null,
  });
  const [kind, setKind] = useState<"llm" | "offline">("llm");
  const [guidance, setGuidance] = useState("");
  const [seed, setSeed] = useState(session.engine.seed);
  const [settings, setSettings] = useState(session.engine.settings);
  const [backpack, setBackpack] = useState(session.engine.loadout.backpack);
  const [characterId, setCharacterId] = useState("dafeiyu");
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    request.current++;
    abort.current?.abort();
    abort.current = null;
    const old = pending.current;
    pending.current = null;
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
  const navigate = (next: JourneyStage) => {
    stage.current = next;
    cancel();
    setError(null);
    setDrawer(false);
    dispatch({ type: "navigate", stage: next });
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
  const changeSeed = (value: number) => {
    invalidate();
    setSeed(value);
    session.preview(value, settings, { backpack });
  };
  const changeDeadline = (value: number) => {
    const next = resolveGameSettings({ ...settings, timeLimitSeconds: value });
    invalidate();
    setSettings(next);
    session.preview(seed, next, { backpack });
  };
  const changeBackpack = (value: boolean) => {
    invalidate();
    setBackpack(value);
    session.preview(seed, settings, { backpack: value });
  };
  const enterScene = () => {
    session.preview(seed, settings, { backpack });
    navigate("character");
  };
  const confirmCharacter = () =>
    navigate(
      kind === "offline" || (flow.prepared && preparation.current)
        ? "plan"
        : "guidance",
    );
  const prepare = async (autonomous: boolean) => {
    if (stage.current === "planning" || stage.current === "launch") return;
    if (kind === "offline") {
      navigate("plan");
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
    setError(null);
    const epoch = request.current;
    const input: JourneyInput = {
      sceneId: "metro",
      seed,
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
      stage.current !== "launch"
    )
      return;
    pending.current = null;
    const agent = ready.agent;
    session.start(agent, offlineClassifier, ready.opts);
    dispatch({ type: "navigate", stage: "watch" });
    setCamera((c) => ({ mode: "follow", reset: c.reset }));
  }, [session]);
  const onCameraReady = useCallback(() => {
    cameraReady.current = true;
    tryStart();
  }, [tryStart]);
  const start = async (twoDimensional: boolean) => {
    if (stage.current !== "plan") return;
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
    const journey: JourneyMetadata = {
      sceneId: "metro",
      sceneName: "地铁末班车",
      characterId,
      characterName: character.name,
      model: kind === "llm" ? prepared!.model : null,
      plan: prepared?.plan ?? null,
      autonomous: p?.input.autonomous ?? true,
      preparationMs: p?.durationMs ?? 0,
    };
    try {
      const agent =
        kind === "llm"
          ? await RemoteAgent.create(
              effectiveGuidance,
              prepared!.normalized,
              p!.input.runId,
              settings,
              { backpack },
              { preparationId: prepared!.id, sceneId: "metro", seed },
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
          runId: p?.input.runId,
          guidance: effectiveGuidance,
          normalizedGuidance: prepared?.normalized ?? null,
          journey,
          preparation: p
            ? { durationMs: p.durationMs, server: prepared?.debug ?? null }
            : undefined,
        },
      };
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
  const edit = (text?: string) => {
    if (text !== undefined) setGuidance(text);
    invalidate();
    session.preview(seed, settings, { backpack });
    navigate(kind === "offline" ? "plan" : "guidance");
  };
  const retry = () => {
    const autonomous = report?.journey?.autonomous ?? false;
    session.preview(seed, settings, { backpack });
    void prepare(autonomous);
  };
  const returnLobby = () => {
    if (watching) session.stop();
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
    invalidate,
    navigate,
    changeSeed,
    changeDeadline,
    changeBackpack,
    enterScene,
    confirmCharacter,
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
