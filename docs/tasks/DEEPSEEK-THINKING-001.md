# DEEPSEEK-THINKING-001：保留思考修复 DeepSeek 接入

状态：实现及本地软件检查完成，准备提交 PR 待审核。2026-10-31 用户要求保留思考修复，并提交 PR 供其审核；未授权合并、部署或额外付费调用。

## 目标与责任

- 单一执行人及本任务集成人：Codex 本次会话；复用上一项已完成本地工具任务的独立工作区，串行实现，不派生并行 Agent。
- 基线：已 fetch 核对的 origin/main `633f941783478b242fbd7f9cd530cf1a887fd5b1`。
- 分支：`codex/fix-deepseek-thinking`；原主工作区 main 不改动，正在运行的开发服务不重新启动。
- 开工遗留：`.gitignore` 的 `/api-debug/` 规则及两份本地诊断任务文档；忽略规则随本 PR 固化，旧诊断文档不提交；本地 api-debug 代码、报告、样本及凭据不进入 PR。
- 完成条件：DeepSeek 默认仍启用思考，避免 required 冲突；多轮保留 reasoning_content；结构化调用符合官方 JSON 模式；单动作/参数/预算限制与现有一次重试保持有效；其他网关请求兼容；完整软件检查通过并创建待用户审核 PR。

## 路径与依赖

- 允许：`server/openai.ts`；`tests/deepseek.test.ts`、必要的既有模型/运行器测试；README 的模型接入说明；本简报、对应验证报告及中央记录/验证索引中的本任务入口；`.gitignore` 仅已有本地诊断规则。
- 排除：UI、模拟规则、共享动作/报告协议、依赖与锁文件、其他任务文件、api-debug 内容、密钥、真实模型整局调用、Responses 迁移。
- 共享文件归属：本任务串行拥有上述服务端适配与测试；中央记录只新增本任务状态。接口消费者保持 LlmService/DecisionResult/SessionStore 不变。
- 依赖：npm ci 安装锁定依赖；Node.js 24；GitHub 已授权 commit/push/PR，远端 main 仅只读核对。

## 设计与兼容

- 只按精确官方主机 api.deepseek.com 启用适配，模型名称或相似域名不能影响其他 OpenAI 兼容网关。
- 继续使用 Chat Completions；DeepSeek 改为 auto 工具选择、max_tokens、非严格工具定义；保留配置的思考强度，显式思考开关与强度一致。不以关闭思考绕过冲突。
- 仅保存并回传服务商真实返回的 reasoning_content（包括普通文本、无动作或被拒动作的轮次），不制造思考内容；仍只执行单个经 parseToolUse 验证的动作。无动作沿用 GameRunner 最多一次重试，不在网络层新增重试。
- DeepSeek 的指导整理、意图归类和 NPC 采用 json_object，加服务端拥有的 schema 格式说明，继续本地验证字段和长度。其他网关沿用原 json_schema/严格工具请求。
- 不增加公开接口、外部协议或承诺；思考预算仍按现有返回用量检查，未知用量不伪称硬限制。错误正文继续不直接显示，防止原始提示或密钥回显；独立诊断报告留本地。
- 依据：[Chat 参数](https://api-docs.deepseek.com/api/create-chat-completion/)、[思考与多轮回传](https://api-docs.deepseek.com/guides/thinking_mode/)、[JSON 输出](https://api-docs.deepseek.com/guides/json_mode/)。本地用户实测指出 low + required 在 v1/beta 均返回 400；只采用脱敏结论，不上传原始报告。

## 验证与交接

- 定向：模拟官方对参数和多轮历史的校验，覆盖流式/非流式、文本后重试、多动作拒绝、格式与预算限制；网页配置入口也使用同一适配。
- 提交前：npm run typecheck、npm test、npm run build、git diff --check、git diff --cached --check；验证见 [DEEPSEEK-THINKING-001](../validation/DEEPSEEK-THINKING-001.md)。
- 实际验收：本轮不调用付费模型，不开启浏览器或新服务；用户原实测只定位旧版故障，不证明修复版通过。
- 人工审核：待用户在 PR 审核，不能以自动检查替代。回退：回退本 PR，不迁移数据、不改变游戏规则。
- 集成：向 main 创建 PR，保留未合并状态。提交前后状态、验证及剩余项在报告及 PR 中交接。

## 交接

- 类型检查、40 文件/372 测试及前后端构建通过，新增 DeepSeek 17 项测试；详见验证报告。
- 人工审核、浏览器、真实修复版模型测试均未进行；无付费调用。下一步为推送分支并创建 PR 供用户审核，之后再决定合入与真实复测。
- 仅提交本任务明确文件和此前已授权的本地诊断忽略规则；api-debug 及旧本地诊断文档保留未跟踪状态。原主工作区和运行服务未改动。
