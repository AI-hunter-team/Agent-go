# IV2-RAILING-001：安检低栏杆翻越可达

状态：待集成（已提交并开 PR，未合入）。流程见 [DEVELOPMENT](../DEVELOPMENT.md)。

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | IV2-RAILING-001：修复“玩家指导要求翻安检栏杆，但角色 Agent 永远走不到可翻越位置”的缺陷 |
| 交付物与完成条件 | 售票厅侧存在可 `move_to` / `approach` 的低栏杆前节点；`vault(railing)` 在售票厅内自动先走到最近低栏杆段；解释器把 `approach` 安检后节点 + `vault(railing)` 的不可达组合时仍能翻越；相关自动化测试通过 |
| 单一负责人 | 任务发起者（Git 用户 undefim）；执行工具为 Claude Code 会话，接手方式见下方交接 |
| 集成负责人 | 待确认（`main` 的 PR 审查/合并人） |
| 基线 | 实现基于 `codex/iv2-phase2` @ `b663394d3b9787ff9f87710bfbd2c05709cb4758`；该分支已经 PR #32 合入 `main`，提交前变基到 `main` @ `81e9aafc`（2026-10-31 fetch 核实；本任务文件在两者间无变化） |
| 任务分支与工作区 | `codex/iv2-railing-vault`，独立 worktree `.worktrees/iv2-railing`；原 `.worktrees/iv2-phase2` 有他人未提交修改且落后远端 3 个提交，未改动 |
| 前置任务与资源 | 无；问题来源为一份真实模型对局报告（seed 78017401，原始文件不入库） |
| 规范与接口依据 | [interaction-v2 设计](../interaction-v2/design.md) 第 430、447、458 行（`vault` 原语、执行器前置条件、栏杆 3 s） |

## 问题与根因

对局报告 seed 78017401（指导：“没有道具就逃票并翻越栏杆”）中，Agent 8 次提交翻栏杆均被拒，最终 180 s 超时，仍在 S2 安检排队：

1. `vault(railing)` 要求 `24.2 ≤ x < 26` 且 `y ∈ [8,12] ∪ [18,21]`，但所有可走到的命名地点都不在该区域：`HALL_N` (19,8)、`HALL_C` (19,15)，走到 S1/S2 附近实际停在 (23.6,7.2)/(23.6,16.2)。拒绝文本为“请靠近安检墙的低栏杆段”。
2. 解释器把“走到栏杆边”翻译成 `approach CONC_N`（安检后大厅，墙另一侧），寻路失败，拒绝文本为“目标不可步行到达”。
3. 栏杆不是可见实体，解释器也曾因“没有栏杆 id”返回 `needs_precondition`。

## 路径边界

- 允许修改：`src/sim/layout.ts`、`src/sim/actions/executor.ts`、`server/boss.ts`、`server/prompts.ts`、`tests/actions.test.ts`、`tests/phase2Flow.test.ts`、本简报及 [验证报告](../validation/IV2-RAILING-001.md)。
- 明确排除：依赖、锁文件、UI、中央记录与路线图。
- 共享文件与顺序：`NAV_NODES` 为共享常量（nav 图、`move_to` 工具枚举、解释器、UI 渲染均消费）；经 PR 合入 `main`，由审查人协调。
- 范围外发现（未处理，供后续）：指导归一化凭空写出“150 秒内”而实际时限 180 s；决策上下文无截断（34 次决策共 1.22M 输入 token）；解释器 LLM 正常返回但计划被回退为 `keywords` 时提示“离线解析不支持”，掩盖真实校验原因；Agent 对已在身后的乘客重复请求让位。

## 设计、决定与差异

- 新增 `RAILING_APPROACHES`（`RAIL_N` (25.3,10)、`RAIL_S` (25.3,19.5)）并并入 `NAV_NODES`；新增 `atRailing()` 作为唯一位置判定。
- 执行器 `railingLead()`：玩家在售票厅且不在低栏杆段时，在 `vault(railing)` 前插入走向最近可达栏杆前节点的 `approach`；紧接 `vault(railing)` 的不可达 `approach` 被丢弃。已在节点 1 m 内仍不满足条件时不再插入，照常明确失败，避免循环。安检墙另一侧仍拒绝。
- 提示词：Agent 布局说明与解释器系统提示新增 `RAIL_N` / `RAIL_S` 及“直接 vault 即可”的说明。
- 规范与实现差异（待确认）：设计第 447 行写“前置条件不满足时明确失败”；本任务让售票厅内的栏杆翻越自动补走位，属于对该规则的放宽。需集成负责人/产品确认后再同步设计文档；未确认前不改写规范。

## 验证与交付

- 验证报告：[IV2-RAILING-001](../validation/IV2-RAILING-001.md)。
- 实现完成：是（已提交）。软件检查通过：是。实际验收（浏览器 + 真实模型）：未运行。已合入：否。
- 集成方式：分支 `codex/iv2-railing-vault` 推送后向 `main` 开 PR；按任务发起者要求只开 PR、不合并。
- 风险与回退：新增导航点参与可视图寻路，全部种子整局测试未变化；回退即撤销本分支改动。

## 交接

- 分支 `codex/iv2-railing-vault`，已变基到 `main`，修改已提交并开 PR（未合并）。
- 下一步：确认第 447 行规范差异；用真实模型复跑 seed 78017401 同一指导，核对 Agent 是否经 `RAIL_N`/`RAIL_S` 翻越及保安反应。
