# DOC-COMPOSE-001：GitHub 首页部署教程

状态：文档实现及检查完成，待 PR 审核和集成。单一负责人及文档集成协调：本次 Codex 会话；人工审查未进行。

- 当前授权：用户指出“没有在 GitHub 页面修改新的 Docker Compose 部署方式教程”，要求修正 GitHub 可见的教程；沿用此前“按规范提交 PR 并供我审核”的交付要求。本任务仅更新首页文档及教程入口，不把功能 PR #1 合入 `main`。
- 基线：远端 `main` / `e8efed5e66e4a63ca1a1e867166f04b76c3ac2f9`；独立分支 `codex/docs-compose-guide`，工作区代号 `agent-go-compose-guide`。
- 原因：PR #5 已于 2026-10-30 合入 `codex/luna-api-thinking-budget`，其 README 含 Compose 说明，但 GitHub 默认分支仍是 `main`；首页没有该说明，而且 `main` 尚无 Compose 文件。
- 允许路径：`README.md`、`docs/DOCKER.md`、本任务简报与验证报告。排除所有源代码、Docker/Compose 实现、依赖、工作流、中央记录及其他任务。
- 完成条件：首页有明显的 Docker 部署入口；教程包含正确分支的克隆、构建启动、访问、页面 API 配置、环境变量、端口、宿主机网关、更新/停止与故障排查。不能让用户在不含 Compose 的 `main` 中直接执行启动命令。
- 实现依据：部署版本 `66d7ede44f8824bb99326998a51fd98b1e644c6c` 中的 Compose/Dockerfile/模型 UI，以及 PR #5 的实际 CI；共同流程沿用根 AGENTS 与文档导航。
- 验证：文档相对链接、命令与实际部署文件核对、差异空白、GitHub 最终渲染入口。纯文档不重跑业务测试，不把历史 Docker 成功记录说成本次重跑。
- [验证报告](../validation/DOC-COMPOSE-001.md)。交付使用指向 `main` 的纯文档 PR，提交用户审核；合并后复核默认首页入口。本任务不代替用户批准或合并 PR，功能代码的既有审核流程保持独立。
- 回退：撤回本任务文档提交即可，无代码或数据迁移。PR #1 未来合入 `main` 后，由其集成人同步教程适用分支说明；本任务不修改默认分支设置。
