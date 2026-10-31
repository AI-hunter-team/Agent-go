# NPC-MODEL-001 验证报告

状态：包含原本地验收基线和最新 main 上的 PR 发布版两次验证；发布结论见末尾。不代表已合入或真实模型验收通过。

## 版本与环境

- 任务：[NPC-MODEL-001](../tasks/NPC-MODEL-001.md)；执行人：当前 Codex 会话，2026-10-31（Asia/Shanghai）。
- 基线：`6dfabc50e9a3d7d5c19f5b54e53d75550aead2ae`；受测版本为 `codex/npc-model-config` 的未提交修改，包含独立 NPC 配置、调用、部署变量、说明及测试。
- macOS / Darwin，Node.js `v22.23.1`，npm `10.9.8`。沿用现有锁定依赖，通过工作区符号链接复用已有 `node_modules`，未修改依赖和锁文件。
- 原工作区既有文档改动未搬移或覆盖。未查询远端新状态，未提交、推送、合并或部署。

## 实际执行

| 检查 | 命令或方法 | 结果 |
|---|---|---|
| 基线 | `npm test` | 37 文件 / 387 测试通过，退出码 0 |
| 先失败再实现 | `npm test -- tests/modelConfig.test.ts tests/npcApi.test.ts tests/npcConfig.test.ts tests/debug.test.ts` | 实现前 15 项失败，覆盖缺少 NPC 工厂、仍使用 Agent、缺少 NPC 凭据脱敏；实现后相关测试通过 |
| 错误响应脱敏回归 | `npm test -- tests/npcApi.test.ts` | 新增两项先失败：NPC 原始失败响应及异常消息会回显开发者密钥；修复后包含于全量通过结果 |
| 类型 | `npm run typecheck` | 通过，退出码 0 |
| 全量 | `npm test` | 38 文件 / 402 测试通过，退出码 0 |
| 构建 | `npm run build` | 类型、前端及服务端构建通过，退出码 0；保留既有 3D chunk 大于 500 kB 提示 |
| Compose 变量 | `docker compose --env-file .env.example config --quiet` | 通过，退出码 0；仅解析配置，未构建或运行容器 |
| 构建产物伪接口冒烟 | 一次性 Node 脚本启动 `build/server.js` 与本机假上游，GET 页面、页面配置用户 Agent、创建会话、Agent 决策、NPC 协商、切换 Agent、再次 NPC 协商 | 通过，退出码 0；用户与 NPC 分别请求独立端点、密钥和模型，Agent 切换后 NPC 模型仍固定。假上游逐次断言 URL、授权及模型，无真实模型请求 |
| diff 与文档 | `git diff --check`，新增文件行尾检查及本次文档相对文件链接检查 | 通过；只验证本地目标文件，未重新访问外部链接或全量锚点 |
| 独立代码审查 | 新上下文只读审查 diff、NPC 配置测试和任务要求 | 未发现 Critical / Important / Minor 级可操作缺陷；没有修改文件或额外调用模型供应商 |

最初普通沙箱运行的 HTTP 测试因 `listen EPERM` 超时；最小本机监听检查复现了权限限制。允许本机临时端口后基线和后续伪模型测试通过，没有通过放宽业务断言规避失败。新增 Anthropic 测试曾按旧版 SDK 预期 `x-api-key`，查阅当前安装 SDK 后改为实际的 Bearer 头断言；另修正了新增测试的 TypeScript mock 参数类型，随后类型与构建通过。

## 覆盖与边界

- 页面模型更换、手动模型 ID、会话模型固定、缺失及错误页面 token 校验继续覆盖。
- 独立 NPC 模型、端点与密钥；用户正文伪造配置不能覆盖 NPC；缺失 NPC 配置不借用 Agent；NPC 权限、异常和拒绝保持关闭行为。
- OpenAI 兼容、Anthropic API Key 与 Auth Token 三种配置均用假响应验证；Anthropic 不继承进程级 Agent 端点。
- NPC 密钥覆盖日志与返回正文脱敏，包括上游异常消息和原始输出。
- 页面仅调整说明文字，未运行浏览器交互或视觉验收；未运行 Docker 镜像/容器验收、Node.js 24 矩阵或付费模型实测。以上软件及伪接口结果不代表这些实际验收通过。

## 交付状态

- 实现完成：是，独立配置及错误语义见[任务简报](../tasks/NPC-MODEL-001.md)。
- 软件检查：上述检查通过。
- 实际验收：构建产物本机伪接口 HTTP 冒烟通过；真实模型、浏览器交互和容器运行未验证。
- 已合入：否，保留本地分支和未提交修改。升级部署需设置 `NPC_MODEL` 与对应 `NPC_*` 密钥；未配置时 NPC 协商返回 503，其他 Agent 流程可继续使用。

## 本地部署交接（2026-10-31，Asia/Shanghai）

用户已填写 DeepSeek 与 Kimi 凭据并要求启动本地环境供本人验收。发现凭据填写在 `.env.example`，已迁移到被 Git 忽略且权限为 `0600` 的 `.env`，并清空模板中的密钥值；没有打印或入库凭据。

- 原工作区服务继续保留在 5173 / 8787。本分支本地 `.env` 的 API 端口改为 8788，新验收页面使用 5174。
- API 启动：`DOTENV_CONFIG_OVERRIDE=true HOST=127.0.0.1 npm run dev:api`。启动日志显示 Agent 为 `deepseek-flash`，NPC 为 `kimi-k3.1-pro`。
- 前端启动：`PORT=8788 npm run dev:web -- --host 127.0.0.1 --port 5174 --strictPort`。
- 直接及经前端代理请求 `/api/health` 均返回 HTTP 200、`llm=true`、`model=deepseek-flash`。页面及新版配置说明源码请求为 HTTP 200。
- 应用内浏览器已打开 `http://127.0.0.1:5174/`，确认开局页、场景、`deepseek-flash` 选项与可编辑指导框已加载，保留页面供用户验收。
- 未点击准备开局或开始对局，未主动调用付费模型。上述启动、健康与浏览器加载检查不证明真实模型调用成功，实际对局及 NPC 协商由用户继续验收。
- 本轮仅处理本地运行配置与启动，没有修改业务代码或依赖，未重跑业务测试与构建；`git diff --check` 通过。

## NPC 404 排查与修复（2026-10-31，Asia/Shanghai）

- 失败证据：本轮日志 `debug-2026-10-31-14928-0.jsonl` 的 `negotiate` 记录，开始时间 `2026-10-31T03:23:27.847Z`，请求 `api.moonshot.cn/v1/chat/completions`，模型 `kimi-k3.1-pro`，HTTP 404，约 301 ms，没有返回模型用量。应用按失败关闭，未授予插队许可。
- 只读校验：使用用户已配置的 NPC 密钥请求同一 API 的 `/models`，HTTP 200，列表为 `kimi-k2.6`、`kimi-k2.7-code`，不含配置中的 `kimi-k3.1-pro`。这说明密钥可通过模型列表认证，当前配置与该账号可发现的模型不匹配；不把该检查当作余额或真实推理验证。
- 原模板根据厂商公开说明选择模型，但未按用户账号的可用模型列表核对。本地 `.env` 与模板改用 `kimi-k2.6`；README 同步说明账号模型差异。没有修改密钥或 Agent 配置。
- [官方参数参考](https://platform.kimi.com/docs/api/models-overview)明确 K2.6 不支持 `reasoning_effort`，支持 `thinking.type=disabled`。NPC 请求因此关闭思考并移除不兼容参数，保持 JSON Schema、1024 输出上限与原有失败关闭行为；调试参数同步记录思考关闭及无 effort。
- 回归测试：新增 K2.6 假供应商检查，旧请求参数先得到模拟 400、测试失败；修复后通过。既有通用 NPC 测试额外断言继续使用 `reasoning_effort=low`，避免影响其他供应商。
- `npm run typecheck`、`npm test`（38 文件 / 403 测试）、`npm run build`、`git diff --check` 均通过；保留既有 3D chunk 大小提示。测试中的全部推理响应均为假响应。
- API 文件监视器已重载，启动日志显示 `NPC model enabled: kimi-k2.6`；Agent 仍为 `deepseek-flash`，验收入口仍为 `http://127.0.0.1:5174/`。
- 没有额外发起付费推理重试。用户需刷新页面重新开局，以新会话继续验收真实 NPC 答复；不能从伪接口测试推断真实调用已通过。

## PR 发布版（2026-10-31，Asia/Shanghai）

- 用户明确授权提交、推送并创建 GitHub PR。原验收工作区的功能提交为 `d56259e`，原服务与 `.env` 保留；PR 工作区没有复制真实配置或凭据。
- 目标分支 `main`；同步远端后的发布基线为 `d4884a8d5f863a43dabb9efaf3793c6553bae687`。功能单独移植到 `codex/npc-model-config-pr`，不携带旧验收分支的固定难度或社交权限任务提交。
- 冲突处理保留 main 的 SSE 聚合、DeepSeek OpenAI 兼容、模型配置错误诊断及已有测试。Agent 沿用 main 配置；NPC 使用独立非流式客户端，避免继承 Agent 的传输配置。Kimi K2.6 的思考参数修复保留。
- NPC 对话现在要求有效 sessionId，随后验证页面归属；前端已有客户端传递该字段。没有从旧验收分支引入指导意图门禁，NPC 的人物上下文与规则结算逻辑沿用 main。
- 最新完整检查：`npm run typecheck`、`npm test`（44 文件 / 414 测试）、`npm run build` 退出码均为 0。保留 3D chunk 大小提示；测试均使用伪模型，不调用付费推理。
- PR 构建产物连接本机假上游的双模型 HTTP 冒烟再次通过；Compose 配置解析、19 个文件的密钥/冲突标记/空白检查及 38 个本地文件链接检查通过。没有将 `.env`、凭据、日志或生成产物加入提交。
- 新上下文只读 AI 审查未发现 Critical / Important 问题；保留一项 Minor 建议：非 Kimi NPC 的顶层调试 `effort` 标签固定为 low，可能与 Luna 或 Anthropic DeepSeek 的实际参数不一致，后续可按真实参数生成或省略；实际请求与逐次传输记录不受影响。本次暂缓该诊断显示调整。
- 发布版本没有重新执行真实 NPC 推理或完整浏览器对局；此前本地浏览器和 404 排查证据仅适用于上述对应版本。人工审查未进行，未合并或部署 PR 版本。
