# NPC-PR-001：移动避让 PR、兼容集成与分支清理

状态：实施中。负责人及集成负责人：本次 Codex 会话，串行执行。

## 目标与授权

- 用户明确授权：按规范提交当前人物避让/设施朝向改动，创建 PR，解决兼容并合并；完成后清理此前已合并的残留 `codex/` 分支。
- 基线：2026-10-31（Asia/Shanghai），本地 main 与 `codex/npc-spacing-facing` 均为 `633f941783478b242fbd7f9cd530cf1a887fd5b1`，叠加 [NPC-VISUAL-001](NPC-VISUAL-001.md) 未提交实现。开始时本地 origin/main 为 `b1bde9d`，需同步远端并记录实际集成基线。
- 工作区：沿用已有独立 worktree 代号 `agent-go-npc-spacing`；主工作区有同份交付及 LOCAL-RUN-001 未提交记录，保留无关修改。
- 完成条件：最新 main 兼容集成；类型/完整测试/构建/diff 及受影响实际浏览器验证；按 PR 模板交付，CI 通过后合并；核对 main CI；输出分支清理及保留依据。
- 依赖：GitHub 现有访问权限、npm 锁定安装和本地离线验证；不调用付费模型，不部署。

## 路径与接口边界

- 沿用 NPC-VISUAL-001 源码/测试路径，允许为兼容 main 资产场景调整其对应消费者、布局与测试。
- 文档允许：本简报、`docs/validation/NPC-PR-001.md`、NPC-VISUAL-001 状态追加、中央记录、验证索引；必要时在现行技术说明追加本轮集成差异。
- 保留最新 main 已合入功能，不混入其他未合入任务或本机凭据、产物；不擅自更改难度/公共 API/报告格式。
- 同一阶段只由本会话更新本轮集成路径，无子 Agent 并行开发。

## 分支清理策略

- 仅处理此仓库的 `codex/` 分支及 origin 上对应引用，不触碰 main、其他命名分支或 previous-origin。
- 以最新 main 可达性和 GitHub 已合并 PR 的准确 head commit 核对；存在未合入提交、开放 PR、脏工作区或其他不确定归属时保留并记录。
- 不用破坏性 Git 清理。对于已合并且干净、被 worktree 检出的分支，保留目录和文件，必要时仅将该 worktree 转为 detached HEAD 再删除分支；不删除脏目录或正在运行本任务试玩服务的工作区。
- 删除前保存 branch→SHA 和对应证据，删除远端时检查当前引用仍匹配已核实 commit，便于恢复。

## 验证与交接

- 执行 `npm run typecheck`、`npm test`、`npm run build`、`git diff --check`、暂存后 `git diff --cached --check`。
- 浏览器验证离线流程及资产场景兼容；保留未验证的正式资产/真实模型/性能范围。
- 报告：[NPC-PR-001](../validation/NPC-PR-001.md)。人工审查未进行，AI/自动审查意见按事实核对，不冒充人工批准。
- 集成目标 main；[PR #17](https://github.com/AI-hunter-team/Agent-go/pull/17)，集成后 381 项检查及离线浏览器通过；删除前恢复清单已入报告，最终合并 SHA、CI 状态和清理结果在 PR 正文追加。回退为 revert 本次实现/兼容提交；分支可按保留 SHA 恢复。
