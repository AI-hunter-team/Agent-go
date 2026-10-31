# RESPONSES-001 验证记录

状态：本地验证快照；不代表真实供应商验收或远端合入。

- 任务：[RESPONSES-001](../tasks/RESPONSES-001.md)。
- 执行人/日期：本次 Codex 会话，2026-10-31（Asia/Shanghai）。
- 基线：`633f941783478b242fbd7f9cd530cf1a887fd5b1`，分支 `codex/responses-deepseek`，工作区含本任务未提交修改及保留的既有记录；未 fetch。
- 环境：Windows，Node.js v24.21.0、npm 12.1.0，既有可用依赖。通过 npm uninstall 删除 Anthropic SDK 并同步 package-lock，无新依赖。

| 检查 | 实际结果 |
|---|---|
| `npm run typecheck` | 最终通过，退出 0。初次发现未使用的类型 import，已删除 |
| `npm test` | 最终 40 文件 / 353 测试通过，退出 0。初次唯一失败为迁移后测试辅助 turn 未包含原开局触发，已在该测试显式补回；没有改业务行为迁就测试 |
| `npm run build` | 通过，退出 0；产物为 `dist/` 和 `build/server.js`。保留 Vite 关于 3D chunk 超过 500 kB 的体积提示，未扩展为无关优化 |
| `node --check scripts/smoke-compose.mjs` | 通过，退出 0；仅证明脚本语法，不代表容器运行 |
| 生产构建页面 | 应用内浏览器，隔离端口 8893，使用 tests/browser-fixture.ts 提供 dist 和伪上游。默认地址、Flash 选择、四档选项、默认关闭、启用成功、切最高并重新启用均通过 |
| 页面实际请求证据 | fixture 输出先后为 `deepseek-flash none 4096` 与 `deepseek-flash max 4096`。所有上游均由 fixtureFetch 拦截，无真实网络模型调用。截图证据为本次聊天附件 `responses-settings.jpg`，未入库；临时页面和服务已关闭 |
| 会话隔离 | 自动化覆盖同 token 重新启用后旧局仍用旧模型/none、新局使用新模型/max；浏览器客户端换 token 或清除配置后，旧局仍携带原 token，局后释放 |
| 协议与失败处理 | 覆盖五类入口、完整历史/推理回传、工具结果配对、多工具拒绝、非法参数、重复 ID、拒绝、空动作、断流、终态失败及 usage；1800 思考 token 的完整合法动作通过，4097 总输出拒绝 |
| Debug | 覆盖实际参数、思考档位、终态用量、流式透传/计数、凭据及 Responses reasoning/encrypted_content 脱敏；日志故障测试中的预期告警不影响测试通过 |
| `git diff --check` | 通过，退出 0；新文件空白/冲突标记另行检查。迁移文档的相对链接和现行/历史边界作人工核对 |
| Docker / 真实 DeepSeek / 其他供应商 | 未运行；仅迁移 Compose 伪模型脚本。无付费模型调用授权，不能据模拟响应或健康接口认定认证、费用、策略或真实时延通过 |

## 交付状态

- 实现完成：Responses 统一调用、默认 none、页面档位、预算更新、历史/流式/诊断、配置迁移与说明均已完成。
- 软件检查通过：以上类型、自动化、构建和格式检查；未执行额外性能或大规模种子测试。
- 实际验收：限定为生产前端的伪模型配置流程，未测真实模型整局和所有浏览器。
- 已合入：否，未提交/推送/合并/部署；人工代码批准未进行。
- 后续：接手时按实际服务商填写 Responses 地址/密钥，旧 .env 不会自动转换；高档位仍受统一总输出预算和 20 秒超时限制。原 1.1 的 1024 规则是历史，现行变更及授权见[技术方案 §17](../MVP技术方案.md#17-responses-与思考设置responses-001)。
