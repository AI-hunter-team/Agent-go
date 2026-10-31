# 交互 2.0：任务拆分、顺序与验收

状态：**规划已确认，任务待认领**（2026-10-31）。任务编号是工作入口，不代表已分配负责人或已排期。规则与接口见 [design.md](design.md)；开工前按 [任务简报模板](../templates/task-brief.md) 为每个任务建立 `docs/tasks/IV2-xx.md`，验证写 `docs/validation/IV2-xx.md`，流程遵守 [AGENTS.md](../../AGENTS.md) 与 [DEVELOPMENT](../DEVELOPMENT.md)。

## 给开发 Agent（Codex）的执行约定

1. 每个任务开工前：读 [README](README.md) 的已确认决定、[design.md](design.md) 中该任务对应章节，以及本页该任务条目；用 `git status --short --branch`、`git worktree list`、`git rev-parse HEAD` 记录基线。
2. D1–D8 已确认，按 README 的结论实现；相关常量和试玩参数集中在 `scenario.ts` / `content/*`。参数值仍是起始值，调整时在验证报告记录依据。
3. 只改本任务“允许路径”。共享文件（`src/shared/types.ts`、`src/shared/interaction.ts`、`src/sim/engine.ts`、`src/sim/world.ts`、`src/sim/scenario.ts`、`src/sim/layout.ts`、`server/tools.ts`、`server/prompts.ts`、`server/app.ts`）只有列出的任务可以改，且只改列出的部分。
4. 接口与 design.md C 节不一致时，先改 design.md 并在简报说明原因，再改代码。
5. 每个代码任务提交前：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`。纯文档任务做文档检查。
6. 不运行付费模型、不推送、不合并，除非任务简报写明了用户授权。
7. 行为改动必须有测试；剧本测试优先于“跑一局看看”。

## 依赖与并行

```
IV2-01 契约与脚手架
   ├─ IV2-02 物品 ───────────┐
   ├─ IV2-03 人设 ──────┐    │
   ├─ IV2-04 事件与感知 ─┼─ IV2-05 警戒 ─┬─ IV2-06 NPC 反应
   │                    │               └─ IV2-07 保安与判负
   │                    └───────────────── IV2-08 行动执行器（依赖 02、04；05 完成后接警戒）
   ├─ IV2-09 服务端 Boss / NPC 对话
   └─ IV2-11 展示层（先用快照桩，05 / 02 完成后接真数据）
IV2-10 Runner / 工具接线（依赖 08、09）
IV2-12 垂直切片集成（依赖 05–10；11 至少完成状态点）           ← 里程碑 M4
IV2-13 安检与背包 │ IV2-14 闸机与栏杆 │ IV2-15 楼梯扶梯 │ IV2-16 全程排队 │ IV2-17 事件链
IV2-18 时限复评与真实模型验收（需授权）
IV2-19 报告 / 回放 / 复盘与旧接口清理
```

**单个 Codex 串行时的推荐顺序**：01 → 02 → 04 → 03 → 05 → 07 → 06 → 08 → 09 → 10 → 11 → 12 → 14 → 13 → 16 → 15 → 17 → 19 → 18。

**多人并行时**：第一批 02 / 03 / 04 / 09 / 11；第二批 05 / 08；第三批 06 / 07 / 10。IV2-13 与 IV2-14、IV2-15 都改 `layout.ts`，三者串行（14 → 13 → 15）或由集成负责人先合入布局改动。

## 里程碑

| 里程碑 | 包含任务 | 完成标志 |
|---|---|---|
| M1 基础设施 | 01–04 | 物品、人设、事件感知可用；现有玩法与测试不变；离线通关率不低于基线 |
| M2 警戒与人物 | 05–07 | 白黄红与圆环运行；翻闸判负改由警戒实现且行为等价 |
| M3 自由行动 | 08–10 | `act` / `talk` / 基础物品操作可用；离线与伪模型均可跑通 |
| M4 垂直切片 | 11–12 | 设计提案的闭环：取道具 / 交涉 → 索要或抢票 → 状态点与圆环 → 目击和报告 → 保安调查与判负；六个剧本测试通过；浏览器可见 |
| M5 全流程接入 | 13–17 | 安检、闸机、楼梯扶梯、排队、环境事件都接入同一机制 |
| M6 验收与收尾 | 18–19 | 时限定稿、真实模型整局证据、报告复盘、旧接口移除 |

---

## 任务条目

每条的“允许路径”同时是该任务对共享文件的独占授权；未列出的共享文件不得修改。

### IV2-01 共享契约与测试脚手架

- **目标**：把 design.md C 节的类型落库，提供后续任务都要用的测试工具，记录离线基线。
- **允许路径**：`src/shared/interaction.ts`（新）、`src/shared/types.ts`（只加 `import` / 再导出与新的可选字段，不改旧字段语义）、`src/sim/rng.ts`（`fork`）、`src/sim/engine.ts`（只加构造参数 `scenarioOverride?: Scenario`，供测试）、`tests/fixtures/`（新）、`tests/helpers/scriptedAgent.ts`（新）、`scripts/offline-baseline.ts`（新）、`tests/rng.test.ts`、`tests/scriptedAgent.test.ts`、`tests/scenarioFixtures.test.ts`（契约与脚手架验证）、`docs/tasks/IV2-01.md`、`docs/validation/IV2-01.md`。
- **步骤**：
  1. 新建 `interaction.ts`，包含 C1–C9 的导出类型（模拟内部类型 `WorldEvent`、`Percept`、`AlertRecord` 也放这里，便于 UI 和报告复用）。
  2. `Rng.fork(label: string): Rng`：`new Rng(this.seedBase ^ fnv1a(label))`，`seedBase` 为构造时的种子；不得消耗父流。
  3. `Engine` 构造增加可选 `scenarioOverride`；`tests/fixtures/scenarios.ts` 提供“空站”“单队列 + 单保安”等最小场景构造器。
  4. `ScriptedAgent`：实现 `Agent`，按 `{ at: number | trigger, action }[]` 脚本返回动作。
  5. `scripts/offline-baseline.ts`：用 `HeuristicAgent` 跑 seed 1–50，输出通关数与平均用时，结果写进验证报告作为基线。
- **测试**：`tests/rng.test.ts`（fork 确定且不影响父流）、`tests/scriptedAgent.test.ts`、现有全部测试通过。
- **完成**：类型可被导入且 `tsc` 通过；基线数据入验证报告。

### IV2-02 物品系统与车票迁移

- **目标**：物品实体、槽位、取物点；车票改为物品且现有买票 / 过闸行为不变。
- **允许路径**：`src/sim/items.ts`（新）、`src/sim/content/items.ts`（新）、`src/sim/world.ts`（`Person` 增加物品相关字段；`hasTicket` 改为 getter；`completeService` 发车票物品；闸机消费车票）、`src/sim/layout.ts`（只加 `ITEM_SPOTS`）、`src/sim/npc.ts`（`hasCard` → 发车票物品）、`src/sim/observation.ts`（`self.inventory`、`self.bag`、`items`）、`src/agent/heuristicAgent.ts`（如需）、`src/ui/JourneyProgress.tsx`（如需）、相关测试。
- **要点**：
  - `ItemSystem` API：`spawn(kind, location, ownerId)`、`move(itemId, to)`（校验槽位：手 ≤ 2，背包容量 ≤ 4，无包不能放 bag）、`holdings(personId)`、`hasValidTicket(personId)`、`visibleItems(from)`。
  - 取物点推荐：售票厅便利架（报纸、零食、矿泉水）、长椅旁失物（雨伞）、安检后大厅自动售货机（矿泉水，需零钱，可放到 IV2-13）。坐标避开导航主路径。
  - 物品转移一律经 `ItemSystem.move`，并记录 `ItemTransfer`（供报告）。
- **测试**：`tests/items.test.ts`（槽位、容量、转移、车票使用）、更新 `world.test.ts`、`facilityFailure.test.ts`、`stairs.test.ts` 中的 `hasTicket` 用法；离线基线通关率不变。

### IV2-03 NPC 人设生成

- **目标**：每名 NPC 有 `Persona`，与现有 `kind` 一致（老人慢、赶时间者 hurry 高）。
- **允许路径**：`src/sim/persona.ts`（新）、`src/sim/content/personas.ts`（新）、`src/sim/world.ts`（只加 `persona` 与 `facing` 字段及 `addPerson` 的可选参数）、`src/sim/npc.ts`（生成时调用）、`src/sim/negotiation.ts`（`temperament` 改为由 traits 生成描述，保持旧接口）、测试。
- **要点**：词库生成外貌 / 衣着 / 说话风格（推荐各 8–12 项，符合“现代主义交通剧场”视觉方向，避免刻板化描述）；traits 用 `rng.fork("persona")` 按 kind 偏移的 Beta 近似分布；`irritable` 由 `temper > 0.6` 推导以保持兼容。
- **测试**：`tests/persona.test.ts`（同 seed 相同、kind 偏移成立、字段范围）；现有插队协商测试通过。

### IV2-04 事件总线与感知

- **目标**：事件登记、进行中行为、视觉 / 听觉感知与归因。
- **允许路径**：`src/sim/events.ts`、`src/sim/perception.ts`（新）、`src/sim/geometry.ts`（如需新几何函数）、`src/sim/scenario.ts`（只加感知参数）、测试。
- **要点**：
  - `EventBus.emit(e)`、`beginAct(act)` / `endAct(actorId)`、`drainFrame()`；事件 id 递增，`causeId` 链接。
  - 视觉：观察者视锥（NPC 140° / 10 m，保安沿用）+ `lineOfSight`；被击晕者不感知。看到 `actorId` 且该行为正在进行 → `attributedTo = actorId`。
  - 听觉：`loudness` 半径，穿过 `SIGHT_OCCLUDERS` 时半径减半；听到只产生 `lookAt`，不归因。
  - `role`：`targetId === observerId` 为 victim，否则看到为 witness，只听到为 bystander。
  - 性能：只对本帧事件和进行中行为计算；人数 ≤ 80 时每帧 O(观察者 × 事件)。
- **测试**：`tests/perception.test.ts`（柱子遮挡、视锥外不可见、听到不归因、墙后半径、被击晕不感知）。

### IV2-05 警戒系统

- **目标**：A5 的完整状态机与参数表。
- **允许路径**：`src/sim/alert.ts`、`src/sim/content/alertRules.ts`（新）、`src/sim/scenario.ts`（只加 `ALERT_RULES`）、测试。
- **要点**：`AlertSystem.step(percepts, canSee)`：先按严重度表升级（只升不降，升级清零圆环），再对白 / 黄记录按“当前能否看到对象”增长圆环或累计 `hiddenFor`；保安黄色清除还要求 `lastFactAt` 早于清除窗口；产出 `AlertSignals.guardRed` 与 `changes[]`（供 NPC / 保安选行为、报告记录）。`report` 通道对保安只到黄色。
- **测试**：`tests/alert.test.ts`：白→黄→红的计时；遮挡暂停保留进度；短暂躲开再回来进度仍在；连续隐藏达阈值清除；红色不清除；目击翻越直接红；保安黄色满 → `guardRed`；报告只到黄色。

### IV2-06 NPC 反应行为与记忆

- **目标**：A5 反应选择表与执行；记忆写入。
- **允许路径**：`src/sim/npcBrain.ts`（新）、`src/sim/npc.ts`（`decide` 改为在无反应行为时才选队）、`src/sim/world.ts`（只加 NPC 行为用的 `Activity` 变体：`reacting`）、测试。
- **要点**：行为执行：`glance` 改朝向 1.5 s；`murmur` / `complain` 发出台词事件（低音量）；`keep_distance` 路径避开对象 1.5 m；`argue` 停下面对 3 s 并发出 `argument` 事件；`expel` 阻止对象插入其前方；`flee` 离队远离；`confront` 靠近挡路，若对象持有其物品可发起 `snatch` 夺回（经 `contest`）；`report` 走向最近保安或喊话 → `report` 事件（`aboutId`）。被抢车票的 NPC 若未红色，回售票机重新排队。记忆每条 ≤ 40 字。
- **测试**：`tests/npcBrain.test.ts`：同颜色不同性格选不同行为；报告必须走近或在喊话距离内有视线；被抢票后重新买票。

### IV2-07 保安行为与判负迁移

- **目标**：巡逻 / 调查 / 注视 / 击晕；安检员；判负改由 `guardRed`。
- **允许路径**：`src/sim/guards.ts`、`src/sim/scenario.ts`（只加安检员定义）、`src/sim/engine.ts`（只改第 9 步判定与步进顺序中 guards / perception / alert 的接线）、`src/sim/creative.ts`（删除 `detect`，翻闸的事件登记由 08 接手；过渡期可保留调用）、测试。
- **要点**：`investigate` 优先级：报告 > 看到的可疑行为 > 听到的声音；同时只处理一个，最新更高优先级覆盖。`watch` 时向对象移动至 3 m 并保持面向。失败文案：“被{保安}确认{行为}，判负”。
- **测试**：`tests/guards.test.ts` 扩展：调查路径与返回；击晕期间不感知；击晕前看到攻击开始直接判负；`creative.test.ts`、`gateWindow.test.ts` 的判负结果不变。

### IV2-08 行动执行器、原语与对话执行

- **目标**：C5 原语的校验、持续、结算、中断；`contest`；`talk` 的模拟侧。
- **允许路径**：`src/sim/actions/`（新）、`src/sim/dialogue.ts`（新，吸收 `negotiation.ts`）、`src/sim/engine.ts`（只改 `applyAction` 路由与第 2 步）、`src/sim/creative.ts`（删除，插队让位迁入 `dialogue.ts` / 原语）、`src/sim/intent.ts`（离线 `parsePlan(instruction, context): ActionPlan`）、`src/sim/world.ts`（`Activity` 增加 `acting`）、测试。
- **要点**：
  - `ActionExecutor.start(plan)`；每步：`validate(world)` → `approach` → `perform(duration)`（`beginAct`）→ `settle`（再校验后改世界，`emit` 结果事件，`endAct`）。
  - 每个原语一个文件或一个表项：`validate`、`duration`、`settle`、`interruptIf`。
  - `talk` 步骤需要模型 / 离线回复：执行器在到达后挂起，产出 `pendingDialogue`，由 Runner 取走请求、拿到回复后调用 `dialogue.apply(response)`。
  - 离线 `parsePlan` 覆盖：拿 / 捡、给、丢 / 扔、说 / 要票 / 换、威胁、抢、推、打 / 击晕、翻闸 / 翻栏杆、插队、制造声音；指代按“最近的 / 穿 X 的 / 在 Y 排队的”匹配可见人物。
- **测试**：`tests/actions.test.ts`（每个原语的前置失败、中断、成功结算）、`tests/contest.test.ts`（概率边界、确定性）、`tests/intent.test.ts`（离线解析）、`tests/dialogue.test.ts`（只能交出持有物；威胁无论结果都产生事件）。

### IV2-09 服务端 Boss 与 NPC 对话

- **目标**：`/api/boss/interpret`、`/api/npc/respond`；双供应商结构化输出。
- **允许路径**：`server/boss.ts`、`server/npcDialogue.ts`（新）、`server/structured.ts`（只加 schema 与公共函数）、`server/openai.ts`、`server/claude.ts`（适配新操作）、`server/llm.ts`、`server/app.ts`（只加两条路由与 `loadout` 校验）、`server/security.ts`（如需）、`tests/boss.test.ts`、`tests/npcDialogue.test.ts`、`tests/server.test.ts`（追加）。
- **要点**：
  - Boss 系统提示：中立裁判；只能输出闭合原语；不能创造物品或替人物决定；指代不明返回 `needs_precondition`。输入用 `untrustedData` 包装（沿用安全做法）。
  - 服务端校验 `ActionPlan`：op 在白名单、步数 1–4、id 出现在 `BossContext` 中，否则降级为关键词解析并标注。
  - NPC 提示：扮演单个乘客；依据性格、警戒、记忆、持有物；`give` 必须在 holdings 中，否则服务端改为 `refuse`。
  - 调试日志与 `traceOperation` 沿用。
- **测试**：伪响应测试覆盖：合法计划、非法 op 降级、越权 id、NPC 交出未持有物被拒、无模型时的状态码。

### IV2-10 Runner、远程客户端与角色工具

- **目标**：角色可调用 C7 工具；Runner 编排 Boss 与 NPC 对话的子弹时间；预算。
- **允许路径**：`src/agent/runner.ts`、`src/agent/agent.ts`、`src/agent/remoteAgent.ts`、`src/agent/heuristicAgent.ts`、`server/tools.ts`、`server/prompts.ts`、`src/shared/debug.ts`（新 operation 名）、`src/ui/gameSession.ts`（注入新回调）、相关测试。
- **要点**：
  - `parseToolUse` 增加新工具；`request_cut_in` → `talk(goal: "yield")`、`attempt_creative` → `act`、`descend_stairs` → `traverse(stairs)`。
  - 提示词新增：物品与取物点（公开固定知识）、背包与安检耗时、“他人会对你的行为作出反应，你只能看到他们的表现”、“不买票本身不会被查”；**不**列出 Boss 原语清单。
  - 新触发：`action_interrupted`、`noticed`（视野内有人对你表现变化）、`spoken_to`。
  - 预算：`BUDGETS = { decisions: 80, boss: 20, npc: 30 }`，用尽后对应能力退化为离线。
- **测试**：`runner.test.ts` 扩展（act → 计划 → talk 挂起 → 回复 → 执行的冻结 / 恢复顺序）、`claude.test.ts` / `openai.test.ts` 工具解析、`heuristicAgent.test.ts` 通关回归。

### IV2-11 展示层

- **目标**：状态点与圆环、物品、台词气泡、背包 / 持有物面板、事件链日志、2D 调试图同步。
- **允许路径**：`src/ui/**`（除 `gameSession.ts` 由 10 负责的注入部分）、`tests/presentation.test.ts` 等 UI 测试。
- **要点**：
  - `presentation.ts` 快照增加 `alerts: { observerId, subjectId, level, ring }[]`（每个观察者只显示对角色的最高状态）、`items`、`speech`。
  - `AlertBadge`：头顶 Billboard 圆点（白 / 赭黄 / 砖红，沿用 `resources.ts` 色板）+ 外圈进度环；红色无环；保安无白色。
  - 观战者能看到圆环数值；角色 Agent 看不到（D2）。
  - 尊重 `reducedMotion`；冻结时动画停止（沿用 `session.frozen`）。
- **测试**：快照单测；浏览器验证见 IV2-12。

### IV2-12 垂直切片集成（M4）

- **目标**：把 02–11 接成设计提案的最小闭环，并用剧本测试锁定。
- **允许路径**：集成负责人；所有上述共享文件的冲突协调；`tests/scenarios/*.test.ts`（新）；`docs/开发计划.md`、`docs/ROADMAP.md`、本专题文档状态更新。
- **剧本验收**（全部用 `ScriptedAgent` + 固定场景，断言事件链与结局）：
  1. **索要成功**：取雨伞 → 找虚荣心高的乘客恭维并用零食交换车票（伪 NPC 回复 accept）→ 车票归属转移 → 持票过闸 → 通关；无人超过白色。
  2. **抢票被举报判负**：在售票队列抢票；受害者红，目击者红并选择报告；报告者走到保安附近喊话 → 保安黄、前往调查 → 看到角色 → 圆环满 → 红 → 判负。断言报告前保安未对角色亮点。
  3. **抢票后躲避成功**：同 2，但角色在保安黄色后躲到柱后连续隐藏超过 `guardYellowClear`，期间无新事实 → 保安黄色清除 → 通关；受害者红色保留到结束。
  4. **丢物引开注意后翻闸**：在闸机旁丢矿泉水 → 保安转头调查 → 角色在保安视野外翻闸 → NPC 目击者红但不判负 → 通关。
  5. **翻闸被保安看见**：行为与现有规则一致，立即判负（回归）。
  6. **背后击晕保安**：从背后 `strike(knockout)` 成功 → 保安倒地 20 s、不感知；目击 NPC 红并向另一名保安报告。另断言：若保安面向角色时开始击打，立即判负。
- **其他**：离线基线通关率不低于 IV2-01 记录；浏览器（`.claude/launch.json` 预览）中能看到状态点、圆环、物品和事件日志，截图入验证报告。

### IV2-13 安检与背包

- **允许路径**：`src/sim/world.ts`（安检办理耗时与没收）、`src/sim/layout.ts`（安检员站位、安检后售货机取物点）、`src/sim/scenario.ts`、`src/sim/content/items.ts`、`server/app.ts` 与 `src/ui/ControlPanel.tsx`（赛前背包选择，D1）、`src/ui/App.tsx`、`src/ui/gameSession.ts`、`src/agent/remoteAgent.ts`、`src/agent/runner.ts`、`src/shared/interaction.ts`、`src/shared/types.ts`、`src/sim/engine.ts`（仅 loadout 类型、状态与开局透传，不改其他语义）、测试。
- **要点**：背包选择由 App 持有，preview / start / 重试、RemoteAgent.create 与 `/api/session` 全链路携带 `loadout`，Engine 以同一配置初始化物品；省略时默认带包，保持旧调用兼容。共享文件只改 loadout 相关部分，由集成负责人在 IV2-10 完成后串行接入。有包安检加时；`inspect` 物品加时；`confiscate` 没收；安检员对安检口附近肢体冲突与可疑动静反应；绕过安检墙（`vault railing` 于安检口）为违规。

### IV2-14 闸机、栏杆与注意力转移

- **允许路径**：`src/sim/layout.ts`（栏杆段可翻越区域）、`src/sim/actions/`（`vault` 细分）、`src/sim/scenario.ts`、测试。
- **要点**：闸机与栏杆翻越的位置条件与耗时；保安调查期间的视野空档由感知自然产生，不写特判。

### IV2-15 楼梯与扶梯

- **允许路径**：`src/sim/layout.ts`、`src/sim/nav.ts`、`src/sim/world.ts`（`stairs` 活动泛化为 `traverse`）、`src/ui/scene/Station.tsx`、`src/ui/render.ts`、`server/prompts.ts`（布局段落）、测试。
- **要点**：扶梯与楼梯并列；扶梯站立较慢、可走动；拥堵时可 `vault escalator_side` 翻到楼梯（`suspicious`，可能碰撞 → `affecting`）；`slide_handrail` 2 s（`suspicious`）。终点仍是下层站台。

### IV2-16 全程排队与 NPC 插队

- **允许路径**：`src/sim/npc.ts`、`src/sim/npcBrain.ts`、`src/sim/actions/`（`force_cut_in`）、测试。
- **要点**：低公平意识、高赶时间的 NPC 以小概率插队，触发被插队者黄色与驱赶；角色强插按 `affecting` 处理；给好处 = `talk(goal: "bribe", offer)`。

### IV2-17 环境事件链

- **允许路径**：`src/sim/scenario.ts`（脚本事件）、`src/sim/world.ts`（设施损坏状态）、`src/sim/perception.ts`（照明系数）、`src/ui/scene/*`（灯光）、测试。
- **要点**：断电降低区域视野；设施损坏由 `strike` 设施或脚本触发；都通过事件进入感知链。爆炸、增援不在本任务。

### IV2-18 时限复评与真实模型验收

- **前置**：用户对付费模型调用的明确授权、可用凭据。
- **内容**：离线 seed 1–50 与真实模型若干局，统计用时分布与各路线（买票 / 索要 / 抢票 / 翻闸）可行性；提出时限建议交用户决定（D3）；记录费用、延迟、Boss / NPC 调用次数。

### IV2-19 报告、回放、复盘与旧接口清理

- **允许路径**：`src/agent/runner.ts`（`report()` 新字段）、`src/ui/ReportView.tsx`、`src/ui/TrajectoryReplay.tsx`、`src/replay/`、`server/app.ts`（移除旧路由）、`server/tools.ts`（移除旧别名）、相关测试与文档。
- **要点**：C9 字段；复盘页展示警戒时间线、物品流转、Persona 揭晓、Boss 计划与执行结果；旧报告兼容显示。

---

## 验收总表（M4 之后每次集成都要满足）

| 检查 | 命令 / 方式 |
|---|---|
| 类型 | `npm run typecheck` |
| 单元与剧本测试 | `npm test` |
| 构建 | `npm run build` |
| 离线回归 | `npx tsx scripts/offline-baseline.ts`，通关率不低于 IV2-01 基线 |
| 浏览器 | 预览中完成一局离线对局，截图包含状态点与圆环 |
| 真实模型 | 仅在授权后由 IV2-18 执行 |
