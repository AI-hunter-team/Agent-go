# Docker Compose 部署与配置

适用版本：当前 `main`，已包含 Docker/Compose、3D 界面及 [RESPONSES-001](tasks/RESPONSES-001.md) 的 Responses 与思考设置（经 PR #22 合入）。

## 1. 准备环境

- Git。
- Docker Engine 20.10+ 或 Docker Desktop。
- Docker Compose v2.20+，使用带空格的 `docker compose` 命令。

确认 Docker 服务已启动：

```bash
docker version
docker compose version
```

宿主机不需要 Node.js、npm 或另外配置 Nginx；镜像会构建前端并由同一个 Node 服务提供页面和 API。

## 2. 获取正确版本并启动

首次部署建议克隆到新目录，避免影响已有开发环境或覆盖其未提交修改：

```bash
git clone --branch main --single-branch https://github.com/AI-hunter-team/Agent-go.git Agent-go-docker
cd Agent-go-docker
docker compose up --build -d --wait
```

构建成功后打开 [http://localhost:8080](http://localhost:8080)。第一次启动需要下载基础镜像和安装镜像内依赖，可能需要等待。

查看服务状态与日志：

```bash
docker compose ps
docker compose logs -f app
```

`healthy` 表示页面/API 服务就绪。即使没有模型凭据，也应该能够启动并使用离线 Agent。健康检查不代表模型 Key、额度或模型权限已验证。

## 3. 在页面开启大模型

1. 点击开局区的「模型 API 配置」。
2. 填写 DeepSeek 或兼容 Responses 的基础地址和 Key，默认 `https://api.deepseek.com`；保留原路径，不自动补 `/v1`。
3. 点击「验证连接并获取模型」。
4. 选择模型和思考强度，默认 DeepSeek Flash / 关闭；可选低、高、最高。模型列表不可用时手动填写模型 ID。
5. 点击「验证模型并启用大模型」，成功后点击「去开局」。

模型启用会发起一次真实工具调用，可能消耗少量供应商额度；失败时显示原因，不会启用该模型。Key 不写入浏览器存储或镜像，只在临时内存中持有。刷新页面需重新填写；容器重启会清空临时配置和对局。

## 4. 服务端默认模型与端口

没有 `.env` 也可以使用上一节的页面配置。如果希望提供服务端默认模型，在 `Agent-go-docker` 目录创建 `.env`，按自己的接口替换示例值：

```dotenv
AGENT_PROVIDER=responses
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=your-api-key
AGENT_MODEL=deepseek-flash
OPENAI_REASONING_EFFORT=none
OPENAI_STREAM=1
DECISION_MAX_TOKENS=4096
APP_PORT=8080
```

Compose 会读取 `.env` 并把明确列出的模型变量传给容器；文件不进入构建上下文或镜像，也不要提交到 Git。模型 Key 应填写在 `OPENAI_API_KEY`，不要使用任何 `VITE_*` 变量。

角色决策、Boss 行动解释和 NPC 对话沿用对局创建时绑定的同一 Responses 模型；用户可在页面验证并启用模型，新配置只影响新局。独立 `NPC_*` 环境变量已停用，升级后不需要补充 NPC 凭据。没有可用模型时仍可使用离线规则 Agent。

配置修改后重建容器使环境变量生效：

```bash
docker compose up -d --force-recreate --wait
```

Compose 默认开启脱敏调试日志（`DEBUG_LOG_ENABLED=1`），写入容器内 `/app/logs` 并挂载为命名卷 `debug-logs`；在 `.env` 设置 `DEBUG_LOG_ENABLED=0` 后重建容器可关闭。

`APP_PORT=8081` 会把访问地址改为 `http://localhost:8081`。容器内部端口固定为 8787，本地开发配置中的 `PORT` 不会改变网页映射端口。

默认 `APP_HOST=127.0.0.1` 只允许宿主机访问。如需局域网访问，可在 `.env` 中明确设置 `APP_HOST=0.0.0.0` 后重建容器，并使用宿主机 IP 访问。应用没有新增账号鉴权或 TLS；公网托管应另行配置访问控制与 HTTPS。

旧 `AGENT_PROVIDER=openai` 作为 Responses 别名。Anthropic 原生通道已移除，须自行配置支持 Responses 的地址、模型和 Key；不会自动挪用旧密钥。`DECISION_THINKING_TOKENS`、`AGENT_FALLBACK` 已停用。总输出预算包括思考；页面档位独立于服务端默认值，重新启用只影响新对局。

## 5. 连接宿主机上的模型网关

容器里的 `localhost` 指容器本身。如果模型网关运行在宿主机，例如端口 8000，在页面或 `.env` 中填写：

```text
http://host.docker.internal:8000/v1
```

Compose 已设置 Linux 的 `host-gateway` 映射；Docker Desktop 也支持这个主机名。宿主机上的网关还必须监听容器能够访问的接口，不能只依赖宿主机回环访问。

## 6. 更新、停止与排查

在本教程首次克隆的目录内更新并重新构建：

```bash
git pull --ff-only
docker compose up --build -d --wait
```

停止并删除本应用的容器/Compose 网络：

```bash
docker compose down
```

常见问题：

| 现象 | 检查方式 |
|---|---|
| 提示找不到 Compose 配置文件 | 确认位于 `Agent-go-docker` 根目录，分支为当前 `main`，目录中存在 `compose.yaml` |
| 8080 端口被占用 | 在 `.env` 设置其他 `APP_PORT`，重新执行启动命令 |
| 页面可访问，但模型认证失败 | 在页面检查域名、Key、模型权限和额度；`healthy` 不验证这些内容 |
| 连接宿主机网关失败 | 使用上一节的 `host.docker.internal`，核对网关端口、监听接口和宿主机网络设置 |
| 容器未就绪或启动失败 | 执行 `docker compose ps`、`docker compose logs --tail=100 app` 查看构建/启动错误 |
| 修改环境变量后没有变化 | 执行 `docker compose up -d --force-recreate --wait`，仅刷新浏览器不会更新容器环境变量 |

## 验证范围与实现入口

- [实际 Compose 构建、健康启动及模拟模型流程验证](https://github.com/AI-hunter-team/Agent-go/actions/runs/41051814331)。
- [Ubuntu/Windows 软件检查](https://github.com/AI-hunter-team/Agent-go/actions/runs/41051838597)。
- 部署实现：[compose.yaml](../compose.yaml)、[Dockerfile](../Dockerfile)。

以上是既有部署版本的验证记录，本次教程更新没有重新执行 Docker 构建或真实模型调用。实际验证的平台为 Linux CI 容器环境；不能据此宣称全部桌面 Docker 或 CPU 架构均已验收。
