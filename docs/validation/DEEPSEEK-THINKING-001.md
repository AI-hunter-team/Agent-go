# DEEPSEEK-THINKING-001 验证报告

状态：软件检查通过的提交前快照，不代表真实模型或游戏整局验收；人工审核未进行。

## 版本与环境

- 任务：[DEEPSEEK-THINKING-001](../tasks/DEEPSEEK-THINKING-001.md)。执行人：Codex 本次会话，2026-10-31（Asia/Shanghai）。
- 基线：fetch 后的 origin/main `633f941783478b242fbd7f9cd530cf1a887fd5b1`；分支 `codex/fix-deepseek-thinking`。
- 开工保留上一任务的本地 debug 文档，不纳入提交；`api-debug/` 整体被忽略。所有检查针对本任务未提交代码；最终 commit 由 PR 指向。
- 平台：Windows，Node.js `v24.16.0`，npm `11.13.0`；`npm ci` 使用现有 package-lock.json，依赖未升级。
- npm ci 成功；安装报告 3 项依赖漏洞（1 moderate / 2 critical）及既有 three-mesh-bvh 弃用提示。未运行 audit fix，不在本任务扩大依赖变更。

## 实际执行

| 检查 | 实际命令/方法 | 状态与证据 |
|---|---|---|
| 首次类型检查 | npm run typecheck | 失败：新增测试替身缺少 Agent.dispose；已补齐，不涉及生产实现 |
| 首次定向测试 | npm test -- tests/deepseek.test.ts tests/openai.test.ts tests/modelConfig.test.ts tests/chatStream.test.ts tests/runner.test.ts | 85 通过 / 1 失败：测试断言写为“归类格式”，实现原文为“分类格式”；修正断言后复验见下方 |
| 最终类型检查 | npm run typecheck | 通过，退出码 0 |
| 最终完整测试 | npm test | 通过，40 文件、372 测试，其中新增 DeepSeek 17 测试；退出码 0 |
| 最终生产构建 | npm run build | 前端及服务端均通过，退出码 0；保留现有 >500 kB chunk 提示，不扩大本任务 |
| 差异/目录检查 | git diff --check；git check-ignore -v api-debug 路径；git ls-files -- api-debug | 通过；诊断目录被忽略，无受跟踪内容；暂存后空白和文件清单检查见交接 |
| 浏览器/真实 DeepSeek | 未运行 | 未取得本轮付费测试授权；不启动或检查既有开发服务 |

新增模拟测试覆盖：官方主机与 v1/beta/根路径；low 思考显式保留、auto 工具选择和非严格定义；完整多轮 reasoning_content / 工具结果回传；文本轮次纠正和两次失败后的既有保底；多动作拒绝；本地长度及思考用量上限；流式返回拼接；JSON 结构校验与错误不授权 NPC；网页配置探测；相似域名及其他网关不受影响。

## 实测来源与边界

- 用户本地旧版诊断已证实：基础 Chat/Responses、关闭思考的工具/多轮/Responses JSON 通过；旧游戏默认请求在 v1/beta 均返回“Thinking mode does not support this tool_choice”。只保存结论，不提交原始诊断目录或响应。
- 本次软件检查用模拟传输验证修正后的请求和状态处理；没有真实调用供应商，不能据此声称开启思考后的通关、延迟或预算稳定。
- DeepSeek 官方文档：[参数与 thinking/tool_choice 限制](https://api-docs.deepseek.com/api/create-chat-completion/)、[多轮思考回传](https://api-docs.deepseek.com/guides/thinking_mode/)、[JSON 模式](https://api-docs.deepseek.com/guides/json_mode/)。
- 仍沿用单次思考最多 1024 token 的现有事后用量检查；第三方代理不自动采用官方适配；页面启用探测仍只接受有效动作。

## 交付状态

- 实现：官方 DeepSeek 保留思考的参数适配、多轮回传、JSON 模式及回归测试完成；原 OpenAI 兼容接口测试通过。
- 软件检查：上述最终检查通过；首次测试替身/断言错误已修正，完整复验覆盖全部相关项。
- 实际验收：真实模型/浏览器未运行；原诊断只证明旧版故障。
- 合入：未合入；用户要求提交 PR 审核，不授权自动合并或部署。
- 回退：回退本 PR；不涉及数据迁移或游戏规则变更。
- 提交前暂存检查：git diff --cached --check 通过；核对暂存清单为本任务 8 个文件，不含 api-debug、原始报告、旧本地诊断任务文档、依赖或锁文件。
