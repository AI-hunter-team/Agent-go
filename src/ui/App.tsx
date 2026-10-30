import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, Classifier } from "../agent/agent";
import { HeuristicAgent } from "../agent/heuristicAgent";
import { Api, RemoteAgent, offlineClassifier, remoteClassifier } from "../agent/remoteAgent";
import { GameRunner } from "../agent/runner";
import type { NormalizedGuidance } from "../shared/types";
import { Engine } from "../sim/engine";
import { describeActivity } from "../sim/observation";
import { DECISION_LIMITS, RULES } from "../sim/scenario";
import { Controls, GuidanceCard, SetupPanel, type AgentChoice } from "./ControlPanel";
import { DecisionLog } from "./DecisionLog";
import { MapCanvas } from "./MapCanvas";
import { EventTimeline, ReportSummary } from "./ReportView";
import type { RenderOptions } from "./render";

type Stage = "setup" | "confirm" | "playing" | "ended";

export function App() {
  const [health, setHealth] = useState<{ llm: boolean; model: string | null }>({ llm: false, model: null });
  const [agentKind, setAgentKind] = useState<AgentChoice>("offline");
  const [seed, setSeed] = useState(1);
  const [guidance, setGuidance] = useState("");
  const [normalized, setNormalized] = useState<NormalizedGuidance | null>(null);
  const [stage, setStage] = useState<Stage>("setup");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showVision, setShowVision] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [, setTick] = useState(0);

  const engineRef = useRef<Engine | null>(new Engine(1));
  const runnerRef = useRef<GameRunner | null>(null);
  const optionsRef = useRef<RenderOptions>({ showVision: true, showTrail: true, thinking: false });
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  pausedRef.current = paused;
  speedRef.current = speed;

  useEffect(() => {
    Api.health()
      .then((h) => {
        setHealth(h);
        if (h.llm) setAgentKind("llm");
      })
      .catch(() => setHealth({ llm: false, model: null }));
  }, []);

  // Preview the chosen seed's starting state while setting up.
  useEffect(() => {
    if (stage === "setup" || stage === "confirm") engineRef.current = new Engine(seed);
  }, [seed, stage]);

  // Main loop: advance the world in real time unless paused or the agent is thinking.
  useEffect(() => {
    if (stage !== "playing") return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    const frame = (now: number) => {
      const runner = runnerRef.current;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (runner) {
        if (!pausedRef.current && runner.phase === "running") {
          acc += dt * 10 * speedRef.current;
          const steps = Math.floor(acc);
          acc -= steps;
          runner.advance(steps);
        }
        optionsRef.current.thinking = runner.phase === "thinking";
        optionsRef.current.trail = runner.engine.trail;
        if (runner.phase === "ended") {
          setStage("ended");
          setTick((t) => t + 1);
          return;
        }
      }
      if (now - lastUi > 120) {
        lastUi = now;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  useEffect(() => {
    optionsRef.current.showVision = showVision;
    optionsRef.current.showTrail = showTrail;
  }, [showVision, showTrail]);

  const prepare = useCallback(async () => {
    setError(null);
    if (agentKind === "llm" && guidance.trim()) {
      setBusy("正在整理指导…");
      try {
        const r = await Api.normalize(guidance);
        setNormalized(r.guidance);
      } catch (e) {
        setError(`整理指导失败：${(e as Error).message}`);
        setBusy(null);
        return;
      }
      setBusy(null);
    } else {
      setNormalized(null);
    }
    setStage("confirm");
  }, [agentKind, guidance]);

  const start = useCallback(async () => {
    setError(null);
    setBusy("正在开局…");
    let agent: Agent;
    let classify: Classifier;
    try {
      if (agentKind === "llm") {
        agent = await RemoteAgent.create(guidance, normalized);
        classify = remoteClassifier;
      } else {
        agent = new HeuristicAgent();
        classify = offlineClassifier;
      }
    } catch (e) {
      setError(`开局失败：${(e as Error).message}`);
      setBusy(null);
      return;
    }
    const engine = new Engine(seed);
    engineRef.current = engine;
    const runner = new GameRunner(engine, agent, classify, {
      guidance: agentKind === "llm" ? guidance : "",
      normalizedGuidance: agentKind === "llm" ? normalized : null,
      onChange: () => setTick((t) => t + 1),
    });
    runnerRef.current = runner;
    setPaused(false);
    setBusy(null);
    setStage("playing");
    runner.start();
  }, [agentKind, guidance, normalized, seed]);

  const runner = runnerRef.current;
  const engine = engineRef.current!;
  const p = engine.player;

  return (
    <div className="app">
      <header>
        <h1>
          AI猎人 <span>地铁站 MVP</span>
        </h1>
        {stage !== "setup" && stage !== "confirm" && runner && (
          <div className="status">
            <span className="clock">
              {engine.t.toFixed(1)}s <small>/ {RULES.timeLimit}s</small>
            </span>
            <span className={`phase ${runner.phase}`}>
              {runner.phase === "thinking" ? "思考中（世界暂停）" : paused ? "已暂停" : runner.phase === "ended" ? "已结束" : "运行中"}
            </span>
            <span>
              决策 {runner.decisions.length}/{DECISION_LIMITS.maxDecisions}
            </span>
            <span className={p.hasTicket ? "chip on" : "chip"}>车票</span>
            <span className={p.screened ? "chip on" : "chip"}>已安检</span>
            <span className={p.onPlatform ? "chip on" : "chip"}>过闸</span>
          </div>
        )}
      </header>

      <main>
        <div className="stage">
          <MapCanvas engineRef={engineRef} optionsRef={optionsRef} />
          <Legend />
          {stage === "ended" && runner && <EventTimeline report={runner.report()} />}
        </div>

        <aside>
          {error && <div className="error">{error}</div>}

          {stage === "setup" && (
            <SetupPanel
              llmAvailable={health.llm}
              model={health.model}
              agentKind={agentKind}
              onAgentKind={setAgentKind}
              seed={seed}
              onSeed={setSeed}
              guidance={guidance}
              onGuidance={setGuidance}
              busy={busy}
              onPrepare={prepare}
            />
          )}

          {stage === "confirm" && (
            <section className="card">
              <h2>确认开局</h2>
              <p className="muted">
                {agentKind === "llm" ? "以下是整理后的指导，角色将据此行动。" : "离线规则 Agent 按默认守序方案行动。"} 种子 {seed}。
              </p>
              {agentKind === "llm" && <GuidanceCard guidance={guidance} normalized={normalized} />}
              <div className="row">
                <button className="primary" disabled={busy !== null} onClick={start}>
                  {busy ?? "开局"}
                </button>
                <button className="ghost" onClick={() => setStage("setup")}>
                  返回修改
                </button>
              </div>
            </section>
          )}

          {(stage === "playing" || stage === "ended") && runner && (
            <>
              {stage === "playing" && (
                <section className="card">
                  <Controls
                    paused={paused}
                    onPause={() => setPaused((x) => !x)}
                    speed={speed}
                    onSpeed={setSpeed}
                    showVision={showVision}
                    onShowVision={() => setShowVision((x) => !x)}
                    showTrail={showTrail}
                    onShowTrail={() => setShowTrail((x) => !x)}
                    onAbort={() => engine.abort("玩家结束了本局")}
                  />
                  <p className="now">
                    当前：{describeActivity(engine.world, p)}
                    {runner.budgetExhausted && <span className="badge brick">决策次数已用完</span>}
                  </p>
                </section>
              )}
              {stage === "ended" && <ReportSummary report={runner.report()} onRetry={start} onEdit={() => setStage("setup")} />}
              <section className="card log">
                <h3>决策记录</h3>
                <DecisionLog decisions={runner.decisions} />
              </section>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="dot player" /> 你的角色
      </span>
      <span>
        <i className="dot npc" /> 乘客
      </span>
      <span>
        <i className="dot elderly" /> 老人
      </span>
      <span>
        <i className="dot luggage" /> 带行李
      </span>
      <span>
        <i className="tri" /> 保安（扇形为视野）
      </span>
      <span>
        <i className="sq broken" /> 故障/停用
      </span>
    </div>
  );
}
