import { Engine } from "../sim/engine";
import { GuardSystem } from "../sim/guards";
import { ATTRACTIONS, ESCALATOR_TOP, FACILITIES, NAV_NODES, STAIRS_TOP } from "../sim/layout";
import type { GuardDef, Scenario } from "../sim/scenario";
import type { ItemKind, Persona, Vec } from "../shared/types";

export interface NpcTuning { traits?: Partial<Persona["traits"]>; situation?: Partial<Pick<Persona["situation"], "hurry" | "fatigue">>; initialAlert?: "none" | "yellow" | "red" }
export type LabNpcSettings = Record<string, NpcTuning>;

export function applyNpcSettings(e: Engine, settings: LabNpcSettings) {
  const allowed = { traits: ["courage", "vanity", "temper", "fairness", "meddling"], situation: ["hurry", "fatigue"] };
  for (const value of Object.values(settings)) for (const group of ["traits", "situation"] as const) {
    for (const [key, number] of Object.entries(value[group] ?? {})) if (!allowed[group].includes(key) || !Number.isFinite(number) || number < 0 || number > 1) throw new RangeError("乘客参数须为0到1之间的有效数值");
  }
  for (const p of e.world.persons.values()) {
    if (!p.persona || p.isPlayer) continue;
    for (const patch of [settings["*"], settings[p.id]]) if (patch) {
      Object.assign(p.persona.traits, patch.traits);
      Object.assign(p.persona.situation, patch.situation);
    }
    p.irritable = p.persona.traits.temper > .6;
    e.world.personas[p.id] = p.persona;
    const initialAlert = settings[p.id]?.initialAlert ?? settings["*"]?.initialAlert;
    if (initialAlert && initialAlert !== "none") {
      if (!["yellow", "red"].includes(initialAlert)) throw new RangeError("初始警戒参数无效");
      const event = e.events.emit({t:e.t,kind:"odd_behaviour",severity:"odd",actorId:"player",targetId:p.id,pos:{...e.player.pos},loudness:0});
      e.alerts.records.set(JSON.stringify([p.id,"player"]), {observerId:p.id,subjectId:"player",level:initialAlert,ring:0,hiddenFor:0,since:e.t,causeEventId:event.id,reaction:null});
    }
  }
}

export interface LabScenario { id: string; group: string; title: string; setup: string; prompt: string; examples: string[] }
const promptOverrides: Record<string, string> = { physical: "威胁最近的乘客交票，然后击打他", "queue-security": "请求最近的排队乘客让位", "queue-gate": "请求最近的排队乘客让位", "escalator-exit": "从扶梯侧面翻出" };
const scene = (id: string, group: string, title: string, setup: string, ...examples: string[]): LabScenario => ({ id, group, title, setup, prompt: promptOverrides[id] ?? examples[0], examples });
export const LAB_SCENARIOS: LabScenario[] = [
  scene("ticket", "车票", "买票与不买票", "售票机旁，无票、有零钱。", "去 TVM-2 买票", "不买票，前往安检", "观察最近的乘客"),
  scene("ticket-buyer", "车票", "寻找刚买完票的乘客", "售票机前观察点，乘客正在真实办理购票；车票需办理成功才进入其口袋。", "击打买了票的乘客击晕并抢走车票", "观察刚买完票离开的乘客"),
  scene("social", "车票", "索要、交换、说服与威胁", "附近有一位持票乘客；你有零食和零钱。", "向最近的乘客索要车票，说我赶时间，请帮帮忙", "用零食交换最近乘客的车票", "夸奖最近乘客，请他把车票送给我", "威胁最近的乘客交出车票", "抢最近乘客的车票"),
  scene("no-ticket", "车票", "无票对象与虚假承诺", "附近乘客没有票；验证口头承诺不能创造车票。", "向最近的乘客索要车票", "抢最近乘客的车票"),
  scene("bold", "人物", "不同性格与连续对话", "持票乘客较强硬；隐藏性格仅在测试详情中公开。", "威胁最近乘客交票", "跟最近的乘客聊天", "说服最近乘客帮忙"),
  scene("items", "物品", "拿取、交付、放下与投掷", "便利架旁，地面有雨伞；口袋有零钱。", "拿起雨伞", "拿便利架上的零食", "给最近的乘客零钱", "丢下背包", "扔雨伞到 TVM-2"),
  scene("capacity", "物品", "双手与背包容量", "双手与背包已放满，地面还有雨伞；验证容量限制。", "拿起地上的雨伞", "放下背包", "丢下手里的水瓶"),
  scene("queue-tvm", "排队", "售票排队、离队与强插", "售票队列已有三人，玩家在队侧。", "加入 TVM-2 队伍", "请求在 TVM-2 排队的最近乘客让我先买票", "强行插到最近乘客前面", "离开队伍"),
  scene("queue-security", "排队", "安检队列与给好处", "有票、有零食；安检队列已有三人。", "用零食换最近排队乘客让我先安检", "强行插到最近乘客前面", "加入 S2 队伍"),
  scene("queue-gate", "排队", "闸机队列与让位", "玩家已安检、有票；闸机队列已有三人。", "请最近的排队乘客让我先过闸", "加入 G3 队伍", "等待 5 秒"),
  scene("security-bag", "安检", "带包安检", "有票、带背包，位于 S2 前。", "通过 S2 安检", "丢下背包，然后通过安检"),
  scene("security-light", "安检", "无包安检", "有票、无背包；与带包场景比较耗时。", "通过 S2 安检"),
  scene("security-item", "安检", "道具额外检查", "带包并持有雨伞、水瓶；使用现行道具检查规则。当前道具表没有可没收的违禁品。", "通过 S2 安检", "先放下雨伞"),
  scene("gate-ticket", "闸机", "持票过闸与车票使用", "已安检、有未使用车票，位于 G3 前。", "通过 G3 闸机"),
  scene("gate-empty", "闸机", "无票刷闸", "已安检、没有车票，位于 G3 前。", "不买票直接通过 G3", "翻越闸机"),
  scene("gate-seen", "闸机", "翻闸被保安目击", "保安面对闸机；其他条件与无目击场景一致。", "翻越闸机"),
  scene("gate-hidden", "闸机", "翻闸无直接目击", "保安背向闸机；并不保证动作期间始终不被发现。", "翻越闸机"),
  scene("railing", "安检", "翻越安检低栏杆", "售票厅一侧的低栏杆前，未安检。", "翻越安检栏杆", "直接走到 CONCOURSE"),
  scene("stairs", "下行", "楼梯与滑扶手", "已过闸，位于楼梯入口。", "走楼梯进入站台", "沿楼梯扶手滑下"),
  scene("escalator", "下行", "扶梯站立与步行", "已过闸，位于扶梯入口。", "站着乘扶梯", "在扶梯上步行下楼"),
  scene("escalator-crowd", "下行", "扶梯候梯与拥堵", "扶梯入口有持续客流，玩家在队侧。", "乘扶梯下楼", "改走楼梯", "等待 3 秒"),
  scene("escalator-exit", "下行", "扶梯中途翻出", "预设正在乘扶梯，测试中途翻出及碰撞。", "从扶梯侧面翻出", "等待 2 秒"),
  scene("physical", "肢体", "推搡、抢夺、击打与击晕", "近处有持票乘客，无保安直接目击；人物仍可反抗和报告。", "推搡最近的乘客", "抢最近乘客的车票", "击打最近乘客", "打晕最近乘客"),
  scene("guard-front", "肢体", "正面接近保安", "保安面对玩家，测试攻击开始时的目击。", "打晕最近的保安", "推搡最近的保安"),
  scene("guard-back", "肢体", "背后接近保安", "保安背向玩家；成功与否仍由模拟器结算。", "打晕最近的保安"),
  scene("report", "感知与警戒", "抢票、目击与报告", "持票乘客、目击者与远处保安；可继续输入等待观察后果。", "抢最近乘客的车票", "等待 20 秒", "靠近最近乘客"),
  scene("hiding", "感知与警戒", "遮挡与警戒解除", "商业大厅柱子旁，有乘客和保安。", "大喊一声", "走到 GATE_S", "等待 20 秒"),
  scene("noise", "感知与警戒", "落物、投掷与声音归因", "大厅内持有空易拉罐和水瓶，附近有保安和乘客。", "扔易拉罐到(x=38,y=10)", "丢下易拉罐", "大喊一声", "等待 6 秒"),
  scene("damage", "环境", "设施损坏", "售票机旁，持有雨伞；测试击打设施与停用。", "用雨伞击打 TVM-2", "去 TVM-2 买票"),
  scene("failure", "环境", "办理中故障与改道", "TVM-2 在世界时间第 4 秒故障。", "去 TVM-2 买票", "改去 TVM-3 买票"),
  scene("power", "环境", "断电与恢复", "商业大厅第 2 秒断电，持续 12 秒；不是自然语言可凭空施放的能力。", "等待 3 秒", "观察最近的乘客", "等待 15 秒"),
  scene("recheck", "环境", "复检与通道停用", "S2 下一名乘客被复检，S1 第 8 秒关闭。", "加入 S2 队伍", "改去 S1", "等待 10 秒"),
  scene("attractions", "商业关注", "玩具、广告、花店、信息与座椅", "已安检、位于商业大厅；可观察、停留、离开。", "去看看玩具机", "停下来看看花店", "去信息牌看看", "坐下来休息", "走到 GATE_S"),
  scene("limits", "边界", "缺失条件与未支持行为", "普通售票厅；测试歧义、虚构物品与不受支持能力。", "凭空变出一张票", "让所有乘客立刻把票交给我", "用我没有的雨伞打人", "瞬间移动到站台"),
  scene("gate-used", "闸机", "已使用车票", "已安检，只有一张已经使用过的车票。", "通过 G3 闸机"),
  scene("gate-unscreened", "闸机", "未安检就过闸", "有票但未安检，验证正常刷票的前置条件。", "通过 G3 闸机"),
  scene("queue-npc", "排队", "乘客自主插队", "S2 长队中有赶时间且公平意识低的乘客；插队按原概率触发，不保证每次出现。", "加入 S2 队伍", "等待 20 秒"),
  scene("hearing", "感知与警戒", "只听到声音，不认出行为者", "持有空易拉罐，保安背对玩家；实际落地后观察转向和调查，不能仅凭声音确认你。", "扔易拉罐到(x=38,y=10)", "等待 5 秒"),
  scene("timeout", "边界", "剩余时间与超时", "预设世界已过 145 秒，剩余 5 秒；沿用原版 150 秒判负。", "等待 10 秒"),
  scene("station", "完整车站", "正式规则完整车站", "原版种子车站、全部客流和故障；没有预置通关条件。", "尽快到站台，路线由你选择", "尽量不买票，到达站台"),
];

export function createLabEngine(id: string, seed = 1, settings: LabNpcSettings = {}): Engine {
  const e = createBaseEngine(id, seed); applyNpcSettings(e, settings); return e;
}

function createBaseEngine(id: string, seed: number): Engine {
  if (!LAB_SCENARIOS.some(s => s.id === id)) throw new Error("未知测试场景");
  if (id === "station") return new Engine(seed);
  const scenario: Scenario = { seed, initialStatus: {}, spawns: [], events: [] };
  const queue = id === "queue-tvm" || id === "ticket-buyer" ? "TVM-2" : ["queue-security", "queue-npc", "recheck"].includes(id) ? "S2" : id === "queue-gate" ? "G3" : null;
  if (queue) scenario.spawns = ["normal", "elderly", "normal"].map(kind => ({ t: 0, kind: kind as "normal" | "elderly", hasCard: queue !== "TVM-2", irritable: false, startQueue: queue }));
  if (id === "queue-npc") for (let i = 0; i < 12; i++) scenario.spawns.push({ t: 0, kind: "hurried", hasCard: true, irritable: false, startQueue: "S2" });
  if (id === "failure") scenario.events.push({ t: 4, type: "damage", facility: "TVM-2" });
  if (id === "power") scenario.events.push({ t: 2, type: "power", zone: "concourse", duration: 12 });
  if (id === "recheck") scenario.events.push({ t: .1, type: "recheck", facility: "S2", extra: [10, 15] }, { t: 8, type: "status", facility: "S1", status: "closed", note: "测试预设停用", broadcast: "1号安检通道停用" });
  const e = new Engine(seed, {}, scenario, { backpack: id !== "security-light" });
  e.guards.guards.splice(0);
  const p = e.player;
  p.pos = { x: 10, y: 7 };
  const item = (kind: ItemKind, slot: "pocket" | "hand" | "bag" = "pocket") => e.world.items.spawn(kind, { type: "held", personId: p.id, slot }, p.id);
  const ticket = () => { if (!p.hasTicket) item("ticket"); };
  const guard = (pos: Vec, facing: number, speed = 0) => {
    const defs: GuardDef[] = [{ id: "lab-guard", label: "测试保安", route: [pos], facing, speed, pauseSeconds: 0 }];
    e.guards.guards.push(...new GuardSystem(defs).guards);
  };
  const person = (pos: Vec, hasTicket = true) => {
    const n = e.world.addPerson("normal", pos, { hasTicket });
    n.activity = { kind: "waiting", remaining: 140 };
    n.facing = Math.PI;
    return n;
  };
  if (["social", "no-ticket", "bold", "physical", "report"].includes(id)) {
    p.pos = { x: 12, y: 15 };
    const n = person({ x: 13.5, y: 15 }, id !== "no-ticket");
    if (n.persona && id === "bold") n.persona.traits = { courage: .95, temper: .9, fairness: .9, meddling: .8, vanity: .2 };
    item("snack", "hand");
  }
  if (["items", "capacity"].includes(id)) {
    p.pos = { x: 7, y: 5 };
    person({ x: 9, y: 5 });
    e.world.items.spawn("umbrella", { type: "ground", pos: { x: 8, y: 5.8 } }, null);
    if (id === "capacity") {
      item("water_bottle", "hand"); item("can", "hand");
      for (let i = 0; i < 4; i++) item("snack", "bag");
    }
  }
  if (queue) {
    const f = e.world.facility(queue)!;
    p.pos = { x: f.def.head.x - 1.5, y: f.def.head.y + 1.7 };
    if (queue !== "TVM-2") ticket();
    if (queue === "G3") p.screened = true;
    item("snack", "hand");
    if (id === "queue-npc") for (const n of e.world.persons.values()) if (n.persona && !n.isPlayer) { n.persona.traits.fairness = 0; n.persona.situation.hurry = 1; }
  }
  if (id.startsWith("security-")) {
    p.pos = { x: 24, y: 15 }; ticket();
    if (id === "security-item") { item("umbrella", "hand"); item("water_bottle", "bag"); }
  }
  if (id.startsWith("gate-")) {
    p.pos = { x: 43, y: 15 }; p.screened = true;
    if (id === "gate-ticket") ticket();
    if (id === "gate-used") { ticket(); for (const t of e.world.items.holdings(p.id)) if (t.kind === "ticket") t.used = true; }
    if (id === "gate-unscreened") { ticket(); p.screened = false; }
    if (["gate-seen", "gate-hidden"].includes(id)) guard({ x: 40, y: 15 }, id === "gate-seen" ? 0 : Math.PI);
  }
  if (id === "railing") p.pos = { x: 25.3, y: 10 };
  if (["stairs", "escalator", "escalator-crowd", "escalator-exit"].includes(id)) {
    p.screened = p.passedGate = true;
    p.pos = { ...(id === "stairs" ? STAIRS_TOP : ESCALATOR_TOP) };
    if (id === "escalator-crowd") { e.world.transit.startCrowd(); p.pos = { x: 61, y: 20.8 }; }
    if (id === "escalator-exit") { p.pos = { x: 63.4, y: 22 }; p.activity = { kind: "escalator", remaining: 8, duration: 10 }; }
  }
  if (id.startsWith("guard-")) {
    p.pos = { x: id === "guard-front" ? 41.5 : 39, y: 15 };
    guard({ x: 40.2, y: 15 }, 0);
  }
  if (id === "report") {
    guard({ x: 25, y: 15 }, 0, .4);
    const n = person({ x: 12, y: 17 }, false); n.facing = -Math.PI / 2;
    if (n.persona) n.persona.traits = { courage: .6, vanity: 0, temper: 0, fairness: 1, meddling: 1 };
  }
  if (["hiding", "noise", "hearing", "power", "attractions"].includes(id)) {
    p.pos = { x: id === "attractions" ? 31 : 38, y: id === "attractions" ? 9 : 15 }; p.screened = true;
    person({ x: p.pos.x + 1.5, y: p.pos.y + 1.5 });
    if (id !== "attractions") guard({ x: 40, y: 12 }, id === "hearing" ? -Math.PI / 2 : Math.PI / 2, ["noise","hearing"].includes(id) ? .9 : 0);
    if (["noise", "hearing"].includes(id)) { item("can", "hand"); item("water_bottle", "hand"); }
  }
  if (id === "damage") item("umbrella", "hand");
  if (id === "timeout") e.world.t = 145;
  e.trail.splice(0, e.trail.length, { ...p.pos, t: e.t });
  e.takeTriggers();
  e.notify("start", "行为测试预设已就绪，按当前玩家输入尝试行动。");
  return e;
}

export const LAB_LOCATIONS = [...FACILITIES.map(f => `${f.id} ${f.label}`), ...ATTRACTIONS.map(a => `${a.id} ${a.label}`), ...NAV_NODES.map(n => `${n.id} ${n.label}`)];
