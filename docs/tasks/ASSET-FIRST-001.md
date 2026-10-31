# ASSET-FIRST-001：站厅首次渲染优先使用正式素材

状态：已提交并创建 PR #37，待审核

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | ASSET-FIRST-001；消除正式站厅加载期间先显示旧几何场景的闪切 |
| 交付物与完成条件 | 站厅 GLB 加载完成前不渲染旧几何回退；成功后直接显示正式素材；加载失败仍可进入旧几何回退并保留重试提示 |
| 单一负责人 | 当前开发 Agent（Codex）；用户在本会话验收 |
| 集成负责人 | 待确认；当前分支直接交付 |
| 基线 | `codex/sync-cloud-20261031`，`09a315a9da878eef9a575b606b38f8642c6c3336`，2026-10-31 |
| 任务分支与工作区 | 当前工作区；不创建新 worktree，保留已有无关修改 |
| 前置任务与资源 | 既有 station-kit 与 metro-railings GLB 清单及加载器 |
| 规范与接口依据 | `src/ui/scene/Station.tsx`、`src/ui/scene/stationAssets.ts`；模拟规则不变 |

## 路径边界

- 允许修改：`src/ui/scene/Station.tsx`、本任务简报、对应验证报告。
- 明确排除：模拟器、共享类型、素材文件、锁文件、中央工作记录及现有用户修改。
- 共享文件与顺序：无。

## 设计、决定与差异

加载阶段使用空的站厅内容，避免旧几何先出现在正式画面；只有明确加载失败才使用 `StationFallback`。这样不会伪装加载状态为正式站厅，也不改变失败后的恢复路径。

## 验证与交付

快速检查：`npm run typecheck`；完整检查：`npm test`、`npm run build`、`git diff --check`。浏览器首次渲染需由用户或集成验收确认。用户已明确授权本任务提交并创建 PR；不自动合并。

## 当前交接

代码实现、任务简报、验证报告及中央记录已补齐；已创建提交 `c3c3df0be23b001fe12a0d426e37f153e00a4792`、远端分支 `codex/asset-first-render` 和 [PR #37](https://github.com/AI-hunter-team/Agent-go/pull/37)。工作区已有的 `.claude/launch.json`、`.dockerignore`、`src/ui/App.tsx` 及其他未跟踪任务记录不属于本任务。

## 交接

当前交接：PR #37 待 CI/审核；未执行远端合并或部署。浏览器首次帧验收仍待用户/集成负责人确认。
