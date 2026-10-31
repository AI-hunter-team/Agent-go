# NPC-MODEL-001：Agent 与 NPC 模型配置分离

状态：实现与软件检查完成，准备提交 PR。负责人及本次集成执行者：当前 Codex 会话；用户本轮明确授权 commit、推送和创建 GitHub PR，不自动合并。

- 用户要求：Agent 支持用户自定义模型，NPC 单独由开发者配置。
- 基线：本地验收基线为 `6dfabc50e9a3d7d5c19f5b54e53d75550aead2ae`，功能在 `codex/npc-model-config` 提交为 `d56259e`。已同步远端；PR 版本基于 `origin/main` 的 `d4884a8d5f863a43dabb9efaf3793c6553bae687`，工作分支 `codex/npc-model-config-pr`、工作区 `Agent-go-npc-model-config-pr`，目标分支为 `main`。
- 范围：`server/{app,llm,index,debug,openai}.ts`、相关模型/API/脱敏测试、`.env.example`、`compose.yaml`、`src/ui/ModelConfigPanel.tsx` 的说明文字、README、Docker 与技术方案说明，以及本任务简报、计划和验证报告。
- 排除：模拟器规则、模型提示词、依赖、锁文件、已有未提交文档、真实凭据及付费模型调用。
- 方案：页面配置继续只管理 Agent；新增服务端 NPC 模型依赖与 `NPC_*` 环境变量，独立模型、端点和凭据，不继承用户或默认 Agent 配置。
- 边界：NPC 必须绑定有效对局并校验所属页面，保留 NPC 专用上下文和独立用量；未配置返回 503，调用失败返回 502，均不授予许可或回退到 Agent。PR 继承最新 main 的游戏规则与工具权限，不夹带旧验收分支上的其他功能提交。
- 开发者选择：NPC 显式设置模型 ID，支持现有 OpenAI 兼容和 Anthropic 接口；凭据仅存在服务端。未设置 NPC 模型时保持不可用，不替用户选择付费模型。
- 完成条件：不同 Agent 页面配置仍使用同一个开发者 NPC；切换 Agent 模型不改变 NPC；NPC 凭据不出现在日志或页面配置响应。
- 检查：基线 37 文件 / 387 测试通过；新增行为先观察失败，再实现；完成后类型检查、全部测试、构建、diff 检查，详见[验证报告](../validation/NPC-MODEL-001.md)。
- 交付/回退：按用户授权提交并推送 PR 分支，不自动合并；回退可撤销 PR commit，升级部署需新增独立 NPC 环境变量。原工作区及本地验收服务保持原状。
- 交接：PR 版本已适配最新 main 的 SSE、DeepSeek OpenAI 参数和模型配置诊断，保留页面用户自定义 Agent；NPC 使用独立非流式客户端。44 文件 / 414 测试、类型检查与构建通过，详细版本与实际验收限制见[验证报告](../validation/NPC-MODEL-001.md)末尾。真实凭据未加入 PR；人工审查未进行，接手负责人待认领。
- 本地验收修复范围：日志确认 `kimi-k3.1-pro` 请求返回 404；用户密钥的只读模型列表仅含 `kimi-k2.6`、`kimi-k2.7-code`。改用 `kimi-k2.6`，适配其不支持 `reasoning_effort`、使用 `thinking.type=disabled` 的 NPC 请求；同步本地配置与模板、保持独立模型和 1024 输出上限。只读模型发现已执行，不额外调用付费推理。真实凭据仍只保留在被忽略的本地文件中。
