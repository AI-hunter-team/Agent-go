# Agent 与 NPC 独立模型配置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户自定义 Agent 模型，NPC 使用开发者独立配置的服务端模型。

**Architecture:** 保留页面模型与 Agent 会话绑定；向 API 注入独立 NPC 服务。复用已有供应商实现，通过独立环境映射隔离模型、接口和凭据。

**Tech Stack:** TypeScript、Express、React、Vitest、现有 OpenAI 兼容与 Anthropic 客户端。

**Spec:** [NPC-MODEL-001](../../tasks/NPC-MODEL-001.md)，来源为本次用户明确要求。

## Global Constraints

- 不更改模拟器规则或模型提示词，不增加依赖，不运行真实模型。
- NPC 配置不继承 Agent 的密钥、端点、模型；未配置返回 503，不回退。
- NPC 必须绑定有效对局并校验所属页面，保持失败关闭行为与独立用量；游戏规则与工具权限沿用 PR 基线 main。
- 保留原工作区的无关改动；按用户后续明确授权提交、推送和创建 PR，不自动合并。

## Review Focus

- 用户切换/重新启用 Agent 模型后，NPC 仍使用固定开发者模型。
- 有 Agent 配置但缺少 NPC 配置时，不借用用户密钥。
- 伪造正文中的模型配置不能覆盖 NPC；其他页面不能使用本局会话。
- NPC 支持独立 OpenAI 兼容和 Anthropic 配置，日志脱敏覆盖两者密钥。
- Docker 显式传递 NPC 变量；页面配置不提供修改 NPC 的入口。

### Task 1: 配置与调用隔离

**Files:** `server/{app,llm,index,debug}.ts`；`tests/{npcApi,modelConfig,npcConfig,debug}.test.ts`。

**Interfaces:** `NpcService { model: string; negotiate(request: CutInDialogueRequest): Promise<NpcReply> }`；`createNpcLlm(env?: NodeJS.ProcessEnv): NpcService | null`；`AppDeps.npcLlm` 与 `AppDeps.npcModelParameters`。

- [x] 写并运行失败测试：独立 NPC 端点/密钥/模型、页面模型切换、未配置不回退、越权校验、NPC 凭据脱敏。
- [x] 实现独立 NPC 配置与 API 注入；启动时创建 NPC 服务，日志记录 NPC 参数。
- [x] 运行相关测试与类型检查，比较真实输出。

### Task 2: 部署说明与验证

**Files:** `.env.example`、`compose.yaml`、`src/ui/ModelConfigPanel.tsx`、`README.md`、`docs/{DOCKER,MVP技术方案}.md`、本任务验证报告。

**Interfaces:** `NPC_PROVIDER`、`NPC_MODEL`、`NPC_OPENAI_{BASE_URL,API_KEY}`、`NPC_ANTHROPIC_{BASE_URL,API_KEY,AUTH_TOKEN}`，页面自定义 API 保持不变。

- [x] 同步环境模板、Compose 映射和页面/文档说明。
- [x] 执行 `npm run typecheck`、`npm test`、`npm run build` 和 `git diff --check`；检查新增文件空白和文档链接。
- [x] 完整 diff 审查，记录检查结果及未运行的真实模型/浏览器/Docker 验收。

### 发布适配

- 用户随后明确要求 commit 和创建 GitHub PR，发布基线更新为 main 的 `d4884a8d5f863a43dabb9efaf3793c6553bae687`；仅搬移本功能，保留原验收工作区和服务。
- 继承 main 的 Agent SSE、推理强度和 DeepSeek 兼容逻辑；NPC 单独使用非流式客户端，Kimi K2.6 保持关闭思考。会话现在为 NPC 接口必填，页面客户端已随请求传递，无需变更请求格式。
- PR 版完整检查与验收边界见[验证报告](../../validation/NPC-MODEL-001.md)末尾；原章节的 403 项本地检查不覆盖发布版。
