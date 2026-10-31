# Station Map Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 实现已确认的安检后商业大厅、可抵抗注意力干扰与动态拥挤扶梯。

**Architecture:** 地图定义统一驱动导航和两种展示。世界负责关注及下行的实际时间、排队和位置；模型只提交动作，观察保持局部可见。复用已接续的失败复盘实现，以事件及互斥耗时分类传递依据。

**Tech Stack:** TypeScript、React、R3F/Three.js、Express、Vitest；保持既有依赖。

**Spec:** [MAP-ITERATION-001](../../tasks/MAP-ITERATION-001.md)，包括用户在本次聊天确认的地图与执行授权。

## Global Constraints

- 商业设施位于安检后、闸机前；普通寻路不能跨层。
- 关注自愿且可打断，模型思考暂停世界，不计作分心。
- 扶梯实际 FIFO，候梯可离队，上扶梯不可中断；隐藏队列不进入局内观察。
- 旧观察/旧报告兼容；复盘经验必须经玩家采纳，不自动应用。
- 保留既有依赖、120 秒挑战；无远端、部署或付费模型操作。

## Review Focus

- 队尾移动、满队和退出后不会产生重复乘客、越过闸机或重复占位。
- 无效动作及冷却中的关注请求保留当前队列/活动；结束时有准确的关注耗时。
- 视野外吸引物及扶梯队伍不泄露，信息屏只给公开信息。
- 未关注设施时普通步速与计时不变；关注活动不与行走耗时重复累计。
- 摄像机、角色高度、2D 回放及旧报告在扩大地图后仍可用。

### Task 1: Simulation and local observations

**Files:** `src/sim/{layout,world,npc,observation,engine,nav,negotiation}.ts`、新增 `src/sim/transit.ts`、`src/shared/types.ts`、`tests/{stationMap,attractions,escalator}.test.ts` 及旧楼梯/导航夹具。

**Interfaces:** 地图导出 `ATTRACTIONS`、`ESCALATOR_TOP/BOTTOM` 和时长/入口间隔；`World.inspectAttraction(person,id,mode)`、`world.transit.join(person)` 返回错误文字或 null；观察可选 `attractions`/`routes`，动作 `take_escalator`/`inspect_attraction`。

- [x] 写行为测试：设施只能在安检后闸机前访问；不能穿越实体或绕过下行；关注自愿、减速/停留、可取消及冷却；扶梯 FIFO/容量/离队/坐满四秒，种子重现，观察可见性。
- [x] 运行 `npm test -- tests/stationMap.test.ts tests/attractions.test.ts tests/escalator.test.ts`，确认因缺少行为失败。
- [x] 实现地图、关注、独立下行队列及 NPC 流、局部观察与互斥时间分类；按新布局迁移旧夹具，保留原行为断言。
- [x] 运行该组测试及现有模拟器测试，随后完整测试；检查失败来源，修复实际回归。

### Task 2: Agent tools and review evidence

**Files:** `server/{tools,prompts,review}.ts`、`src/agent/{heuristicAgent,runner,reviewRecorder}.ts`、`src/shared/review.ts`、相关工具/路线/报告/复盘测试。

**Interfaces:** `inspect_attraction` 参数严格验证，`take_escalator` 无额外参数；HeuristicAgent 只使用观察中的路线；报告保留互斥 `escalator`/`distraction` 和实际事件。

- [x] 写工具非法参数、未知目标、路线成本、无全局队伍读取、复盘投影保留新耗时/事件的失败测试。
- [x] 运行相关测试确认失败；实现工具/提示、离线选择、报告及复盘事实投影。
- [x] 运行类型检查、相关测试及完整测试，确认旧模型伪响应和旧报告兼容。

### Task 3: Scene, UI and end-to-end validation

**Files:** `src/ui/scene/{Station,GameScene,cameraCollision}.tsx/ts`、新商业设施展示组件、`src/ui/{render,presentation,JourneyProgress,ReportView,format}.ts/tsx`，展示/流程/报告测试、文档及验证记录。

**Interfaces:** 展示从同一地图/世界快照读取，不改变模拟事实；两条下行高度一致；动作日志、当前流程与报告显示关注和扶梯。

- [x] 写展示快照、流程状态与报告分段的必要失败测试，运行并确认失败。
- [x] 实现有辨识度的玩具机、广告灯箱、花摊、信息屏、座椅及 NPC 现场；扩展两条下行与镜头取景，更新 2D 调试地图。
- [x] 完成 `npm run typecheck`、`npm test`、`npm run build`、`git diff --check`，本地浏览器覆盖两路线、注意力、候梯退出及复盘玩家采纳。
- [x] 记录证据及限制，一次全分支独立审查并处理重要发现，形成可审阅本地提交；不推送或部署。
