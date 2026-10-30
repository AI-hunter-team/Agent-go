# Debug 日志与 AI 耗时

## 使用

在 `.env` 配置后重启 API：

```dotenv
DEBUG_LOG_ENABLED=1
DEBUG_LOG_DIR=logs
```

默认开启服务端 JSONL 文件日志。`DEBUG_LOG_ENABLED=0` 只关闭文件写入，复盘诊断和 JSON 导出仍可使用。日志路径相对于 API 进程工作目录；运行真实测试命令 `npm run test:model` 时也会记录。

对局结束后展开 **Debug 日志与 AI 耗时**，可查看耗时汇总、逐次输入/结果，并点击 **导出 Debug JSON**。普通完整报告 JSON 也包含 `debug` 字段。离线规则 Agent 同样有诊断报告，但没有供应商请求数据，不代表模型速度。

## 耗时口径

- `summary.aiWaitMs`：局内首次决策、失败重试、创造性归类与 NPC 协商的端到端等待之和，单位毫秒。创造性归类以前未计入，现在计入 `thinkingRealSeconds`。
- `preparation.durationMs`：赛前指导整理单列；没有输入指导时为 0。复用同一整理结果重试时不重复计算。
- `summary.includingPreparationMs`：局内等待加赛前整理；不包括玩家停留时间、世界模拟运行时间和会话创建/清理。
- `byOperationMs`：首次决策、重试、创造性归类、NPC 协商；`byStageMs`：按发起调用时的角色状态归入买票、安检、过闸或下楼梯。两者是同一批等待的不同视角，不能相加。
- `providerWaitHeadersMs`：请求发出至收到响应头。非流式时通常含网络、供应商排队和生成；流式时后续生成发生在读体阶段，不能直接跨模式比较头部等待。`providerReadBodyMs`：读取响应体，流式时包含后续生成等待。
- 单次调用新增可选 `streaming` 与 `firstBodyByteMs`：流式模式及从请求开始至首个非空响应体片段的时间（毫秒），不是首个可见 token 或完整动作时间，可能是心跳；非流式未单独测量，值为 `null`。完整调用耗时仍为 `totalMs`。旧报告缺少这些字段仍可读取。
- 流式调用的可选 `streamSummary` 只保存计数：响应字节 `bytes`、SSE data 事件数 `events`（包含 DONE）、工具调用片段数 `toolCallDeltas`、文本字符数 `contentChars`、`doneReceived` 与 `usageReceived`。片段数不是工具总数；心跳注释不计事件；缺失 usage 仍为未知。这些字段不保存正文或工具参数，旧报告缺少时仍兼容。
- `otherMs`：总等待扣除以上供应商细分后的剩余，含浏览器到本机 API 往返、解析和未细分等待；不能解释为纯本地计算时间。缺少细分的调用数单列。
- `internalReasoningMs` 始终为 `null`：供应商没有提供内部推理耗时，不能把响应头等待当作纯推理时间。

手动结束时，Debug 中未完成请求的等待按结束时刻截断并标为 `cancelled`，迟到结果不改写该 Debug 耗时快照。完整报告的 `attempts` / `dialogues` 则会保留实际返回的迟到响应及 token；迟到动作和协商结果不执行，也不改写世界结算。供应商请求可能继续执行，服务端后续日志可比客户端报告更完整。关闭/刷新页面或网络中断可能来不及保存最终汇总，逐次服务端日志仍可用于排查。

## 记录内容

`runId` 贯穿指导整理、模型会话、决策、归类、NPC 协商和最终报告；`sessionId` 与独立操作 ID 用于定位请求。

| 数据 | 内容 |
|---|---|
| 对局参数 | 种子、Agent 类型、模拟规则、固定步长、时间/决策预算 |
| 操作参数 | 配置模型、供应商、思考预算、输出预算、强度、超时、回退配置 |
| 单次调用 | 操作类型、任务阶段、决策序号、局部观察、触发原因、重试上下文、动作、错误、usage |
| 模型传输 | endpoint（去除查询参数及 URL 凭据）、请求字节数、消息数量、工具名/选择、schema、HTTP 状态、供应商请求 ID、实际响应模型、停止原因、token、耗时 |
| 生命周期 | `session_start`、`model_operation`、`run_report`、`session_end` |

`model_operation` 可包含多个底层调用，例如启用的供应商回退；文件中的操作耗时不包含日志写盘，浏览器等待会包含 API 响应前的写盘耗时。最终 `run_report` 标记为 `clientReported`，来自本机可信客户端，不作为防作弊权威记录。

局内结束后，前端先将最终报告提交到 `/api/session/:id/report`，再删除会话；服务端核对运行 ID 和结束状态。离线 Agent 没有服务端会话，仅在页面导出。文件写入失败会告警，不阻断对局；断网或报告过大等保存失败时，仍可在页面导出报告。

## 脱敏与文件管理

服务端 Debug JSONL 不保存认证头或完整系统提示。传输诊断只记请求/响应元数据，但 `model_operation.output` 和上传的 `run_report` 也可能包含 API 实际返回的内容块、文本、工具参数及对话，并非只保存简短理由。日志递归过滤密钥字段、已配置 API 凭据、Bearer 内容、`sk-` 密钥及 `thinking` / `reasoning_content` / `signature` 等字段；token 数值统计保留。过滤是按字段和已知凭据处理，并不删除全部响应正文；指导、观察及返回文本仍需在分享前检查。

浏览器完整报告 JSON 与服务端脱敏日志不同：`attempts` / `dialogues` 包含实际 API 返回的思考、文本、工具参数、原始内容块和协商记录。只保存接口实际提供的内容，无法取得服务商未公开的内部推理。分享完整报告前也需核对这些内容；服务端日志的过滤规则不能视为浏览器完整报告的脱敏保证。

Docker Compose 使用 `debug-logs` 命名卷挂载 `/app/logs`，容器以 node 用户写入；重建容器保留该卷，`docker compose down -v` 会删除卷中日志。设置 `DEBUG_LOG_ENABLED=0` 可禁用写盘。

文件名为 `debug-UTC日期-进程号-分片.jsonl`，逐条串行追加，约 10 MiB 后切换分片；单条超大记录可以超过此值。新建目录权限为 0700，文件为 0600（已有目录权限不改变）。日期使用 UTC；没有自动清理旧文件，需要按磁盘容量自行归档或删除。

`.env`、`logs/` 和 `*.jsonl` 已加入 Git 忽略。推送的是功能源码、测试和说明，运行日志不提交到 GitHub；这次提交不部署公网服务。思考预算 1024 与总输出保护值 4096 仍分开配置。


## 流式与延迟配置

兼容接口默认 `OPENAI_STREAM=1`（HTTP SSE），日志包装器直接透传分片，不预先读完整个响应。服务端收齐完整动作和流结束后才执行既有校验，并将完整 JSON 决策返回浏览器；尚未向浏览器逐 token 展示模型内容。没有迁移为 WebSocket。

`gpt-6-luna` 默认推理强度为 `none`，其他兼容模型保留 `low`；`OPENAI_REASONING_EFFORT` 可显式配置 `none/minimal/low/medium/high`，是否支持由服务商和模型决定。恢复原有更多推理使用 `OPENAI_REASONING_EFFORT=low`，不支持流式则设置 `OPENAI_STREAM=0`；更改后重启 API 并重新启用页面配置/开新局。不会因流式失败自动切换协议或增加隐藏的付费请求。页面模型配置沿用服务端的这些性能参数及预算，凭据仍按页面隔离。

降低推理强度可能影响复杂策略与沟通质量。八次小请求的实际延迟、缓存差异及局限见 [LLM-LATENCY-001](validation/LLM-LATENCY-001.md)；该结果不证明完整对局质量、稳定时延或纯内部推理耗时。官方依据：[延迟优化](https://developers.openai.com/api/docs/guides/latency-optimization)、[推理强度](https://developers.openai.com/api/docs/guides/reasoning)；兼容接口支持需实测，不能直接从官方接口推断。

## 空工具响应排查

出现“模型返回空响应”时，先查同次请求的 HTTP 状态、`stopReason`、`providerRequestId` 和 `streamSummary`。`doneReceived=true`、`toolCallDeltas=0`、`contentChars=0`、`usageReceived=false` 表示所观察到的 SSE 没有工具/文本片段及 usage；如工具片段非零却未得到动作，还需检查参数、截断、工具数量和用量校验错误。缺少历史计数时不能据此倒推供应商内部根因。

空响应仍保留在本次 `output` 和错误中，不写成后续请求中的空 assistant 消息；合法或被拒的工具调用仍保留，以便下一轮逐一回答工具 ID。沿用最多一次业务重试，不补造动作、用量或额外传输重试。[专项诊断记录](validation/LLM-LATENCY-001.md)区分已确认的空历史记录问题与尚未复现的四次空响应来源。
