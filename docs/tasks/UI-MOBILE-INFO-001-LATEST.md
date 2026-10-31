# UI-MOBILE-INFO-001-LATEST：移动端本局信息位置统一

状态：实施中

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | UI-MOBILE-INFO-001-LATEST；基于 `origin/main` 新版 UI，将移动端“本局信息”放到“当前行动”上方，并保持同一信息区统一 |
| 交付物与完成条件 | 观战状态下“本局信息”入口位于“当前行动”入口上方；移动端两者属于同一信息区，宽度、间距和安全区适配一致；类型检查、构建和 diff 检查通过 |
| 单一负责人 | Codex `/root/latest_ui_patch`；接手后向 `/root` 交接 |
| 集成负责人 | `/root`，负责中央记录与后续集成 |
| 基线 | `origin/main` 本地引用，`8162f922401f534c1cbaf6221fde4fbd5002f666`，2026-10-31；未拉取远端 |
| 任务分支与工作区 | `codex/mobile-info-latest-ui`；独立 Codex worktree |
| 前置任务与资源 | 用户截图对应新版 UI；不需要外部凭据 |
| 规范与接口依据 | [文档导航](../README.md)、[开发流程](../DEVELOPMENT.md)、当前 `src/ui/App.tsx` 与 `src/ui/App.module.css` |

## 路径边界

- 允许修改：`src/ui/App.tsx`、`src/ui/App.module.css`、`docs/tasks/UI-MOBILE-INFO-001-LATEST.md`、`docs/validation/UI-MOBILE-INFO-001-LATEST.md`。
- 明确排除：模拟器、服务端、共享类型、依赖锁文件、中央工作记录、其他 UI 组件和已有任务文件。
- 共享文件与顺序：本任务独占 `src/ui/App.tsx` 与 `src/ui/App.module.css`；集成负责人后续串行合入。
- 范围外发现：若新版截图与 `origin/main` 的整体布局存在差异，只实现本任务要求的位置与信息区统一，不移植无关视觉或交互。

## 设计、决定与差异

- 在观战面板中把“本局信息”作为信息区的第一项，把“当前行动”行程记录紧随其后；两者共享 `runInfo` 容器。
- 移动端让信息区占满可用列宽，按钮按统一高度和间距排列，避免入口落在控制区或产生横向溢出。
- 继续复用现有 `Modal` 和 runner/session 数据；不改变模拟规则、共享接口或数据格式。

## 验证与交付

- 快速检查：`npm run typecheck`。
- 完整检查：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`；测试若受环境限制失败，记录实际原因。
- 实际验收：尝试移动端浏览器/本地页面检查 DOM 顺序和列宽；端口权限受限时记录未运行。
- 验证报告：[docs/validation/UI-MOBILE-INFO-001-LATEST.md](../validation/UI-MOBILE-INFO-001-LATEST.md)。
- 集成方式/目标：将本 worktree 的变更交给 `/root`，不自动提交、推送或合并。

## 交接（离开任务前填写）

- 当前分支、完整 commit、已提交/未提交文件与状态：实施完成后填写。
- 已做/未做、验证报告与证据：实施完成后填写。
- 关键决定、依赖方是否可继续、范围外事项及下一步：实施完成后填写。
