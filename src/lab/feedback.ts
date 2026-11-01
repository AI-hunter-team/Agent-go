import type { ActionLifecycle, PlanStep, Vec } from "../shared/types";
import type { Engine } from "../sim/engine";
import type { LabRun } from "./controller";
import { explicitPhysicalIntent } from "../shared/physicalIntent";

export interface QueueFact { facility: string; position: number; ahead: string[]; people: string[] }
export interface LabFrame {
  t: number;
  actors: { id: string; position: Vec; player: boolean; activity: string; reaction: string | null; incapacitated: number; alert: string }[];
  action: Engine["executor"]["action"];
}
export interface GoalResult { label: string; state: "yes" | "no" | "unknown"; text: string }
export interface Assessment { summary: string; goals: GoalResult[]; facts: string[] }
export const REACTIONS: Record<string, string> = { restrained: "身体被控制，当前无法移动", glance: "转头查看", murmur: "议论", keep_distance: "后退并保持距离", complain: "抱怨", argue: "争执", expel: "驱赶", flee: "逃离", confront: "靠近阻拦", report: "前往保安处求助", investigate: "调查现场", watch: "注视目标" };

export function queueFact(e: Engine): QueueFact | null {
  const q = e.world.queuePosition(e.player);
  if (q) return { facility: q.facility.def.id, position: q.index + 1, ahead: q.facility.queue.slice(0, q.index), people: [...q.facility.queue] };
  const index = e.world.transit.queue.indexOf("player");
  return index >= 0 ? { facility: "扶梯", position: index + 1, ahead: e.world.transit.queue.slice(0, index), people: [...e.world.transit.queue] } : null;
}

export function captureLabFrame(e: Engine): LabFrame {
  const actors: LabFrame["actors"] = [...e.world.persons.values()].filter(p => p.isPlayer || Math.hypot(p.pos.x - e.player.pos.x, p.pos.y - e.player.pos.y) <= 12).map(p => ({
    id: p.id, position: { ...p.pos }, player: p.isPlayer, activity: p.activity.kind,
    reaction: e.world.isRestrained(p.id) ? "restrained" : e.npcBrain.active.get(p.id)?.action ?? null, incapacitated: p.incapacitated,
    alert: e.alerts.get(p.id, "player")?.level ?? "none",
  }));
  for (const g of e.guards.guards) if (Math.hypot(g.pos.x - e.player.pos.x, g.pos.y - e.player.pos.y) <= 12) actors.push({ id: g.def.id, position: { ...g.pos }, player: false, activity: "保安", reaction: g.mode === "investigate" ? "investigate" : g.mode === "watch" ? "watch" : null, incapacitated: g.incapacitated, alert: e.alerts.get(g.def.id, "player")?.level ?? "none" });
  return { t: e.t, actors, action: e.executor.action };
}

export function stepLabel(step: PlanStep) {
  switch (step.op) {
    case "approach": return `接近 ${step.target.id}`;
    case "talk": return `与 ${step.npcId} 交谈`;
    case "strike": return `${step.aim === "knockout" ? "击晕" : "击打"} ${"npcId" in step ? step.npcId : step.facilityId}`;
    case "snatch": return `抢夺 ${step.npcId} 的物品`;
    case "push": return `推搡 ${step.npcId}`;
    case "restrain": return `抓住并控制 ${step.npcId}`;
    case "release": return `松开 ${step.npcId}`;
    case "force_cut_in": return `插到 ${step.npcId} 前方`;
    case "take": return `拿取 ${step.itemId}`;
    case "give": return `交付 ${step.itemId} 给 ${step.toId}`;
    case "drop": return `${step.mode === "throw" ? "投掷" : "放下"} ${step.itemId}`;
    case "vault": return `翻越 ${step.obstacle === "gate" ? "闸机" : step.obstacle === "railing" ? "栏杆" : "扶梯侧边"}`;
    case "slide_handrail": return "沿扶手滑下";
    case "make_noise": return "制造声音";
    case "wait": return `等待 ${step.seconds} 秒`;
  }
}

export function lifecycleText(row: ActionLifecycle): { kind: string; text: string } | null {
  if (row.step.op === "talk" && ["dialogue", "completed"].includes(row.phase)) return null;
  if (row.phase === "approach" && row.step.op !== "approach" && row.distance !== undefined && row.reach !== undefined && row.distance <= row.reach) return null;
  const name = stepLabel(row.step), distance = row.distance === undefined ? "" : `（距离 ${row.distance.toFixed(2)} 米${row.reach === undefined ? "" : `，可及范围 ${row.reach.toFixed(2)} 米`}）`;
  const prefix = `步骤 ${row.stepIndex}`;
  if (row.phase === "approach") return { kind: `${prefix} · 接近中`, text: `${name}：${row.text}${distance}` };
  if (row.phase === "perform") return { kind: `${prefix} · 动作开始`, text: `${name}，尚未完成${distance}` };
  if (row.phase === "skipped") return { kind: `${prefix} · 未执行`, text: `${name}：${row.text}` };
  if (row.phase === "rejected") return { kind: `${prefix} · 未能开始`, text: `${name}：${row.text}${distance}` };
  if (row.phase === "interrupted") return { kind: `${prefix} · 动作中断`, text: `${name}：${row.text}${distance}` };
  const rule = row.evaluation ? `；${row.evaluation.reason}。本次命中判定率 ${Math.round(row.evaluation.hitProbability*100)}%${row.evaluation.knockoutGivenHit===null?"":`，命中后击晕率 ${Math.round(row.evaluation.knockoutGivenHit*100)}%`}` : "";
  return { kind: `${prefix} · ${row.ok ? "动作完成" : "动作失败"}`, text: `${name}：${row.text}${rule}` };
}

/** Goal statements below use simulator evidence, never an NPC's claimed movement. */
export function assessRun(run: LabRun): Assessment {
  const after = run.after;
  if (!after) return { summary: "正在执行", goals: [], facts: [] };
  const before = run.before, input = run.instruction;
  const completed = run.steps.filter(s => s.phase === "completed" && s.ok);
  const transfers = after.transfers.slice(before.transfers.length);
  const events = after.events.slice(before.events.length);
  const goals: GoalResult[] = [], facts: string[] = [];
  const add = (label: string, yes: boolean, text: string) => goals.push({ label, state: yes ? "yes" : "no", text });
  const physical = (op: "strike" | "push" | "snatch", label: string) => {
    const done = completed.some(s => s.step.op === op);
    const blocked = run.steps.find(s => s.step.op === op && ["interrupted", "rejected", "skipped"].includes(s.phase));
    const started = run.steps.some(s => s.step.op === op && s.phase === "perform");
    add(label, done, done ? `${label}实际完成` : blocked ? blocked.text : started ? `已开始${label}，没有完成记录` : `尚未执行${label}`);
  };
  if (explicitPhysicalIntent(input) && /殴打|击打|击晕|打晕|打人|动手打|揍/.test(input)) {
    physical("strike", "击打");
    if (/击晕|打晕/.test(input) || events.some(e=>e.kind==="knockout")) add("击晕", events.some(e=>e.kind==="knockout"), events.some(e=>e.kind==="knockout") ? "程序已记录击晕与20秒失能" : "命中不等于击晕；本次没有击晕事件");
  }
  if (explicitPhysicalIntent(input) && /推搡|推开|推倒/.test(input)) physical("push", "推搡");
  if (explicitPhysicalIntent(input) && /抢|snatch/i.test(input)) physical("snatch", "抢夺");
  if (/插队|让位|加塞|先.*(?:过|安检|买票)/.test(input)) {
    const eligible = run.steps.filter(s => s.step.op === "force_cut_in" || s.step.op === "talk" && ["yield", "bribe"].includes(s.step.goal));
    const targets = eligible.flatMap(s => "npcId" in s.step ? [s.step.npcId] : []);
    const proof = run.queues.find(q => q.queue && targets.some(id => q.queue!.people.includes(id) && q.queue!.people.indexOf("player") < q.queue!.people.indexOf(id)));
    add("插队/让位", !!proof, proof?.queue ? `${proof.t.toFixed(1)}秒实际进入 ${proof.queue.facility} 第${proof.queue.position}位，已在目标乘客前方` : eligible.length ? "没有确认移动到目标前方；口头回应不等于队列让位" : "本次没有提交让位或插队步骤；其他动作不直接改变队列位次");
  }
  if (/票/.test(input) && !/不买票|逃票/.test(input)) add("取得车票", after.hasTicket || transfers.some(t => t.kind === "ticket" && t.to.startsWith("player:")), after.hasTicket ? "实际持有有效车票" : "未取得有效车票");
  if (/安检/.test(input)) add("通过安检", after.screened, after.screened ? "已实际通过安检" : "仍未通过安检");
  if (/闸/.test(input)) add("通过闸机", after.passedGate, after.passedGate ? "已实际到闸机内侧" : "仍在闸机外侧");
  if (/站台|下楼|走楼梯|乘扶梯|滑.*扶手/.test(input)) add("到达站台", after.onPlatform, after.onPlatform ? "已实际到达站台" : "尚未到达站台");
  if (!goals.length && /拿|捡|取|给|交付|丢|扔|放下/.test(input)) add("物品操作", transfers.some(t => t.from.startsWith("player:") || t.to.startsWith("player:")), transfers.length ? "实际物品转移已记录" : "没有发生角色相关物品转移");
  if (!goals.length && /等待|^等\d/.test(input)) add("等待", after.t > before.t, `世界实际推进 ${(after.t - before.t).toFixed(1)} 秒`);
  if (!goals.length && /加入|排队/.test(input)) add("进入队列", run.queues.some(q => q.queue), run.queues.some(q => q.queue) ? "实际排队过程已记录；办理是否完成另以阶段事实为准" : "没有确认进入队列");
  if (!goals.length && /玩具|花店|广告|信息牌|座椅|休息/.test(input)) add("关注设施", after.distractionSeconds > before.distractionSeconds, `实际关注耗时 ${(after.distractionSeconds - before.distractionSeconds).toFixed(1)} 秒`);
  if (!goals.length && /观察|查看/.test(input)) add("观察", run.requests.some(r => r.action.type === "observe" && r.result.ok), "观察返回的内容见步骤记录，不包含隐藏性格");
  if (!goals.length) goals.push({ label: "本次目标", state: "unknown", text: run.state === "rejected" || run.state === "error" ? run.summary : "不自动判断任意自然语言目标；以下只展示实际变化" });
  if (run.queues.some(q => q.queue) || /queue/.test(run.sceneId ?? "") || goals.some(g => g.label === "插队/让位")) {
    const last = run.queues.at(-1)?.queue;
    facts.push(last ? `当前在 ${last.facility} 第${last.position}位，前面${last.ahead.length}人` : "当前未在队列中");
    const service = after.log.slice(before.log.length).filter(l => /办理|验票|出票|通行/.test(l.text));
    if (service.length) facts.push(service.at(-1)!.text);
  }
  for (const n of after.npcs) {
    const old = before.npcs.find(p => p.id === n.id);
    const moved = old ? Math.hypot(n.position.x - old.position.x, n.position.y - old.position.y) : 0;
    if (n.incapacitated > 0) facts.push(`${n.id} 已失能，剩余 ${n.incapacitated.toFixed(1)} 秒`);
    else if (n.reaction || moved > .2 && run.steps.some(s => "npcId" in s.step && s.step.npcId === n.id)) facts.push(`${n.id}：${REACTIONS[n.reaction ?? ""] ?? n.activity}，实际移动 ${moved.toFixed(2)} 米`);
  }
  for (const r of after.restraints ?? []) if(r.remaining>0) facts.push(`${r.id} 被 ${r.holderId} 控制，移动限制剩余 ${r.remaining.toFixed(1)} 秒`);
  if (/power|damage|failure|recheck/.test(run.sceneId ?? "") || /设施|停电|断电/.test(input)) {
    facts.push(`停用设施：${after.facilities.filter(f => f.status !== "open").map(f => `${f.id} ${f.status}`).join("、") || "无"}`);
    facts.push(`断电区域：${after.outages.filter(([, until]) => until > after.t).map(([zone]) => zone).join("、") || "无"}`);
  }
  if (/威胁|恐吓/.test(input)) facts.push(events.some(e => e.kind === "threaten") ? "威胁事件已发生；人物的身体反应以程序记录为准" : "没有确认威胁事件发生");
  for (const g of after.guards) if (g.incapacitated > 0) facts.push(`${g.id} 已失能，剩余 ${g.incapacitated.toFixed(1)} 秒`);
  const yes = goals.filter(g => g.state === "yes").map(g => g.label), no = goals.filter(g => g.state === "no").map(g => g.label);
  return { summary: [yes.length ? `已完成：${yes.join("、")}` : "", no.length ? `未完成：${no.join("、")}` : ""].filter(Boolean).join("；") || "请核对以下实际变化", goals, facts };
}
