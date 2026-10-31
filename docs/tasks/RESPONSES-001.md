# RESPONSES-001：统一 Responses 与 DeepSeek 思考设置

状态：本地实现及软件检查完成；未提交、未推送或合入。以用户确认的完整实施计划为授权依据。

- 负责人/集成人：本次 Codex 会话，串行修改与最终验证。
- 基线：2026-10-31（Asia/Shanghai），`633f941783478b242fbd7f9cd530cf1a887fd5b1`；本地任务分支 `codex/responses-deepseek`，当前工作区。未 fetch，远端最新状态未核实。
- 目标：全部远程模型调用使用 Responses，默认 DeepSeek Flash、关闭思考；页面支持关闭/低/高/最高，保留离线 Agent。
- 完成条件：角色决策、指导、分类、NPC、启用探测全部迁移；历史/工具配对/流式/诊断正确；必要回归、类型、全量测试、构建、diff 检查完成。
- 允许修改：`server/` 模型、配置、会话、提示、诊断；`src/agent/remoteAgent.ts`、`src/shared/` 的相关类型、`src/ui/ModelConfigPanel.tsx`；对应 `tests/`、模型/Compose 脚本、`compose.yaml`、包清单与锁文件；配置示例、README、现行接口/预算说明、本简报与验证报告、`PROGRESS.md`、`TODO.md`、中央记录的本任务条目。
- 排除：游戏模拟规则、3D/美术资产、无关本地记录、实际 `.env` 和密钥；不推送、合并、部署或调用付费模型。
- 现存工作：中央记录已有修改，PROGRESS/TODO 与 RUN/PULL/API-REVIEW 记录未跟踪；保留并仅追加本任务内容。其他 worktree 的资产任务不归本任务修改。
- 接口：`/api/model/enable` 增加可选 `reasoningEffort`（none/low/high/max），缺省 none；业务返回形状保持兼容，原始输出改为 Responses items。
- 已确认变更：取消独立 1024 思考上限及 `DECISION_THINKING_TOKENS`，所有模型请求统一总输出预算默认 4096；页面配置固定到会话，后续调整只作用于新对局。
- 配置迁移：默认 provider responses，旧 openai 作为别名，anthropic 明确报错；保留 OPENAI_* 与 AGENT_MODEL 配置名，默认 DeepSeek 根地址；不自动改写凭据或追加 /v1。
- 验证：使用现有伪模型回归，不增加大规模测试；完成后执行类型检查、完整测试、构建和 diff 检查。真实模型未授权，记录未运行。
- 交接：本地未提交交付；结果写入 `docs/validation/RESPONSES-001.md`，同步进度/待办。回退仅限本任务 diff，不清理无关记录。

## 文件与函数职责

新增/修改的业务函数均附用途注释。主要入口及内部函数如下，测试文件中的辅助函数只构造伪数据或本地 HTTP 服务。

| 文件/函数 | 职责 |
|---|---|
| `responses.ts` — ResponsesClient.constructor / create | 固定基础地址和凭据；仅发送一次 Responses 请求，处理 HTTP、SSE 或 JSON，不退回旧协议 |
| 同文件 — rememberResponse | 校验可重放条目和唯一调用 ID，把有效历史追加到本局 |
| 同文件 — ResponsesLlmService.constructor / parameters | 冻结模型配置；生成全业务共用的模型、思考档位和总输出预算 |
| 同文件 — decide | 发送观察/历史，配对工具结果，校验一轮一个动作，记录失败和用量 |
| 同文件 — structured | 使用 JSON Schema 请求和解析结构化文本 |
| 同文件 — normalize / classify / negotiate | 分别整理玩家指导、分类创意意图、生成 NPC 答复；各自执行领域校验，NPC 失败不授予许可 |
| `responsesTypes.ts` — parseResponse / assertCompleted | 检查响应外壳；拒绝未完成、拒绝、截断及总输出超限 |
| 同文件 — responseUsage / responseStopReason / responseOutput | 映射真实 token、停止原因和原始输出到现有报告结构 |
| 同文件 — responseThinking / responseText | 提取供应商公开的推理/摘要，以及结构化请求的文本；不生成或解密推理 |
| `responsesStream.ts` — SseDecoder.constructor / push / end / lines / line / dispatch | 注册事件接收器、增量解码字节、结束刷新、切行、收集 data、分发完整事件 |
| 同文件 — readResponsesStream | 等待完整终态并读取 usage，随后取消上游流；不拼接半个动作 |
| `modelSettings.ts` — configFromEnv / normalizeBaseUrl | 读取统一模型预算和档位；检查地址并保留基础路径 |
| `shared/modelConfig.ts` — isReasoningEffort | 前后端共用的四档值校验 |
| `llm.ts` — createLlm | 创建唯一 Responses 服务，支持旧 openai 别名并明确拒绝 Anthropic 原生配置 |
| `modelConfig.ts` — verify / enable / get / delete / sweep | 模型发现；按所选档位探测并冻结配置；读取、撤销及过期清理临时凭据；构造器注入测试传输 |
| `app.ts` — createApp / runtime / forSession | 注册路由；选择新请求的实际参数；固定并校验旧会话配置 |
| `sessions.ts` — create / get / delete / size / sweep | 创建、访问、删除、计数与清理局内 Responses 历史 |
| `tools.ts` — tool | 生成平铺的 Responses function schema；原 parseToolUse 继续校验游戏参数 |
| `debug.ts` — redactDebug / clean / write / filename | 递归脱敏、生成副本、串行轮转写日志和命名日志文件 |
| 同文件 — traceOperation / debugFetch / record / finish / pull / cancel | 关联业务与请求、透传上游、提取终态元数据、计时、读取分块与释放连接；elapsed/number/string 仅做诊断基础转换 |
| 同文件 — debugLoggerFromEnv | 配置日志和敏感字段列表，继续遮蔽遗留凭据 |
| `remoteAgent.ts` — discardUnused / releaseToken / sessionToken / api | 按会话引用释放旧凭据、选择本局 token、调用本地 HTTP API |
| 同文件 — Api.verifyModel / discardModel / enableModel / clearModel / health | 页面配置的发现、释放、启用、清除与只读健康状态 |
| 同文件 — Api.normalize / createSession / decide / classify / saveReport / deleteSession / negotiate | 分别封装业务路由；有 sessionId 时使用该局固定 token |
| 同文件 — RemoteAgent.create / decide / classify / negotiate / dispose | 将游戏 Agent 生命周期映射到局内 HTTP 调用；构造器持有 ID；赛外与离线分类封装保持原职责 |
| `ModelConfigPanel.tsx` — ModelConfigPanel / invalidate / verify / enable / clear | 展示配置表单、作废未启用配置、取模型列表、按档位验证启用、清除默认配置 |
| `index.ts` — shutdown | 保留优雅停机；启动时提示已停用的独立思考预算变量 |
| 测试与脚本 | 原协议伪响应迁移为 Responses；浏览器 fixture 拦截全部上游请求；Compose 脚本检查根地址与 none；实测脚本记录总输出与档位，仅显式运行才付费 |

## 完成与交接

- 类型检查、40 个测试文件的 353 项测试、前后端构建均通过。浏览器使用生产前端与隔离伪模型，默认关闭和改为最高后重新启用均通过。
- 详情和跳过项见[验证报告](../validation/RESPONSES-001.md)。未改实际 .env，未做真实供应商或 Docker 验收，不声称真实模型已通过。
- 依赖只删除 Anthropic SDK 及其不再使用的传递依赖，无新增 SDK。旧业务重复测试已合并到 Responses 测试，模拟器规则不变。
- 所有现存 RUN/PULL/API-REVIEW 记录和其他会话的 WORKTREE-CLEAN 记录均保留；不将这些既有文件归为本任务交付。
