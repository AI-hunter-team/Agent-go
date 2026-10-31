# GUIDANCE-RETRY-001 验证报告

日期：2026-10-31（Asia/Shanghai）。执行与本地集成：本聊天 Codex；另有独立只读 Agent 代码审查。任务：[GUIDANCE-RETRY-001](../tasks/GUIDANCE-RETRY-001.md)。

## 版本与范围

- 本地基线：`eaf19961e1230036b75b1a00343da49d19fcf6ba`；独立分支 `codex/guidance-follow-through`，工作区 `Agent-go-guidance-follow-through`；本次代码、测试与文档均未提交。
- macOS、Node.js `v22.23.1`、npm `10.9.8`；链接使用相邻验收工作区相同锁文件对应的 node_modules，无依赖或锁文件修改。
- 原始症状来自既有对局日志；本轮不调用真实模型或复制凭据。使用实际模拟器、Runner 和伪模型响应验证行为。

## 检查结果

| 检查 | 实际结果 |
|---|---|
| RED | 初始对话结果 3 个断言失败；初始 guidanceRetry 7 个断言失败，确认缺少进度/纠正/act 检查；否定范围、复合后缀及让位途中失效分别补失败复现 |
| GREEN | `npm test -- tests/guidanceRetry.test.ts tests/dialogue.test.ts tests/responses.test.ts --maxWorkers=2`：57 项通过；后续完整运行同时包含 journey HTTP 检查 |
| 类型 | `npm run typecheck` 退出 0 |
| 完整自动化 | `npm test -- --maxWorkers=2 --testTimeout=15000`：90 文件，88 通过、2 失败；740 项，737 通过、3 失败，41.75 秒，退出 1。新增 23 项全部通过 |
| 构建 | `npm run build` 退出 0；包含类型、Vite、esbuild；仅保留已有 Three.js 大文件提示 |
| Diff | `git diff --check` 退出 0；新文件另查行尾空白与换行 |
| 独立审查 | 发现两项重要问题：提前报告让位成功、复合行动自动续跑绕过待办；均通过新增失败测试修复；无遗留次要问题。不是人工批准 |
| 本地启动 | 独立生产服务只监听 `127.0.0.1:8084`，PID `12768`；健康接口返回 `llm:false, model:null` |
| 静态/API | 独立 HTTP 请求确认首页、入口 JS、CSS、健康接口均 200；首页及入口资源 SHA-256 与本工作区 dist 完全一致 |

首轮沙箱内 HTTP 测试因 `listen EPERM 127.0.0.1` 超时；停止该轮后，在获准回环监听的环境重跑，未以超时作为产品失败。初始基线无指导的模拟测试已显示下面三项失败，既有 LOCAL-ACCEPTANCE-001 报告也记录相同结果。

## 三项已知基线失败

- `tests/heuristicAgent.test.ts` / `original orderly fixture also passes on seed 4`：期待 success，实际 failed。
- `tests/heuristicAgent.test.ts` / `new fixed crowd can time out orderly play while retaining a legal route on other seeds`：期待 success，实际 failed。
- `tests/runner.test.ts` / `the integrated map has a legal route within the 150-second dense default`：实际 122 秒，断言上限 120 秒。

本任务未修改对应地图、离线策略、参数或断言。完整检查未全绿；相关修复测试、类型及构建通过不等于这些回归已解决。

## 行为与边界

- 正常对话的 ok 保持 true，拒绝通过 decision/goalAchieved 明确表达；不暴露 NPC 隐藏 reason。
- 原始指导保留在规范化 rules；原文有明确失败后改话术要求时建立进度。直接等待/排队及仅改标点的原话重复先纠正一次，调用和 token 均计入已有预算。
- 无要求、否定重试、同人约束、允许换人、明确两次重试、第一次接受、上限/对象离开、停止与迟到结果均有测试。
- 同意让位先报告 effectPending；实际移动入队才 goalAchieved=true，途中失效回传 false/blocked。
- 复合行动首次交涉被拒时暂停后缀；已有待办的 plan 必须在 talk 后返还控制，不能自动等待绕过剩余重试。
- 本次仅保守识别明确中文/英文拒绝后重试表达；复杂自然语言仍由模型理解。相同文本比较不证明语义上采用了全新说服策略；提示词要求结合公开拒绝原因调整。

## 使用与移交

修复版地址：`http://127.0.0.1:8084`。在设置中连接模型后可用原指导新开一局。其他端口及工作区未更新。

- 忽略的启动器：`logs/start-guidance-retry.py`，已清除继承模型凭据；模型由用户在页面配置。
- 日志：`logs/guidance-retry-server.log`；PID：`logs/guidance-retry-server.pid`；完整测试：`logs/guidance-retry-tests-final.log`。
- 重启：在此工作区执行 `python3 logs/start-guidance-retry.py`；端口被占用时退出，不会停止已有服务。停止前先核实 PID 的 cwd 与 8084 监听归属，再发送 TERM；PID 可能被复用。
- 实现完成；软件检查部分通过（上述三项已知失败）；完整浏览器整局及真实模型验收未运行；未提交、推送、合入或公网部署。

## 接续：前端按钮超出视口的修复

用户反馈 8084 找不到按钮后，实际读取当前浏览器并截图确认：视口 637×854，开始按钮 y=1021.96–1063.96，修改指导 y=1073.96–1115.96；动画 transform 覆盖准备面板的居中 transform，且45vw窄栏使内容过长。此前独立修复版未包含验收工作区的本地 CSS 修复。

- 仅修改 `src/ui/App.module.css` 三处：独立 translate 负责垂直居中；601–900 宽度为 min(440px, calc(100% - 48px))；手机底部面板复位 translate。
- 复用现行既有布局修正，未改按钮操作、模型设置或游戏逻辑；没有新增镜像 CSS 实现的单测。浏览器真实测量作为该低影响样式修正的验证。
- `npm run build` 和 `git diff --check` 退出 0，生产构建包含类型检查；原 Three.js 分包提示保留。
- 使用现有无费用 `tests/browser-fixture.ts` 在8893启动，216字指导生成长方案；没有调用用户模型、运行其准备方案或刷新用户8084标签。

| 视口 | 面板与按钮结果 |
|---|---|
| 637×854 | 面板 x=173、y=70、440×714，完整处于窗口内；向下滚动后开始按钮 y=665.17–707.17，修改指导 y=717.17–759.17 |
| 390×844 | 手机底部面板 x=12、y=342.48、366×489.52；滚动后开始按钮 y=716.95–758.95，修改指导 y=768.95–810.95 |
| 1280×720 | 滚动后开始按钮 y=522.80–564.80，修改指导 y=574.80–616.80 |

三个视口均以 elementFromPoint 检查按钮中心确实命中按钮自身，未被覆盖；截图证据 `logs/layout-fixed-637.jpg` 已查看。临时视口覆盖已清除，验证标签关闭，8893伪模型服务已停止。原8084仍停留用户已生成的方案，未清除其模型连接。

8084继续由原生产服务提供新静态构建。HTTP确认新首页及 `index-zxLcAT9N.css` 与 dist 字节一致；用户刷新后生效。刷新会丢失临时模型连接与内存方案，需要重新连接/生成；本次未替用户执行刷新。纯 CSS 变更不重启 API、不重复运行与布局无关的全量业务测试；上文三项基线失败状态不变。
