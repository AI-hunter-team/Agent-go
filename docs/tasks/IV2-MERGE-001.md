# IV2-MERGE-001：规划修正与合入

状态：实施中（2026-10-31）。

## 目标与分工

- 单一负责人及集成负责人：本聊天 Codex 会话，串行执行。
- 基线：PR #21，`codex/iv2-plan` / `594965de18c155e82a1db8ac9655d75c05fd4823`；远端 main 已核实为 `257349aa7e63f2ed249b171361dabe02d23e992a`。
- 工作区：隔离 worktree `agent-go-iv2-plan-merge`，detached HEAD；修正提交推送至 PR 原分支。
- 授权：用户于本聊天要求 PR 无冲突后合并，并按计划开始第二阶段开发；包含本次规划修正、推送和合并，不包含部署或付费模型调用。
- 依赖：PR 原规划、当前源码、自动审查的两条意见；AI 意见由本次执行者核对，不冒充人工批准。
- 完成条件：补齐背包开局链路归属、明确随机子流生命周期，文档检查与 PR CI 通过，核实无冲突后合并；实施从 IV2-01 接续。

## 路径边界

- 允许：`docs/interaction-v2/tasks.md`（IV2-01 测试归属、IV2-13 loadout 链路）、`docs/interaction-v2/design.md`（随机流生命周期说明）、本简报、`docs/validation/IV2-MERGE-001.md`。
- 排除：源码、依赖、配置及其他任务记录；原工作区两份 LOCAL-RUN 未跟踪文件保持原样。
- 本任务不与其他任务并行修改共享文件；中央记录由后续 IV2-01 集成负责人更新。

## 设计与验证

- App 持有设置并启动远程会话/本地 Engine，IV2-13 必须拥有 App、GameSession、RemoteAgent 及会话契约的 loadout 透传部分。
- `fork(label)` 不消耗父流，每次从原 seed 生成同一子流；子系统每局只创建一次并保留状态，实体也可用稳定唯一 label 派生。
- 纯文档检查：相对链接、任务路径与接口一致性、完整 diff、`git diff --check`；不运行本地 npm 检查（无运行时变化）。
- 证据与状态见 [验证报告](../validation/IV2-MERGE-001.md)。回退：revert 本任务文档提交。

## 交接

- 当前：规划修正中，未合入。最终合并 commit 及下一任务基线由 IV2-01 记录。
- PR：[#21](https://github.com/AI-hunter-team/Agent-go/pull/21)。
