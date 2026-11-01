# 交互 2.0：规则规范与技术设计

状态：**现行规则与分阶段实现规划**（2026-10-31）。原规划依据用户[角色设计提案](source-角色设计.md)及当时 `main`（`d4884a8`）；IV2-01–19 现已本地实现，软件、浏览器和真实模型证据分别记录，具体证据与缺口见 [README 状态表](README.md#状态与后续)。D1–D8 已确认；标注“推荐”的数值仍是试玩起始值，可按测试与试玩数据调整。B2 的“现状”保留原基线快照，不代表当前实现。

本文分三部分：A 规则规范（做什么）、B 技术设计（怎么做）、C 接口契约（各模块之间的约定）。任务拆分、文件归属与验收见 [tasks.md](tasks.md)。

---

## A. 规则规范

### A1. 不变的原则（沿用现行基线）

- **模拟器是唯一事实来源。** 位置、物品归属、警戒状态、成败都由 `src/sim` 结算；角色 Agent、Boss、NPC 模型只输出“意图 / 解释 / 台词 / 选择”，由模拟器校验后执行。模型声称成功不等于成功。
- **子弹时间。** 任一模型请求（角色决策、Boss 裁定、NPC 对话）进行时，世界停止推进；动作执行期间世界继续运行，其他人可以走开、转头或打断。
- **信息权限。** 角色只拿到自己能看到、听到的信息；看不到 NPC 的隐藏性格、圆环数值、视野外状态。Boss 掌握全局事实，但不能把信息“传给”某个人物，人物只能通过感知或报告获得信息。
- **不展示攻略清单。** 角色提示词描述基础操作和自由行动入口，不枚举 Boss 支持的全部原语。
- **明确传送肢体行动（BEHAVIOR-LAB-002）。** 用户于2026-10-31明确要求区分对话与实际动作；新增公开 physical_action 工具及独立 action/speech 字段，覆盖推搡、抢夺、击打/击晕。不把台词当作已发生动作，也不因此公开全部 Boss 原语或保证成功；旧 talk/act 保留。
- **过程证据（BEHAVIOR-LAB-003）。** 执行器只读记录每步的实际时间、阶段、对象与距离；开始挥击、命中、中断和后续未执行分别呈现。实验台回放读取真实位置/阶段采样，台词与身体反应独立展示，目标达成须有物品/队列/阶段事实；不通过动画或模型台词补写结果。
- **评分不变。** 到达下层站台的世界时间为成绩；判负条件为超时或保安红色。
- **确定性。** 同 seed、同指导、同模型回复 ⇒ 同结果。所有随机数来自 `World.rng` 的派生流。

### A2. 阶段与路线

| 阶段 | 角色可用方式 | 由哪些子系统结算 |
|---|---|---|
| 取得车票 | 买票（现有）、逃票（不买）、索要 / 交换 / 说服 / 威胁（对话）、抢夺（肢体） | 物品、对话、肢体原语、警戒 |
| 安检 | 有包 / 无包通过；携带道具；制造动静；与安保肢体冲突 | 物品（背包）、安检设施、事件感知、保安 |
| 闸机 | 持票通行、翻越闸机或栏杆、利用注意力转移 | 闸机设施、`vault` 原语、警戒 |
| 楼梯 / 扶梯 | 走楼梯、乘扶梯、中途翻出、沿扶手滑下 | 新布局、`traverse` / `vault` / `slide_handrail` 原语、碰撞事件 |
| 全程排队 | 正常排队、请求让位、给好处、强行插队；NPC 也会插队 | 队列、对话、`force_cut_in` 原语、警戒 |

**不买票本身不会被查。** 闸机仍会拒绝无票刷卡（设施行为，不产生警戒）。保安只对实际感知到的行为反应。

### A3. NPC：形象、性格、处境、记忆

每名 NPC 开局由 seed 生成 `Persona`（字段见 C3）：

BEHAVIOR-LAB-002 起，正式默认生成器从温和热心、胆小避事、强硬暴躁、重视公平、爱面子、随和灵活、急切冷淡七组性格组合采样并加入小幅扰动，替代全部性格集中于中间值的生成方式；赶时间/行李等类别偏移和显式旧测试脾气标记仍保留。模板源为 [personas.ts](../../src/sim/content/personas.ts)，生成实现为 [persona.ts](../../src/sim/persona.ts)。同版本同 seed 仍可复现；旧版本 seed 的人物组合不承诺跨版本相同，不回算旧报告。

- **外在形象（公开）**：外貌、衣着、携带物、动作与说话风格。角色可在视野内看到简述，`observe` 后看到详细描述。
- **稳定性格（隐藏）**：胆量 `courage`、虚荣 `vanity`、脾气 `temper`、公平意识 `fairness`、管闲事 `meddling`，取值 0–1。
- **当前处境（部分公开）**：赶时间、疲惫、同行者、行李；外显部分进入形象描述（“步伐很快”“拖着大箱子”）。
- **局内记忆（隐藏）**：`NpcMemory` 记录对谁做过什么、目击过什么、当前关注谁，按时间保留最近 N 条（推荐 12）。

**颜色表示受影响程度，性格决定具体反应。** 同一颜色下行为由 A5 的效用选择决定。

赛后报告可公开全部 Persona（推荐：复盘时展示，帮助玩家理解结果）。

### A4. 物品与背包

- 物品是实体：有 id、种类、位置（某人手上 / 口袋 / 背包、地面坐标、取物点）和**合法所有者**。车票也是物品。
- 道具只能从**取物点**或他人处取得，不能凭描述凭空出现。
- 槽位：口袋（车票、零钱等小件，不限数量）、双手（2 个）、背包（容量 4 单位，仅有包时）。
- 背包影响安检：有包时安检耗时额外 + 区间（推荐 [4, 7] 秒）；违禁品在安检被没收（推荐 +3 秒，不触发警戒）。
- 车票交付或被抢后，归属实际转移；闸机通过时车票被标记为已使用。
- 同一物品可被交付、丢下（产生声音）、投掷、用于肢体行为；效果由物品属性（C2 `ItemDef`）和原语共同决定。

起始配置（已确认 D1、D6）：角色口袋里有少量零钱，无其他道具；是否带背包在赛前选择，默认带包，局内可放下背包。

### A5. 警戒：白 / 黄 / 红与圆环

#### 状态机

| 观察者 | 状态 | 进入 | 即时反应（由性格选择） | 圆环满 | 消失 |
|---|---|---|---|---|---|
| NPC | 白 | 目击奇怪但无害的行为 | 看一眼、议论、保持距离 | → 黄 | 连续看不到对象 `npcWhiteClear` 秒 |
| NPC | 黄 | 自己受到影响；或白色圆环满 | 不满、争执、驱赶 | → 红 | 连续看不到对象 `npcYellowClear` 秒 |
| NPC | 红 | 感到危险 / 目击严重违规；或黄色圆环满 | 逃离、阻拦、求助 / 报告 | 不再升级 | 本局不消失 |
| 保安 | 黄 | 可疑行为、动静指向某人、收到报告；或巡查时看到对象 | 注视、靠近、调查 | → 红 | 连续看不到对象 `guardYellowClear` 秒**且**期间无新事实 |
| 保安 | 红 | 确认违规；或黄色圆环满 | — | — | **立即判负，不可解除** |

保安没有白色。

#### 统一规则

1. **只有具体事件才触发关注。** 正常走路、排队不亮点。
2. 状态是**有向的**：`(观察者, 对象)` 一对一条记录。NPC 对角色黄色，不影响它对其他 NPC 的态度。
3. **圆环只在观察者能看到对象时增长**，看不到时暂停（保留进度）并累计 `hiddenFor`；再次看到时 `hiddenFor` 清零。
4. 连续隐藏达到对应清除时间，白 / 黄回到无。红色不倒计时。
5. **升级时圆环清零。** 严重事件可直接跳级（目击翻越栏杆 → NPC 红；保安确认 → 红）。新事件只能升不能降。
6. **被惊动 ≠ 认出行为者。** 只听到声音或看到结果的人会转头看向现场（`lookAt`），保安会去查看，但不对任何人亮点。只有看到行为本身，或收到指明对象的报告，才建立对该对象的警戒。
7. **报告需要实际传递。** 红色 NPC 选择“报告”时必须走近保安或在喊话距离内且有视线，才产生 `report` 事件；保安收到后对被描述者进入黄色并前往最后已知位置调查，之后靠视线让圆环增长。报告不会直接让保安变红。
8. **击晕。** 被击晕的人在持续时间内不感知、不行动，圆环冻结。已红的保安在变红那一刻已经判负，不存在“击晕撤销”。击晕前保安若看到了攻击开始，直接红色判负。苏醒后若没看到攻击者，只进入“调查”状态。

#### 事件严重度 → 初始状态

| 严重度 | 示例事件 | 受害者（NPC） | 目击者（NPC，看到行为） | 保安（看到行为） | 只听到 / 只看到结果 |
|---|---|---|---|---|---|
| `odd` 奇怪 | 丢东西、在队边徘徊、观察他人很久 | — | 白 | 无 | 转头看 |
| `suspicious` 可疑 | 沿扶手滑下、扶梯中途翻出、在闸机旁逗留后突然加速 | — | 白 | 黄 | 转头看；保安去查看 |
| `affecting` 影响他人 | 推搡、东西砸到人、强行插队 | 黄 | 白 | 黄 | 转头看；保安去查看 |
| `danger` 危险 | 威胁、持物逼近 | 红 | 黄 | 黄 | 转头看；保安去查看 |
| `violation` 严重违规 | 抢夺、击打 / 击晕、翻越闸机或栏杆 | 红 | 红 | **红（判负）** | 转头看；保安去查看 |

强行插队按 `affecting`、威胁按 `danger` 处理，保安看到两者均为黄色、不直接判负（已确认 D4）。

#### 推荐参数（可调，放在 `ALERT_RULES`）

| 参数 | 推荐值 | 说明 |
|---|---|---|
| `npcWhiteFill` | 6 s | 白色持续看见对象多久升黄 |
| `npcWhiteClear` | 3 s | 白色连续看不到多久消失 |
| `npcYellowFill` | 8 s | 黄色升红 |
| `npcYellowClear` | 12 s | 黄色消失 |
| `guardYellowFill` | 5 s | 保安黄色升红（判负） |
| `guardYellowClear` | 15 s | 保安黄色消失（期间无新事实） |
| `npcSightRange` / `npcFovDeg` | 10 m / 140° | NPC 视野（保安沿用 12 m / 110°） |
| `shoutRadius` | 8 m | 喊话报告需在此距离内且有视线 |
| `knockoutSeconds` | 20 s | 击晕持续时间 |

#### NPC 反应选择（效用法，确定性）

对每个 `(NPC, 对象, 状态)` 第一次进入时选一次行为并记住，避免每帧抖动。候选与评分（推荐，`rng` 加 ±0.1 噪声）：

| 状态 | 行为 | 评分 |
|---|---|---|
| 白 | `glance` 看一眼 | 0.5 |
| 白 | `murmur` 议论 | 0.3 + 0.4·meddling |
| 白 | `keep_distance` 保持距离 | 0.3 + 0.4·(1−courage) |
| 黄 | `complain` 抱怨 | 0.4 + 0.3·temper |
| 黄 | `argue` 争执（停下、面对、短时阻挡） | 0.2 + 0.5·temper + 0.2·courage |
| 黄 | `expel` 驱赶（仅同队列或被插队时） | 0.3 + 0.6·fairness |
| 红 | `flee` 逃离（离开队列，远离对象 ≥ 6 m） | 0.3 + 0.6·(1−courage) + 0.2·fatigue |
| 红 | `confront` 阻拦（靠近、挡路，可尝试夺回物品） | 0.1 + 0.5·courage + 0.3·temper |
| 红 | `report` 报告（走向最近保安或喊话） | 0.2 + 0.4·meddling + 0.3·fairness + 0.3·[保安在 15 m 内] |

行为会产生新事件（争执声音、喊话），进入同一感知链。

### A6. 自由行动与 Boss 裁定

#### 角色的操作

- **基础操作（确定性执行，不调用 Boss）**：`move_to`、`join_queue`、`leave_queue`、`wait`、`traverse`（楼梯 / 扶梯）、`observe`、`take`、`give`、`drop`、`talk`。
- **自由行动 `act`**：一句自然语言，可组合多个操作或包含肢体行为。由 Boss 转为 `ActionPlan`。

#### Boss 的职责与边界

1. **解释**：识别对谁、用什么、做什么、目的，转成不超过 4 步的原语计划（C4 `PlanStep`，闭合列表）。
2. **不裁定成败**：Boss 只输出计划；可行性（位置、物品归属、可达、持续时间）由模拟器在每步开始时校验；肢体行为的成功率由模拟器 `contest` 计算（C5）；NPC 是否答应由 NPC 对话（A7）决定。
3. **不可做**：凭空创造物品、修改他人记忆、给人物传递其未感知的信息、临时增加规则或惩罚、宣布通关。
4. 无法映射时返回 `unsupported`（附原因），或 `needs_precondition`（如“需要先拿到雨伞”）。

#### 执行模型

- 每个原语是**持续动作**：`approach`（走到可及距离）→ `perform`（持续 `duration` 秒，期间对外发出“进行中”事件，能被看到）→ `settle`（结算效果，重新校验前置条件）。
- 中断条件：目标离开可及距离、目标反抗 / 逃离、执行者被推开或击晕、设施状态改变、角色发出新动作。中断后触发 `action_failed` 决策。
- 计划逐步执行；任一步失败即停止并把原因反馈给角色。

### A7. 对话（交谈、索要、交换、说服、威胁、让位）

- `talk(npcId, message, goal, offerItemId?)`；goal ∈ `chat | ask_ticket | trade | yield | persuade | threaten | bribe`。
- 前置条件：3 米内、可见、可达；同一 NPC 每局最多 3 轮（沿用）。
- NPC 回复由 NPC 对话模型基于 Persona（含隐藏性格）、当前警戒、记忆、持有物生成；输出 `decision`（C6）。
- 模拟器执行决定：只有 NPC 实际持有的物品才能交出；`accept` 交易时双方物品对换；`yield` 只移动到该 NPC 前方（沿用现有让位）。
- BEHAVIOR-LAB-002 修正赠送：`persuade` 和 `chat` 也允许 NPC 明确自愿赠送实际持有的物品；不再按这两个 goal 一概拦截交票。仍须同意、未使用、容量可接收，且转移原子执行；合法赠送同时变更合法所有者。拒绝、虚构物品和已使用票不会转移。纯 `yield` 仍只表示让位，不夹带物品交付。
- **威胁本身是事件**：无论 NPC 是否屈服，`threaten` 都按 `danger` 严重度进入感知链（受害者红，目击者黄）。
- 离线模式：用基于性格的启发式代替模型（不再一律拒绝），保证离线可玩。

### A8. 保安行为

状态：`patrol`（沿用路线）→ `investigate(point)`（走到事件点，环顾 4 s，返回）→ `watch(subject)`（保安黄色：面向、靠近到 3 m，圆环增长）→ 红色即判负；另有 `incapacitated(remaining)`。

新增**安检员**：每条安检通道一名固定保安（同一系统，角色 `security_staff`），负责安检处的肢体冲突与可疑动静。

### A9. 环境事件链

所有局部变化都走同一条链：**世界改变 → 事件 → 感知 → 警戒 → 反应 → 新事件**。

- 丢东西：`item_dropped`（`odd`，声音半径取物品 `dropNoise`）。
- 投掷 / 碰撞：命中人则 `affecting`。
- 设施损坏、断电：先改变设施状态与照明（断电区域视野半径 ×0.5），再产生全局可听事件，保安调查，乘客转头 / 绕行。
- 爆炸、增援：后续扩展；增援也必须实际到场。

### A10. 时限与预算

- 时限正式为 150 秒。IV2-18 离线 50 seeds 在 120/150/180 秒下分别通关 6/21/32 局；用户于 2026-10-31 明确选择 150 秒以保留赶车压力。旧报告保留当局 settings。
- 推荐预算：角色决策 80 次 / 局；Boss 20 次 / 局；NPC 对话 30 次 / 局；模型输出预算现按上游 [Responses 规范](../MVP技术方案.md#17-responses-与思考设置responses-001)统一计算（含思考、文本和工具参数），不再单列 1024 token 思考上限。

---

## B. 技术设计

### B1. 技术栈结论

**沿用现有栈，不引入新运行时依赖。**

| 层 | 现有选择 | 交互 2.0 的用法 |
|---|---|---|
| 语言 / 构建 | TypeScript（`tsc --noEmit`）、Vite、esbuild、npm + `package-lock.json` | 不变 |
| 模拟 | 纯 TS，固定步长 `DT = 0.1`，`mulberry32` RNG | 新子系统都是纯 TS 类 / 函数；为 `Rng` 增加 `fork(label)` 派生独立随机流 |
| AI 服务 | Express 代理；Anthropic SDK + OpenAI 兼容客户端；`structured.ts` 严格 JSON schema；手写校验 | Boss 与 NPC 对话复用 `structured.ts` 模式与双供应商适配，不引入 zod 等新校验库，保持现有手写校验风格 |
| 前端 | React 18、R3F 8 / Drei 9 / three 0.170、Radix | 状态点与圆环用 Drei `Billboard` + three `RingGeometry`（`thetaLength` 表示进度）；台词气泡用 Drei `Html`；物品用简单几何体 |
| 测试 | Vitest（Node 环境），伪模型响应 | 每个子系统单测 + 固定场景的“剧本测试”（ScriptedAgent） |

不引入 ECS 框架、行为树库或物理引擎：人物数量 < 80，警戒与行为选择用表驱动 + 效用评分即可，保持可测与确定性。

### B2. 现状与目标对照

| 能力 | 现状（`main` `d4884a8`） | 目标 | 主要改动点 |
|---|---|---|---|
| 车票 | `Person.hasTicket` 布尔 | 物品实体，可转移 | 新 `src/sim/items.ts`；`hasTicket` 改为由物品推导；消费者见 B5 |
| NPC | `kind` + `irritable`，程序选队 | Persona + 记忆 + 反应行为 | 新 `persona.ts`、`npcBrain.ts`；`npc.ts` 只保留生成与选队 |
| 感知 | 角色 360° 视野；保安 `seenBy` 只看违规 | 统一事件总线 + 视觉 / 听觉 + 归因 | 新 `events.ts`、`perception.ts` |
| 警戒 | 无（保安看见翻闸即判负） | 白 / 黄 / 红 + 圆环 | 新 `alert.ts`；`creative.detect` 删除 |
| 保安 | 巡逻 + 听投诉转头 | 巡逻 / 调查 / 注视 / 击晕；安检员 | 重写 `guards.ts` 为 `GuardBrain` |
| 非常规行动 | `attempt_creative` → 分类到 `cut_in_line` / `jump_gate` | `act` → Boss → 原语计划 → 执行器 | 新 `src/sim/actions/`、`contest.ts`；删除 `creative.ts`；`intent.ts` 改为离线计划解析 |
| NPC 对话 | 仅插队协商 `negotiate` | 通用 `talk`（索要 / 交换 / 威胁…） | `negotiation.ts` → `dialogue.ts`；服务端 `npcRespond` |
| 楼梯 | 单楼梯 6 s | 楼梯 + 扶梯，翻出 / 滑扶手 | `layout.ts`、`nav.ts`、`Station.tsx` |
| 展示 | 人物、设施、轨迹 | + 状态点圆环、物品、气泡、事件链日志 | `src/ui/scene/*`、`presentation.ts` |
| 报告 | 决策、对话、违规列表 | + 警戒时间线、物品流转、Persona 揭晓、Boss 记录 | `GameReport` 增加**可选**字段 |

### B3. 模块结构（目标）

```
src/sim/
  engine.ts          单局入口；步进顺序见 B4；applyAction 路由到 ActionExecutor
  world.ts           人物、设施、队列（保留）；hasTicket 推导
  rng.ts             + fork(label)
  layout.ts / nav.ts 布局；+ ITEM_SPOTS、扶梯、栏杆
  scenario.ts        场景与 RULES；+ ALERT_RULES、BUDGETS
  content/
    items.ts         ItemDef 目录
    personas.ts      外貌 / 衣着 / 说话风格词库、性格分布
    alertRules.ts    事件严重度表、反应评分表
  items.ts           ItemSystem：生成、归属、转移、槽位校验
  persona.ts         generatePersona(rng, kind)
  events.ts          EventBus：emit / ongoing acts / 本帧事件
  perception.ts      PerceptionSystem：视觉、听觉、归因 → Percept[]
  alert.ts           AlertSystem：状态机、圆环、清除、判负信号
  npcBrain.ts        NPC 反应选择与执行；记忆
  guards.ts          GuardBrain：巡逻 / 调查 / 注视 / 击晕
  actions/
    executor.ts      ActionExecutor：计划队列、持续动作、中断
    primitives.ts    每个 PlanStep 的 validate / duration / settle
    contest.ts       肢体对抗成功率（确定性）
  dialogue.ts        talk 前置条件、请求构造、决定执行
  intent.ts          离线：自然语言 → ActionPlan（关键词）
  observation.ts     + inventory、people、items、guard 状态描述
src/agent/
  runner.ts          + act（Boss）、talk（NPC 对话）的子弹时间调用；预算
  agent.ts           + Interpreter、NpcResponder 接口
  heuristicAgent.ts  离线策略保持可通关
  remoteAgent.ts     + /api/boss/interpret、/api/npc/respond 客户端
server/
  tools.ts           新工具；IV2-19 已移除旧公开别名
  prompts.ts         固定知识：物品、取物点、背包、警戒语义（不枚举原语）
  boss.ts            interpretAction（结构化输出）
  npcDialogue.ts     npcRespond（结构化输出）
  app.ts             新路由；IV2-19 已移除旧路由
src/ui/
  presentation.ts    快照 + alerts、items、speech
  scene/AlertBadge.tsx、scene/Items.tsx、scene/SpeechBubble.tsx
  InventoryPanel.tsx、EventChainLog.tsx；render.ts（2D 调试）同步
```

### B4. 每帧步进顺序（`Engine.step`）

```
t += DT
1. npcs.spawnAndScript()        生成乘客、脚本事件（保留）
2. executor.step(player)        推进角色持续动作；进行中的动作向 EventBus 登记 ongoing act
3. npcBrain.step()              NPC 执行当前反应行为 / 选队（产生 argue、shout 等事件）
4. world.stepPeopleAndFacilities()  移动、队列、设施办理（保留）
5. guards.step()                巡逻 / 调查 / 注视 / 击晕计时
6. perception.step()            对本帧事件 + 进行中行为，计算每个观察者的 Percept
7. alert.step(percepts)         升级、圆环增长 / 暂停 / 清除；产出 guardRed 信号与新反应
8. npcBrain.onAlertChanges() / guards.onAlertChanges()  选择行为（下一帧开始执行）
9. 判定：guardRed(subject=player) → failed；到达站台 → success；超时 → failed
10. 生成角色触发：被打断、看到 NPC 行为变化（亮点对角色体现为可见行为）、受到对话请求等
```

顺序固定，保证确定性；所有系统只通过 `World` 与 `EventBus` 交互，不互相直接修改内部状态。

### B5. 迁移注意（避免破坏现有行为）

- **`hasTicket`**：消费者有 `world.ts`、`observation.ts`、`npc.ts`、`runner.ts`、`heuristicAgent.ts`、`JourneyProgress.tsx`、`shared/types.ts`（`SelfObservation.hasTicket` 保留为推导值）以及相关测试。先加 `ItemSystem.hasValidTicket(personId)`，`Person.hasTicket` 改为 getter，再逐个替换。
- **`attempt_creative` / `request_cut_in`**：过渡期曾映射到 `act` / `talk(goal: "yield")`，IV2-19 已停止公开和解析旧工具；旧报告中的 `CreativeMechanic` 类型保留只读兼容。
- **翻闸判负**：现有“保安看到翻闸即判负”改由 `vault` 原语 + `violation` 严重度 + 保安红色实现，行为等价，`tests/creative.test.ts`、`tests/gateWindow.test.ts` 应在改造后继续通过（期望文本可调整，判定不可变）。
- **固定对局设置**：`/api/session` 当前拒绝非默认设置；新增的赛前选择（背包）走独立字段 `loadout`，不复用 `settings`。
- **报告兼容**：`GameReport` 新字段全部可选；`ReportView` / 回放对缺字段的旧报告照常显示。

### B6. 模型调用与预算

- Runner 串行化所有模型调用：同一时刻最多一个请求；请求期间 `phase = "thinking"` 冻结世界（现有机制）。
- `act` 流程：角色决策 → Boss `interpret`（冻结）→ 执行器校验 / 执行（世界运行）→ 计划中的 `talk` 步骤再调用 NPC 对话（冻结）。
- 失败兜底：Boss 不可用 → 离线关键词解析；NPC 对话失败 → 离线性格启发式，并在记录中标注 `source`。
- 记录：Boss 与 NPC 调用都进入 `RunDebug.attempts`（`operation: "interpret" | "npc_respond"`），保留原始输出，便于复盘与计费。

### B7. 确定性与测试策略

- `Rng.fork(label)`：以构造种子 `seedBase ^ fnv1a(label)` 构造新流，不消耗父流；同一 label 每次调用都会重置为相同初态。persona、contest、reaction、items 各子系统在每局初始化时只派生一次并复用该子流，不能每次判定或生成 NPC 时重新 fork 固定 label。按实体派生时使用稳定唯一 label（如 `persona:${personId}`），保证确定性并避免重复抽样相关；新增系统不改变原有乘客生成序列。
- 单元测试：每个子系统独立（见 tasks.md 各任务）。
- **剧本测试**：`tests/fixtures/scenarios.ts` 提供可注入的小场景（`Engine` 增加 `scenarioOverride` 测试入口），配合 `ScriptedAgent` 按时间脚本发出动作，断言事件链与结局。垂直切片验收的六个场景都写成剧本测试。
- 回归：离线启发式 Agent 在 seed 1–20 仍能在时限内通关（比例不低于改造前，基线在 IV2-01 中记录）。

---

## C. 接口契约

以下类型是各任务并行开发的约定，由 IV2-01 落到 `src/shared/interaction.ts`（共享）与 `src/sim/*`（模拟内部）。字段名可在 IV2-01 中微调，但调整须同步本文。

### C1. 基础

```ts
// src/shared/interaction.ts
export type AlertLevel = "none" | "white" | "yellow" | "red";
export type ObserverRole = "npc" | "guard" | "security_staff";
export type Severity = "odd" | "suspicious" | "affecting" | "danger" | "violation";
export type EntityRef = { kind: "person" | "item" | "facility" | "node" | "spot"; id: string };
```

### C2. 物品

```ts
export type ItemKind = "ticket" | "coins" | "umbrella" | "water_bottle" | "newspaper" | "snack" | "backpack";

export interface ItemDef {
  kind: ItemKind;
  label: string;
  /** 背包占用单位；0 = 口袋小件。 */
  size: number;
  /** 丢下时可被听到的半径（米）；投掷为其 1.5 倍。 */
  dropNoise: number;
  /** 肢体行为加成 0–1（推、打、威胁的可信度）。 */
  impact: number;
  /** 交易 / 贿赂价值 0–1。 */
  value: number;
  security: "ok" | "inspect" | "confiscate";
  /** 拿在手里时他人能否看见。 */
  visibleWhenHeld: boolean;
}

export type ItemLocation =
  | { type: "held"; personId: string; slot: "pocket" | "hand" | "bag" }
  | { type: "ground"; pos: Vec }
  | { type: "container"; containerId: string } // 丢下的背包内物品；不可直接从远处取出
  | { type: "spot"; spotId: string };

export interface Item {
  id: string;            // "i1", "i2"…
  kind: ItemKind;
  location: ItemLocation;
  /** 合法所有者；被抢后不变，用于记忆与报告。 */
  ownerId: string | null;
  used?: boolean;        // 车票通过闸机后为 true
}

export interface ItemSpot { id: string; label: string; pos: Vec; stock: ItemKind[]; takeSeconds: number }
```

推荐起始目录（IV2-02 落库）：

| kind | size | dropNoise | impact | value | security |
|---|---|---|---|---|---|
| ticket | 0 | 0 | 0 | 0.6 | ok |
| coins | 0 | 4 | 0 | 0.4 | ok |
| umbrella | 1 | 6 | 0.5 | 0.2 | ok |
| water_bottle | 1 | 5 | 0.2 | 0.2 | inspect |
| newspaper | 1 | 1 | 0 | 0.1 | ok |
| snack | 1 | 2 | 0 | 0.3 | ok |
| backpack | — | 5 | 0.1 | 0 | ok（触发安检加时） |

### C3. 人物

```ts
export interface Persona {
  look: { build: string; outfit: string; carrying: string[]; manner: string; voice: string };
  traits: { courage: number; vanity: number; temper: number; fairness: number; meddling: number };
  situation: { hurry: number; fatigue: number; companionId: string | null; luggage: boolean };
}

export interface MemoryEntry { t: number; about: string | null; kind: string; text: string; eventId?: string }
```

`Person` 增加 `persona?: Persona`（角色无）、`incapacitated: number`（剩余秒）、`facing: number`（NPC 也需要朝向用于视锥）。

### C4. 事件、感知、警戒（模拟内部）

```ts
export type WorldEventKind =
  | "item_dropped" | "item_thrown" | "collision" | "push" | "snatch" | "strike" | "knockout"
  | "threaten" | "vault" | "slide_handrail" | "escalator_exit" | "force_cut_in"
  | "argument" | "report" | "facility_damaged" | "power_out" | "odd_behaviour";

export interface WorldEvent {
  id: string; t: number; kind: WorldEventKind; severity: Severity;
  actorId: string | null; targetId?: string; itemId?: string;
  pos: Vec;
  /** 可听半径（米），墙体遮挡时减半；0 = 无声。 */
  loudness: number;
  /** 引发本事件的事件，用于事件链展示。 */
  causeId?: string;
  /** report 专用：被描述的对象。 */
  aboutId?: string;
  aboutPos?: Vec; // 报告携带的最后已知地点，不跟踪对象隐藏的实时位置
}

/** 持续动作在执行期间登记；看到行为者即可归因。 */
export interface OngoingAct { actorId: string; kind: WorldEventKind; severity: Severity; targetId?: string; eventId: string }

export interface Percept {
  observerId: string; eventId: string; t: number;
  channel: "sight" | "hearing" | "report";
  role: "victim" | "witness" | "bystander";
  /** 只有看到行为或收到指明对象的报告才非空。 */
  attributedTo: string | null;
  pos: Vec;
}

export interface AlertRecord {
  observerId: string; subjectId: string; level: AlertLevel;
  ring: number;        // 0–1
  hiddenFor: number;   // 秒
  since: number; causeEventId: string;
  reaction: string | null;   // A5 选中的行为
}

export interface AlertSignals { guardRed: { guardId: string; subjectId: string; causeEventId: string } | null }
```

### C5. 行动计划与执行（Boss 输出，模拟校验）

```ts
export type TalkGoal = "chat" | "ask_ticket" | "trade" | "yield" | "persuade" | "threaten" | "bribe";

export type PlanStep =
  | { op: "approach"; target: EntityRef }
  | { op: "take"; itemId: string }                                 // 地面 / 取物点
  | { op: "give"; itemId: string; toId: string }
  | { op: "drop"; itemId: string; mode: "place" | "drop" | "throw"; at?: EntityRef }
  | { op: "talk"; npcId: string; message: string; goal: TalkGoal; offerItemId?: string }
  | { op: "snatch"; npcId: string; itemKind: ItemKind }
  | { op: "push"; npcId: string }
  | { op: "strike"; npcId: string; itemId?: string; aim: "knockout" | "hurt" }
  | { op: "vault"; obstacle: "gate" | "railing" | "escalator_side" }
  | { op: "slide_handrail" }
  | { op: "force_cut_in"; npcId: string }
  | { op: "make_noise"; level: "low" | "mid" | "high" }
  | { op: "wait"; seconds: number };

export interface ActionPlan {
  status: "plan" | "unsupported" | "needs_precondition";
  steps: PlanStep[];       // 1–4 步；status ≠ plan 时为空
  summary: string;         // ≤ 60 字，给玩家看
  reason: string;          // 不支持 / 缺条件的原因
  source: "llm" | "keywords";
}

export interface StepOutcome { ok: boolean; text: string; eventIds: string[] }
```

执行器接收模拟侧校验过的闭合步骤，最多 4 步；开始时保留计划副本。每帧先推进接近/持续阶段，感知处理后在 `finishFrame()` 再校验和结算，确保最后一帧仍能被目击。中断清理 ongoing act 与队列预约。现有闸机可执行；栏杆/扶梯/扶手已由 IV2-14/15 提供几何与结算；前置条件不满足时明确失败。

`contest`（`src/sim/actions/contest.ts`）推荐公式，概率夹在 [0.05, 0.95]，用每局初始化时创建并保留的 `contestRng = rng.fork("contest")` 连续抽样（每次判定调用 `contestRng.next()`，不得重新 fork）：

```
p = base[op] + 0.3·item.impact + 0.2·[目标未面向执行者] − 0.25·target.courage
    − 0.2·[目标对执行者已是红色] − 0.15·[目标为保安]
base: push 0.7, snatch 0.55, strike(knockout) 0.35, strike(hurt) 0.6
结果：success | resisted（目标反抗，产生 argument 事件） | interrupted
```

推荐持续时间：take 1.5 s（取物点按 `takeSeconds`）、give 1 s、drop 0.5 s、throw 1 s、snatch 1 s、push 0.8 s、strike 1 s、vault gate 2.5 s（沿用）、vault railing 3 s、slide_handrail 2 s、force_cut_in 1.5 s。

### C6. NPC 对话

```ts
export interface NpcDialogueRequest {
  npc: {
    id: string; look: Persona["look"]; traits: Persona["traits"]; situation: Persona["situation"];
    alert: { level: AlertLevel; cause: string | null };
    memory: string[];                    // 与说话者相关的最近记忆
    holdings: ItemKind[];                // 只列 NPC 实际持有的
    queue: { facility: string; position: number; length: number } | null;
  };
  speaker: { look: string; holding: ItemKind[] };   // NPC 看到的说话者
  goal: TalkGoal; message: string; offer: ItemKind | null;
  history: { message: string; reply: string; decision: NpcDecision }[];
}

export type NpcDecision = "accept" | "refuse" | "counter" | "comply_under_threat" | "flee" | "call_guard";

export interface NpcResponse {
  reply: string;              // ≤ 80 字
  decision: NpcDecision;
  give: ItemKind | null;      // 仅在 accept / comply_under_threat 时有效，且必须在 holdings 中
  want: ItemKind | null;      // counter 时想要的东西
  reason: string;
  source: "llm" | "offline" | "error";
}
```

模拟器只执行与 `holdings`、goal 一致的决定；`flee` / `call_guard` 等价于让该 NPC 进入红色并选定对应反应。现有 `CutInDialogueRequest` / `NpcReply` 在一个里程碑内保留并由 `yield` 适配。

模拟侧 `pendingDialogue` 保存到达后构造的请求，`dialogue.apply(response)` 再校验距离、持有物与轮数后结算；等待时 Engine.step 不推进世界时间。请求和回复历史由模拟器保存，单 NPC 最多三轮。交易所有物品转移原子完成；任何容量/持有校验失败均不交换。威胁在请求产生时登记 danger 行为，与回复是否同意无关。Runner 的网络编排由 IV2-10 接入。

### C7. 角色工具（新增 / 变更）

| 工具 | 参数 | 执行 |
|---|---|---|
| `traverse` | `route: "stairs" \| "escalator"` | 公开替代 `descend_stairs`；`walking?: boolean` 仅用于扶梯；旧名只在内部历史适配保留 |
| `observe` | `targetId` | 1 s；返回目标详细外观、可见行为、持有的可见物品 |
| `take` | `itemId` | 可及范围内的地面物品或取物点库存 |
| `give` | `itemId`, `npcId` | 交付；对方是否收下由对话 / 规则决定 |
| `drop` | `itemId`, `mode: place \| drop` | 放下 / 丢下（投掷走 `act`） |
| `talk` | `npcId`, `message`, `goal`, `offerItemId?` | 通用对话，替代 `request_cut_in` |
| `act` | `instruction`（≤ 200 字） | Boss 解释为 `ActionPlan` 后执行，替代 `attempt_creative` |

### C8. 观察（角色可见）

`Observation` 增加：

```ts
self.inventory: { id: string; kind: ItemKind; slot: "pocket" | "hand" | "bag" }[];
self.bag: { has: boolean; used: number; capacity: number };
self.action: { op: string; progress: number } | null;      // 当前持续动作
people: { id: string; look: string; distance: number; doing: string; towardYou: string | null; holding: string[] }[];
items: { id: string; kind: ItemKind; where: string; distance: number }[];   // 可见的地面物品与取物点
guards[].doing: string;    // "巡逻" / "朝 S2 方向走去查看" / "盯着你" / "倒地不动"
```

`towardYou` 是 NPC 对角色的**可见表现**（“看了你一眼”“在和你争执”“惊慌后退”“朝保安跑去”），不暴露颜色、圆环数值或隐藏性格（已确认 D2）。

### C9. 报告（全部可选字段）

```ts
GameReport.alerts?: { t: number; observerId: string; subjectId: string; from: AlertLevel; to: AlertLevel; cause: string }[];
GameReport.items?: { t: number; itemId: string; kind: ItemKind; from: string; to: string; how: string }[];
GameReport.worldEvents?: WorldEvent[];
GameReport.personas?: Record<string, Persona>;     // 赛后揭晓
GameReport.boss?: { t: number; instruction: string; plan: ActionPlan; outcomes: StepOutcome[] }[];
```

### C10. HTTP 接口

| 路由 | 请求 | 响应 | 备注 |
|---|---|---|---|
| `POST /api/boss/interpret` | `{ sessionId, instruction, context: BossContext }` | `ActionPlan & { debug }` | 无模型时 200 返回关键词解析结果 |
| `POST /api/npc/respond` | `{ sessionId, request: NpcDialogueRequest }` | `NpcResponse & { debug }` | 无模型 503，客户端走离线启发式 |
| `POST /api/session` | 增加 `loadout?: { backpack: boolean }` | 不变 | 校验同 `settings` 风格 |
| `/api/creative/classify`、`/api/npc/negotiate` | 已移除 | HTTP 404 | IV2-19 完成；调用方迁移到 `/api/boss/interpret`、`/api/npc/respond` |

`BossContext`：角色位置与持有物、视野内人物（含 id、外观、位置、持有可见物品）、可见物品与取物点、设施状态、玩家原始指令。Boss 只需要能把指令中的指代（“那位穿红衣服的乘客”）解析到 id；隐藏性格不提供给 Boss，以免 Boss 依据性格替角色挑软柿子。

### IV2-09 接口补充（实现同步）

BossContext 共享可见位置、人物外观/队列、物品 id 与设施；导航节点是公开固定知识。模型不得补造 id。严格 JSON Schema 的可选字段以 null 返回，服务端转为省略后校验。ActionPlan / NpcResponse 可附 debug、model、usage 元数据，不影响模拟器结算。新接口必须使用 session 绑定的同一角色模型配置；旧协商接口已在 IV2-19 移除；历史报告和模拟动作通过内部适配读取。错误计划降级关键词；不可用的在线 NPC 答复不授予许可。

### 第二阶段集成补充（IV2-13–19，2026-10-31）

由当前串行集成人依据用户“完成整个第二阶段”授权落实：`loadout?: { backpack: boolean }` 独立于固定难度 settings；省略默认有包。`traverse` 增加可选 `walking`，仅扶梯使用，站立 10 秒、步行 5 秒，楼梯保持 6 秒。内部继续兼容 `stairs` 活动标签，以可选 route/duration/end 表示两条路线，旧报告不需迁移。

C5 `strike` 增加设施分支 `{ op: "strike", facilityId: string, itemId?: string, aim: "hurt" }`，与 npcId 分支互斥；Boss 仅能引用可见设施，模拟器再次验证距离与状态后结算损坏。环境脚本新增 power（区域、持续时间）及 damage（设施 id），统一发出世界事件。断电视距系数 0.4，恢复后为 1；视觉与保安/NPC 连续追踪采用同一系数。以上扩展为原方案已有行为提供缺失表达能力，不允许模型直接提交世界状态。

安检起始调参：背包 +2 秒，每件 inspect 物品 +2 秒；没收物品移交到通道保管点并记录转移。安检后设置公开饮水架（免费），避免将未实现的收费流程伪装成售货机。时间参数最终以 IV2-18 的实际验证为准。

公开取物点 `spot` 引用与导航点一样按 layout 白名单校验，Boss 提示提供固定 id/坐标；可见物品 id 仍只允许 context 中实体。

C9 增量：报告还保存 `loadout`、`interactionDialogues`、`calls` 与 `operationUsage`。后者按 decision/retry/interpret/npc_respond 等操作累计调用、输入/输出 token、现实耗时及 unknownUsage，供应商未返回用量时不伪装为完整零费用。具体类型见 shared/types。

IV2-18 实测修复：`observe` 按 C7 消耗 1 秒并唤醒下一次决策，继续保持排队/移动状态；仅返回手持可见物品。Boss 提示重复给出闭合输出结构和 vault 示例，避免将翻闸误译为重复 approach。

IV2-18 兼容修复（先记录契约）：现有 OpenAI 兼容端对 Boss 的嵌套 anyOf 多分支原语持续只生成首个 approach 分支，显式 vault/strike 请求亦如此。传输 schema 改为单一闭合 step 对象（op 枚举、其余字段 nullable），解码后去除 null，仍用原 isPlanStep/引用校验执行。不改变运行时 ActionPlan；人物/设施 strike 互斥校验保持。授权依据为本任务真实验收发现缺陷的修复范围。

BossContext.people 补充可选 `holding: ItemKind[]`，只列手中可见物品，旧调用省略仍兼容。用于落实 C10 可见持物，不暴露口袋/背包内容；对应真实抢票 probe 仅安排公开手持车票。

### 与最新 main 的集成（IV2-PR-001）

本节更新此前基线说明：保留 main `331bdec` 已合入的可选时限与统一 Responses 接口，默认时限为用户选定的 150 秒；`settings` 可选择 60–300 秒整数，初始额外客流仍固定 3 人，背包继续走独立 `loadout`。角色、Boss、NPC 使用创建对局时绑定的同一模型、地址、凭据、思考档位及总输出预算；独立 `NPC_*` 配置停用。

地图沿用上游 90 米站厅，楼梯入口 `(61,9)`、扶梯入口 `(61,22)`，入口侧边导航点 `(61,20.8)`，出口 x=73。扶梯使用上游 `TransitSystem` 的 FIFO 候梯、1 秒放行和并行乘坐，活动类型为 `escalator`，含 duration/remaining；站立 10 秒、步行 5 秒指无阻挡的乘坐时间，排队和物理阻挡另计。侧出按现位置转入楼梯，碰撞失败恢复乘梯；旧 `stairs` 扩展字段及报告继续兼容。模拟器夹具注入场景时不生成额外商业/扶梯背景客流，常规对局保留上游客流。

保留正式站厅与角色素材、相机和失败复盘；新增物品、警戒、断电展示及交互报告。旧 HTTP/工具入口仍移除，公开动作使用 `act`、`talk`、`traverse`；内部历史适配只供旧调用与报告。此次消费者、软件/浏览器和离线结果见 [集成验证](../validation/IV2-PR-001.md)。历史真实模型证据不能视作 Responses 集成版复验。

### BEHAVIOR-LAB-004：用户授权的指令保真和动作规则增量

2026-10-31 用户确认实施修改方案，要求能核对原文到执行计划的转化路径、语言/动作自由先后、0.5秒击打、无防备高击晕率，并追加模型连接本地保存。此段覆盖此前四步与1秒击打限制；仅本地实现，未合入。

- 内部计划最多八步；步骤默认按序，可用 when 表达前次对话拒绝、前步成功或目标失能/拒绝条件。紧跟持续动作的 talk 可用 timing=with_previous 在该动作执行阶段同时开始；对话与接近不能作为同时语言的前置步骤，非法组合明确拒绝。旧步骤及缺省字段保持原顺序。
- PhysicalAction 增加 speechTiming=before/after/during；旧数据省略时保持 before。共享执行器、解释器和工具共同支持 restrain/release。控制仅支持乘客，成功后限制移动约3–8秒；超过1.8米、控制者失能或到期解除，同一控制者最多控制一人。控制不等于失能；保安控制尚不支持，需显示前置限制。
- 人物/设施 strike 均改0.5秒。普通乘客在攻击开始前无防御警戒（none/white）时，命中率95%，命中后的击晕率默认90%；实际命中和击晕分别抽样。已有防备或保安仍走原反抗因素；成功击晕持续20秒。攻击开始是尝试事件，击晕另有实际事件；视觉感知保持视野/遮挡约束。
- 追近可选，最多两次重新接近，开始追近后整个动作累计6秒上限，重新尝试需完整耗时；碰撞/可见性不绕过。失能者可以被取走实际持物，不能对话；无物品或无容量不能凭空交付。强迫取票的补充动作会显示推导说明，仅在失能或对话拒绝后尝试。
- 解释器返回 translation 观察信息；实验台保留原文、角色实际参数、解释器原计划、程序修正、要求映射和最终计划。匹配不等于成功，不明表达保留待核对。自动修正是有界关键词/顺序核对，不声称任意自然语言完整理解；复杂条件会明确拒绝而非无条件执行。
- 用户授权模型地址、密钥、模型和思考档位保存到当前浏览器站点本地存储，启用后保存，有效会话刷新恢复；过期保留填写内容、提示重新启用，不在刷新时自动付费验证。可清除，测试导出不包含连接设置。不同端口/站点的存储相互独立。

软件检查及用户实际验收边界见 [BEHAVIOR-LAB-004](../validation/BEHAVIOR-LAB-004.md)。

### BEHAVIOR-LAB-008：可观察事件与寻找目标

用户确认执行后，本地接入已目击购票/离队/物品交接事件、人物活动及设施在办者ID。仅记录角色当时可见的事实；手持列表为空不代表口袋没有票，漏看的购票不回填。

明确的“刚购票者/刚取得物品者/刚离队者/持票者”描述可先进入共用PersonSearch准备，再将已确认人物及证据交给原动作解释。准备阶段不默认问话，不为每次等待调用模型；40秒世界时间上限，证据最多60秒/80条。失去视野只保留最后目击位置，不读取隐藏实时位置。程序准备来源、解释器原始状态/理由及程序修正分别记录。多目标/复杂措辞不承诺全部识别，实际动作仍由模拟器裁定。

实现与验证边界见[BEHAVIOR-LAB-008](../validation/BEHAVIOR-LAB-008.md)；测试页新增ticket-buyer场景，正式运行器复用同一准备机制。后端更新需重启对应BAT，新局才使用新提示。
