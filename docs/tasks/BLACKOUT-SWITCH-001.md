# BLACKOUT-SWITCH-001：Agent 操作电闸触发限时熄灯

状态：已合入（PR #45、PR #48）

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | BLACKOUT-SWITCH-001；只有 Agent 主动操作电闸时触发一段时间的熄灯，并在 3D 场景靠墙位置显示临时方盒子电闸 |
| 交付物与完成条件 | 新增 `operate_switch` 动作、模拟状态与倒计时、观察/提示词说明、3D 电闸占位模型和熄灯视觉反馈；相关测试及完整检查通过 |
| 单一负责人 | 本次 Codex 会话；使用 Codex 独立 worktree 实施 |
| 集成负责人 | 本次 Codex 会话，按用户授权创建 PR、解决冲突并合入 main |
| 基线 | 最新 `origin/main` `8849cd5e8100c3ba2125256d2034edaa414b20b8`，2026-10-31 |
| 任务分支与工作区 | PR 分支 `codex/agent-blackout-switch`；当前 worktree 基于最新 main 重建 |
| 前置任务与资源 | 现有断电感知/渲染机制、模拟动作工具、场景组件；不需要外部凭据 |
| 规范与接口依据 | `src/shared/types.ts`、`src/sim/world.ts`、`src/sim/engine.ts`、`server/tools.ts`、`server/prompts.ts`、`src/ui/scene/Station.tsx` |

## 路径边界

- 允许修改：`src/shared/`、`src/sim/`、`server/tools.ts`、`server/prompts.ts`、`src/ui/`、`tests/`、本任务简报和验证报告。
- 明确排除：依赖版本、部署和真实模型调用；主分支现有其他功能保持原样。

## 设计、决定与差异

- Agent 通过严格工具 `operate_switch` 主动操作固定电闸；模拟器校验距离、重复操作和当前状态。
- 成功后调用已有统一光照/感知链，设置全站限时熄灯；20 秒后自动恢复。该动作不由脚本自动触发。
- 电闸位于 `(4, 28)` 靠墙处；正式模型缺失时用方盒子和拨杆占位。

## 验证与交付

- 已通过：`npm run typecheck`、相关 49 项测试、`npm run build`、`git diff --check`。
- 完整 `npm test` 需在合入后复跑；浏览器/真实模型验收未运行。
- 验证报告：`docs/validation/BLACKOUT-SWITCH-001.md`。

## 交接

- PR #45 已于 `883b265` 合入 `main`。后续检查发现回退场景把电闸放在 `Device` 内会导致每个设施重复渲染；修复已移到 `StationFallback` 根组，已由 follow-up PR #48 独立合入。
