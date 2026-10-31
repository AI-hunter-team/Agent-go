# GUARD-BALANCE-001：减少安检员压迫感并扩大可读风险窗口

状态：实施中

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | GUARD-BALANCE-001；调整安检员数量、观察覆盖和非常规行动窗口，使玩家/Agent 能通过观察、绕行和制造注意力转移形成可读的风险收益决策。 |
| 交付物与完成条件 | 安检区不再由三名固定全功能观察者形成连续监控；保留至少一个可读的安全窗口和可被 NPC/保安反应重新压缩的风险；相关回归测试、完整软件检查和验证报告完成。 |
| 单一负责人 | 当前 Codex 会话（负责实现、验证与本地集成） |
| 集成负责人 | 当前 Codex 会话；仅修改本任务允许路径，中央记录在实现与验证完成后更新。 |
| 基线 | `main`，`f60f1d81c131399bc00141b2da98ad0c671e2c3a`，2026-11-01；仅使用已核实本地基线。 |
| 任务分支与工作区 | `main` 当前工作区（独立 worktree 创建后被沙箱拒绝写入）；保留已有无关迁移文档修改。 |
| 前置任务与资源 | 现行安检员/保安实现、IV2-07 与 DIFFICULTY-002 的固定难度约束；无需凭据。 |
| 规范与接口依据 | `docs/MVP技术方案.md` §5.6、§16；`src/sim/scenario.ts`、`src/sim/guards.ts`、`src/sim/perception.ts`、相关 guard/fixture 测试。 |

## 路径边界

- 允许修改：`src/sim/scenario.ts`、`src/sim/guards.ts`、`src/sim/perception.ts`、`src/sim/engine.ts`（仅生产安检员集合接线）、`src/sim/actions/legacy.ts`（保持旧兼容检查与生产结算一致）、`src/ui/render.ts`、`src/ui/scene/GameScene.tsx`（仅调试视锥展示）、`tests/guards.test.ts`、`tests/scenarioFixtures.test.ts`、本简报和对应验证报告。
- 明确排除：共享类型/API、UI/资产、锁文件、模型提示词、中央工作记录（验证完成后由集成负责人按流程追加摘要）。
- 共享文件与顺序：`scenario.ts` 为共享模拟配置；先完成参数与语义设计，再更新测试；无并行代码写入。
- 范围外发现：若发现地图几何或 Agent 观察协议需要变更，只记录后续入口，不在本任务扩大范围。

## 设计、决定与差异

- 采用“减少一个固定哨位 + 软化剩余安检员感知 + 可移动支援”的组合：S1、S3 保留为固定安检员，S2 取消常驻观察；生产 Engine 额外加入一名沿三条安检口移动的流动安检员，其闲置视野为 85°/8m，响应事件时仍按普通保安规则观察。这样中间通道形成可读开口，S1/S3 仍维持边缘压力，事件系统仍能把注意力拉回安检区。
- 为兼容旧测试和调试夹具，`SECURITY_STAFF` 继续保留稳定的 `security-S1/security-S2/security-S3` 定义；生产集合由 `SECURITY_STAFF_BALANCED` 导出，fixture 仍可显式使用任意 GuardDef。
- 观察范围/角度变化必须同时影响 `GuardSystem.canSee` 与 `PerceptionSystem.canSee`，避免展示与结算分叉；普通巡逻保安规则不变。
- 该方案是当前产品规范“一条通道一名固定安检员”的实现差异，需在验证报告中明确；若产品坚持 A8 原文，应回退到三名固定员并改用仅软化感知的方案。
- 回退方式：恢复生产 Engine 使用 `SECURITY_STAFF`，移除角色视野参数和相关测试即可回到基线。

## 验证与交付

- 快速：相关 guard/scenario/perception 测试、类型检查。
- 完整：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`；补充多 seed 离线通关/违规窗口对照命令并记录实际结果。
- 实际验收：本任务不调用真实模型；记录未运行，并说明浏览器/真实模型仍需后续复验。
- 验证报告：`docs/validation/GUARD-BALANCE-001.md`。
- 集成方式/目标：本地分支交付给当前会话；未经用户明确授权不推送、创建 PR 或远端合并。

## 交接（离开任务前填写）

- 当前分支、完整 commit、已提交/未提交文件与状态：待实现完成后填写。
- 已做/未做、验证报告与证据、失败/跳过/阻塞原因：待填写。
- 关键决定、依赖方是否可继续、范围外事项及下一步：待填写。
- 接手负责人/入口：当前 Codex 会话；后续集成从本简报和验证报告开始。
