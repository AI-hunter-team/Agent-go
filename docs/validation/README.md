# 验证报告索引

每个任务使用 [验证模板](../templates/validation-report.md)，报告命名 `<任务编号>.md`；复验可另存 `<任务编号>-<日期或序号>.md` 并互相引用，不覆盖历史证据。小修复也可在原报告追加新版本/环境与独立结论，避免混淆两次运行。

每份报告写清版本、脏工作区、环境、实际命令、结果/证据和未验证项。执行规则统一见 [DEVELOPMENT](../DEVELOPMENT.md)。不入库秘密、个人绝对路径或原始大型产物。

| 报告 | 性质与适用范围 |
|---|---|
| [CI-MAIN-STABILITY-001](CI-MAIN-STABILITY-001.md) | #71合入后Windows展厅与难度会话检查超时；逐资产/通道检查及实际tick后主动结束会话，原预算不变，含两轮本地与远端证据 |
| [PR-SERIAL-MERGE-002](PR-SERIAL-MERGE-002.md) | #68–#71 串行冲突修复、CI 和合并记录；各轮次实际状态见报告 |
| [CHARACTER-HOME-PR-001](CHARACTER-HOME-PR-001.md) | 首页与豆包/Idle/失败/问候整合最新PR68，修复门框黄线穿模；904项、类型/构建与生成车站实际成功/失败验证 |
| [HOME-MATCH-001](HOME-MATCH-001.md) | 全实时3D参考首页、菜单与材质取景重建；功能检查通过，严格1:1视觉差异保留 |
| [STATION-DETAIL-PR-001](STATION-DETAIL-PR-001.md) | 站内细节与登车主线、小地图及两种旧世界摘要整合验证 |
| [STATION-DETAIL-001](STATION-DETAIL-001.md) | 45类原创站内模型、贴图、摆放与展厅的来源工作树历史验证；登车规则以整合验证为准 |
| [CONTROLROOM-005](CONTROLROOM-005.md) | 首页菜单桌面/窄屏底色统一与按钮流程检查 |
| [WORLDGEN-V3-PR-001](WORLDGEN-V3-PR-001.md) | V3后续PR整合最新#68首页/角色，976项及豆包79.1秒实际登车/复盘；与来源大矩阵/性能证据分开记录 |
| [WORLDGEN-V3-004](WORLDGEN-V3-004.md) | 13种子52实机镜位、12整局+B扶梯；修复远端车门绕行穿斜板与二维柱体/标题遗漏；具体通过范围及软件结果见报告 |
| [WORLDGEN-V3-003](WORLDGEN-V3-003.md) | M2三类建筑与M3集成；958项、1000种子0无效/回退、44/50、三类60秒P95 18.3ms、20次换图及窄屏/二维/故障降级；本地默认V3，未合入 |
| [WORLDGEN-V3-002](WORLDGEN-V3-002.md) | 站长与列车编组、楼扶梯比例；937项、1000种子0无效/0回退、44/50、全入口预算及94.7秒实际登车；待视觉确认 |
| [WORLDGEN-V3-001](WORLDGEN-V3-001.md) | 建筑/多连接器与90模型融合、五种版本记录恢复、44/50、实际登车及下楼短片；本地样板，待视觉确认 |
| [WORLDGEN-V2-001](WORLDGEN-V2-001.md) | 双层建筑样板、四连接器和独立队列；895项、50局及桌面证据，待用户视觉确认，M2/M3未实施 |
| [WORLDGEN-PR-001](WORLDGEN-PR-001.md) | 世界生成器、休息室、小地图与最新主线整合；登车终点、软件及离线/浏览器检查和未验证范围 |
| [MINIMAP-003](MINIMAP-003.md) | 紧凑设施标记、小地图滚轮/拖动/复位；762测试和桌面/窄屏浏览器 |
| [MINIMAP-002](MINIMAP-002.md) | 小地图完整居中取景、图标留白与全层/附近切换；760测试及三布局/窄屏生产复验 |
| [MINIMAP-001](MINIMAP-001.md) | 通用楼层小地图、当前路线及开关、整站交互/窄屏/2D/回放与六层夹具；758测试及生产浏览器 |
| [CONTROLROOM-004](CONTROLROOM-004.md) | 03品牌、简洁休息室、独立预览与角色偏好；当前组合的软件/浏览器/性能分项结果 |
| [CONTROLROOM-003](CONTROLROOM-003.md) | 移除控制室桌面/侧墙屏幕，18项专项、构建与生产浏览器检查 |
| [CONTROLROOM-002](CONTROLROOM-002.md) | 控制室角色过曝修正及照明平滑衔接；741测试、双角色与低画质/入场浏览器检查 |
| [CONTROLROOM-001](CONTROLROOM-001.md) | 控制室、本机世界列表、沙盘、连续入场、740测试及新旧启动50种子对照；本地验证 |
| [FACILITY-RANDOM-002](FACILITY-RANDOM-002.md) | 安检停用随机目标、广播/复检与新局种子生命周期；200 种子及离线浏览器回归，本地修复 |
| [DOCS-SYNC-001](DOCS-SYNC-001.md) | 2026-11-01 文档与主线状态同步：仓库滞后核对、合入对照、源码一致性修正与全量链接审计；纯文档 |
| [GUIDANCE-DIALOGUE-PR-001](GUIDANCE-DIALOGUE-PR-001.md) | 指导重试与多 NPC 对话整合最新 main，最终781项/类型/构建通过；窄屏报告按钮遮挡修复与无费用浏览器复验，PR #61交付证据 |
| [DOUBAO-IDLE-001](DOUBAO-IDLE-001.md) | 豆包静止Idle与默认自然站姿，原行走数据保持；17项/类型/构建/真实选角站姿通过，本地未提交 |
| [SELECTION-GREETING-001](SELECTION-GREETING-001.md) | 选角模型就绪后播放自身问候，重复选择/重建去重/无片段与减少动态；23项、类型/构建及真实选角通过 |
| [DOUBAO-PRESET-001](DOUBAO-PRESET-001.md) | 豆包GLB与角色预设追加，14项/类型/构建、实际加载与切换通过；本地main未提交 |
| [FAILURE-ANIMATION-001](FAILURE-ANIMATION-001.md) | 用户失败GLB合入默认大肥鱼，单次播放/末帧/减少动态及重试；747项、类型/构建与离线自然超时检查；本地main未提交 |
| [ONBOARD-PR-001](ONBOARD-PR-001.md) | 登车终点、精细车厢和结束界面统一PR交付；提交/主线整合/CI状态见报告，不自动合并 |
| [JOURNEY-FAILURE-001](JOURNEY-FAILURE-001.md) | 失败结束展示、真实120秒超时、主动复盘/重试/调整入口和四种尺寸；739项检查，本地未提交；失败动作待后续素材 |
| [METRO-CABIN-002](METRO-CABIN-002.md) | 精细车厢与游戏化宽高、实际GLB双模型零错误/警告、738项及149.0秒实际登车；桌面/手机实图；本地未提交 |
| [ONBOARD-VICTORY-001](ONBOARD-VICTORY-001.md) | 玩家实际登车、车厢舞蹈、主动复盘及四种尺寸；736项及离线148.8秒实际登车通过；本地未提交 |
| [LAYOUT-SCROLL-001](LAYOUT-SCROLL-001.md) | 选角/指导错位与无效滚动、矮屏布局、底部控件及气泡遮挡；31 项相关回归及所列浏览器检查，整合 main 后完整 724 项通过；PR 交付 |
| [REVIEW-UX-001](REVIEW-UX-001.md) | 三层复盘、手机常驻操作、重玩/调整及上一局内存报告；原 696 项，整合最新 main/策略采用及登车阈值回归后 722 项通过，PR 交付 |
| [REVIEW-PR-001](REVIEW-PR-001.md) | 复盘界面、策略采纳和模型优先级的独立分支集成及 PR 交付检查 |
| [REVIEW-STRATEGIES-001](REVIEW-STRATEGIES-001.md) | 策略前置、单击进入开局设置并预填，以及无费用自然超时失败样例 |
| [REVIEW-SERVER-001](REVIEW-SERVER-001.md) | 本局用户模型优先、服务端兜底及局后复盘绑定生命周期 |
| [REVIEW-SIMPLIFY-001](REVIEW-SIMPLIFY-001.md) | 复盘单列结构、详情折叠和固定标题；底部按钮的历史迭代由策略任务接续 |
| [HOME-REFRESH-001](HOME-REFRESH-001.md) | 参考图驱动的大厅首页布局、实时场景镜头及桌面/窄屏本地验证 |
| [UI-JOURNEY-FINAL-001](UI-JOURNEY-FINAL-001.md) | 旅程界面与已合入的乘客、交互及胜利展示最终主线集成 |
| [UI-JOURNEY-IV2-001](UI-JOURNEY-IV2-001.md) | 旅程界面与 #32 的候选集成；背包绑定、150/120 秒及离线/伪模型浏览器检查；不代表最终主线组合验收 |
| [VICTORY-REVIEW-001](VICTORY-REVIEW-001.md) | #33 主角手势审查修复与 #34/#32 主线集成复验 |
| [VICTORY-001](VICTORY-001.md) | 三舞蹈随机循环、电影运镜和点击问候；523测试/类型/构建、离线乘梯整局及双终点展示夹具、生产烟测通过；已提交 PR #33 |
| [PR-SERIAL-MERGE-001](PR-SERIAL-MERGE-001.md) | #34、#32、#33、#35 串行集成与逐轮验证；实际状态见报告 |
| [IV2-REVIEW-001](IV2-REVIEW-001.md) | PR #32 审查问题复现、排队与背包修复、主线同步及 CI 复验 |
| [IV2-PR-001](IV2-PR-001.md) | 交互2.0与最新main的Responses/地图/扶梯/复盘冲突整合；642项、离线50种子及Chrome复验；PR交付，不合并 |
| [IV2-18](IV2-18.md) | 第二阶段 时限复评及真实模型验收；集成结果见 IV2-18 |
| [IV2-19](IV2-19.md) | 第二阶段 报告/回放/旧接口迁移；集成结果见 IV2-18 |
| [IV2-17](IV2-17.md) | 第二阶段 断电及设施损坏；集成结果见 IV2-18 |
| [IV2-16](IV2-16.md) | 第二阶段 NPC 插队；集成结果见 IV2-18 |
| [IV2-15](IV2-15.md) | 第二阶段 楼梯扶梯；集成结果见 IV2-18 |
| [IV2-14](IV2-14.md) | 第二阶段 栏杆与闸机；集成结果见 IV2-18 |
| [IV2-13](IV2-13.md) | 第二阶段 安检与背包；集成结果见 IV2-18 |
| [IV2-08](IV2-08.md) | 01–08 最终本地集成：执行器、对抗、对话挂起/原子交易、离线解析及兼容；515 项测试与 50 seeds 基线回归；停在 08，非 M3/M4 实际验收 |
| [IV2-07](IV2-07.md) | 保安调查/注视/失能、事件与警戒判负接线；462 项测试及离线基线回归 |
| [IV2-06](IV2-06.md) | NPC 性格反应、实际报告、记忆、重买票；467 项测试，夺回由 08 接线 |
| [IV2-05](IV2-05.md) | 定向警戒与视线圆环状态机；457 项测试 |
| [IV2-04](IV2-04.md) | 事件总线、持续行为、感知与归因；447 项测试 |
| [IV2-03](IV2-03.md) | 确定性 NPC 人设及旧协商兼容；450 项测试 |
| [IV2-02](IV2-02.md) | 物品实体/槽位/背包及车票迁移；440 项测试与离线基线 |
| [IV2-01](IV2-01.md) | 交互 2.0 契约、独立随机流、场景/剧本脚手架；435 项检查与 seed 1–50 离线对照；仅本地实现，非 M4 验收 |
| [NPC-DETAIL-PR-001](NPC-DETAIL-PR-001.md) | 原普通乘客外观移植到新地图主线，独立工作区的软件和浏览器复验 |
| [NPC-DETAIL-001](NPC-DETAIL-001.md) | 普通乘客外观的三轮本地开发与旧基线验证快照 |
| [CI-SESSION-001](CI-SESSION-001.md) | PR #30合并后Windows双整局报告比较超时，限定六个种子的执行预算；保留全部518项检查及产品时限 |
| [CAMERA-STABILITY-001](CAMERA-STABILITY-001.md) | 跟随镜头稳定、被占最终队尾等候及 NPC 转向限速；整合地图 main 两处冲突，最终 518 测试/类型/构建通过，生产离线 seed 1、180 秒时限下 131.4 秒乘梯；PR #30 交付 |
| [STATION-PR-002](STATION-PR-002.md) | 显示修复与栏杆整合 PR，同步角色/失败复盘 main 的4处冲突及本轮集成验证 |
| [ASSET-FIRST-001](ASSET-FIRST-001.md) | 站厅正式 GLB 首次渲染优先；加载期间不显示旧几何回退，相关测试/构建及未运行的浏览器首帧验收 |
| [METRO-RAILING-001](METRO-RAILING-001.md) | 中国地铁A圆管/B玻璃、7 GLB、独立小样及串行场景接入；445测试、生产整局99.1秒与资源/回退复验 |
| [STATION-DISPLAY-001](STATION-DISPLAY-001.md) | 安检顶部重叠、导视比例、磨石/反射与6米顶板；追加20级防滑楼梯及平台收口，427测试和生产整局 |
| [ALL-LOCAL-001](ALL-LOCAL-001.md) | 全部本地源工作、角色资产与既有 Responses/UI/性能交付的最终组合；含提交、冲突及验证边界 |
| [STATION-INTEGRATION-001](STATION-INTEGRATION-001.md) | 固定栏杆、33 GLB、正式站厅接入与视线/占地回归；开发/生产浏览器整局、回放、失败重试及本机性能 |
| [PR18-MERGE-001](PR18-MERGE-001.md) | 名称统一 PR 与最新 main 的文档冲突解决及集成验证；最终合入见原 PR |
| [BRAND-002](BRAND-002.md) | 英文名agent-go及包/下载/素材生成标识统一；验证范围与结果见报告 |
| [NPC-PR-001](NPC-PR-001.md) | 人物修复与最新 main 兼容、PR/CI/合并及已合并分支清理，进行中 |
| [ESCALATOR-NPC-001](ESCALATOR-NPC-001.md) | 右侧扶梯 NPC 满载改道与入口堆积回归；相关测试、类型和构建通过，完整服务端测试受环境 listen EPERM/既有边界波动影响 |
| [NPC-VISUAL-001](NPC-VISUAL-001.md) | 连续移动避让、队列/办理占位、设施朝向、364 项检查及离线浏览器复验 |
| [DEEPSEEK-THINKING-001](DEEPSEEK-THINKING-001.md) | 官方 DeepSeek 思考模式工具选择、多轮回传及 JSON 模式适配；模拟接口验证，不代表真实模型验收 |
| [STARTUP-API-001](STARTUP-API-001.md) | 本地服务恢复、上游权限 400 与 DeepSeek 工具调用参数 400 诊断、386 项集成回归及真实 Safari 开局；包含临时伪响应入口导致截图 500 的纠正记录 |
| [GUARD-002](GUARD-002.md) | 独立奶娃保安 GLB、缩小帽子/警棍、烘焙 Idle/Walk 与自定义导入，5 项相关检查和浏览器快照 |
| [AVATAR-001](AVATAR-001.md) | 主角/保安默认 GLB、独立本机导入/保存/恢复、358 项检查与生产版浏览器核验；本地未提交 |
| [STATION-PR-001](STATION-PR-001.md) | 难度/故障修复与最新 main 的冲突、提示一致性和 343 项集成检查；PR 发布前验证快照 |
| [FAILURE-REVIEW-001](FAILURE-REVIEW-001.md) | 失败全局复盘、玩家选择与指导草稿；原版 413 项/伪模型浏览器，Responses 集成 423 项及独立复审，最新站厅主线集成复跑 436 项；真实模型质量待用户验收 |
| [MAP-ITERATION-001](MAP-ITERATION-001.md) | 售票机左侧并排、安检后闸机前商业大厅、可抵抗关注与动态扶梯；原 438 项回归及主线集成 512 项 CI 等价回归，含独立审查修复与浏览器验证 |
| CUTIN-PERMISSION-001（原索引引用，报告未随仓库交付） | 原始指导控制插队工具、自然求助与否定、模型整理防泄漏、接口/执行防绕行及 387 项回归；浏览器导出未完成 |
| [DIFFICULTY-002](DIFFICULTY-002.md) | 固定 120 秒 / 每条开放队列额外 3 人、移除难度选择、318 项回归和 650 局离线对照；覆盖原可调 UI 方案 |
| [DIFFICULTY-001 / FACILITY-FAIL-001](DIFFICULTY-001.md) | 可调时限/初始队列、办理中故障结算、314 项回归、浏览器与 600 局离线对照；不代表真实模型验收 |
| [BRAND-001](BRAND-001.md) | Agent Go 品牌文字与现行文档核对、软件检查及品牌浏览器验证 |
| [PR-REMAINING-001](PR-REMAINING-001.md) | 剩余 PR #6、#8 的串行冲突处理、消费者核对及集成验证 |
| [PR7-MERGE-001](PR7-MERGE-001.md) | 3D PR #7 与 main 的冲突解决、模型配置/调试衔接及集成软件检查；最终合入见 PR |
| [3D-MIG-001](3D-MIG-001.md) | 浏览器三维展示、运行快照、完整 UI、伪模型及性能的本地验证；包含用户停止浏览器操作后的未验证项 |
| [原 MVP 本地验收记录](../验收记录.md) | 保留原位置及证据；旧轮次的自动化、离线运行和浏览器限制，不是当前重跑 |
| [DOC-001](DOC-001.md) | 本次文档与协作规则迁移的本地检查及交接 |
| [CI-001](CI-001.md) | 后续 CI 配置、本地软件检查、远端运行与集成证据 |


## 补充索引（2026-11-01 核对）

以下报告此前未在上表登记，按编号排列；“随附 PR”指报告随之进入 `main` 的 PR（截至 `8a98665` 均已合入），完整对照见[中央记录的主线合入对照](../开发计划.md#主线合入对照截至-2026-11-01)。报告内的“未提交/待集成”等状态仍是写作时的快照。[IV2-18-evidence.json](IV2-18-evidence.json) 与 [IV2-PR-001-evidence.json](IV2-PR-001-evidence.json) 分别是对应报告的结构化证据。

| 报告 | 主题 | 随附 PR |
|---|---|---|
| [3D-STACK-001](3D-STACK-001.md) | 浏览器 3D 与 UI 技术选型讨论 | #7 |
| [API-CONFIG-001](API-CONFIG-001.md) | 页面配置模型 API 并验证启用 | #1 |
| [API-REVIEW-001](API-REVIEW-001.md) | 模型接口选型核对 | #24 |
| [ASSET-KIT-001](ASSET-KIT-001.md) | 非角色站厅素材小样与可复用资产包 | #14 |
| [ASSET-KIT-001-V2](ASSET-KIT-001-V2.md) | 非角色站厅素材小样与可复用资产包（V2 复验） | #14 |
| [BLACKOUT-SWITCH-001](BLACKOUT-SWITCH-001.md) | Agent 操作电闸触发限时熄灯 | #45 |
| [BUBBLE-BORDER-001](BUBBLE-BORDER-001.md) | 移除角色气泡左侧强调效果 | #53 |
| [CHARACTER-JITTER-001](CHARACTER-JITTER-001.md) | 角色抽搐修复 | #26 |
| [CHECKPOINT-001](CHECKPOINT-001.md) | 设施移动目标对齐队尾 | #43 |
| [CREATIVE-001](CREATIVE-001.md) | 保留玩家的非常规玩法目标 | #12 |
| [CURRENT-ACTION-001](CURRENT-ACTION-001.md) | 当前行动在行程记录外常显 | #63 |
| [DEADLINE-001](DEADLINE-001.md) | 开局选择截止时间 | #26 |
| [DEMO-PREVIEW-001](DEMO-PREVIEW-001.md) | 启动验收预览 | #26 |
| [DEMO-TRIAGE-001](DEMO-TRIAGE-001.md) | 三小时 Demo 优先级评估 | #24 |
| [DEPLOY-COMPOSE-001](DEPLOY-COMPOSE-001.md) | Docker Compose 部署 | #1 |
| [DIALOGUE-ORDER-001](DIALOGUE-ORDER-001.md) | 多 NPC 对话有序展示 | #61 |
| [DOC-COMPOSE-001](DOC-COMPOSE-001.md) | GitHub 首页部署教程 | #6 |
| [FACILITY-RANDOM-001](FACILITY-RANDOM-001.md) | 按情景种子随机生成设施故障 | #16 |
| [FINAL-LOCAL-001](FINAL-LOCAL-001.md) | 本地最终测试版本 | #26 |
| [GUARD-BALANCE-001](GUARD-BALANCE-001.md) | 减少安检员压迫感并扩大可读风险窗口 | #66 |
| [GUIDANCE-RETRY-001](GUIDANCE-RETRY-001.md) | 被拒后调整话术的执行跟踪 | #61 |
| [INT-README-001](INT-README-001.md) | 修复 Luna PR 的 README 集成冲突 | #1 |
| [IV2-09](IV2-09.md) | 服务端 Boss 与 NPC 对话 | #32 |
| [IV2-10](IV2-10.md) | Runner 与角色工具 | #32 |
| [IV2-11](IV2-11.md) | 观战展示 | #32 |
| [IV2-12](IV2-12.md) | 垂直切片集成 | #32 |
| [IV2-MERGE-001](IV2-MERGE-001.md) | 规划修正与合入 | #21 |
| [IV2-RAILING-001](IV2-RAILING-001.md) | 安检低栏杆翻越可达 | #36 |
| [LLM-LATENCY-001](LLM-LATENCY-001.md) | 模型调用延迟优化 | #11 |
| [METRO-INTEGRATION-001](METRO-INTEGRATION-001.md) | 青绿线列车接入正式站台 | #38 |
| [METRO-TRAIN-001](METRO-TRAIN-001.md) | 中国城市地铁列车小样 | #38 |
| [MODEL-LOADING-OVERLAY-001](MODEL-LOADING-OVERLAY-001.md) | 模型首次加载进度遮罩 | #57 |
| [NAIWA-COLLISION-001](NAIWA-COLLISION-001.md) | 奶蛙保安碰撞体修复 | #47 |
| [NPC-BUBBLE-001](NPC-BUBBLE-001.md) | 连续对话气泡避让 | #52 |
| [NPC-MODEL-001](NPC-MODEL-001.md) | Agent 与 NPC 模型配置分离 | #20 |
| [OPENING-001](OPENING-001.md) | 模型从开局自主选择路径 | #10 |
| [PERF-001](PERF-001.md) | 观战性能与可选低开销设置 | #22 |
| [PR-SUBMIT-001](PR-SUBMIT-001.md) | 提交 Responses、界面与性能更新 | #22 |
| [PR14-REVIEW-001](PR14-REVIEW-001.md) | 布局导向带与开口同步 | #14 |
| [PULL-001](PULL-001.md) | 同步当前分支 | #24 |
| [PULL-002](PULL-002.md) | 同步最新仓库 main | #24 |
| [PULL-003](PULL-003.md) | 快进当前 main 到最新仓库 | #24 |
| [RECORD-COLLAPSE-001](RECORD-COLLAPSE-001.md) | 开局默认收起行程记录 | #50 |
| [RESPONSES-001](RESPONSES-001.md) | 统一 Responses 与 DeepSeek 思考设置 | #22 |
| [RESTORE-REVIEW-051](RESTORE-REVIEW-051.md) | 恢复 PR #51 的行程复盘 | #64 |
| [RUN-001](RUN-001.md) | 本地启动游戏 | #24 |
| [SYNC-001](SYNC-001.md) | 同步本地项目与云端功能分支 | #3 |
| [TRAIN-BOARDING-002](TRAIN-BOARDING-002.md) | 站台 NPC 登车并从场景移除 | #44 |
| [UI-JOURNEY-001](UI-JOURNEY-001.md) | 六阶段旅程界面 | #35 |
| [UI-MOBILE-INFO-001-LATEST](UI-MOBILE-INFO-001-LATEST.md) | 移动端本局信息位置统一 | #59 |
| [UI-POLISH-001](UI-POLISH-001.md) | 全界面统一优化 | #22 |
| [VICTORY-CAMERA-002](VICTORY-CAMERA-002.md) | 胜利镜头编排与自动恢复 | #40 |
| [WATCH-UI-001](WATCH-UI-001.md) | 观战记录与终局入口 | #41 |
| [WORKTREE-CLEAN-001](WORKTREE-CLEAN-001.md) | 只保留一个 AgentGo 目录 | #24 |

中央记录只链接报告并概括状态，不复制全部命令和结果。未来报告由集成负责人在本索引登记，避免并行任务同时编辑索引；任务可先从各自简报链接报告。

- [WORLDGEN-001 世界生成器 V1](WORLDGEN-001.md)：基线、生成与分层、兼容及浏览器结果。

- [WORLDGEN-002 入口楼梯与连续入站](WORLDGEN-002.md)：玩家下楼入场、乘客来源、通道/镜头/回放及兼容验证。

- [WORLDGEN-003 生成场景正式模型与表面材质](WORLDGEN-003.md)：列车、楼扶梯、入口/轨道/设施贴图、资源归属及渲染验证。

- [SHOWROOM-001 资产展厅与组合样板间](SHOWROOM-001.md)：独立生产入口、47件资产、15种表面及组合/单件/材质浏览器验证。
