# NAIWA-COLLISION-001 验证报告

状态：实现完成；软件检查通过，浏览器实际验收待集成。

| 层级 | 命令/操作 | 结果 | 证据/限制 |
|---|---|---|---|
| 快速检查 | `npm test -- tests/movement.test.ts` | 通过，14 项 | 覆盖保安尺寸、玩家横穿拦截、既有移动/巡逻回归 |
| 受影响回归 | `npm test -- tests/movement.test.ts tests/guards.test.ts tests/engine.test.ts tests/presentation.test.ts` | 通过，43 项 | 移动、保安、引擎与展示消费者均通过 |
| 类型检查 | `npm run typecheck` | 通过 | `tsc --noEmit` |
| 自动化测试 | `npm test -- --maxWorkers=2 --testTimeout=15000` | 部分通过 | 受影响模拟器测试通过；API/HTTP 测试因沙箱禁止监听本地端口（`listen EPERM`）超时或失败 |
| 生产构建 | `npm run build` | 通过 | Vite 前端与 esbuild 服务端完成；仅有既有 chunk size warning |
| 差异空白 | `git diff --check` | 通过 | 已检查工作树差异 |
| 3D 实际验收 | 浏览器贴近奶蛙观察 | 未运行 | 需集成到实际运行版本后复验 |

环境：Node `v24.8.0`、npm `11.6.0`；基线 `origin/main@1032a9155aec1801249054da63a98ffbbd96b093`。
