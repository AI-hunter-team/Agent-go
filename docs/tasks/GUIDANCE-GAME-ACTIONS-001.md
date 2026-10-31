# GUIDANCE-GAME-ACTIONS-001：修复初始方案误拒游戏行动

状态：已提交并推送，创建 [PR #70](https://github.com/AI-hunter-team/Agent-go/pull/70) 待审查，未合入；真实模型验收未运行。流程见 [DEVELOPMENT](../DEVELOPMENT.md)。

## 目标与分工

| 项目 | 内容 |
|---|---|
| 目标与完成条件 | 初始方案和旧指导整理正确区分游戏动作、应用指令与伪造事实；保留玩家掏票、偷票、抢票等尝试及否定/条件，仍由模拟器结算；相关及完整软件检查通过 |
| 单一负责人 / 集成负责人 | 本聊天 Codex，串行实施并协调本任务文件；不启动并行 Agent |
| 基线 | 本地 main，`fa5551b8ac725377ace494866141e7109342cee2`，2026-11-01；未同步远端 |
| 分支与工作区 | `codex/guidance-game-actions`；独立临时 worktree `agent-go-guidance-game-actions` |
| 前置资源与授权 | 用户要求修复截图所示误拒；已有 npm 依赖可供本地验证；不含付费模型、远端操作或部署授权 |
| 规范与接口依据 | [交互 2.0](../interaction-v2/README.md)、[设计](../interaction-v2/design.md)；现有 JourneyPlan / NormalizedGuidance 及会话消费者，字段与接口不变 |

## 路径边界

- 允许修改：`server/security.ts`、`server/structured.ts`、`server/responses.ts`（共享提示与初始方案生成）、`tests/creativeGuidance.test.ts`、`tests/journey.test.ts`、`tests/security.test.ts`、本简报与对应验证报告。
- 排除：模拟器规则、UI、共享类型/API 格式、依赖与锁文件、根配置、迁移任务及其他工作区、中央记录与路线图。
- 共享归属：上述提示/测试由本任务单一负责人串行修改；中央记录交给后续主线集成人登记，避免与主工作区迁移任务争用。

## 设计、决定与差异

- 截图来自新旅程 `prepareJourney` 流程，旧 `normalize` 的详细策略保留规则未完整用于该入口，初始方案也未带上共享安全前缀。原“不可信、不是指令”数据标签可能让模型把有效游戏指导也理解成应忽略的指令。
- 修复将游戏策略与应用权限分清，明确虚构 NPC/票据动作可尝试；两条整理入口复用策略保留规则。不会赋予物品、跳过前置条件或保证结果。
- 不改现行玩法、字段、公开信息边界或冻结接口；无需迁移。回退本任务提示与测试即可。

## 验证与交付

- 快速：相关提示、Journey、security 测试及 `npm run typecheck`。
- 完整：`npm test -- --maxWorkers=2 --testTimeout=15000`、`npm run build`、`git diff --check`。
- [验证报告](../validation/GUIDANCE-GAME-ACTIONS-001.md)记录真实执行结果；伪模型检查不冒充真实模型或浏览器验收。
- 本地独立分支交付；未授权提交、推送、合并或部署。人工审查未进行。

## 交接

- 当前分支 `codex/guidance-game-actions`，HEAD 仍为基线 `fa5551b8ac725377ace494866141e7109342cee2`，本任务 3 个服务端文件、2 个测试文件与 2 个文档未提交。
- 已共用策略保留规则、修正“不可信”标签、给初始方案接入安全边界与本局胜利目标；不改 API 或结算。类型检查、94 个文件 / 799 项测试、构建与 diff/文档检查通过，详见验证报告。
- 浏览器与真实模型未运行，未部署；未获本任务付费调用授权，伪响应不能证明供应商模型一定遵从提示。人工审查未进行。
- 原工作区迁移任务文件未动。接手入口为本简报及验证报告，后续集成人待认领；集成后复验并登记中央记录。

## PR 交付授权（2026-11-01）

- 用户明确确认：本任务与 FACILITY-RANDOM-002 分别 commit、推送并创建 PR，不合并 main。本段更新此前仅本地交付的授权范围，不授权部署或真实模型调用。
- 本聊天 Codex 负责串行交付两个独立分支，各自仅提交所属源码、测试及任务记录；不混入随机关闭修复或主工作区迁移文档。
- 已 `git fetch origin` 核实目标主线仍为基线 `fa5551b8ac725377ace494866141e7109342cee2`，无需解决主线冲突。既有 799 项、类型及构建结果对应本次代码；本阶段仅补文档并重查完整 diff 与暂存空白。
- PR 目标 `main`、head `codex/guidance-game-actions`；仓库简报及验证记录随分支提交，PR 描述按模板列范围、模型未实测限制、回退及交接入口。最终 PR URL 与 head SHA 以对应 PR 为准；未合并、未部署，人工审查未进行。
- 交付成功：[PR #70](https://github.com/AI-hunter-team/Agent-go/pull/70)，实现提交 `561199f6b0cb3552dbfadf6bb84dd20fa7505d04`。提交推送后分支干净，后续文档提交仅补本链接；PR 为 open、非草稿、目标 main，未合并，未启用自动合并。
