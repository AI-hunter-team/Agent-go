# WORKTREE-CLEAN-001：只保留一个 AgentGo 目录

状态：本地清理完成；2026-10-31（Asia/Shanghai）。

- 授权与目标：用户要求处理两个 AgentGo 文件夹，只留一个。保留原 `AgentGo`，移除相邻的 `AgentGo-latest` Git worktree。
- 单一负责人及集成人：本聊天 Codex 会话，串行执行目录清理与最终核对。
- 基线：原目录位于 `codex/responses-deepseek` / `633f941783478b242fbd7f9cd530cf1a887fd5b1`，有其他任务未提交开发；辅助目录位于 `codex/station-asset-kit` / `68fd7d7359b8f1603c7b756d4ffaebbda602ae87`，工作区干净，代码树与已合入 main 的 `b1bde9d` 一致。
- 路径边界：保留主目录业务文件、配置、依赖和所有本地修改；允许复制辅助目录的 `dist/`、`build/`、`artifacts/pr14-review/` 到主目录本地产物区，停止/迁移本聊天启动的 5192 预览服务，并通过 `git worktree remove` 移除已核实的辅助目录。仅追加本任务简报、验证、PROGRESS、TODO 及中央记录。
- 本地产物位置：原浏览器证据保存在 `artifacts/pr14-review/`；辅助目录构建保存到 `artifacts/pr14-delivery/`，不覆盖当前开发的 `dist/` 或 `build/`。目录使用本地 Git 排除，不提交原始产物。
- Git 边界：辅助分支历史已由 main 保留；只允许本地 main 快进同步，不切换或合并正在开发的 Responses 分支，不提交、推送、发布或改写业务函数。
- 完成条件：辅助目录无独有未提交代码；待保留产物逐文件 SHA256 一致；仅剩一个 worktree 和一个实际项目目录，主目录开发分支与修改保留，预览路径有效。
- 验证：[清理记录](../validation/WORKTREE-CLEAN-001.md)。只做文件/Git/HTTP 核对，不运行业务测试或新增构建。
- 回退/交接：素材源代码和提交仍在 Git；复制产物保留可用预览。若未来需要并行开发，按正常 worktree 流程另建，不能通过恢复旧双目录改变当前用户选择。
- 结果：移除干净的辅助 worktree 后仅剩原目录；81 个产物文件复制后逐个 SHA256 一致；本地 main 已快进到 `b1bde9d`，当前 Responses 开发分支保持 `633f941` 且未切换。另一个对话的开发持续进行，本会话没有操作其业务源码、测试或安装过程。
