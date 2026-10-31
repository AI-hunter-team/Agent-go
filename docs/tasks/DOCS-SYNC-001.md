# DOCS-SYNC-001：文档与主线状态同步核对

状态：待集成（已提交 PR，未合入）。流程见 [DEVELOPMENT](../DEVELOPMENT.md)。

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | 核对本地仓库与 GitHub 是否滞后，并修正现行文档中与源码或主线状态不符的内容 |
| 交付物与完成条件 | 本地 `main` 与 `origin/main` 一致；现行文档的目录、接口、配置、测试预算与合入状态和 `8a98665` 一致；全部 Markdown 相对链接/锚点有效；验证见 [DOCS-SYNC-001 验证](../validation/DOCS-SYNC-001.md) |
| 单一负责人 | Claude Code 本次会话（用户在聊天中要求“查看项目文档是否准确完整以及 github 仓库内容是否滞后，你修复好”） |
| 集成负责人 | 同上；中央记录与路线图仅由本任务更新 |
| 基线 | `main` = `origin/main` = `8a98665`，2026-11-01，已 `git fetch` 核实 |
| 任务分支与工作区 | `claude/docs-sync-20261101`，独立 worktree；主工作区另有 Codex 会话的 MIGRATION-ALIYUN-HK-001 未提交记录，未触碰 |
| 前置任务与资源 | 无；`gh` 已登录，仅只读查询 PR 列表 |
| 规范与接口依据 | [文档导航](../README.md)、[DEVELOPMENT](../DEVELOPMENT.md)、`server/app.ts`、`src/shared/gameSettings.ts`、`src/sim/layout.ts`、`tests/gameSession.test.ts`、`compose.yaml` |

## 路径边界

- 允许修改：`README.md`、`PROGRESS.md`、`TODO.md`、`docs/README.md`、`docs/DEVELOPMENT.md`、`docs/DOCKER.md`、`docs/ROADMAP.md`、`docs/开发计划.md`、`docs/MVP技术方案.md`、`docs/interaction-v2/README.md`、`docs/validation/README.md`、`docs/tasks/API-REVIEW-001.md`、`docs/validation/API-REVIEW-001.md` 及本任务简报/报告。
- 明确排除：业务源码、测试、配置、依赖、其他任务的历史结论正文、`MIGRATION-ALIYUN-HK-001` 文件。
- 共享文件与顺序：无并行文档任务；迁移任务完成后由其负责人自行登记。
- 范围外发现：远端仍保留 51 个 `codex/*` 分支（43 个已并入 `main`）；本地有多份旧 worktree。未清理，需团队决定。

## 设计、决定与差异

- 历史简报与验证报告开头的“状态”保留为写作时快照，不逐份改写；在中央记录新增由 `git log --first-parent main` 与 `gh pr list` 生成的“主线合入对照”，作为合入状态的单一入口，并在导航、索引、PROGRESS/TODO 中指向它。
- 已删除源码的历史链接（`server/openai.ts`）改为删除前 commit 的 GitHub 固定链接；未随仓库交付的 CUTIN-PERMISSION-001 链接改为纯文本说明。
- 技术方案 §4/§10 按源码重写目录与路由摘要；§16 加后续变化补注，不改写当时事实。

## 验证与交付

- 文档检查：一次性 Markdown 相对链接与锚点脚本、`git diff --check`、新文件行尾空白检查；纯文档改动，不运行 npm 检查。
- 验证报告：[DOCS-SYNC-001](../validation/DOCS-SYNC-001.md)。
- 集成方式：推送分支并创建面向 `main` 的 PR；合并需用户另行授权。
- 风险与回退：仅文档；回退即关闭 PR 或还原提交。

## 交接

- 分支 `claude/docs-sync-20261101`，单个文档提交；PR 链接见验证报告或 GitHub。
- 未做：浏览器/真实模型验收（不适用）；远端旧分支与本地 worktree 清理（范围外）。
