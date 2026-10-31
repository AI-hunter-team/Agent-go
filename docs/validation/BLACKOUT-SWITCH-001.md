# BLACKOUT-SWITCH-001 验证报告

日期：2026-10-31

| 检查 | 结果 | 证据 |
|---|---|---|
| 类型检查 | 通过 | `npm run typecheck` |
| 相关模拟/工具/展示测试 | 通过 | `npm test -- --run tests/engine.test.ts tests/scenario.test.ts tests/scenarioFixtures.test.ts tests/phase2Flow.test.ts`，41 tests；覆盖默认场景无 Agent 电闸操作时不产生断电事件 |
| 生产构建 | 通过 | `npm run build` |
| Diff 空白 | 通过 | `git diff --check` |
| 完整测试 | 部分受限 | 受影响 49 tests 通过；完整 `npm test -- --run` 受沙箱端口权限及既有 5 秒 API 测试超时影响，未将局部通过冒充完整通过 |
| 浏览器实际验收 | 未运行 | 未启动浏览器/真实模型 |

## 核对结论

- `operate_switch` 是唯一触发入口；距离超过 1.5 米或重复操作都会被模拟器拒绝。
- 操作后 `World.blackoutUntil` 设置 20 秒，全局 `lightAt` 使用统一暗视距系数；恢复时发出 `power_restored` 事件。
- `Observation.blackout` 暴露 active、remaining、switchDistance、canOperate，提示词公开电闸位置。
- 默认场景已移除定时 `power` 事件；未执行 `operate_switch` 的整局不会自动产生全局熄灯事件。
- 正式三维和几何回退场景均在 `(4, 28)` 靠墙位置渲染方盒子电闸；熄灯时已有场景照明降低，已有断电遮罩链也会覆盖。

## 限制

暂无专用电闸资产，按用户要求使用方盒子占位。PR #45 与 follow-up PR #48 均已合入；本次 follow-up 修复了回退场景的重复渲染。浏览器实际验收未运行。
