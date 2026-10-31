# CHARACTER-JITTER-001：角色抽搐修复

状态：本地实现及预览交付完成；用户于 2026-10-31 提供排队角色截图并要求修复。

- 负责人及集成人：本聊天 Codex；探子仅做只读定位，主代理实施和最终验证。
- 基线：预览所用主线 `186682486f46615f86e915088067c53ab02b95d9`（本地 origin/main，未再次 fetch）。任务分支 `codex/character-jitter`，独立工作区 `character-jitter/AgentGo`。
- 原目录仍为旧开发分支；原有 PROGRESS、TODO 和预览记录不覆盖。
- 目标：定位并消除排队附近角色反复转身/动作抽动，保留碰撞、队列和设施规则。
- 允许范围：`src/sim/movement.ts`、`src/sim/world.ts`、`src/ui/presentation.ts`、`src/ui/scene/Character.tsx`，必要的 `tests/movement.test.ts` / `tests/presentation.test.ts`，本简报、对应验证报告、PROGRESS、TODO、中央工作记录；本地预览副本和构建。
- 排除：模型/API、依赖、共享协议、其他 UI 功能；无付费模型、提交、推送、合并、部署。
- 前置与接口：沿用现有 npm 锁定依赖、模拟器位置权威和展示快照；不新增对外接口。
- 验证：先定向复现，再执行相关现有测试、类型检查和构建，核对浏览器预览；只增加直接覆盖根因的回归，不扩展测试规模。
- 范围补充：修复真实移动后改变了队伍到达顺序，seed 28 从通关变为合法超时；`tests/heuristicAgent.test.ts`、`tests/runner.test.ts`、`tests/report.test.ts`、`tests/trajectory.test.ts` 的通关样例改用实测 115.5 秒通关的 seed 27，保留原成功/时限/回放断言，不更改玩法或放宽期望。固定场景图按体型缓存，避免重复计算静态碰撞边。
- 完成条件：根因及修复有证据，必要检查通过，用户本地预览使用修复后的构建。
- 交接：本地未提交变更及 `docs/validation/CHARACTER-JITTER-001.md`；回退只撤销本任务差异、恢复原预览构建，不变更存储或规则。

实现完成；软件检查见[报告](../validation/CHARACTER-JITTER-001.md)，全部 413 项经完整检查与超时项复验覆盖，默认 5 秒限制未修改。实际验收仅覆盖本地浏览器离线烟测，用户最终验收待进行；未合入。工作区保持在上述基线，7 个源码/测试文件及本任务文档为未提交变更。下一位负责人待认领，可直接从本简报继续。
