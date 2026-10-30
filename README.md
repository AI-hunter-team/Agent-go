# AI猎人 · 地铁交通剧场

玩家用最多 300 字指导一个角色，让它在动态地铁站里自主完成 **买票 → 安检 → 过闸机**。世界由程序模拟，Agent 只能请求行动，不能改写世界事实。

项目仓库：[AI-hunter-team/Agent-go](https://github.com/AI-hunter-team/Agent-go)。

**当前开发版本已增加单层 3D 站厅、几何角色、跟随/总览镜头及完整游戏界面，支持 Luna 兼容 API 与 Anthropic 接入。** 规则仍由原模拟器结算，二维地图保留为调试视图。3D 浏览器证据及未完成验收见 [3D-MIG-001](docs/validation/3D-MIG-001.md)，模型实测见 [验收记录](docs/验收记录.md)，本次集成检查见 [PR7-MERGE-001](docs/validation/PR7-MERGE-001.md)。

新开发者与开发 Agent 先读 [AGENTS.md](AGENTS.md)、[文档导航](docs/README.md)和[开发流程](docs/DEVELOPMENT.md)，阶段状态见[工作记录](docs/开发计划.md)。功能修改通过独立 `codex/` 分支向 `main` 提交 PR；历史任务的分支及推送限制不是后续任务的永久规则。

## Docker Compose 部署

**完整教程：[Docker Compose 部署与配置](docs/DOCKER.md)。** 包含首次安装、页面 API Key 配置、自定义端口、宿主机网关、更新和停止步骤。

默认 `main` 已包含 Docker/Compose、页面模型配置和 3D 界面。首次部署：

```bash
git clone --branch main --single-branch https://github.com/AI-hunter-team/Agent-go.git Agent-go-docker
cd Agent-go-docker
docker compose up --build -d --wait
```

打开 [http://localhost:8080](http://localhost:8080)，点击「模型 API 配置」，填写域名和 Key、验证连接、选择模型并启用；也可直接使用离线规则 Agent。需要 Docker Engine / Docker Desktop 和 Docker Compose v2.20+，无需在宿主机安装 Node.js。没有 `.env` 也可以启动。

## 本地开发启动

建议 Node.js 24 LTS、npm，使用仓库 `package-lock.json`。仓库尚未用 `engines` 或版本文件固定 Node；验证报告需记实际版本。首次安装：

```bash
npm ci
```

启动前后端：

```bash
npm run dev
```

打开 http://localhost:5173 。前端 Vite 代理 `/api` 到本机 Express 8787 端口。

没有模型凭据也能玩：选 **离线规则 Agent → 准备开局 → 出发**。可暂停、切换 1/2/4 倍速、结束对局；结束后看成绩、耗时、决策与事件，或导出 JSON。

离线规则 Agent **不是大模型，不理解自然语言指导**，只用于运行规则演示及回归测试。不能据此认定真实模型会通关。

### 三维观战与占位资产

- 默认第三人称跟随；拖动场景环绕、滚轮缩放；“回正”恢复背后视角，“总览”切换正交镜头。暂停或思考时仍可操作镜头。
- “显示设置”提供标准/低画质和减少动效；低画质关闭动态阴影。
- 地址后加 `?debug=1` 显示开发调试：切换同一局的 2D/3D、查看视距示意和轨迹、采样/导出性能记录。
- 调试中的“加载样例”使用原创 [文本 glTF 样例](public/models/sample-sculpture.gltf)替换玩家模型；也可指定 `/models/` 下的本地 `.gltf` / `.glb`。失败显示几何占位，不改变对局。
- 资产采用米制、Y 向上、脚底原点、+Z 为角色前方，玩家模型适配到约 1.7 米。动画名为 `Idle / Walk / Interact / Jump`；缺失时使用程序动效。当前支持普通 glTF 2.0/GLB，未配置外部 Draco 解码器，不依赖外部字体或解码 CDN。
- 正式角色、NPC、设施和材质资产后续单独接入；当前没有多层空间或刚体物理，大型资产和截图不入库。

### 无费用浏览器验收服务

仅在验收时运行 `node --import tsx tests/browser-fixture.ts`，它在本机端口 8891 提供标明“伪模型（无费用）”的 API，不读取模型凭据。另一个 PowerShell 中设置 `$env:PORT = '8891'`，再运行 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178 --strictPort`，即可用隔离端口验收。

指导包含 `FAIL-NORMALIZE` 可检查整理失败；`SLOW` 使伪决策等待 10 秒；`FAIL-DECISION` 检查重试/保底/终局；`JUMP` 供已有翻闸机制的展示验证使用。这些只属于测试服务，不是真实模型能力。验收结束后停止该服务；日常使用沿用 `npm run dev`。

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

- React 18 + TypeScript + Vite，Three.js / R3F / Drei 三维场景，Radix 交互与定制游戏 UI；Express 模型代理，兼容 OpenAI API 与 Anthropic。
- 与渲染器独立的对局运行层、只读展示快照、位置插值、程序动画、相机避障、同局二维调试与模型失败占位。
- 固定步长模拟、带种子的 NPC/耗时、队列与服务、设施故障与广播。
- 角色局部观察、墙体/柱子遮挡、保安视野及违规发现判负。
- 事件触发决策、思考期间整个世界与倒计时暂停、每局决策预算。
- 自然语言指导整理、结构化工具、局内消息记忆、局后清理。
- 有限创造性机制、条件检查与实际后果；不支持的意图会反馈限制。
- 过闸用时评分，超时/违规被发现无成绩；技术失败单独说明原因。
- 轨迹、决策记录、世界事件、时间分解、JSON 导出及同种子重试。

## 验证与边界

见 [历史验收记录](docs/验收记录.md)与[按任务验证报告](docs/validation/README.md)。规则 Agent 种子 1–6 既有自动化测试通过；3D 任务核对了这些种子的对局结果一致性，并在 Edge 跑通种子 1（72.9 秒）。Luna 真实模型实测由独立命令执行并保存报告，3D 界面原验收使用伪 API。历史数据不代表本次集成重跑了浏览器或真实模型；Chrome、最终构建浏览器/性能及其他未验证项以对应报告为准，不从软件检查推断全部验收通过。

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

三维美术沿用 [现代主义交通剧场](design/ui-concepts-v3/README.md)。本版使用几何占位，历史概念图不作为已实现效果或性能承诺。
