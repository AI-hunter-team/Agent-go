# AI猎人 · 地铁站 MVP

玩家用最多 300 字指导一个角色，让它在动态地铁站里自主完成 **买票 → 安检 → 过闸机**。世界由程序模拟，Agent 只能请求行动，不能改写世界事实。

项目仓库：[AI-hunter-team/Agent-go](https://github.com/AI-hunter-team/Agent-go)。

**当前状态：本地 Web MVP 已实现，支持 Luna 兼容 API 与 Anthropic 两种模型接入。** 实测记录见 [验收记录](docs/验收记录.md)。功能修改通过独立的 `codex/` 分支向 `main` 提交 PR，审核后合并。

新开发者与开发 Agent 先读 [AGENTS.md](AGENTS.md)、[文档导航](docs/README.md) 和 [开发与协作流程](docs/DEVELOPMENT.md)，当前任务与阻塞见 [工作记录](docs/开发计划.md)。原 MVP 任务的 `mvp-dev` 分支及推送限制保留在历史记录中，不是所有后续任务的固定分支或永久规则。

## 本地启动

建议 Node.js 24 LTS、npm，使用仓库 `package-lock.json`。仓库尚未用 `engines` 或版本文件固定 Node；验证报告需记实际版本。首次安装：

```bash
npm ci
```

启动前后端：

```bash
npm run dev
```

打开 http://localhost:5173 。前端 Vite 代理 `/api` 到本机 Express 8787 端口。

没有模型凭据也能玩：选 **离线规则 Agent → 准备开局 → 开局**。可暂停、切换 1/2/4 倍速、查看轨迹、结束对局；结束后看成绩、耗时、决策与事件，或导出 JSON。

离线规则 Agent **不是大模型，不理解自然语言指导**，只用于运行规则演示及回归测试。不能据此认定真实模型会通关。

### Docker Compose 部署

需要 Docker Engine / Docker Desktop 和 Docker Compose v2.20+。在仓库根目录执行：

```bash
docker compose up --build -d --wait
```

打开 [http://localhost:8080](http://localhost:8080)。同一容器提供前端和 `/api`，不需要另启 Vite、反向代理或配置浏览器跨域；默认映射到本机回环地址。没有 `.env` 也可以启动，之后通过页面的「模型 API 配置」填入自己的域名和 Key，或先使用离线 Agent。

也可在根目录 `.env` 中设置服务端默认模型，沿用下面的模型环境变量说明；Compose 会读取并传给容器，不将 `.env` 复制进镜像。更改后执行 `docker compose up -d --force-recreate`。页面填写的 Key 与对局只在内存中保存，刷新或容器重启后需重新配置/开局。

- 自定义网页端口：在 `.env` 中设置 `APP_PORT=8081`；本地开发的 `PORT` 不改变容器固定内部端口 8787。
- 需要从其他机器访问时，显式设置 `APP_HOST` 为宿主机对应地址；当前默认 `127.0.0.1`。这不提供账号鉴权或 TLS，公网托管需另行配置。
- 连接宿主机上的模型网关时，容器中的 `localhost` 指容器自身；使用 `http://host.docker.internal:<网关端口>/v1`。Compose 已兼容 Linux 的 host-gateway 映射，宿主机网关还需要监听容器能够访问的接口。
- 更换代码后重新执行 `docker compose up --build -d --wait`。镜像由官方 Node 24 多架构基础镜像构建，跟随 Docker 本机平台；实际验证的平台以任务验证报告为准。

```bash
docker compose ps
docker compose logs -f app
docker compose down
```

容器使用非 root 用户、生产依赖和健康检查；检查 `/api/health` 只说明进程与路由就绪，离线模式也会健康，不代表模型认证或额度已验证。`npm run test:compose` 会对已启动的本机 Compose 实例执行模拟接口冒烟并停止容器，供开发/CI 使用，不在实际用户对局期间运行。

### 接入真实模型

可直接在页面点击 **模型 API 配置**，填写 OpenAI 兼容接口的 **API 域名和 Key → 验证连接并获取模型 → 选择模型 → 验证模型并启用大模型**。只填写域名时自动补上 `/v1`；填写完整基础路径时会保留。模型列表接口不受支持时，可手动填写模型 ID。启用前会发起一次与游戏相同的真实工具调用，验证认证、模型权限与工具协议，可能消耗少量接口额度；失败时不会启用。

页面配置按浏览器页面隔离，Key 仅存于临时内存，不写入浏览器存储、`.env` 或日志；刷新后需重新配置，闲置 30 分钟后失效。配置只影响当前页面的新对局，不更改服务端默认配置或其他用户的模型。可通过「清除页面配置」恢复服务端默认配置。

也可继续使用服务端默认配置：

尚无 `.env` 时复制本地配置模板（PowerShell）；已有配置则直接编辑，避免覆盖：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`，填入自己的 `OPENAI_API_KEY`，然后重启开发服务器。不要把密钥放入任何 `VITE_*` 变量或提交到 Git。

- 模板默认 `AGENT_PROVIDER=openai`、`OPENAI_BASE_URL=https://lax.toklens.ai/v1`、`AGENT_MODEL=gpt-6-luna`，使用兼容 OpenAI 的 Chat Completions 协议，由 Node 服务端发出请求。
- Luna 决策使用 `reasoning_effort=low`、强制单个工具调用；多工具、无效参数或截断输出均不执行。会话保存工具调用及下一轮真实动作结果和局部观察。
- 指导整理和意图分类使用严格 JSON Schema。接口未返回推理 token 明细时记录为未知，不估算；界面通过动作的 `reason` 显示简短决策理由。
- 使用 Anthropic 时设置 `AGENT_PROVIDER=anthropic`、`ANTHROPIC_API_KEY`、`AGENT_MODEL=claude-opus-5-5`；也支持 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL` 与 `AGENT_FORCE_LLM=1`。
- `GET /api/health` 只检查凭据是否配置，**不代表额度、认证或模型可用性已验证**。
- 每次模型请求会消耗接口额度，执行真实测试需当前任务对应授权。可显式运行 `npm run test:model` 做真实整局测试；普通 `npm test` 使用模拟响应，不调用付费模型。
- `DECISION_THINKING_TOKENS=1024` **仅约束思考**，动作与说明另计；`DECISION_MAX_TOKENS=4096` 是独立的总输出保护值，并为非思考输出保留至少 1024 token 空间。
- 当前兼容协议没有经确认的独立数值思考硬上限。应用通过提示、`low` 强度及返回的 `reasoning_tokens` 检查；思考超限的动作不执行。缺少思考明细时标为无法验证，不能声称供应商生成时已硬截断到 1024。[官方推理参数说明](https://developers.openai.com/api/docs/guides/reasoning)。
- 每个决策最多重试一次，思考用量逐次检查，复盘累计两次用量。模型传输层不自动重试，20 秒超时；浏览器请求 30 秒超时。
- 兼容 API 接入固定关闭应用侧模型回退；Anthropic 可通过 `AGENT_FALLBACK=default` 开启服务端拒答回退。日志记录供应商响应的模型名。
- 指导整理属于赛前操作，输出上限 4096；创造性归类独立调用，上限 1024。报告的 token 统计仅含局内角色决策（含其重试），**不是全局账单**。

### Debug 日志与 AI 耗时

每局复盘可展开 **Debug 日志与 AI 耗时**，查看局内 AI 总等待、赛前整理、首次决策/重试/创造性归类，以及买票/安检/过闸阶段的耗时和占比；支持导出 Debug JSON、查看逐次参数与错误。游戏评分仍只使用世界时间。

服务端默认将脱敏日志写入 `logs/debug-*.jsonl`，包含请求参数、供应商请求 ID、响应模型、token 和接口耗时；通过 `runId` 关联整局。设置 `DEBUG_LOG_ENABLED=0` 可关闭文件写入，`DEBUG_LOG_DIR` 可修改目录。日志与凭据均由 Git 忽略，不随代码上传。详见 [Debug 日志说明](docs/Debug日志.md)。

这里的“思考耗时”是端到端 AI 调用等待，包含网络、排队和生成；接口不提供纯内部推理时间，报告将其保留为未知。

### 常用命令

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

`npm run build` 完成类型检查并生成 `dist/` 静态前端和 `build/server.js` 生产服务。`npm run build:web`、`npm run build:server` 可分别构建；`npm start` 执行编译后的服务，生产环境需设置 `NODE_ENV=production` 才提供前端静态页面。Compose 已设置该变量和容器监听地址。单独发布 `dist/` 仍不会自动包含 API；本版没有新增公网账号、鉴权或 TLS。

真实模型测试（消耗接口额度）：

```bash
npm run test:model -- --seeds=1,2 --compare
```

默认只跑种子 1；上述命令跑种子 1、2，并在种子 1 加跑“优先 TVM-2”的指导对照，最后测试三类创造性意图。通过本地 HTTP API 验证指导整理、会话、决策与清理，完整报告写入 `docs/model-tests/`，不含密钥。辅助调用不计入对局 token 总数，费用以供应商账单为准。

[GitHub Actions CI](.github/workflows/ci.yml) 在指向 `main` 的 PR、`main` 更新及手动触发时，使用 Node.js 24 在 Ubuntu/Windows 上执行锁定安装、类型检查、测试和构建；不调用真实模型或部署。运行结果以 Actions 为准，平台分支保护需另行核实。

## 已实现

- React + TypeScript + Vite，Canvas 2D 地图；Express 模型代理，兼容 OpenAI API 与 Anthropic。
- 固定步长模拟、带种子的 NPC/耗时、队列与服务、设施故障与广播。
- 角色局部观察、墙体/柱子遮挡、保安视野及违规发现判负。
- 事件触发决策、思考期间整个世界与倒计时暂停、每局决策预算。
- 自然语言指导整理、结构化工具、局内消息记忆、局后清理。
- 有限创造性机制、条件检查与实际后果；不支持的意图会反馈限制。
- 过闸用时评分，超时/违规被发现无成绩；技术失败单独说明原因。
- 轨迹、决策记录、世界事件、时间分解、JSON 导出及同种子重试。

## 验证与边界

见 [验收记录](docs/验收记录.md)和[按任务验证报告](docs/validation/README.md)。规则 Agent 在种子 1–6 的既有自动化测试中均能通关；此前浏览器完整跑通种子 1，用时 72.9 秒。模型协议回归测试覆盖请求参数、预算、工具解析、多轮会话和失败处理；Luna 实测由独立命令执行并保存报告。历史数据不代表本次冲突修复重跑了浏览器或真实模型；各轮验证范围与限制以对应记录为准。

- 玩家采用上帝视角；模型只拿局部观察。图上的圆/扇形是视距和朝向示意，**不是经过遮挡裁剪后的实际可见区域**；规则判定会检查遮挡。
- 相同种子固定初始环境与随机序列；玩家动作会影响后续状态，不代表不同指导下 NPC 轨迹永远相同。真实模型输出也不保证确定性。
- 本局报告保留在当前页面，可导出 JSON；刷新后不会保留。没有历史局库、逐帧回放或跨局 Agent 记忆。
- 本机可信客户端管理世界状态，不适合竞技防作弊。无账号、数据库、公网限流与生产部署方案。

## 文档

- [文档导航与权威来源](docs/README.md)：产品、架构、接口、开发、验收及历史入口。
- [开发与协作流程](docs/DEVELOPMENT.md)：任务边界、并行工作、命令、审查与交接。
- [当前路线图](docs/ROADMAP.md)和[中央工作记录](docs/开发计划.md)：目标依赖、状态、决定与后续入口。
- [方案 1.1](docs/Demo方案1.1.md)和[详细 MVP 技术方案](docs/MVP技术方案.md)：产品基线、架构与实现差异；代码不能默默覆盖产品规则。
- [任务简报](docs/templates/task-brief.md)、[验证报告](docs/templates/validation-report.md)及[PR 模板](.github/pull_request_template.md)：新任务可直接使用。
- [旧项目基线](PROJECT.md)：历史设计和决策证据，不能替代现行产品基线。

后续三维美术方向仍保留 [现代主义交通剧场](design/ui-concepts-v3/README.md)，本版不做 3D。历史素材没有被删除。
