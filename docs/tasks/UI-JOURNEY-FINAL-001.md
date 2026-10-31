# UI-JOURNEY-FINAL-001：旅程界面最终主线集成

状态：最终主线集成及本地验证完成，待 #35 远端检查；2026-10-31（Asia/Shanghai）。

## 责任、授权与基线

- 用户授权确认通过后逐一合并；本聊天 Codex 为单一集成人，串行处理。任务接续 [UI-JOURNEY-IV2-001](UI-JOURNEY-IV2-001.md) 和 `PR-SERIAL-MERGE-001`。
- PR #35 的初始头 `20e9813867827b714960d47a497ce4d6c97df758`，工作区 `../Agent-go-journey-integration`。#32 已以 merge commit `81e9aafe0b6055b6be321b00d5ebd9184db3f496` 合入；#33 以 `db499ec4fd0f1dfb17a4b20441cbabf9b077c6c7` squash 合入。
- #33 合入后将 #35 目标改为 main，吸收最新主线、处理页面及场景冲突；保留 150 秒默认/120 秒选项、背包方案绑定、交互报告、细化乘客、点击问候、胜利舞蹈和电影镜头。胜利展示需实际可见，复盘仍可访问。
- 集成期间其他工作已将 #36 合入 main `09a315a9da878eef9a575b606b38f8642c6c3336`；本任务无冲突吸收该主线并重新验证组合，保留上游安检栏杆规则及测试。
- 远端 PR 头若变化先核对整合，普通快进推送，不强推；不改其他工作区或清理原始分支。

## 路径与验收

- 允许与冲突及最终衔接直接相关的 `src/ui/App.tsx`、`App.module.css`、`scene/GameScene.tsx`、`useJourney.ts`、必要测试，以及本简报、验证报告、中央记录和索引；合并 main 接受其既有实现。模拟规则、依赖锁文件及模型凭据不变。
- #35 审查新增两项直接相关的修复：允许修改 `src/ui/AvatarThumbnail.tsx`、`src/shared/journey.ts`、`src/shared/guidance.ts`、`server/app.ts`、`server/responses.ts`、`server/security.ts` 和对应测试，以统一生成方案及会话校验、保护二维降级时的角色选择。模拟规则、依赖锁文件及模型凭据仍不变。
- 分别核对大厅、选角、规划、开局门控、背包/时限、观战、成功/失败复盘、舞蹈/电影镜头/手动接管及重试；必要时复核无障碍和窄屏。真实设备及真实供应商验收另列，不假称通过。
- 执行类型检查、相关和完整测试、生产构建、差异检查；以最新目标分支的 Ubuntu、Windows、Compose CI 为合入前条件。生产浏览器仅用离线或隔离伪模型，不调用付费模型、不部署。
- 记录实际冲突、检查、结果与未覆盖项至 `docs/validation/UI-JOURNEY-FINAL-001.md`，更新中央交接；#35 的合入与最终 main 状态以实际 PR 为准。
