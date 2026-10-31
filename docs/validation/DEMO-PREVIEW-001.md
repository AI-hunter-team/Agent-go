# DEMO-PREVIEW-001：验收预览启动记录

身份：2026-10-31 本地启动与页面显示核对，不代表真实模型整局或用户验收通过。范围见[任务简报](../tasks/DEMO-PREVIEW-001.md)。

- 执行人：本聊天 Codex。
- 基线：原目录 HEAD `b1ef12e2ba571573906f12b49bb5f23bf7c8a303`，开始时干净；fetch 后主线为 `186682486f46615f86e915088067c53ab02b95d9`，包含 PR #22 与 #23。
- 运行副本：`.codex/demo-preview-001/source/`，由该提交的 `git archive` 导出，不包含未提交的集成工作区。现有依赖通过本地 node_modules junction 复用；package 与 lock 相对原目录只有包名差异，无依赖版本差异。
- 环境：Windows，Node v24.21.0、npm 12.1.0。

## 实际结果

| 检查 | 结果 |
|---|---|
| 导出源码 | Git archive 成功；Windows tar 解压两个中文文件名失败，改用 Python tarfile 对同一归档解压成功，未修改源码 |
| `npm run build` | 通过，含类型检查及前后端生产构建；保留已有 3D chunk >500kB 提示 |
| 生产服务 | 已启动；`NODE_ENV=production`、`HOST=127.0.0.1`、`PORT=5173`；Node PID 53380 |
| 配置 | 通过 dotenv 的路径参数引用原本地配置，不复制或输出凭据；诊断日志落入本地忽略目录 |
| HTTP 页面 | `http://127.0.0.1:5173/` 返回 200，包含 root 容器 |
| `/api/health` | 返回 200，`{ llm:false, model:null }`；服务端当前未启用模型 |
| 浏览器 | 应用内浏览器打开 `http://localhost:5173/`，已目视确认三维站厅、角色、品牌及开局面板正常显示；标签已标为交付并保留 |
| 业务与付费验收 | 未新增或运行业务测试，未启动对局、启用探测或任何真实模型调用；用户验收待进行 |

## 产物与运行交接

- 页面地址：`http://localhost:5173/`，服务在后台保持运行。
- 前端产物：`.codex/demo-preview-001/source/dist/`。
- 后端产物：`.codex/demo-preview-001/source/build/server.js`。
- 启动标准输出/错误：`.codex/demo-preview-001/stdout.log`、`.codex/demo-preview-001/stderr.log`。
- 停止时先核对监听 5173 的进程，当前为 PID 53380；确认仍为本预览后执行 `Stop-Process -Id 53380`。
- 无业务函数修改，因此没有新增函数或函数职责变化；只更新本任务、验证、PROGRESS 与 TODO 文档。未提交、推送、合并或部署。
