# TRAIN-BOARDING-002：站台 NPC 登车并从场景移除

状态：待集成。流程见 [DEVELOPMENT](../DEVELOPMENT.md)。

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | TRAIN-BOARDING-002；修复站台 NPC 堵在单一列车门口，令其分散到多个实际车门、完成登车后从世界中移除。 |
| 交付物与完成条件 | 更新站台/列车门位常量、NPC 站台行为和 Person 状态；加入登车回归测试；玩家到达站台即完成的既有规则保持不变。 |
| 单一负责人 | Codex（本聊天执行）；以本任务分支和验证报告交接。 |
| 集成负责人 | Codex（本聊天）；负责 PR、远端集成和合入。 |
| 基线 | `origin/main` / `5daacdb`，2026-10-31 已核实。 |
| 任务分支与工作区 | `codex/train-boarding-v2`；独立临时工作区。 |
| 前置任务与资源 | 最新列车/扶梯架构已在 `main`；无需凭据或外部服务。用户已明确授权提交、推送、创建 PR 并合并到 `main`。 |
| 规范与接口依据 | [文档导航](../README.md)、[开发流程](../DEVELOPMENT.md)、现行 `src/sim/layout.ts`、`src/sim/npc.ts`、`src/sim/world.ts` 及现有模拟测试。 |

## 路径边界

- 允许修改：`src/sim/layout.ts`、`src/sim/npc.ts`、`src/sim/world.ts`、`tests/trainBoarding.test.ts`、本任务简报和验证报告。
- 明确排除：UI、服务端、依赖锁文件、生产配置、中央工作记录及无关已有本地修改。
- 共享文件与顺序：`src/sim/world.ts` 为共享 Person 类型；先更新类型，再接入 NPC 行为并补回归测试。无其他并行任务依赖。
- 范围外发现：旧 PR #42 基于已过时架构，单独关闭并由本任务 PR 替代；不将旧分支改动带入本任务。

## 设计、决定与差异

- 为站台列车设置五个稳定门位。NPC 首次进入站台时按当前负载选择门位，之后保持分配，沿站台移动到对应门位。
- 到达登车阈值后将 NPC activity 设为 `done` 并从 `world.persons` 删除，避免继续占用门口碰撞体；玩家路径与结算规则不变。
- `Person.boardingDoor` 是内部模拟状态，不改变共享 API、动作工具或报告格式；无迁移需求。若需回退，恢复本任务四个代码/测试文件即可。
- 规范与实现差异：现有旧行为把所有已到站台 NPC 送往同一点并立即删除；本实现保留“登车后移除”的结果，但使用实际门位分流，解决门口阻塞。

## 验证与交付

- 快速检查：受影响 Vitest 文件及相邻移动/楼梯/扶梯测试；预期 NPC 可到达门位并被移除，且不回归移动系统。
- 完整软件检查：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`。
- 实际验收：本任务不调用真实模型；浏览器验收未运行，需在后续产品验收中确认视觉登车表现。
- 验证报告：[TRAIN-BOARDING-002](../validation/TRAIN-BOARDING-002.md)。
- 状态：实现完成；软件检查以报告为准；实际验收待浏览器；合入待 PR。
- 集成方式/目标：推送 `codex/train-boarding-v2`，创建目标 `main` 的 PR，检查 CI 后按用户授权合并，并在合并后复核 `main`。

## 交接（离开任务前填写）

- 当前分支：`codex/train-boarding-v2`；基线 `5daacdb`；提交前文件范围见上方。
- 已做：代码实现、登车回归测试及本地验证；未做：远端 PR、CI 和合入后复验。
- 关键决定：使用多个稳定门位并在登车后移除 NPC；不改变玩家结算。
- 接手入口：PR 描述与 [验证报告](../validation/TRAIN-BOARDING-002.md)。
