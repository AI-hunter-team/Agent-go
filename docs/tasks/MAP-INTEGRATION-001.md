# MAP-INTEGRATION-001：在最新主线接入商业大厅与扶梯

状态：实现及本地验证完成，已交付 [PR #29](https://github.com/AI-hunter-team/Agent-go/pull/29)，未合入；2026-10-31。

## 目标与责任

- 用户在地图 PR 调查后明确要求“okok，开始干活”；按建议从最新 main 移植地图、完成兼容验证并交付替代 PR。
- 单一开发及集成负责人：本聊天 Codex，串行实施，无子 Agent。中央记录在本独立分支由本任务维护。
- 基线：已 fetch 的 `origin/main` / `26ddb2bd983be5be2a64bb0c58912a8e3614a0df`。
- 来源：[PR #28](https://github.com/AI-hunter-team/Agent-go/pull/28)，仅移植地图提交 `2e69d17746ce5a2b967f7771bfb0aa1bdd279f08`，不重放旧难度/权限/复盘历史。
- 工作分支 `codex/map-main-integration`；独立工作区 `../Agent-go-map-integration`。原工作区 NPC 外观未提交工作保持原样，不纳入本任务。
- 完成条件：90×30 地图、并排售票机、商业关注和楼梯/扶梯功能兼容当前素材/移动/模型/复盘/时限选择，类型/测试/构建及浏览器验收留证，提交并普通推送替代 PR。
- 授权范围：上述实施、必要本地服务、提交、普通推送及 PR；不远端合并、不关闭旧 PR、不部署外部环境、不调用付费模型。

## 路径归属及接口

- 允许：原地图提交涉及的 `src/shared/{types,review}.ts`、`src/agent/{heuristicAgent,reviewRecorder,runner}.ts`、`src/sim/{layout,world,engine,npc,observation,creative,negotiation,transit,facilityGeometry,nav}.ts`；必要的模拟移动与避让消费者。
- 允许：`server/{prompts,review,tools,security}.ts`，必要的 Responses 动作/观察消费者及相关测试；不恢复已删除的旧模型客户端。
- 消费者补充：`server/objective.ts` 的共享常规路线描述需包含扶梯；`src/sim/movement.ts` 的地板边缘与商业物碰撞需随地图同步；对应检查属于本任务。
- 展示文字补充：`src/ui/App.tsx`、`ControlPanel.tsx` 与 `MapCanvas.tsx` 仅同步商业大厅、楼梯/扶梯路线说明及回放无障碍文字，不改变开局/时限/模型配置流程。
- Windows CI补充：三项完整对局触及现行15秒预算，CPU采样显示矩形求交、静态障碍膨胀分配和远距人物扫掠为热点。允许优化 `src/sim/geometry.ts`、`movement.ts` 及边界回归；保持几何/结算语义，不调整CI时限或删除种子/断言。
- 允许：`src/ui/{JourneyProgress,ReportView,presentation,render,format}.ts*`、`src/ui/scene/` 中地图/楼梯/扶梯/商业设施/相机/设施布局及几何回退消费者；不修改普通乘客外观、主角/保安资产或行为。
- 允许：受影响测试与必要浏览器夹具；`docs/{README,MVP技术方案,开发计划}.md`、原地图简报/验证/计划、验证索引及本任务两份文档。README 仅当前地图使用说明。
- 排除：依赖/锁文件、生成资产库、旧 NPC 外观在途路径、交互 2.0、远端部署和生产数据；发现额外必要文件先在此补记。
- 新动作 `take_escalator`、`inspect_attraction`，可选观察 `attractions/routes`、耗时 `escalator/distraction` 与历史 transit 快照沿用原 PR 语义。模拟器决定世界事实，保持可见性约束和旧报告兼容。
- 队列方向必须统一模拟排队、体型间距、实体占地、避让、模型朝向与标线；现行透明栏杆、正式素材、角色绕行、Responses 和 2–5 分钟时限选择继续有效。

## 验证及交付

- 快速：新地图、关注、扶梯、队列方向/碰撞、路线选择、工具契约及旧报告测试。
- 完整：`npm run typecheck`、`npm test`（并核对现行 CI 的 `--maxWorkers=2 --testTimeout=15000`）、`npm run build`、`git diff --check` 与暂存差异检查。
- 浏览器：正式场景/两处下行开口/售票朝向与队列、离线完整对局、关注及扶梯夹具、时限选择/报告/复盘；无真实模型调用。
- 记录环境与全部失败、未运行和限制于 [验证报告](../validation/MAP-INTEGRATION-001.md)，人工审查未进行。
- 回退：PR 合并后可 revert 对应提交，不涉及数据迁移；合并前保留独立分支，原工作区不变。

## 当前交接

- 19处文本冲突及队列方向、正式素材、碰撞、扶梯生成/排队、下行入口兼容已处理。真实模型与远端合并未运行。
- 类型、62文件/512测试（现行CI参数）、前后端构建通过；生产浏览器seed22离线119.1秒通关，伪模型关注6秒/扶梯4秒整局及复盘采纳流程通过。Windows热点优化与商业设施接近P2修复见验证报告追加记录；原15秒CI预算不变。
- 原工作区NPC未提交修改、已删除旧模型通道、依赖/锁文件和当前时限选择保持原样。本任务单独提交并交付替代PR；后续接手见[验证报告](../validation/MAP-INTEGRATION-001.md)。
- 功能提交 `215a5f5eb2ba89d009c254f3c0ccb2425d854d60` 已普通推送；[PR #29](https://github.com/AI-hunter-team/Agent-go/pull/29) 为非草稿替代PR，目标main。远端CI已触发，结果以PR的实际运行及头提交为准；本页后续交付更新仅文档。
