import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Api } from "../agent/remoteAgent";
import { getLocalModel, rememberLocalModel } from "../agent/localModel";
import { ModelRememberControl } from "../ui/ModelRememberControl";
import { drawStation, MAP_PX } from "../ui/render";
import { ITEM_DEFS } from "../sim/content/items";
import { LabController, type LabMode, type LabRun } from "./controller";
import { createLabEngine, LAB_LOCATIONS, LAB_SCENARIOS, type LabNpcSettings } from "./scenarios";
import { NpcControls } from "./NpcControls";
import { LabStage } from "./LabStage";
import { stepLabel } from "./feedback";
import "./style.css";
import "./stage.css";

declare const __LAB_COMMIT__: string;
if (!import.meta.env.DEV || import.meta.env.MODE !== "behavior-lab") throw new Error("行为实验台仅在专用开发服务中提供，请使用 start-behavior-lab.bat");
const levelLabel: Record<string, string> = { none: "无", white: "白色注意", yellow: "黄色警戒", red: "红色警戒" };
const stateLabel: Record<LabRun["state"], string> = { running: "执行中", finished: "尝试结束", rejected: "未受理", error: "调用错误", stopped: "已停止", partial: "尚未完成" };
const groups = [...new Set(LAB_SCENARIOS.map(s => s.group))];
const itemLabel = (kind: keyof typeof ITEM_DEFS) => ITEM_DEFS[kind].label;

function Connection({ onChange, close }: { onChange: (value: { llm: boolean; model: string | null }) => void; close: () => void }) {
  const [saved] = useState(getLocalModel);
  const [rememberKey, setRememberKey] = useState(saved?.rememberKey ?? false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [base, setBase] = useState(saved?.baseUrl ?? "https://api.deepseek.com"), [key, setKey] = useState(saved?.apiKey ?? ""), [model, setModel] = useState(saved?.model ?? "deepseek-flash");
  const [effort, setEffort] = useState<"none" | "low" | "high" | "max">(saved?.reasoningEffort ?? "none");
  const [verified, setVerified] = useState<{ token: string; models: string[] } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const token = useRef<string | null>(null);
  useEffect(() => () => { if (token.current) void Api.discardModel(token.current).catch(() => undefined); }, []);
  const verify = async () => {
    setBusy(true); setError("");
    try {
      if (token.current) await Api.discardModel(token.current);
      token.current = null; setVerified(null);
      const result = await Api.verifyModel(base, key); token.current = result.token; setVerified(result); setKey("");
      if (result.models.length && !result.models.includes(model)) setModel(result.models[0]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const enable = async () => {
    if (!verified) return;
    setBusy(true); setError("");
    try {
      const result = await Api.enableModel(verified.token, model, effort, rememberKey);
      onChange({ llm: result.llm, model: result.model }); token.current = null;
      setStorageWarning(result.storageWarning ?? null);
      if (!result.storageWarning) close();
    }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="connection" aria-label="模型连接"><div className="row"><strong>连接测试模型</strong><button disabled={busy} onClick={close}>收起</button></div>
    {!verified ? <><label>基础地址<input type="url" value={base} onChange={e => setBase(e.target.value)} /></label><label>接口密钥<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></label><button disabled={busy || !key || !base} onClick={() => void verify()}>验证连接并获取模型</button></> : <>
      <label>模型<input value={model} list="model-list" onChange={e => setModel(e.target.value)} /><datalist id="model-list">{verified.models.map(m => <option key={m} value={m} />)}</datalist></label>
      <label>思考强度<select value={effort} onChange={e => setEffort(e.target.value as typeof effort)}><option value="none">关闭</option><option value="low">低</option><option value="high">高</option><option value="max">最高</option></select></label>
      <button disabled={busy || !model.trim()} onClick={() => void enable()}>验证模型并用于测试</button></>}
    <ModelRememberControl checked={rememberKey} disabled={busy} warning={storageWarning} onChange={checked => {
      setRememberKey(checked); setStorageWarning(rememberLocalModel(checked).warning ?? null);
    }} />
    <p className="muted">启用验证会消耗少量额度，刷新不会自动调用模型。</p>
    <button disabled={busy} onClick={() => { setKey(""); setRememberKey(false); void Api.clearModel().then(result => {
      setStorageWarning(result.storageWarning ?? null); onChange({ llm: result.llm, model: result.model });
    }).catch(e => setError(e.message)); }}>清除本地保存与当前连接</button>{error && <p role="alert" className="error">{error}</p>}
  </section>;
}

function Result({ run, current, fresh, retry, active }: { run: LabRun; current: LabController; fresh: boolean; retry: (text: string, mode: LabMode) => void; active: boolean }) {
  const after = run.after ?? (run.state === "running" ? undefined : run.before);
  const changes = after?.transfers.slice(run.before.transfers.length) ?? [];
  const logs = after?.log.slice(run.before.log.length) ?? [];
  const events = after?.events.slice(run.before.events.length) ?? [];
  const stepStates = [...new Map(run.steps.map(s => [`${s.planId}:${s.stepIndex}`, s])).values()];
  return <article className={`result ${run.state}`} aria-label={`测试 ${run.id}`}>
    <div className="row"><span className="tag">{stateLabel[run.state]}</span><span className="muted">#{run.id} · {run.mode === "model" ? "大模型角色" : "离线规则检查"} · {run.fresh ? "已重置现场与记忆" : "沿用现场"}</span></div>
    <h2>{run.instruction}</h2><p aria-live="polite">{run.summary}</p>
    {!!run.searchHistory?.length && <section className="facts" aria-label="目标寻找与证据"><strong>寻找对象 → 确认证据 → 继续原行动</strong><p>{run.searchHistory.at(-1)!.state.detail}</p><p className="muted">准备期间保留原指令；下面的“目标准备（程序）”是共用规则执行的观察与等待，不冒充模型选择，也不会默认向乘客问话。</p></section>}
    {run.paths?.map((path, index) => <details className="translation" key={index} open={index === 0}><summary>指令转化路径 · 要求覆盖 {path.requirements.filter(r=>r.state==="covered").length}/{path.requirements.length}</summary>
      <p><b>原始输入：</b>{path.instruction}</p>
      <p><b>{path.source==="program"?path.stage==="preparation"?"程序准备步骤：":"目标确认后恢复原指令：":"角色提交："}</b>{path.role.type === "act" ? path.role.instruction : JSON.stringify(path.role)}</p>
      <p><b>选择理由：</b>{path.role.reason}（简短理由，不是执行指令）</p>
      <p><b>解释依据：</b>{path.originalPlan?.reason || "角色直接调用操作；实际前置条件由模拟器检查"}</p>
      {path.originalPlan && <p><b>解释器原计划：</b>{path.originalPlan.steps.map(stepLabel).join(" → ") || path.originalPlan.reason}</p>}
      {path.changes.map((text,i)=><p key={i}><b>程序修正：</b>{text}</p>)}
      {path.finalPlan && <p><b>最终执行计划：</b>{path.finalPlan.steps.map(s=>`${stepLabel(s)}${s.timing==="with_previous"?"（与前步同时）":""}${s.when==="previous_refused"?"（上次对话拒绝后）":""}${s.when==="previous_succeeded"?"（前步成功后）":""}${s.when==="incapacitated_or_refused"?"（失能或拒绝后）":""}`).join(" → ")}</p>}
      <ul>{path.requirements.map((r,i)=><li key={i}><b>{r.state==="covered"?"已映射":r.state==="missing"?"缺失":"待核对"} · {r.text}</b>：{r.explanation}</li>)}</ul>
      <p className="muted">自动拆解只覆盖可识别表达；已映射表示有对应步骤，不代表目标已经达成。完整参数在下方调用详情中。</p>
    </details>)}
    {!!stepStates.length && <div className="plan-strip" aria-label="实际行动步骤">{stepStates.map(s => <span key={`${s.planId}:${s.stepIndex}`} className={s.phase}>{stepLabel(s.step)} · {s.phase === "completed" ? s.ok ? s.step.op === "talk" ? "已结束" : "完成" : "失败" : s.phase === "skipped" ? "未执行" : s.phase === "interrupted" ? "中断" : s.phase === "rejected" ? "未能开始" : s.phase === "dialogue" ? "等待回复" : s.phase === "perform" ? "执行中" : "接近中"}</span>)}</div>}
    {active ? <LabStage run={run} active={active} /> : <details><summary>查看现场回放</summary><LabStage run={run} active={false} /></details>}
    <ol className="trace">{run.trace.map((t, i) => <li key={i}><time>{t.t.toFixed(1)}s</time><div><strong>{t.kind}</strong><p>{t.text}</p>{t.data !== undefined && <details><summary>调用与操作详情</summary><pre>{JSON.stringify(t.data, null, 2)}</pre></details>}</div></li>)}</ol>
    {after && <div className="facts"><strong>目标与实际变化</strong><p>世界实际推进 {(after.t - run.before.t).toFixed(1)} 秒</p>
      {run.assessment?.goals.map(g => <p className={`goal ${g.state}`} key={g.label}><b>{g.label}：{g.state === "yes" ? "已完成" : g.state === "no" ? "未完成" : "未自动判断"}</b><br />{g.text}</p>)}
      {run.assessment?.facts.map((text, i) => <p key={i}>{text}</p>)}
      {after.failReason && <p className="error">场景判负：{after.failReason}</p>}
      <p>{changes.length ? changes.map(t => `${itemLabel(t.kind)}：${t.from} → ${t.to}`).join("；") : "本次没有物品转移。"}</p>
      {after.alerts.filter(a => a.subjectId === "player").map(a => <p key={a.observerId}>{a.observerId} → 你：{levelLabel[a.level]} {a.level !== "red" ? `${Math.round(a.ring * 100)}%` : ""}</p>)}
    </div>}
    {(events.length > 0 || logs.length > 0) && <details className="consequences"><summary>原始事件与世界日志（{events.length} 个事件）</summary>
      <details><summary>世界日志</summary><ul>{logs.map((l, i) => <li key={i}>{l.t.toFixed(1)}s · {l.text}</li>)}</ul></details>
      <details><summary>感知事件与因果编号</summary><pre>{JSON.stringify(events, null, 2)}</pre></details>
    </details>}
    {run.state !== "running" && <button disabled={current.busy || (!fresh && current.engine.status !== "running")} onClick={() => retry(run.instruction, run.mode)}>{fresh ? "从初始现场重试这条输入" : "继续尝试同一意图"}</button>}
  </article>;
}

function App() {
  const [, refresh] = useReducer(n => n + 1, 0);
  const controllerRef = useRef<LabController | null>(null);
  if (!controllerRef.current) controllerRef.current = new LabController(createLabEngine("social"), refresh);
  const controller = controllerRef.current;
  const [sceneId, setSceneId] = useState("social"), [seed, setSeed] = useState(1), [seedInput, setSeedInput] = useState("1");
  const [input, setInput] = useState(LAB_SCENARIOS.find(s => s.id === "social")!.prompt), [mode, setMode] = useState<LabMode>("model");
  const [health, setHealth] = useState<{ llm: boolean; model: string | null }>({ llm: false, model: null });
  const [connection, setConnection] = useState(false), [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [fresh, setFresh] = useState(true), [npcSettings, setNpcSettings] = useState<LabNpcSettings>({});
  const [knockoutRate, setKnockoutRate] = useState(.9);
  const baseScene = useMemo(() => createLabEngine(sceneId, seed), [sceneId, seed]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const e = controller.engine, selected = LAB_SCENARIOS.find(s => s.id === sceneId)!;
  useEffect(() => { void Api.health().then(setHealth).catch(err => setError(err.message)); return () => controller.stop(); }, [controller]);
  useEffect(() => { if (showMap && canvas.current) { const ctx = canvas.current.getContext("2d"); if (ctx) drawStation(ctx, e, { showVision: true, showTrail: true, thinking: controller.busy }); } });
  const reset = (id = sceneId) => {
    const value = Number(seedInput);
    if (!Number.isInteger(value) || value < 1 || value > 4294967295) { setError("场景编号请输入 1–4294967295 的整数"); return; }
    setSeed(value); setSceneId(id); const next = createLabEngine(id, value, npcSettings); next.executor.surpriseKnockoutRate=knockoutRate; controller.reset(next); setError("");
    if (id !== sceneId) setInput(LAB_SCENARIOS.find(s => s.id === id)!.prompt);
  };
  const run = (text = input, selectedMode = mode) => {
    setError("");
    const value = Number(seedInput);
    if (!Number.isInteger(value) || value < 1 || value > 4294967295) { setError("场景编号请输入 1–4294967295 的整数"); return; }
    setSeed(value);
    controller.engine.executor.surpriseKnockoutRate=knockoutRate;
    void controller.run(text, selectedMode, fresh ? () => { const next=createLabEngine(sceneId,value,npcSettings); next.executor.surpriseKnockoutRate=knockoutRate; return next; } : undefined, sceneId).catch(err => setError(err.message));
  };
  const download = () => {
    const blob = new Blob([JSON.stringify({ baseCommit: __LAB_COMMIT__, implementation: "本地行为实验台", scene: sceneId, seed, npcSettings, knockoutRate, freshByDefault: fresh, runs: controller.runs }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `agent-go-behavior-${sceneId}-${seed}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const visible = e.observe();
  return <main className="lab"><header><div><span className="eyebrow">AGENT-GO / BEHAVIOR LAB</span><h1>行为实验台</h1><p className="muted">输入一个行动，查看角色怎么理解、环境是否受理，以及真正发生了什么。</p></div><div className="header-actions"><span className={`dot ${health.llm ? "connected" : ""}`} />{health.model ?? "尚未连接模型"}<button disabled={controller.busy} onClick={() => setConnection(x => !x)}>模型连接</button></div></header>
    {connection && <Connection onChange={h => { setHealth(h); setMode("model"); setError(""); }} close={() => setConnection(false)} />}
    <div className="workspace"><aside><section className="panel"><label>测试场景<select aria-label="测试场景" disabled={controller.busy} value={sceneId} onChange={ev => reset(ev.target.value)}>{groups.map(group => <optgroup key={group} label={group}>{LAB_SCENARIOS.filter(s => s.group === group).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</optgroup>)}</select></label>
      <p className="setup">{selected.setup}</p><p className="muted">除完整车站外，均为预置测试现场；预置物品和位置不会计作角色完成的行动。</p>
      <div className="row"><label className="seed">场景编号<input aria-label="场景编号" type="number" min="1" max="4294967295" disabled={controller.busy} value={seedInput} onChange={ev => setSeedInput(ev.target.value)} /></label><button disabled={controller.busy} onClick={() => reset()}>恢复初始现场</button></div>
      <p className="muted">相同编号恢复相同初始现场；模型回复仍可能不同。</p>
      <label className="check"><input type="checkbox" checked={fresh} disabled={controller.busy} onChange={ev => setFresh(ev.target.checked)} />每条新输入都重置现场与乘客记忆</label>
      <p className="muted">{fresh ? "默认独立实验：清空对话次数、警戒与记忆，保留所选性格参数和历次测试记录。" : "连续实验：沿用位置、物品、警戒、对话次数与记忆。"}</p>
      <NpcControls engine={baseScene} settings={npcSettings} onChange={setNpcSettings} disabled={controller.busy} />
      <label className="slider">无防备乘客命中后的击晕率：{Math.round(knockoutRate*100)}%<input aria-label="无防备击晕率" type="range" min="0" max="1" step="0.05" disabled={controller.busy} value={knockoutRate} onChange={ev=>setKnockoutRate(Number(ev.target.value))} /></label>
      <p className="muted">默认90%，击打耗时0.5秒；这是命中后的概率，距离、反抗与实际命中另外结算。</p>
      <label>测试方式<select aria-label="测试方式" disabled={controller.busy} value={mode} onChange={ev => setMode(ev.target.value as LabMode)}><option value="model">大模型角色</option><option value="offline">离线规则检查（不调用模型）</option></select></label>
      <p className="muted">{mode === "model" ? "使用现有角色、环境解释和人物对话模型。每次最多 6 次准备决策，完成第一项实质操作后暂停。" : "仅验证关键词映射与模拟规则；不会验证自由话术或大模型的自主选择。"}</p>
      <form onSubmit={ev => { ev.preventDefault(); run(); }}><label htmlFor="instruction">你想尝试什么？</label><textarea id="instruction" placeholder="例如：用零食交换最近乘客的车票" value={input} maxLength={200} onChange={ev => setInput(ev.target.value)} disabled={controller.busy} />
        <button type="button" disabled={controller.busy} className="prompt-reset" onClick={() => setInput(selected.prompt)}>填回本场景提示词</button>
        <div className="row"><small className="muted">{[...input].length}/200</small>{controller.busy ? <button type="button" className="danger" onClick={() => controller.stop()}>停止并冻结</button> : <button className="primary" type="submit" disabled={!input.trim() || (mode === "model" && !health.llm)}>测试</button>}</div>
      </form>{mode === "model" && !health.llm && <p className="hint">先连接模型，或选择离线规则检查。</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <details><summary>本场景示例</summary><div className="examples">{selected.examples.map(text => <button key={text} disabled={controller.busy} onClick={() => setInput(text)}>{text}</button>)}</div></details>
    </section><section className="panel"><div className="row"><h2>当前现场</h2><span>{e.t.toFixed(1)} / {e.settings.timeLimitSeconds}s</span></div>
      <p>你在 {visible.self.zone}，位置 {e.player.pos.x.toFixed(1)}, {e.player.pos.y.toFixed(1)}。</p><p>{visible.self.activity} · {e.player.hasTicket ? "有有效车票" : "没有有效车票"}</p>
      <p>持有：{e.world.items.holdings("player").map(i => `${itemLabel(i.kind)}${i.used ? "（已使用）" : ""}`).join("、") || "无"}</p>
      <div className="people">{visible.people?.map(p => <p key={p.id}><strong>{p.id}</strong> · {p.look} · {p.distance.toFixed(1)} 米<br /><small>{p.doing} {p.towardYou}</small></p>)}</div>
      <button disabled={controller.busy || e.status !== "running"} onClick={() => void controller.run("等待 5 秒", "offline")}>让世界继续 5 秒，观察后果</button>
      <details><summary>可见物品与地点编号</summary><ul>{visible.items?.map(i => <li key={i.id}>{i.id} · {itemLabel(i.kind)} · {i.where}</li>)}</ul><p>{LAB_LOCATIONS.join("；")}</p></details>
      <details onToggle={ev => setShowMap(ev.currentTarget.open)}><summary>现场地图</summary>{showMap && <canvas aria-label="测试现场地图" ref={canvas} width={MAP_PX.w} height={MAP_PX.h} />}</details>
      <details><summary>测试者全局信息（不会提供给角色）</summary><pre>{JSON.stringify({ personas: e.world.personas, alerts: [...e.alerts.records.values()], outages: [...e.world.outages] }, null, 2)}</pre></details>
    </section></aside><section className="results" aria-label="测试记录"><div className="row"><h2>过程与结果</h2><button disabled={!controller.runs.length || controller.busy} onClick={download}>导出记录</button></div>
      {!controller.runs.length && <div className="empty"><span>01 / 输入一次尝试</span><h2>允许尝试，不代表一定成功。</h2><p>这里会记录实际选择的操作、人物回复、拒绝原因、物品转移和警戒后果。默认每条新输入恢复初始现场并清空乘客记忆；关闭重置选项可连续测试。</p><p className="muted">共 {LAB_SCENARIOS.length} 个预设，覆盖当前实现的行为族；预设入口不代表所有分支已通过真实模型验收。</p></div>}
      {[...controller.runs].reverse().map(r => <Result key={r.id} run={r} current={controller} fresh={fresh} retry={run} active={r.id === controller.runs.at(-1)?.id} />)}
    </section></div><footer>主线基线 {__LAB_COMMIT__} ＋ 本地实验台 · 与正式游戏共用模拟规则 · 本页暂停时世界不推进</footer></main>;
}

createRoot(document.getElementById("root")!).render(<App />);
