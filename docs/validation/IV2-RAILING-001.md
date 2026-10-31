# IV2-RAILING-001 验证报告

状态：验证快照，不代表已合入或已完成全部产品验收。规则见 [开发流程](../DEVELOPMENT.md)。

## 版本与环境

- 任务简报：[IV2-RAILING-001](../tasks/IV2-RAILING-001.md)。
- 执行人/日期：Claude Code 会话（代任务发起者执行），2026-10-31（本地时间）。
- 基线/受测版本：`codex/iv2-railing-vault`。首轮在 `b663394d3b9787ff9f87710bfbd2c05709cb4758` 上对未提交修改执行；提交并变基到 `main` @ `81e9aafc` 后复跑完整检查（见下表“变基后”行）。
- 环境：macOS（Darwin 25.6.0），Node v24.8.0，npm 11.6.0；依赖复用同仓库 `iv2-phase2` worktree 已安装的 `node_modules`（同一 `package-lock.json`），本次未重新 `npm ci`。
- 验证范围：栏杆翻越位置判定、自动补走位、不可达 approach 替换、`move_to RAIL_N/RAIL_S` 后直接翻越、全部既有测试与构建。排除：真实模型整局、浏览器操作。

## 实际执行

均在 worktree 根目录执行。

| 检查层次 | 实际命令/操作 | 预期 | 状态、实际结果及退出码（适用时） | 证据位置/编号 |
|---|---|---|---|---|
| 快速 | `npx vitest run tests/phase2Flow.test.ts tests/actions.test.ts` | 新增/改写栏杆用例通过 | 通过；修改前有 2 项按旧“原地拒绝”语义断言的用例失败，已按新语义改写 | `tests/phase2Flow.test.ts`、`tests/actions.test.ts` |
| 完整软件检查 | `npm run typecheck` | 无类型错误 | 通过，退出码 0 | 终端输出 |
| 完整软件检查 | `npx vitest run --maxWorkers=2 --testTimeout=15000` | 全部通过 | 通过：81 个文件、654 项 | 终端输出 |
| 完整软件检查 | `npm run build` | 前端与服务构建成功 | 通过；`build/server.js` 298.3kb | 终端输出 |
| 完整软件检查 | `git diff --check` | 无空白错误 | 通过；新文件未暂存，另行目视检查 | 终端输出 |
| 完整软件检查（变基后） | `npm run typecheck`；`npx vitest run --maxWorkers=2 --testTimeout=15000`；`npm run build`；`git diff --check HEAD~1 HEAD` | 全部通过 | 通过：类型检查退出码 0；82 个文件、658 项测试；构建成功；提交无空白错误。`package.json`/锁文件与首轮基线一致 | 终端输出 |
| 集成/浏览器/真实环境 | 真实模型复跑 seed 78017401 同一指导 | Agent 能翻过安检栏杆 | 未运行：需付费模型授权与浏览器操作 | 无 |

## 结论与剩余事项

| 状态维度 | 实际结论及证据 |
|---|---|
| 实现完成 | 是（已提交，见 PR） |
| 软件检查通过 | 是：类型检查、全部测试、构建、diff 检查 |
| 实际验收通过 | 未运行 |
| 已合入 | 未合入 |

- 未验证：真实模型是否会选用 `RAIL_N`/`RAIL_S` 或直接 `vault`；翻越后的保安/NPC 反应只由既有测试覆盖。
- 规范差异：设计第 447 行“前置条件不满足时明确失败”与自动补走位的差异待确认，见简报。
- 集成后需复验：`npm test` 全量与上述真实模型对局。
