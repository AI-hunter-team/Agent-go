# 文档导航

新开发者与开发 Agent 的阅读顺序：[根规则](../AGENTS.md) → 本页 → [开发流程](DEVELOPMENT.md) → [路线图](ROADMAP.md) → [中央工作记录](开发计划.md)。本地运行从 [根 README](../README.md) 开始。

## 权威来源与状态

同一规则只维护一处正文，其他文档链接引用。下表区分“应该是什么”“代码是什么”和“实际检查过什么”，不以新日期或后写的文字自动覆盖产品基线。

| 内容 | 当前权威入口 | 使用边界 |
|---|---|---|
| 产品范围、玩法与首版验收目标 | [Demo 方案 1.1](Demo方案1.1.md) | 原产品基线；后续 3D 展示见 [3D-MIG-001](tasks/3D-MIG-001.md)，已合入的楼梯、NPC 协商与回放见 [PR-REMAINING-001](tasks/PR-REMAINING-001.md)及[技术方案 §16](MVP技术方案.md#16-当前集成差异pr-remaining-001)；历史长期构思不自动成为交付承诺 |
| 交互 2.0 规范与分阶段实现 | [interaction-v2](interaction-v2/README.md) | D1–D8 已确认；IV2-01–19 已经 PR #32 合入 `main`，150 秒已定稿；原软件/浏览器/真实模型分项结果见 IV2-18；最新 Responses/地图集成及 PR 交付见 [IV2-PR-001](validation/IV2-PR-001.md)；旅程界面最终主线集成见 [UI-JOURNEY-FINAL-001](tasks/UI-JOURNEY-FINAL-001.md) |
| 架构、设计约束及实现差异 | [MVP 技术方案](MVP技术方案.md) | §1–13 主要保留开发前设计，§4/§10 的目录与接口已据源码校准；§14 记录原 MVP 实现核对，§15 记录 3D 展示，§16–21 记录后续集成差异（§16 为 `c6bfb52` 快照）；实现说明不能自行更改产品规则 |
| 实际目录、共享类型和接口行为 | [技术方案的目录与接口章节](MVP技术方案.md)及其中链接的源码 | 代码是实现事实，规范与代码不一致需记录差异和后续任务 |
| 正式站厅资产与栏杆规则 | [技术方案 §18](MVP技术方案.md#18-固定栏杆与正式站厅资产station-integration-001)、[素材说明](../design/station-kit/README.md) | 本地接入与安检通透视线调整；实际结果见对应验证报告，角色及交互2.0仍独立 |
| 开发、文档生命周期、协作和检查要求 | [DEVELOPMENT](DEVELOPMENT.md) | 团队约定；不代表托管平台已经强制执行 |
| 当前目标、依赖和推进条件 | [ROADMAP](ROADMAP.md) | 不存放详细实施日志；候选任务未认领不等于已排期 |
| 阶段状态、决定、阻塞和集成结果 | [开发计划与工作记录](开发计划.md) | [主线合入对照](开发计划.md#主线合入对照截至-2026-11-01)给出各任务的实际合入 PR；任务表与简报中的状态为写作时快照；原 MVP 原子化计划与记录保留为历史 |
| 任务范围及交接 | [任务简报模板](templates/task-brief.md)、[本次 DOC-001](tasks/DOC-001.md) | 复制到 `docs/tasks/<任务编号>.md`；大型专题可在自己的目录保存简报并在中央记录链接 |
| 实测结果及未验证项 | [验证目录](validation/README.md)、[验证模板](templates/validation-report.md) | 每份报告只证明所列版本、环境与范围 |
| 既有 MVP 验收证据 | [验收记录](验收记录.md) | 历史快照；其中测试数和浏览器成绩不是本次重跑结果 |
| PR 交付信息 | [GitHub PR 模板](../.github/pull_request_template.md) | 负责人、范围、接口、验证、风险、回退和交接均可从 PR 找到 |

## 架构与接口入口

当前终点见[技术方案 §21](MVP技术方案.md#21-登车终点与车厢庆祝onboard-victory-001)：到站台后仍需实际登上地铁才获胜，已经 PR #60 合入。它覆盖历史“到站台即成功”说明；软件/浏览器证据见对应任务与验证记录。

当前模型接入与思考预算由[技术方案 §17](MVP技术方案.md#17-responses-与思考设置responses-001)维护：统一 Responses、默认 DeepSeek Flash / 关闭思考，以及页面档位与会话绑定。该任务的代码/验证/合入状态见 [RESPONSES-001](tasks/RESPONSES-001.md)，旧模型章节和历史成绩不证明新接口真实验收。

项目为 npm 管理的 TypeScript Web 应用：React/Vite + Three.js/R3F/Drei 三维展示、Radix 定制 UI、浏览器模拟器和 Express 模型代理；Canvas 2D 保留作调试，Vitest 在 Node 环境运行测试。当前三维展示与内部快照入口见 [技术方案 §15](MVP技术方案.md)，后续楼梯、协商、回放和报告差异见 [§16](MVP技术方案.md#16-当前集成差异pr-remaining-001)，目录职责和脚本见 [开发流程](DEVELOPMENT.md)。

HTTP JSON、动作工具及共享数据目前是应用内部接口，复用 [技术方案 §7、§10、§14、§16](MVP技术方案.md)，不另建一份协议表。实际接口以 [server/app.ts](../server/app.ts)、[远程客户端](../src/agent/remoteAgent.ts)、[共享类型](../src/shared/types.ts) 和 [工具定义](../server/tools.ts) 互相核对；导出格式从 `GameReport` 与 [报告导出实现](../src/ui/ReportView.tsx) 查起。目前没有仓库内的独立版本化对外协议或冻结记录，不能因此自行破坏已有调用方或导出数据消费者。

## 历史和专题材料

- [PROJECT.md](../PROJECT.md)：早期产品基线与决策过程，保留证据；旧的阶段范围、选型待定与运行状态不适用于当前实现。
- [第一轮](../design/ui-concepts/README.md)、[第二轮](../design/ui-concepts-v2/README.md)、[第三轮视觉探索](../design/ui-concepts-v3/README.md)：概念与历史候选技术。第三轮已选方向用于后续三维探索，当前二维 MVP 范围仍由方案 1.1 决定。图片未入库，历史文件名不能当作可用附件。
- 小任务只需简报和验证报告；只有大型功能或重构才按需建立 `docs/<专题>/`，保存范围、设计、阶段与验收，不创建空文件套装。独立协议确有维护需求时再设单独文档并更新本页。

未核实的负责人、批准和远端门禁标记“待确认”，不补写推测的历史。归档、状态标记及引用修复规则统一见 [开发流程](DEVELOPMENT.md)。
