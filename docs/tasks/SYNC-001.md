# SYNC-001：同步本地项目与云端功能分支

状态：同步完成，远端 PR 待人工审核。负责人及本次集成协调：Codex 当前会话；人工审核待用户。

## 目标、基线与范围

用户要求核对并同步本地仓库和云端。当前根工作区停留在旧提交且混有 Debug、API 配置和独立安全校验；main 仍跟踪旧仓库。已 fetch 核实 main 与功能分支，先备份未提交文件，不删除原始修改。

- 本次基线：Debug `6f2c1e6a166d057606eb4a8a7eb9b5c01e0109b5`；云端 Luna 集成 `66d7ede44f8824bb99326998a51fd98b1e644c6c`（含已合并的 API 配置 PR #4 与 Docker PR #5）。main 仍为文档基线，Luna PR #1、Debug PR #3 与部署文档 PR #6 待审。
- 工作区：使用已有独立 Debug worktree 解决依赖冲突；完成后同步根目录工作区。原始 38 项已变更/未跟踪文件已有私有本地备份，保留凭据和运行文件，不提交原始日志。
- 允许：将云端 Luna 最新基线 merge 进 Debug 分支，同步保留安全相关 server 模块和测试，调整 `Dockerfile`/`compose.yaml` 的可写日志目录及命名卷；处理 `server/app.ts`、`server/index.ts`、`src/agent/remoteAgent.ts`、`src/ui/App.tsx` 的重叠，核对模型配置消费者；保留根目录已有安全校验及对应测试，新增本简报和验证记录；同步本地分支/跟踪配置。
- 排除：不自动合并 GitHub PR、不部署、不新增玩法、不修改其他 worktree 的未提交工作，安全校验作为已存在本地修改随同步保留，在提交及 PR 中明确列出，不隐瞒范围变化。
- 接口约定：保留 API 配置的会话绑定及授权 token；Debug 使用绑定模型的参数并在报告保存时执行相同会话权限校验；保留 Compose 静态资源与关闭流程。

## 验证、回退与交接

类型检查、全部 Vitest、生产构建及 diff 检查；检查原始本地修改备份和根目录与远端关系。无新 UI 布局，不调用付费 API；Docker 不因同步重新部署。

依赖先云端 Luna、再 Debug；更新现有 PR #3，不另合并 PR #1。备份与 Git stash 保留，回退可切回旧分支并恢复 stash，不使用破坏性清理。具体完成状态见 [验证记录](../validation/SYNC-001.md)。
