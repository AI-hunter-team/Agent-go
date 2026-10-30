# INT-README-001 验证报告

状态：冲突修复验证快照，远端 PR 尚未合入。

## 版本与环境

- 简报：[INT-README-001](../tasks/INT-README-001.md)。执行：Codex 当前会话，2026-10-30，Asia/Shanghai。
- PR #1 受测树：`de7796de2d2e6c6f7b64e2a395d58444fe689ac8` 合入 main `e8efed5e66e4a63ca1a1e867166f04b76c3ac2f9` 后的待提交版本；仅 README 人工解决冲突及本任务记录为新编辑。源码/测试/依赖与原 PR #1 相同。
- macOS，Node v24.8.0，npm 11.6.0；复用本机已有 npm 安装，未重装或改锁文件。独立 worktree 使用临时 node_modules 符号链接，验证结束移除，不提交。
- PR #3 随后同步修复后的 PR #1；其 Debug 源码保持 `16ffebc1eede9c83319886b818dfd7d03b956b77` 的实现。

## 检查及结果

| 检查 | 实际结果 |
|---|---|
| PR #1 `npm run typecheck` | 通过，退出 0 |
| PR #1 `npm test` | 15 文件、127 项通过，退出 0 |
| PR #1 `npm run build` | 通过，退出 0 |
| PR #1 `git diff --cached --check` | 通过 |
| 源码一致性 | `git diff HEAD -- src server scripts tests package.json package-lock.json` 为空，集成未改变原 PR 业务实现 |
| README 冲突及事实 | 保留 Luna/Anthropic、思考 1024 与总输出 4096、真实模型记录、主分支协作入口和 CI；去除“尚无真实模型验收”的过时总述 |
| 文档审计 | 对 README 与本任务两份记录执行一次性本地相对链接存在性、冲突标记及敏感字串检查；外部链接和 Markdown 锚点未自动复验 |
| 浏览器/付费模型 | 未重跑；此次只修复文档冲突，不改变页面或模型行为 |

## 状态和交接

实现完成：README 冲突已解决；软件检查通过范围如上。实际验收：本次无 UI/模型行为变化，不追加实测；历史结果见各自报告。已合入：未合并任何远端 PR；人工审查未进行。

同步 PR #1 后再同步 PR #3，保留其 Debug README 段并复验适用软件检查，结果在下方追加。PR #1 的 GitHub CI 将由 push 触发，远端结果以 Actions 为准。PR #3 暂以功能分支为 base，不符合现行 CI 的 main 过滤条件，不声称其远端 CI 已运行。

风险：主分支后续继续修改相同段落可能再次冲突。回退使用新提交撤销此次集成并核对依赖，不 force push。中央记录和路线图仍保留原任务快照，本任务未重写其他任务的历史或负责人。
