# SYNC-001 验证与同步记录

状态：本地整合快照，GitHub PR 保持待审核，不自动合并。

## 版本与环境

执行：Codex 当前会话，2026-10-30，Asia/Shanghai。简报：[SYNC-001](../tasks/SYNC-001.md)。macOS，Node v24.8.0 / npm 11.6.0，复用已有依赖。

- 根目录原基线 `de7796de2d2e6c6f7b64e2a395d58444fe689ac8`（旧的 `codex/debug-ai-timing`）。本地 main 比 origin/main 落后 33 个提交，还跟踪 previous-origin/main。
- 云端 Luna 功能集成基线 `66d7ede44f8824bb99326998a51fd98b1e644c6c`，含 API 配置和 Docker；Debug 基线 `6f2c1e6a166d057606eb4a8a7eb9b5c01e0109b5`。
- 当前验证树：上述分支合并，加根目录原有安全校验文件及消费者、浏览器配置模型的 Debug fetch/参数/权限整合、Docker Debug 日志卷。验证时为待提交树，不冒称已提交测试。

## 原始修改保留

38 项本地变更/未跟踪文件已保存私有本地备份（文件归档、tracked patch、SHA256 清单），原始凭据未纳入备份或提交。根目录切换前另保存 Git stash，作为可恢复快照。

对照原始源码：保留本地输入安全检测、提示与不可信数据分离、结构检查、单工具要求及安全错误处理；保留上游的会话模型绑定、前端生产静态服务和退出流程。Debug 使用更新的逐次分类结果记录及取消计时处理。唯一原始仅本地内容为真实运行 JSON，留在备份，不发布到 GitHub。

## 检查结果

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | 20 个文件、176 项通过；未调用外部模型 |
| `npm run build` | 前端 Vite 与生产服务端 esbuild 均通过 |
| 浏览器配置 Debug 兼容 | 现有配置链路测试补充验证 runId、绑定模型、思考/输出预算、供应商调用元数据以及报告接口跨配置拒绝 |
| `git diff --cached --check` | 通过；38 个暂存文件的冲突标记、凭据与运行产物扫描通过 |
| Docker | 本机没有 Docker CLI，本次未重建/运行容器；静态检查日志目录归属 node 用户、DEBUG 环境变量与命名卷。原 Compose 验证见 DEPLOY-COMPOSE-001，不冒称覆盖本次日志卷改动 |
| 浏览器/付费 API | 本次同步未重跑，现有对应结果保留在各任务验收记录 |

## 交接与限制

当前功能整合分支为 `codex/debug-ai-timing-logs`，继续由 PR #3 审核；其 base 为 Luna 功能分支，PR #1 仍待审核。main 只同步已在 main 的提交，不把功能 PR 自动合入。部署教程 PR #6 仍独立待审。

本次修复分支/跟踪不一致并保留已有本地安全工作。原始快照和凭据留在本机；根目录预期与该远端功能分支提交一致，不再混有已发布功能的未提交副本。CI 现行 main 过滤条件不会自动覆盖以功能分支为 base 的 PR，不能将本地通过当作云端 CI。

人工审查未进行，远端 PR 未合并；本次没有部署或真实模型调用。若需恢复原始工作，切回旧分支并在核对后的工作区应用保留的 stash，勿 force push 或破坏性清理。


## 同步完成核对

整合提交 `d2628f34d3583135f564f55cbea30468b79028f7` 已推送。根目录已切至 `codex/debug-ai-timing-logs` 并跟踪同名 origin 分支，SHA 一致、ahead/behind 为 0/0、工作区干净。main 已快进至 origin/main 的 `e8efed5e66e4a63ca1a1e867166f04b76c3ac2f9` 并改为跟踪 origin/main；原先落后的独立 Luna worktree 也已快进到其云端分支。

原始工作保存于命名 stash `presync-20261030-original-debug-api-safety` 及私有文件备份；本地 `.env` 的同步前后 SHA256 相同，凭据没有覆盖。本记录补交后继续推送同一分支，保持根目录与云端一致。远端 main 与功能分支仍有待审核的功能差异，不以同步操作代替 PR 合并。
