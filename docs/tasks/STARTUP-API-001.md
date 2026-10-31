# STARTUP-API-001：恢复本地启动与手动 API 启用

状态：实现与集成版软件检查完成；远端 PR/合并状态以 GitHub 记录为准。验证与交接见 [STARTUP-API-001](../validation/STARTUP-API-001.md)。

## 目标与分工

- 单一负责人、集成人：Codex 本次会话，串行实施。交接入口为本简报和对应验证报告。
- 基线：本地 main `633f941783478b242fbd7f9cd530cf1a887fd5b1`，2026-10-31（Asia/Shanghai）；尚未同步远端。
- 分支/工作区：`codex/startup-api-config` / `agent-go-startup-api`；根工作区两份 LOCAL-RUN-001 未跟踪文件保留。
- 用户授权：排查并修复无法正常启动，以及手动填 API 和 Key 后启用模型时报 400。沿用同接口同模型不限八次的真实调用授权；不输出或入库凭据。本任务先交付本地可测试修复，提交/远端操作不沿用已完成 PR #11 的单次授权。
- 完成条件：查明本地服务可达性和启用失败的具体阶段；复现并修复已证实问题，补回归；浏览器能打开并开局，手动 API 验证链路有真实/伪响应证据和明确限制。
- 依据：文档导航、开发流程、现行技术方案、API-CONFIG-001、LLM-LATENCY-001。

## 路径边界

- 允许：`server/modelConfig.ts`、`server/modelError.ts`（新增安全错误分类）、`server/openai.ts`、`server/claude.ts`、`server/app.ts`、`server/debug.ts`（错误诊断/配置探测），`src/agent/remoteAgent.ts`、`src/ui/ModelConfigPanel.tsx`、必要的 `src/ui/App.tsx`（连接/错误/配置状态），对应测试；README、.env.example、本简报、验证报告及其索引、中央记录。
- 本地运行：按锁文件 `npm ci`；启动/重启已核实属于本任务的本机开发服务，保留日志在忽略或临时目录，避免终端关闭导致服务退出。
- 排除：模拟器规则、提示策略、地图/模型资产、依赖版本/锁文件、原始大型产物、密钥；不破坏或合入其他工作区改动。
- 共享接口由本任务集成人核对页面配置、环境模型、API/远程客户端和已有测试；新增字段保持可选。若需要改变模型参数默认策略，先在此记录兼容原因、消费者及回退。

## 设计与验证

- Safari 当前显示“开局失败：Load failed”；本机 5173/8787 均无监听，旧开发进程已退出。这证明当前入口断连，尚未证明进程退出的底层原因。
- 用户已定位手动配置 400 在“验证模型并启用大模型”，不是获取模型列表。先用既有配置对照，核对请求地址/参数与上游错误；不凭 HTTP 码猜根因。
- 验证：配置/传输/客户端相关回归；完整 `npm run typecheck`、`npm test`、`npm run build`、`git diff --check`；实际本机页面、API 及已授权模型小请求。真实调用与伪响应分列。
- 已复现：同接口同 Key，Luna 与默认 codex-auto-review 通过；模型对照中的 gpt-5.5、gpt-image-2 被上游以 HTTP 400 拒绝，明确表示不支持通过当前 Codex/ChatGPT 账号调用。不能因出现在 /models 列表就当作有调用权限；不改变推理强度默认或添加盲目重试。
- DeepSeek 专项：官方 Chat Completions 规则明确 `tool_choice: required` 在 thinking 模式返回 400；当前客户端默认同时发送 `reasoning_effort: low`。最新 main 已针对 DeepSeek API 使用 `auto`、对应请求字段和兼容工具结构；本任务叠加安全错误解析与连接状态提示，不回退该适配。模型不调用工具时仍由本地校验拒绝，不会执行文本动作。详见 [DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)。
- 处理决定：只把已识别的上游错误转换为固定中文提示，未知错误仍使用通用 HTTP 提示，绝不直接回显任意上游正文。启用探测增加无 Key 的 trace；页面优先已可用模型，否则要求主动选择。网络断连/超时用明确的本地服务提示替换 Safari 原始 Load failed。
- 已告知用户必要重启，并结束、导出当时对局后实施服务端修改；随后真实入口重新运行。最终 Safari 的种子 10086 对局已到安检阶段，保留该局，不再触发服务重启。
- 截图的整理指导 500 来自本次遗留的隔离伪响应入口（缺少指导整理响应），并非真实模型故障；已向用户说明并关闭临时入口，切回真实服务。相同指导真实调用成功，浏览器已进入对局。
- 回退与交付：撤回本任务差异即可，无数据迁移。真实本机服务保留于 5173/8787；类型、386 项测试、构建通过。实现及软件检查完成；完整整局验收仍未执行。远端交付结果见 GitHub PR。
