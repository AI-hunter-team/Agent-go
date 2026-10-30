# DEPLOY-COMPOSE-001：Docker Compose 部署

状态：实现与本地/CI 验证完成，[PR #5](https://github.com/AI-hunter-team/Agent-go/pull/5) 待用户审核。单一负责人及本任务集成协调：本次 Codex 会话；人工审核尚未进行。

## 目标与基线

- 用户要求新增 Docker Compose 部署兼容；沿用本会话独立分支、按规范提交 PR 供审核的交付方式，不远端合并或部署。
- 基线：`codex/luna-api-thinking-budget` / `a44220fc1b9698c570750c9793326bebcddf3678`，已包含 API 配置 PR #4；远端 `main` 仍为 `e8efed5e66e4a63ca1a1e867166f04b76c3ac2f9`。前置 PR #1 尚未合入，最终集成依赖它。
- 分支：`codex/docker-compose`；独立工作区代号 `agent-go-compose-review`。当前其他工作区及 Debug 任务保持独立。
- 规范：根 AGENTS、文档导航、开发流程、路线图和中央工作记录；功能目标由用户本次请求及下列完成条件限定。

## 路径边界与接口

- 允许：`Dockerfile`、`.dockerignore`、`compose.yaml`、`.github/workflows/compose.yml`、`package.json`、`package-lock.json`、`server/index.ts`、`server/app.ts`、部署相关测试/脚本、`README.md`、`docs/DEVELOPMENT.md` 中真实脚本说明、本任务简报和验证报告。
- 排除：模拟器规则、页面 API 配置业务、共享报告类型、Debug 功能、真实凭据、中央记录及路线图、生成产物和实际远端部署。
- 共享文件由本任务串行协调。`server/index.ts` 和 `server/app.ts` 与未合入 Debug 任务可能冲突，后续集成人需保留两侧行为。
- 新增生产构建/启动方式，生产模式同一 Node 服务提供静态页面和 `/api`，容器通过 `HOST=0.0.0.0` 监听；本机开发仍默认回环地址。无新增模型/动作/报告协议。
- Compose 默认只映射本机回环端口；不复制 `.env` 进入镜像。服务端模型配置使用显式环境变量，页面填写 Key 继续可用；容器内 `localhost` 与宿主机地址区别需在文档说明。

## 完成与验证条件

- 无 `.env` 也可 `docker compose up --build -d` 启动页面和 API；环境配置与页面 API 配置两种模式兼容。
- 多阶段镜像只携带生产依赖、编译后服务与静态资源，使用非 root 用户、健康检查、正常停止和重启策略。
- 生产静态服务不把未知 API 或缺失静态资源返回为首页；健康检查只验证 API 就绪，不虚称模型可用。
- 本地类型检查、全量测试、生产构建和 diff 检查；实际容器构建/启动/健康/HTTP 冒烟通过，验证无需真实模型额度。
- 当前机器无 Docker CLI/daemon，不将静态检查当作容器验收；使用仓库 CI 的 Linux Docker 环境运行 Compose 冒烟并记录实际结果。
- [验证报告](../validation/DEPLOY-COMPOSE-001.md)记录基线、受测版本、命令、结果与未验证项。

## 风险、回退与交接

- 本任务兼集成协调仅限允许路径；不自行修改中央记录、他人任务或长期维护策略。
- 回退：撤回本任务提交，恢复原 Vite + 独立 API 启动；Compose `down` 清理本任务容器/网络，无数据库迁移。Key/对局仍为临时内存，容器重启会清空。
- 实现、软件检查、实际容器验收、远端合入分别记录。真实供应商调用、生产公网部署和 TLS 不属于本次验收；用户审核后再决定合入。
- 交付功能提交：`72c8e9da5bbf8ef4b9635fc60fa79dc959bf19b2`，已推送 `origin/codex/docker-compose`。142 项测试/生产构建、本地编译后服务冒烟、[Linux Compose 实际构建和运行](https://github.com/AI-hunter-team/Agent-go/actions/runs/41051814331)及 [Ubuntu/Windows CI](https://github.com/AI-hunter-team/Agent-go/actions/runs/41051838597) 均通过。
- 最后交接提交只补记任务/验证文档，不改受测代码。下一步为用户审核；PR #1 合并后迁移至最新 `main` 并复验，中央记录由其指定集成人登记。未执行远端合并、镜像发布或实际环境部署。
