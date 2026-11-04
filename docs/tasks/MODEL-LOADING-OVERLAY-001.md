# MODEL-LOADING-OVERLAY-001：模型首次加载进度遮罩

状态：已合入 `main`

## 目标与分工

| 项目 | 内容 |
|---|---|
| 任务编号、目标 | MODEL-LOADING-OVERLAY-001；首次模型加载期间显示现代风格的“正在加载模型”进度遮罩，加载失败并回退时移除遮罩 |
| 交付物与完成条件 | 在现有 UI 组件体系中接入模型加载进度与失败回退状态；首次加载显示明确进度，成功后消失，失败回退后不阻塞界面；通过类型检查、测试、构建与 diff 检查 |
| 单一负责人 | 本次 Codex 会话（实现与验证） |
| 集成负责人 | 本次 Codex 会话；已在中央记录登记本任务状态 |
| 基线 | `origin/main`，`45e7964a1c806faa43093cd6e536ce4b938df1bb`，2026-10-31；原工作区存在与本任务无关的未提交改动，保留不动 |
| 任务分支与工作区 | `codex/model-loading-overlay`；独立工作区（个人机器路径已移除）；仅修改本简报允许范围内的 UI、相关测试和验证文档 |
| 前置任务与资源 | 现有 React/R3F/Drei UI 与资源加载实现；无需外部凭据 |
| 规范与接口依据 | `docs/README.md`、`docs/DEVELOPMENT.md`、`src/ui` 与 `src/ui/scene/resources.ts` 的现行实现 |

## 路径边界

- 允许修改：模型加载相关 `src/ui/**`、必要的测试 `tests/**`、本简报、中央工作记录 `docs/开发计划.md` 及验证报告 `docs/validation/MODEL-LOADING-OVERLAY-001.md`。
- 明确排除：`src/sim/**`、`server/**`、锁文件、其他已有未提交文件。
- 共享文件与顺序：`src/ui/App.tsx`、`src/ui/App.module.css`、`src/ui/styles.css` 如需修改由本任务统一负责；无并行实现写入。
- 范围外发现：记录在交接，不擅自扩大。

## 设计、决定与差异

- 进度来源复用 Drei `useProgress` 的 Three.js `DefaultLoadingManager` 事件，并由模型挂载成功回调将状态推进到 100%。
- 遮罩只覆盖首次加载阶段；模型加载失败且已有回退路径时，不继续显示遮罩，保证离线/回退 UI 可用。

## 验证与交付

- 快速：`npm run typecheck` 与受影响测试。
- 完整：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`。
- 实际验收：本次不调用真实模型；软件检查覆盖当前基线，浏览器慢加载与失败回退路径未在本轮稳定复验。
- 验证报告：`docs/validation/MODEL-LOADING-OVERLAY-001.md`。
- 集成方式/目标：用户已明确授权提交、推送、创建 PR 并合入 `main`；不部署。
- 风险与回退：加载器事件与 React 状态竞态可能导致遮罩残留；通过成功/失败终态和测试覆盖回退路径。

## 交接（离开任务前填写）

- 当前分支、完整 commit、已提交/未提交文件与状态：`codex/model-loading-overlay`；功能提交 `48beb92`、主线同步 `d98bab7`、缓存模型修复 `898976d`；已合入 `main`，合并 commit `7068db42756124e3d52230b904e2061bf6af064b`；原工作区的 `src/sim/movement.ts`、`tests/movement.test.ts` 等无关修改未带入。
- 已做/未做、验证报告与证据：最终 `npm run typecheck`、定向 4 项测试、CI 等价全量 91 文件/730 项测试、`npm run build` 和 `git diff --check` 均通过；详见[验证报告](../validation/MODEL-LOADING-OVERLAY-001.md)及 PR #57。
- 关键决定、依赖方是否可继续、范围外事项及下一步：进度来自 Drei `useProgress`，成功、失败和缓存切换均有明确终态；PR #57 已合入，浏览器慢加载与不存在模型回退未在本轮稳定复验。
- 接手负责人/入口：已合入 `main`；后续如需真实浏览器验收，从 PR #57 和本验证报告继续。
