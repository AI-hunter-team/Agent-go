# API-REVIEW-001：模型接口选型核对

状态：调查已完成；迁移仅为建议，未实施。

- 负责人及集成人：本次 Codex 会话；一名只读探子定位源码，主代理核对调用与判断。
- 目标与完成条件：回答当前使用的模型协议、Responses 对本项目的价值及限制，并留下源码与官方依据。
- 基线：2026-10-31（Asia/Shanghai），当前工作区 `main`，`633f941783478b242fbd7f9cd530cf1a887fd5b1`；未 fetch，远端最新状态未核实。
- 路径边界：只新增本简报、`docs/validation/API-REVIEW-001.md`，追加 `PROGRESS.md`、`TODO.md`。排除业务代码、配置、依赖、中央记录、构建产物；保留已有未提交记录。
- 依赖及授权：用户要求接口调查与建议；不需要凭据，不调用真实模型，不提交或推送。只读探索已结束后串行更新记录。
- 依据：现行[开发流程](../DEVELOPMENT.md)、[模型客户端](../../server/openai.ts)、[供应商选择](../../server/llm.ts)、[会话](../../server/sessions.ts)和 [OpenAI 官方迁移指南](https://developers.openai.com/api/docs/guides/migrate-to-responses)。

## 结论与交接

- OpenAI 兼容分支使用 Chat Completions：`OpenAIClient` 拼接 `/chat/completions`；`complete()` 发请求并接收 SSE 或 JSON。
- `decide()` 将观察和历史发给模型、要求一个动作工具并校验输出；`negotiate()` 生成 NPC 答复；`structured()` 处理结构化 JSON；`normalize()` 整理指导；`classify()` 分类创意动作。现有 Anthropic 分支独立。
- 当前多轮历史由 `session.chatMessages` 管理。Responses 可携带推理与工具上下文，更适合继续探索推理型 Agent，但效果、费用和延迟需在相同模型及网关下比较，不能直接承诺提升。
- 建议后续新增可切换的 Responses 适配器，保留 Chat Completions 兼容路径。迁移需覆盖工具格式、历史、SSE 事件、结构化输出、usage 与错误语义，不能只替换 URL。
- 示例使用第三方兼容网关；未读取实际 `.env`，未验证该网关 Responses 支持或当前运行进程的配置。
- 验证与限制见[调查记录](../validation/API-REVIEW-001.md)。本轮只作本地交接，无业务函数改动；迁移任务待用户决定，未排期。
