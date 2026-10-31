# MODEL-LOADING-OVERLAY-001 验证报告

状态：软件检查完成；浏览器慢加载与失败回退路径未在本轮稳定复验

## 范围与基线

- 目标：首次加载外部角色模型时显示“正在加载模型”进度遮罩；成功后隐藏；`ModelBoundary` 回退几何角色或三维场景失败时立即隐藏遮罩。
- 基线：`origin/main`，`45e7964a1c806faa43093cd6e536ce4b938df1bb`，2026-10-31。
- 改动：`src/ui/App.tsx`、`src/ui/App.module.css`、`src/ui/scene/GameScene.tsx`、`src/ui/scene/Character.tsx`、`src/ui/modelLoading.ts`、`tests/modelLoading.test.ts`。
- 无真实模型或付费接口调用；模型加载路径仍为调试面板允许的 `/models/*.gltf|*.glb`。

## 检查结果

| 检查 | 结果 | 证据/限制 |
|---|---|---|
| `npm run typecheck` | 通过 | `tsc --noEmit` 退出码 0 |
| `npm test -- tests/modelLoading.test.ts` | 通过 | 3 tests passed；覆盖首次加载显示、成功/失败隐藏、进度钳制及缓存 URL 处理 |
| `npm run build` | 通过 | Web 与 server 生产构建均完成；Vite 仅报告既有大 chunk 警告 |
| `git diff --check` | 通过 | 已跟踪改动无空白错误；新增文件另行检查 |
| `npm test` | 通过 | 91 个测试文件、725 项全部通过；仅保留既有 Debug 日志权限提示 |
| `npm run dev:web` / 浏览器 | 未运行 | 本轮以软件回归为主；模型慢加载中间态与不存在模型回退未稳定复验 |

## 实现核对

- Drei `useProgress` 提供 Three.js `DefaultLoadingManager` 的真实加载进度；`ImportedModel` 成功挂载后报告 100%。
- `ModelBoundary.componentDidCatch` 报告失败并继续渲染几何角色，同时关闭当前模型遮罩。
- 遮罩使用 `role="progressbar"`、`aria-valuenow`、`aria-valuemin/max` 和 `aria-live="polite"`；只有状态为 `loading` 且存在模型 URL 时显示。
- `sceneFailure`、二维调试模式和模型失败状态都会阻止遮罩残留。

## 交接

- 当前分支：`codex/model-loading-overlay`，基于 `origin/main` 的 `45e7964a1c806faa43093cd6e536ce4b938df1bb`；原工作区的无关修改未带入。
- 本任务新增/修改文件尚未提交、推送或合并；用户已授权继续完成 PR 交付与合入。
- 浏览器慢加载、成功及不存在模型回退三条路径未在本轮稳定复验，不能以软件检查替代真实浏览器验收。
