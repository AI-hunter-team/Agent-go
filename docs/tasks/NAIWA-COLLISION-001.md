# NAIWA-COLLISION-001：奶蛙保安碰撞体修复

状态：待集成

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | NAIWA-COLLISION-001；为奶蛙保安补齐与实际模型占用范围匹配的移动碰撞体，消除角色穿过保安模型的问题 |
| 交付物与完成条件 | 保安与玩家/NPC 的移动保持碰撞间距；回归测试覆盖保安尺寸和玩家横穿；类型检查、测试、构建结果如实记录 |
| 单一负责人 | 本次 Codex 会话；在独立 worktree 实施并提交 PR |
| 集成负责人 | 待确认 |
| 基线 | `origin/main`，`1032a9155aec1801249054da63a98ffbbd96b093`，2026-10-31 |
| 任务分支与工作区 | 独立 Codex worktree；当前 checkout 从上述基线 detached HEAD 开始，提交后推送任务分支 |
| 前置任务与资源 | 依赖现有 `GuardSystem`、`World.collisionBodies`、`movement` swept collision；无需凭据 |
| 规范与接口依据 | `src/sim/movement.ts`、`src/sim/guards.ts`、`tests/movement.test.ts`；奶蛙模型为 `public/models/naiwa-security.glb` |

## 路径边界

- 允许修改：`src/sim/movement.ts`、`src/sim/scenario.ts`、`tests/movement.test.ts`、`tests/guards.test.ts`、本简报、对应验证报告
- 明确排除：UI 模型资源、服务端、共享 API、其他任务文件
- 共享文件与顺序：移动模块和移动测试由本任务单独修改；无并行任务

## 设计与验证

- 当前保安复用普通角色半径 `0.32`，小于奶蛙模型的可见身体占用范围。
- 新增 `GUARD_COLLISION_RADIUS = 0.84`，通过 `personRadius("guard")` 统一用于路径规划、逐帧碰撞和测试。
- 将南侧巡逻终点收至 `y=23.75`，避开座椅碰撞体膨胀后的 clearance，确保保安仍能完成往返巡逻。
- 不改变视野、抓捕、共享 API 或模型资源，仅扩大保安移动占用空间。

## 交付

- 快速检查：`npm test -- tests/movement.test.ts`
- 完整检查：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`
- 浏览器实际验收：待 PR 集成后执行
- 验证报告：[NAIWA-COLLISION-001](../validation/NAIWA-COLLISION-001.md)
