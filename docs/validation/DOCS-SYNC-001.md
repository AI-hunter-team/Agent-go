# DOCS-SYNC-001 验证报告

状态：文档检查快照；纯文档改动，不代表浏览器、真实模型或部署验收。

## 版本与环境

- 任务简报：[DOCS-SYNC-001](../tasks/DOCS-SYNC-001.md)。
- 执行人/日期：Claude Code 本次会话，2026-11-01（Asia/Shanghai）。
- 基线/受测版本：`origin/main` `8a98665` 加本任务未提交文档修改；独立 worktree，无其他脏文件。
- 环境：macOS，Node.js 24.8.0；未安装或修改依赖。

## 仓库同步核对

| 检查 | 结果 |
|---|---|
| `git fetch origin` 后本地 `main` 与 `origin/main` | 本地落后 4 个提交（PR #65、#66）；主工作区未提交的源码修改与已合入的 PR #66 内容逐文件相同，仅 `scenario.ts` 缺 PR #65 的一行删除。已将这些重复修改存入 stash 后快进至 `8a98665`，stash 与 HEAD 的差异只剩 PR #65 本身的改动 |
| GitHub PR | `gh pr list --state all`：#1–#66 中除 #29（重复的地图适配方案，已关闭）外全部合入，无开放 PR |
| 未入库文件 | 主工作区的 `MIGRATION-ALIYUN-HK-001` 简报/验证属于另一会话进行中的部署任务，保持原样 |

## 文档修正与依据

| 文档 | 原内容 | 源码/主线事实 |
|---|---|---|
| `docs/开发计划.md`、`docs/ROADMAP.md`、`docs/README.md`、`docs/interaction-v2/README.md`、`PROGRESS.md`、`TODO.md` | 多项任务标为“本地未提交/未合入”；路线图基线停在 `c6bfb52`；IV2 写“不合并” | PR 均已合入；新增主线合入对照，路线图基线改为 `8a98665` |
| `docs/validation/README.md` | 55 份报告未登记 | 补充索引并标明随附 PR |
| `docs/DEVELOPMENT.md` | `gameSession.test.ts` 双整局预算 30 秒；目录表缺 3D 场景、回放和素材 | `tests/gameSession.test.ts` 为 `45_000`（PR #62）；`src/ui/scene/`、`src/replay/`、`src/assets/` |
| `README.md` | 翻闸只检查两名保安；NPC 使用独立 `NPC_*` 模型；`test:model` 测创造性意图；“有限创造性机制” | `engine.ts` 使用 `GUARDS` + `SECURITY_STAFF_BALANCED`；NPC 用会话绑定模型（`server/index.ts`）；`scripts/test-model.ts` 无创造性用例；自由行动经 `/api/boss/interpret` |
| `docs/DOCKER.md` | 不能假定 main 含 Responses；缺调试日志卷 | PR #22 已合入；`compose.yaml` 的 `debug-logs` 卷与 `DEBUG_LOG_ENABLED` |
| `docs/MVP技术方案.md` | §4 列出已删除的 `creative.ts`、`server/` 位于 `src/` 下；§10 含已删除的 `/api/creative/classify`、`/api/session` 只返回 `sessionId`；§20 “120 秒默认”；§21 车厢“本地未提交” | `server/app.ts` 现行 16 条路由；`DEFAULT_GAME_SETTINGS.timeLimitSeconds = 150`；PR #60 已合入 |
| 失效链接 | `src/sim/creative.ts`、`server/openai.ts`、CUTIN-PERMISSION-001 ×2 | 改为现行文件、删除前固定链接或纯文本说明 |

## 实际执行

| 检查层次 | 实际命令/操作 | 状态与结果 |
|---|---|---|
| 链接与锚点 | 一次性 Node 脚本：遍历 `git ls-files "*.md"`，忽略代码块与行内代码，检查相对路径存在及 Markdown 标题锚点 | 修改前 283 个文件 5 处失效；修改后 0 处 |
| 差异空白 | `git diff --check`，新文件 `grep -n '[[:space:]]$'` | 通过，无输出 |
| 源码核对 | 只读子代理与本会话分别核对 README/DOCKER/DEVELOPMENT/技术方案与源码，重点项均回到源码行复核 | 已按上表修正 |
| npm 检查 | 未运行 | 跳过：仅文档改动，无业务、配置或依赖变化 |
| 浏览器/真实模型 | 未运行 | 不适用 |

## 结论与剩余事项

| 状态维度 | 结论 |
|---|---|
| 实现完成 | 文档修正完成 |
| 软件检查通过 | 文档检查通过；npm 检查按流程跳过 |
| 实际验收通过 | 不适用 |
| 已合入 | 否，待 PR 审核与用户授权合并 |

剩余：远端保留 51 个 `codex/*` 分支（43 个可由 Git 判定已并入 `main`，其余多为 squash 或重做后的旧分支）及本地旧 worktree，未清理；历史简报/报告正文的状态行仍为快照，以中央记录的合入对照为准。
