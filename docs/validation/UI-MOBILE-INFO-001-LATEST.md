# UI-MOBILE-INFO-001-LATEST 验证记录

日期：2026-10-31

范围：将新版移动端观战 UI 的“本局信息”入口移入行程信息卡，并放在“当前行动”入口之前；移除底部重复入口。

| 检查 | 结果 | 证据/说明 |
|---|---|---|
| `npm run typecheck` | 通过 | 在可写临时副本中复用工作区依赖，`tsc --noEmit` 成功 |
| `npm run build` | 通过 | Vite 前端与 esbuild 服务端构建成功；仅有既有 chunk 体积提示 |
| `git diff --check` | 通过 | worktree diff 无空白错误 |
| `npm test` | 未运行 | 本次为布局 DOM/CSS 调整；现有仓库测试依赖本地端口，当前沙箱监听受限 |
| 移动端浏览器实际验收 | 未运行 | 当前沙箱禁止启动本地监听服务；需在可运行浏览器环境复验 |

基线：`origin/main` / `8162f922401f534c1cbaf6221fde4fbd5002f666`

限制：验证使用 `/private/tmp/agent-go-latest-check` 的可写副本，仅用于复用依赖，不纳入提交。
