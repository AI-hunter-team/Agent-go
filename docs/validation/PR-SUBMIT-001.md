# PR-SUBMIT-001 集成验证与交接

身份：2026-10-31 提交前快照；源任务见 [简报](../tasks/PR-SUBMIT-001.md)。最终 commit、PR 和远端检查以 PR 为准，不代表已合入或人工批准。

## 范围与版本

- 将基于 `633f941` 的 Responses、UI-POLISH 和 PERF 三项已完成增量接到已 fetch 的 main `44e2230`；交付分支 `codex/responses-ui-performance`。
- 原目录完整保留。独立集成工作区不复制本地 RUN/PULL/API-REVIEW/目录整理记录、真实 .env、密钥、调试日志、截图或构建产物。
- main 的 NPC 独立配置、随机种子、账号权限错误分类、品牌与素材变更保留；旧 Chat Completions/Anthropic 专用实现和重复测试随 Responses 迁移删除，独立 NPC 与客户端回归迁到新协议。
- Windows、Node.js v24.21.0、npm 12.1.0；执行锁定安装。没有新增 SDK 或测试框架。

## 检查结果

| 检查 | 结果 |
|---|---|
| `npm ci` | 通过；326 包，保留原依赖审计提示，未擅自升级依赖 |
| `npm run typecheck` | 通过；完整构建再次执行类型检查也通过 |
| `npm test` | 首轮 397/398 通过，gameSession seed 1 超过默认 5 秒，未修改测试或规则 |
| `npm test -- --maxWorkers=2` | 45 文件 / 398 项全部通过；通过降低本地并发避免 CPU 争用，不修改仓库超时配置 |
| `npm run build` | 通过；生成 `dist/` 和 `build/server.js`；现有 3D chunk >500kB 提示保留 |
| 生产前端烟测 | 使用隔离端口的 browser-fixture，无真实模型请求；随机种子刷新、显示设置、节能预设同时启用低画质/30 FPS/简化乘客/低频面板/减少动效均通过 |
| 既有实际验收 | [Responses](RESPONSES-001.md)、[UI](UI-POLISH-001.md)、[性能](PERF-001.md) 保留原版本证据，不冒称本次重跑了完整浏览器整局和硬件性能 |
| 真实供应商 / Docker | 未运行；未新增付费模型调用或部署 |

## 集成时修改的函数

所有新增和修改的具名函数均有用途注释；原三项任务的完整函数索引见各自报告/简报。

| 文件 / 函数 | 集成职责 |
|---|---|
| `server/llm.ts` / `createLlm` | 保留唯一 Responses Agent 通道及旧协议迁移报错 |
| 同文件 / `createNpcLlm` | 从开发者的 NPC 模型、地址和 Key 创建独立 Responses 服务，不借用 Agent 凭据 |
| `server/modelSettings.ts` / `npcConfigFromEnv` | 固定 NPC 为 none、非流式，并沿用统一总输出预算 |
| `server/responses.ts` / `ResponsesClient.create` | 保留 Responses 传输和安全失败处理，复用 main 的账号/模型权限错误分类 |
| `server/modelError.ts` / `modelHttpError` | 支持 Responses 的 reasoning 参数名及按调用场景提供安全兜底文案 |
| `server/app.ts` / `createApp` | 保留 NPC 独立路由和会话归属；启用探测日志同时记录所选思考档位 |
| `src/ui/App.tsx` / `edit` | 保留 main 的新局随机种子，不改变同种子重试入口 |
| `src/ui/useGameSession.ts` / `useGameSession` | 组合随机初始种子与按需模拟/HUD 调度 |
| `src/ui/ModelConfigPanel.tsx` / `verify` | 优先已有可用模型或 Flash；未知模型列表仍需用户选择，不默认选中可能无权限的图片模型 |
| `tests/modelConfig.test.ts` / `start` | 同一隔离 API 中注入独立 NPC 和诊断；保留配置隔离与新旧对局参数检查 |
| `server/index.ts` / 实测脚本启动接线 | 注入独立 NPC 实例及对应预算/诊断；实测脚本没有执行 |

## 风险与交接

这是显式协议迁移：部署前需确认网关支持 `/responses`、工具与结构化输出；原生 Anthropic Agent/NPC 配置需自行迁移，不自动改写 .env。页面档位和独立 NPC 配置互不覆盖，NPC 默认关闭思考。真实接口可用性与策略质量仍未验收。

回退通过撤回本 PR 恢复旧协议；没有数据库或存档迁移。临时烟测服务已停止，原用户服务未调整。构建输出复制到原目录的本地忽略目录后归档临时工作区。
