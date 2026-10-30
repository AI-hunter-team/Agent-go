# INT-README-001：修复 Luna PR 的 README 集成冲突

状态：待 PR 审核。负责人及本次集成协调：Codex 当前会话；人工审核由 PR 发起者处理，尚未进行。

## 目标与边界

- 目标：将最新 main 同步进 PR #1，保留 Luna 接入、思考/总输出分离说明及主分支协作入口和 CI 说明；同步 PR #3 的依赖基线。只更新 PR 分支，不合并远端 PR。
- 基线：已 fetch 核实的 main `e8efed5e66e4a63ca1a1e867166f04b76c3ac2f9`；PR #1 head `de7796de2d2e6c6f7b64e2a395d58444fe689ac8`；PR #3 head `16ffebc1eede9c83319886b818dfd7d03b956b77`。
- 分支与工作区：`codex/luna-api-thinking-budget` 使用独立 worktree（代号 luna-conflict）；`codex/debug-ai-timing-logs` 使用现有独立 debug-review worktree。原项目和模型配置任务的未提交改动不修改。
- 授权依据：用户此前要求将 Luna 和 Debug 修改提交 PR 审核，本次反馈 PR 冲突；沿用现有提交/推送授权修复可审阅性。
- 允许路径：同步 main 已提交文件；冲突解决仅 `README.md`；新增本简报与 `docs/validation/INT-README-001.md`。Debug 分支仅同步修复后的前置分支，必要时保留其 README Debug 段。
- 排除路径：不新增业务逻辑、依赖、接口变更，不部署，不调用付费模型，不提交秘密/运行产物，不修改其他任务 worktree、中央工作记录和路线图。
- 依赖与顺序：先修复 PR #1 并推送，再同步 PR #3；交接通过本报告和两份 PR。

## 决定与验证

采用 merge 同步已有已发布分支，不重写历史。README 同时保留当前 Luna 实现/测试证据和主分支文档/CI 入口，区分历史验收与当前验收。接口/格式与产品规则无新增变化。

冲突限于文档；执行 diff 空白、冲突标记、相对链接、事实保留检查。同步包含新增 CI/协作文档，业务源码保持原 PR 内容；可运行现有 npm 检查核对集成版本，实际结果见 [验证报告](../validation/INT-README-001.md)。不追加浏览器或付费模型实测。

## 交接

远端 PR 保持待审核，不自动合并。若撤销此次同步，使用新的反向提交并重新检查依赖；不 force push。长期维护人与其他任务文档更新由团队分配。
