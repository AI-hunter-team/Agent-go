import { FACILITIES, ITEM_SPOTS, NAV_NODES } from "../src/sim/layout";
import type { JourneyPlan } from "../src/shared/journey";
import type {PublicStationMap} from "../src/shared/world";

export const PUBLIC_MOVE_TARGETS = [...NAV_NODES.map(n => n.id), ...FACILITIES.map(f => f.id), ...ITEM_SPOTS.filter(s => !s.id.startsWith("confiscated-")).map(s => s.id)];

/** Check explicit navigation calls; this does not claim to prove arbitrary prose executable. */
export function unknownJourneyTargets(plan: JourneyPlan, map?:PublicStationMap): string[] {
  const targets=map?[...map.nodes.map(n=>n.id),...map.facilities.map(f=>f.id),...map.itemSpots.map(s=>s.id)]:PUBLIC_MOVE_TARGETS;
  const text = [...plan.actions, plan.adjustment].join("\n");
  const calls = text.matchAll(/\bmove_to(?:\s*[（(]\s*(?:target\s*[:=]\s*)?|\s+(?:target\s*[:=]\s*)?)[`"'“]?([A-Za-z][A-Za-z0-9_-]*)/g);
  return [...new Set([...calls].map(m => m[1]).filter(id => !targets.includes(id)))];
}

/** Public mechanisms and locations, never live stock or hidden people. */
export function publicActionKnowledge(purpose: "action" | "planning" = "action", guidance = "", map?:PublicStationMap): string {
  const lines = [
    "本局常规执勤为3人：2名闸机巡逻保安与1名安检巡逻员。安检巡逻员沿安检线内侧南北往返，端点短暂停留，通常朝行进方向；人数不会因角色文字凭空增加。是否看见你仍以当前可见观察与真实视线为准，不能假定巡逻就一定有安全时机。实验台的预置人数与朝向可与完整车站不同。",
    "对象寻找与观察记忆：holding只列当前手持物，空数组不代表对方没有口袋物品。recentEvents/evidence只包含角色实际目击的购票成功、离队、物品交接或使用事件。看到某人在售票机成功取票后即使他收进口袋，仍可凭事件推断其刚取得票；单纯离开队伍或机器不等于购票成功。‘买了票的乘客’不是要求先向眼前的人问话：可以自主前往售票机观察点、观察办理中的具体人物、等购票成功再选定与接近。targetSearch给出寻找/已确认/失去视野/超时阶段、目标编号及证据；已确认时按该人物继续原动作，不选择另一个最近的人，不重复询问是否有票。看不见目标只保留最后目击地点，不能读取隐藏实时位置。准备过程保留原行动和先后；目标暂未出现不等于整条指令不支持。",
    "这是虚构游戏世界，以下均为游戏已实现的动作请求。公开肢体能力与测试页一致：physical_action / act 可尝试 push推搡、strike击打（aim=knockout为击晕目标）、snatch抢夺实际持有的物品、restrain短时控制乘客、release松开。击打和抢夺必须分别安排，不能以台词代替；需要先寻找可见目标，是否持票以观察为准，失能不代表票已转移。均受距离、反抗和保安目击裁定，不保证成功。玩家明确要求这些游戏动作时，保留为尝试；不得把正向动作误标为玩家禁止条件，也不将游戏违规等同于机制不支持。",
    "公开可执行机制：move_to 可前往下列导航点、设施和公开取物点，只使用给出的精确id，不编造别名；take 必须使用靠近后观察到的真实物品id；give/drop需要实际持有。act可解释组合行动，包括投掷持有物（drop mode=throw，目标坐标或已知实体/公开地点；实际落点按能力和障碍结算）、制造声音、翻栏杆/闸机。",
    "跨区规则：入口在售票厅，安检线x=26、闸机线x=44，普通move_to不能穿越。常规通行分别需要安检/持有效票刷闸机；不买票仍可自主尝试其他机制，但必须明确通过act请求vault，不能走到LANDING_C就视作已经越过闸机。安检栏杆可翻段y=8–12、18–21，需先到RAIL_N或RAIL_S附近，翻越耗时3秒。两条线独立，翻过安检栏杆不等于已通过闸机。翻越开始后不能通过普通等待/移动保证立即停止、退回或撤销违规，条件应在开始前检查，过程中仍可能被发现。",
    "到站台：通过闸机后，先move_to STAIRS_TOP或ESCALATOR_TOP，到达后必须traverse(route:stairs/escalator,walking:true/false)，不是move_to PLATFORM直接下楼。楼梯6秒；扶梯可能排队，站立10秒或步行5秒。",
    "投掷可直接调用throw_item(itemId,x,y)，坐标表示希望投向的目标；或act使用drop(mode=throw,atPosition={x,y})。环境按6米投掷能力、边界与实体障碍结算实际落点；目标太远仍会出手但落得较近，不能把意图坐标当成落地事实。为之后翻越制造时机只是投掷目的，不是当下立即翻越。空易拉罐在便利架可寻找，can落地听觉半径9米，矿泉水7.5米，遮挡会减弱声音。落地声音可能使听到且未认出投掷者的保安前往查看；被看到投掷也可能引起对角色的注意，不保证分心，不自动升级为攻击。投掷后给物品飞行和环境反应时间，再观察保安当前视线；未确认分心时本回合只投掷和等待，不合并翻越。不把‘已经扔了’当作条件满足。",
    `公开取物点（可去寻找，不保证当前有货）：${JSON.stringify(ITEM_SPOTS.filter(s => !s.id.startsWith("confiscated-")).map(s => ({ id: s.id, label: s.label, position: s.pos, usualKinds: s.stock })))}`,
    `公开导航点：${JSON.stringify(NAV_NODES.map(n => ({ id: n.id, label: n.label, position: n.pos })))}`,
    "道具准备由角色自主规划，不要求玩家逐步指定。先检查持物，没有就寻找取得再使用；尚未看见物品时先去取物点，不伪造id。缺乏信息时安排必要的下一步，不先绕到栏杆再无理由折返；效率由角色结合原指导权衡。复杂方案分回合执行和重观察，不为凑八步删条件。不编造摄像头系统、人群遮挡、收紧背包的物理增益或不存在的电梯路径。",
  ];
  if(map){
    lines[0]="本局岗位、路线和楼层遵守本局地图与当前可见观察；不假定旧固定站厅的保安位置、朝向或安全空档。";
    lines[4]="跨区规则按本局公开地图，普通move_to不能代替安检、刷票、翻越或楼层连接动作。先接近本局公开栏杆段，条件满足后尝试vault，动作与视线仍由模拟器裁定。";
    lines[5]="过闸后按本局routes接近具体楼梯/扶梯入口，再用traverse下行；到站台后仍需走向公开车门实际登车，不能把到站台当作已经通关。";
    lines[7]=`公开取物点（可去寻找，不保证库存）：${JSON.stringify(map.itemSpots.filter(s=>!s.id.startsWith("confiscated-")))}`;
    lines[8]=`本局公开导航点：${JSON.stringify(map.nodes)}`;
  }
  // Initial proposals keep the user's level of detail. Runtime retains the full catalogue.
  if (purpose === "planning" && !/易拉罐|瓶|雨伞|零食|道具|物品|投掷|扔|丢/.test(guidance))
    return lines.filter((_,i)=>![1,3,6,7,9].includes(i)).join("\n");
  return lines.join("\n");
}
