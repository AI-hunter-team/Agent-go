# API-CONFIG-001：页面配置模型 API 并验证启用

状态：已提交 [PR #4](https://github.com/AI-hunter-team/Agent-go/pull/4)，待用户审核与集成。负责人及本任务集成协调：本次 Codex 会话；人工审核由任务发起者进行，尚未发生。

## 目标、基线与授权

- 用户要求：在前端填写 API 域名和 Key，验证连通性、选择模型后启用大模型；后续明确要求按规范提交 PR 供审核。
- 基线：`codex/luna-api-thinking-budget` / `de7796de2d2e6c6f7b64e2a395d58444fe689ac8`；远端 `main` 已 fetch，协作规范基线为 `e8efed5e66e4a63ca1a1e867166f04b76c3ac2f9`。
- 任务分支：`codex/model-api-settings`，独立 worktree 代号 `agent-go-api-config-review`。
- 前置：[PR #1](https://github.com/AI-hunter-team/Agent-go/pull/1) 提供 OpenAI 兼容客户端。本 PR 暂以该分支为目标，使审核差异只包含 API 配置；#1 合并后再迁移至最新 `main` 并复验，不能直接认定已集成。
- 规范：以最新 `main` 的 `AGENTS.md`、`docs/DEVELOPMENT.md`、任务/验证模板及 PR 模板为准；上述文件尚未进入前置功能分支，未复制或覆盖其正文。

## 路径边界与分工

- 允许：`server/app.ts`、`server/modelConfig.ts`、`src/agent/remoteAgent.ts`、`src/ui/App.tsx`、`src/ui/ControlPanel.tsx`、`src/ui/ModelConfigPanel.tsx`、`src/ui/styles.css`、`tests/modelConfig.test.ts`、`README.md`、本任务简报和验证报告。
- 排除：Debug 日志/耗时任务、模拟器规则、共享报告类型、环境凭据、依赖/锁文件、中央工作记录、路线图及原始截图/模型报告。
- 共享接口修改由本任务串行完成；保留原工作区及另一任务的改动。Debug 任务与本任务在 `server/app.ts`、远程客户端、App、CSS 等处存在后续集成冲突风险，由合入时的集成人协调，不能覆盖另一任务文件。

## 接口、兼容与完成条件

- 新增内部接口：`POST /api/model/verify` 接收 `{baseUrl, apiKey}`，返回临时配置 token、规范化地址、模型列表；`POST /api/model/enable` 接收模型 ID，并通过 `x-model-config` 指定配置；`DELETE /api/model/config` 清除该 token。
- API 客户端按页面附带 `x-model-config`；缺省继续使用服务端默认模型。Key 不写磁盘或浏览器存储，配置闲置 30 分钟后失效。无模型列表时允许手填 ID；启用前必须用同一工具协议完成真实探测。
- 无效输入返回 400；过期 token 返回 401；跨配置访问对局返回 403；未启用配置返回 409；上游/模型验证失败返回 422；配置数量达上限返回 429。上游请求 20 秒、浏览器 30 秒超时；禁止跟随上游重定向。
- 会话绑定创建时的服务及 token；指导整理、决策、创造性分类使用当前页面模型，换模型不污染已有会话。既有会话创建及离线默认行为保持兼容。
- 预期交付：认证失败可见、模型选择/手填可用、验证失败不启用、成功后自动切换大模型、可以清除恢复服务端默认；完整软件检查和模拟接口浏览器路径有证据。
- 这是应用内部接口扩展，不改变游戏动作工具、结算或报告格式；真实付费供应商的整局验收不在本次授权和模拟验证结论内。

## 验证与交接

- 提交前：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`，暂存后 `git diff --cached --check`。
- [验证报告](../validation/API-CONFIG-001.md)记录实际版本、命令、浏览器复验及未验证项。
- 回退：在依赖分支上撤回本任务功能提交；仅丢弃内存配置，不涉及数据迁移。刷新/进程重启会清空页面配置。
- 实现完成、软件检查、浏览器模拟验收、合入状态分别记录。人工审查未进行，不执行远端合并或部署。
- 交付内容仅为本简报允许路径；独立工作区的 141 项测试、类型检查、构建及模拟接口浏览器冒烟通过，见验证报告。最新 `main` 的集成与远端 CI 尚未执行；前置 #1 合并后由接手人迁移目标并复验。本任务未指定长期人工维护者。
- 功能提交：`e256b786990f5066c20d45c57b00642ecac276dc`。该提交已推送至 `origin/codex/model-api-settings`；PR 处于待审核状态，未合并。本次后续交接提交仅补充 PR 链接与验证版本，不修改受测代码。
