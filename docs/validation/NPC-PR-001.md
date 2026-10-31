# NPC-PR-001 验证与分支清理记录

状态：进行中，未宣称已合入。任务入口：[简报](../tasks/NPC-PR-001.md)。

## 环境与基线

- 执行人：本次 Codex 会话，2026-10-31（Asia/Shanghai）；macOS，沿用锁定 npm 安装，Node v24.8.0 / npm 11.6.0。
- 原实现基线 `633f941783478b242fbd7f9cd530cf1a887fd5b1`，原 364 项检查及浏览器证据见 [NPC-VISUAL-001](NPC-VISUAL-001.md)。
- 本轮已同步 GitHub，集成目标当前 origin/main 为 `b1bde9d`（资产工具包、DeepSeek 思考兼容已合入）。PR #16 随机设施故障尚开放，不属于本次集成/清理范围。
- 本轮用户明确授权提交、推送、PR、解决兼容、合并与清理已合并 codex/ 分支；不部署，不发起付费模型调用。

## 执行记录

- 集成前 `npm run typecheck`、`npm run build`、`git diff --check` 通过；构建仍提示已有大 chunk，未视为性能验收。
- 首次全量与构建并行，`gameSession` seed 1 耗时超过默认 5 秒（其余 363 项通过）；停止构建竞争后独立执行 `npm test`，40 文件/364 项全部通过，seed 1 为 2.734 秒。没有改变测试超时或断言掩盖失败。
- 集成目标为 `b1bde9ddb24edbcee7d621eb0b9dae7fee91997e`；仅验证索引与中央记录发生文本冲突，保留双方条目。源码自动合并；DeepSeek 17 项新增回归保留。
- 资产库 `src/assets/station-kit/` 与独立预览使用自身布局，未引用模拟器设施 head，游戏运行时仍用 Station 几何模型。本轮没有将预览资产擅自接入游戏；未来正式资产仍需按实际尺寸校准碰撞。
- 集成后 `npm run typecheck`、`npm test`（41 文件/381 项）、`npm run build` 均通过；保留已有大 chunk 提示。
- 集成后刷新 5174 应用内浏览器，离线 seed 9 / 120 秒 / 每队额外 3 人，4× 完整流程在 94.7 秒进入站台，无违规，15 次离线决策；76.8 秒暂停/继续正常，场景站位保持分离；浏览器 warn/error 列表为空。设施朝向的暂停截图与断言见原修复报告，集成没有修改此源码。
- diff/暂存 diff 空白检查通过；仅核对本轮文档的相对文件链接和完整差异，未声称新增仓库检查脚本。
- PR/CI 与分支清理待完成，未完成项不视为通过。

## 自动审查核对与修正

- [自动审查 P1](https://github.com/AI-hunter-team/Agent-go/pull/17#discussion_r4430276709) 指出 HALL_S→S1 会在输送带后侧振荡。执行者新增普通/行李乘客端到端回归：修复前两例均未能在 600 tick 内进入办理，确认问题成立。
- 固定场景碰撞矩形现在同时参与导航：按人物半径生成障碍物角点，缓存各体积的静态可视图，把绕行路点保存在活动路径中；每步仍执行动态人物避让和扫掠。消费者 `walkTo` / `joinQueue` 传入真实半径；保安保持局部停让，不改变其路线和规则。
- 两例回归修复后均到达 S1 并进入办理，且逐步没有穿过实体；移动/导航/楼梯 25 项通过。完整 `npm run typecheck`、`npm test`（41 文件/383 项）、`npm run build`、diff 检查通过。
- 最终源码再次刷新应用内浏览器，离线 seed 9 / 120 秒 / 每队额外 3 人 / 4×，**93.3 秒**进入站台，无违规、14 次离线决策，warn/error 为空。此前 94.7 秒保留为修复前集成快照，不冒充最终成绩。
- AI 意见由执行者按复现、源码与测试事实核对；人工审查未进行。远端最终 head 的 CI 仍需实际通过。

## 状态

- 原人物修复与最新 main 兼容集成完成；类型/383 项自动化/构建及限定范围离线浏览器验收通过，待远端 CI 与合入。
- 人工审查未进行；AI 审查若有意见由本次执行者按代码/测试事实核对，不代表人工批准。
- 尚未合入；清理清单及恢复用 SHA 完成后记录。

## PR 与清理交接

- [PR #17](https://github.com/AI-hunter-team/Agent-go/pull/17)；合并及清理操作的最终 SHA、CI 链接和实际删除/保留数量追加在该 PR 正文，便于合入后继续记事实，不把计划写为完成。
- 下表为删除前清单（13 个既有本地分支、11 个 origin 分支），全部经 `merge-base --is-ancestor <SHA> origin/main` 核对。合并后执行前会再核对远端准确 SHA、开放 PR 与 worktree；引用变化则保留。干净 worktree 仅 detach，目录和文件保留；本任务分支也仅在实际合并后按同样标准清理，最终 head 可由 PR 恢复。
- 保留 `codex/random-facility-failures`（PR #16 开放）；保留 `codex/startup-api-config`（worktree 有其他任务未提交工作）；保留 main、mvp-dev、已有 detached worktree 和 previous-origin。
- 恢复示例：`git branch <原分支名> <表中SHA>`；远端确需恢复时由对应负责人另行推送，不触碰原工作区的无关改动。

| 引用 | 恢复 SHA | 删除依据（执行前仍需复核） |
|---|---|---|
| `codex/agent-go-branding` | `54e21972f57a7cfa4776854b81536d720a6109b8` | main 可达；PR #9 |
| `codex/debug-ai-timing` | `de7796de2d2e6c6f7b64e2a395d58444fe689ac8` | main 可达 |
| `codex/debug-ai-timing-logs` | `286926402cd90948ad9bc55e8315d025544ea886` | main 可达；PR #3 |
| `codex/docker-compose` | `6b889d4e45bbabef473f2000102240bee12e9520` | main 可达；PR #5 |
| `codex/docs-compose-guide` | `7b9f7cec15ac9a2b646177553233a242233d8a41` | main 可达 |
| `codex/luna-api-thinking-budget` | `66d7ede44f8824bb99326998a51fd98b1e644c6c` | main 可达；PR #1 |
| `codex/model-api-settings` | `b16f7e3f2887eb383d146160cf419e19a8e86f19` | main 可达；PR #4 |
| `codex/model-latency` | `053e51c6aef719fde81693a9eddd155b2be990f3` | main 可达；PR #11 |
| `codex/model-opening-autonomy` | `4b602d9c626da39d5d0c162c3a32c6976e4839d8` | main 可达；PR #10 |
| `codex/pr7-conflict-resolution` | `5bafcdb36478d318d5a310e2b243053be48d0840` | main 可达；PR #7 |
| `codex/preserve-creative-guidance` | `9dffc2ac839cd20e277972b3d90262ea01fb9633` | main 可达；PR #12 |
| `codex/remaining-pr6-integration` | `b7e4317b86059c684384e483f3d61ed62b1c3a8f` | main 可达；PR #6 |
| `codex/remaining-pr8-integration` | `9c8acd5aa19c90160c9fb4a0451c225c6a15735b` | main 可达；PR #8 |
| `origin/codex/agent-go-branding` | `54e21972f57a7cfa4776854b81536d720a6109b8` | main 可达；PR #9 |
| `origin/codex/debug-ai-timing-logs` | `286926402cd90948ad9bc55e8315d025544ea886` | main 可达；PR #3 |
| `origin/codex/docker-compose` | `6b889d4e45bbabef473f2000102240bee12e9520` | main 可达；PR #5 |
| `origin/codex/docs-collaboration` | `63faa5e4cd37938df83a873e2a2ac8039f7c8acd` | main 可达；PR #2 |
| `origin/codex/docs-compose-guide` | `b7e4317b86059c684384e483f3d61ed62b1c3a8f` | main 可达；PR #6 |
| `origin/codex/fix-deepseek-thinking` | `4301fcc14e9897fcefe67b3eb77aac7cb234dac2` | main 可达；PR #15 |
| `origin/codex/luna-api-thinking-budget` | `66d7ede44f8824bb99326998a51fd98b1e644c6c` | main 可达；PR #1 |
| `origin/codex/model-api-settings` | `b16f7e3f2887eb383d146160cf419e19a8e86f19` | main 可达；PR #4 |
| `origin/codex/model-opening-autonomy` | `4b602d9c626da39d5d0c162c3a32c6976e4839d8` | main 可达；PR #10 |
| `origin/codex/preserve-creative-guidance` | `9dffc2ac839cd20e277972b3d90262ea01fb9633` | main 可达；PR #12 |
| `origin/codex/trajectory-replay` | `9c8acd5aa19c90160c9fb4a0451c225c6a15735b` | main 可达；PR #8 |
