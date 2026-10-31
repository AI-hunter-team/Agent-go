# UI-JOURNEY-FINAL-001 最终主线集成验证

状态：本地验证快照，不代替远端 CI 或实际合入状态；[任务简报](../tasks/UI-JOURNEY-FINAL-001.md)。执行：本聊天 Codex，2026-10-31（Asia/Shanghai），Windows、Node v24.21.0、npm 12.1.0。

## 集成范围

- #35 原头 `20e9813867827b714960d47a497ce4d6c97df758`，吸收 #34、#32 和 #33 已合入的 main `db499ec4fd0f1dfb17a4b20441cbabf9b077c6c7`。冲突在验证索引、中央记录、`App.tsx`、`App.module.css` 和 `GameScene.tsx`；保留两侧文档、旅程状态机与开局镜头、胜利展示和角色点击。
- 成功复盘使用可展开的侧栏，窄屏默认收起到较短区域，使胜利舞蹈可见；失败复盘仍显示完整报告。保留手动镜头控制、交互报告、背包准备绑定及 150 秒默认/120 秒选项。
- 既有行为测试及初次 UI 集成结果分别见 [VICTORY-REVIEW-001](VICTORY-REVIEW-001.md)、[UI-JOURNEY-IV2-001](UI-JOURNEY-IV2-001.md)；不将旧基线结果当作本轮结果。

## 实际检查

| 检查 | 结果 |
|---|---|
| 定向 | `npm.cmd test -- tests/journey.test.ts tests/victory.test.ts tests/characterClick.test.ts tests/followCamera.test.ts tests/passengerModel.test.ts`：5 文件 / 24 项通过。 |
| 类型 | `npm run typecheck`：通过，退出码 0。 |
| 全量 | `npm test`：85 文件 / 670 项通过；`npm.cmd test -- --maxWorkers=2 --testTimeout=15000`：85 文件 / 670 项通过，退出码均为 0。 |
| 生产构建 | `npm run build`：通过；既有大分块提示仍在。 |
| 差异和文档 | 提交前运行 `git diff --check`、`git diff --cached --check`，核对冲突标记及相对链接。 |
| 桌面浏览器 | 整合初版生产构建、隔离伪模型 fixture：离线 seed 1、无背包、150 秒/+3 人，131.0 秒到站，无违规。运行中点击角色正常问候；胜利舞蹈与复盘侧栏同屏，切总览退出电影镜头但舞蹈继续。随后添加窄屏复盘展开/收起控件并重建。 |
| 规划与失败 | 同一隔离环境选择 120 秒；伪模型失败后指导保留，自主规划后改变背包会返回指导并使旧方案失效；重新规划可开局并显示背包。手动结束后打开/关闭复盘模型设置，报告保留。此项在复盘展开控件的最终布局调整前运行。 |
| 窄屏最终构建 | 应用内浏览器 390×844，离线 seed 1、无背包、150 秒/+3 人，131.0 秒到站；舞蹈完整可见，成功复盘可展开/缩小，`scrollWidth` 与视口同为 390；浏览器 warning/error 为空。期间发现初版 40% 高度遮住下半身，改为短面板后重跑，不把初版记为通过。 |

## 限制与交接

- 真实供应商、付费模型、真实触摸取消、跨设备和人工美术验收未运行；浏览器结果只代表所列本机、布局与种子。
- 不部署、不清理原 NPC、旅程、列车及地图工作区。#35 当前远端 CI、审查和最终合入状态以实际 PR 为准；有问题可按 PR 边界回退并核对共享模型/报告消费者。
