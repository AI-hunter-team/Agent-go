# GUARD-BALANCE-001 验证报告

状态：验证快照，不代表已合入或完成浏览器/真实模型验收。

## 版本与环境

- 任务简报：[GUARD-BALANCE-001](../tasks/GUARD-BALANCE-001.md)。
- 执行人/日期：当前 Codex 会话，2026-11-01（Asia/Shanghai）。
- 基线/受测版本：`main` 基线 `f60f1d81c131399bc00141b2da98ad0c671e2c3a`；受测版本为同一工作区未提交修改，另有两份无关迁移文档未改动。
- 环境：macOS，Node/npm 版本按本机 `npm` 工作环境；使用现有 `node_modules`，未修改 `package-lock.json`。
- 验证范围：生产 Engine 的安检员集合、安检员角色视野、调查/注视时的临时扩大视野、感知与调试视锥同步；不覆盖浏览器实际操作、真实模型或远端部署。

## 实际执行

| 检查层次 | 实际命令/操作 | 预期 | 状态、实际结果及退出码（适用时） | 证据位置/编号 |
|---|---|---|---|---|
| 快速/相关测试 | `npm run typecheck` | 类型检查通过 | 通过，退出码 0 | 命令输出；`tests/guards.test.ts` 等 |
| 快速/相关测试 | `npm test -- --run tests/guards.test.ts tests/observation.test.ts tests/scenarioFixtures.test.ts tests/perception.test.ts` | 安检员视野、观察、生产数量和感知回归通过 | 通过，4 个文件、32 项测试 | 命令输出 |
| 完整软件检查 | `npm run build` | 前端、服务端生产构建通过 | 通过，退出码 0；Vite 仅报告既有大 chunk 警告 | 命令输出 |
| 差异检查 | `git diff --check` | 无差异空白错误 | 通过，退出码 0 | 命令输出 |
| 全量自动化 | `npm test` | 全仓库测试通过 | 未完成/受环境阻塞：多个 API/生产测试因沙箱禁止监听 `127.0.0.1`（`EPERM`）或默认 5 秒超时失败；核心模拟与离线测试通过，不能据此宣称全量通过 | 终端输出；失败集中于 `debugApi.test.ts`、`production.test.ts`、`server.test.ts`、`journey.test.ts`、`reviewApi.test.ts` 等 |
| 离线多种子 | `node --import tsx scripts/offline-baseline.ts` | 观察固定拥挤难度下 Agent 成功率与基线量级，不应全局速通 | 通过执行；1–50 seed 成功 11/50（22%），平均成功 140.964s，平均结束 148.012s；失败主要为 150s 超时 | 临时脱敏摘要 `/tmp/guard-balance-offline.json`，未入库 |
| 浏览器/真实模型 | 未运行 | 需要后续验证调试视锥、正式三维展示和真实模型策略 | 未运行 | 不适用 |

## 结论与剩余事项

| 状态维度 | 实际结论及证据 |
|---|---|
| 实现完成 | 已完成：生产安检员由 3 名固定员调整为 S1/S3 两名；S2 设施仍可办理；安检员闲置视野 8m/85°，调查/注视/吸引时恢复 12m/110°；`GuardSystem`、`PerceptionSystem`、Canvas/Three 调试视锥统一读取实际视野。 |
| 软件检查通过 | 类型检查、相关回归测试、构建和 diff 空白检查通过；全量测试受本地端口权限和默认超时阻塞。 |
| 实际验收通过 | 未运行浏览器与真实模型；离线 50 seed 已完成，用于确认没有变成无风险速通。 |
| 已合入 | 未合入、未推送、未创建 PR；保留在当前工作区供用户试玩/审阅。 |

- 规范与实现差异：`docs/interaction-v2/design.md`/IV2-07 仍描述“一条安检通道一名固定保安”；本实现将生产观察哨调整为两名，设施办理规则未改变。若产品要坚持原规范，应回退 `SECURITY_STAFF_BALANCED` 或改为仅收窄视野的方案。
- 风险：缺少浏览器实际视角验收；两名安检员的视觉角色资产仍按既有 actor 列表渲染，正式场景需要确认中间通道没有误导性空岗表现。
- 回退：恢复 `Engine` 使用 `SECURITY_STAFF`，删除 `SECURITY_STAFF_VISION`/`GuardSystem.vision` 的生产引用，并回退数量测试；无需迁移数据或接口。
- 接手方式：从本简报、此验证报告和当前 diff 开始；集成前应在允许监听端口的环境重跑 `npm test`，并做一次浏览器安检区实际走位验收。
