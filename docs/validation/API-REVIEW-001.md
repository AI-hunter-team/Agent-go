# API-REVIEW-001 调查记录

状态：源码及官方资料核对，不代表真实模型验收。

- 任务：[API-REVIEW-001](../tasks/API-REVIEW-001.md)。
- 执行人/日期：本次 Codex 会话，2026-10-31（Asia/Shanghai）。
- 环境与基线：Windows，`main` / `633f941783478b242fbd7f9cd530cf1a887fd5b1`；已有中央记录修改，以及未跟踪的 PROGRESS、TODO、RUN/PULL 简报与验证记录，本次保留。
- 检查范围：模型 API 调用方式及选型建议。未使用 Node/npm、浏览器或模型凭据，版本矩阵不适用。

| 检查 | 结果与证据 |
|---|---|
| 分支和工作区 | `git status --short --branch`、`git worktree list`、`git rev-parse HEAD` 均退出 0；本地两个 worktree 均位于上述提交，未同步远端 |
| 源码核对 | [openai.ts](https://github.com/AI-hunter-team/Agent-go/blob/44e2230322c7fdddf33cbd451ca5a6a5436dff70/server/openai.ts)（删除前版本） 第 50 行为 `/chat/completions`，第 106–118 行使用 messages/tools，第 127–154 行解析并校验 tool_calls；[llm.ts](../../server/llm.ts) 第 8–33 行选择 OpenAI 兼容或 Anthropic 分支 |
| 会话与配置边界 | [sessions.ts](../../server/sessions.ts) 保存 chatMessages；[示例配置](../../.env.example) 使用兼容网关。未读取实际 .env，不能确认运行配置或网关 Responses 能力 |
| 官方资料 | 已搜索并打开 [OpenAI 迁移指南](https://developers.openai.com/api/docs/guides/migrate-to-responses)：推荐新项目使用 Responses，Chat Completions 仍受支持；迁移涉及输入、输出、状态、工具与流式事件 |
| 文档检查 | 相对链接、命令及源码依据人工核对；`git diff --check` 退出 0；对本轮四个文档检查行尾空白及冲突标记，无匹配 |
| 类型、测试、构建 | 跳过：只有咨询记录，业务代码和配置未变；未新增测试 |
| 实际模型与浏览器 | 未运行；未产生模型费用或性能对比结论 |

结论：接口调查完成；Responses 支持尚未实现，软件与真实模型迁移验收不适用，记录未提交/未推送。后续若实施，再核对目标网关和模型支持并进行适度对照；本轮不新增迁移排期。
