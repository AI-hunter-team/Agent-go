# DEPLOY-COMPOSE-001 验证报告

状态：验证快照；容器 CI 验收待运行，尚未合入，人工审核未进行。

## 版本与环境

- [任务简报](../tasks/DEPLOY-COMPOSE-001.md)；执行：本次 Codex 会话；日期：2026-10-30（Asia/Shanghai，UTC+8）。
- 独立分支 `codex/docker-compose`，基线 `a44220fc1b9698c570750c9793326bebcddf3678`，包含已合入前置功能分支的 API 配置 PR #4。受测代码在提交前工作区，最终以本 PR 的 feature 提交固定。
- 变动包括容器/Compose/CI 文件、构建脚本及锁文件、生产入口与静态服务、生产测试、容器冒烟、使用/开发说明及本任务文档；完整允许范围见任务简报。其他工作区及 Debug 任务未纳入。
- 本地：macOS / Darwin 25.6.0 arm64，Node v24.8.0、npm 11.6.0；Docker CLI/daemon 不可用。复用与锁文件对应的已有安装，临时依赖链接不入库。
- esbuild 0.28.2 原已在锁文件的间接开发依赖中，本次将其声明为直接开发依赖；`npm install --save-dev --save-exact esbuild@0.28.2 --package-lock-only --ignore-scripts` 成功，仅新增锁文件根依赖声明，没有更换已有解析版本。离线尝试因无 registry 元数据缓存失败，随后正常获取元数据完成。npm 提示的既有依赖审计告警另行跟进，未执行破坏性自动升级。

## 实际检查

所有本地命令在独立工作区根目录执行。完整测试于 19:54:47（UTC+8）开始。

| 层次 | 实际命令/操作 | 结果与证据 |
|---|---|---|
| 类型 | `npm run typecheck` | 通过，退出码 0 |
| 测试 | `npm test` | 17 文件、142 项通过，退出码 0；新增生产路由测试覆盖首页、SPA 路径、资产、缺失资产及未知 API |
| 生产构建 | `npm run build` | 前端 `dist/` 和 Node 24 ESM 服务 `build/server.js` 均生成成功，退出码 0 |
| 脚本语法 | `node --check scripts/smoke-compose.mjs` | 通过，退出码 0 |
| 编译后启动 | 用 Node 运行 `build/server.js`，环境设为 production、本机监听且无模型 Key；HTTP 请求首页与 health，然后发送 SIGTERM | 通过：HTML 含前端根节点、health 显示离线可用，进程正常退出码 0；没有通过 tsx 启动 |
| 格式与范围 | `git diff --check`；暂存后 `git diff --cached --check`，检查允许路径和文档链接 | 通过，退出码 0；14 个计划文件不含秘密、个人绝对路径或生成产物 |
| 本地容器 | `docker compose version`、`docker version` | 未运行成功：机器无 Docker 命令；不把本地生产服务冒烟称作容器验证 |
| 实际容器 CI | 新增 Compose smoke，检查 `docker compose config --quiet`、构建/健康启动和 `npm run test:compose` | 待 PR 触发并记录实际结论；未提前声称通过 |

容器冒烟计划验证：同源 HTML/JS/HTTP API、无凭据健康状态、缺失资产及未知 API 的 404、非 root 进程、无源文件/`.env`/构建工具的运行镜像、虚拟上游模型认证/启用/会话决策/清理、SIGTERM 退出码 0。模型均为容器内虚拟 HTTP 上游，不消耗付费额度。

## 状态、限制与交接

| 维度 | 实际状态 |
|---|---|
| 实现完成 | 本地实现及使用说明完成，容器实际验收待 CI |
| 软件检查 | 本地类型、142 项测试、生产构建及编译后 HTTP/停止冒烟通过 |
| 实际验收 | 真实 Docker/Compose 构建和运行待 CI；浏览器、真实供应商、Linux arm64 镜像执行未验证 |
| 已合入 | 未合入；将提交独立 PR 供用户审核，依赖前置 PR #1 |

- 单独修改文档不会重新跑业务测试；有容器/代码变化时复验受影响项。CI 结果按实际运行提交记录，不能替代其他架构或生产公网部署验收。
- 容器临时配置/对局会在重启后清空。默认本机端口映射不扩展到公网；外部访问、账号鉴权、TLS 和持久化不属于本次交付。
- Docker 镜像使用官方 Node 24 多架构标签；尚未实际验证的架构不宣称已验收。基础镜像标签会随官方更新，重建时应复验。
- 未来合并 Debug 任务时需要协调生产入口与日志目录权限；本次不改该任务或承诺其日志持久化。
- 回退：撤回本任务功能提交，使用原开发启动方式；`docker compose down` 清理容器/网络，无数据库迁移。审核及集成入口为任务简报、本报告与 PR，人工负责人待团队指定。
