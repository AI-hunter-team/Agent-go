# PR-SERIAL-MERGE-002：串行整合线上全部 PR

状态：实现及本地验证完成，#68–#70 已合入，待 #71 最终远端检查与合入；最终状态见 [PR #71](https://github.com/AI-hunter-team/Agent-go/pull/71)。依据本轮用户明确要求处理冲突并逐个合并线上所有 PR，更新此前各 PR 的仅推送授权；不包含部署或付费模型调用。

## 目标与分工

- 单一负责人及集成负责人：本聊天 Codex，串行维护共享文件、冲突和中央记录；未使用并行开发 Agent。
- 核对日期：2026-11-01（Asia/Shanghai）。新建独立工作区 `../Agent-go-pr-serial-merge-002`，任务分支 `codex/pr-serial-merge-002`；保留原 NPC、首页、生成器及其他工作区未提交修改。
- 干净基线：远端已 fetch 的 `origin/main`，完整提交 `fa5551b8ac725377ace494866141e7109342cee2`（PR #67）。
- 当前开放 PR：#68（6409272ce8efe933eb1753e1b4128ad5298672fa）、#69（990ed25977a2f7616dfc03974ece96ea8cccca19）、#70（928b39f3b1e58a330c4c57b15b8b20ff5a8d92ca）、#71（8f89331b3254b6f26b5c7661e5929f9d2da054c7）。
- 顺序：#68 → #69 → #70 → #71；最后一个 PR 依赖 #68，改为 main 并吸收已合入修复，验证最终 V3 组合。

## 路径边界与集成方法

- 允许：四个 PR 已有改动路径中的必要冲突解决与回归修复、相应测试、当前任务简报与验证报告、`docs/validation/README.md`、`docs/开发计划.md`、`docs/ROADMAP.md`；不扩大玩法范围。
- 共享交叉：`src/sim/scenario.ts`、`src/ui/useJourney.ts`、服务端策略与世界消费者由本任务串行核对。新增缺陷先在本简报记录具体路径/理由。审查核实 #68 的弯曲队列预检和动态公开目标解析遗漏，允许修复 `src/sim/engine.ts`、`src/sim/actions/executor.ts` 并新增 `tests/generatedActionTargets.test.ts`，保持原动作与可见性语义；#71 的入口镜头净空及偏置站电闸接近点已复核源码，允许修复 `src/ui/scene/followCamera.ts`、`src/sim/stationSwitch.ts` 及新增 `tests/v3MergeRegressions.test.ts`；从现有建筑数据派生合法位置，保持序列化建筑、种子和历史摘要。生产入口首帧进一步发现休息室连接通道墙体遮挡，并核实展示路径与原侧洞错位；允许修改 `src/ui/scene/controlRoomModels.ts`、`loungeLayout.ts`、`generatedArchitecture.ts`、`cameraCollision.ts`，对齐侧洞、连接墙端点与相机碰撞，新增实际网格射线回归；不调整首页布局/门框或玩法。
- 排除：无关 worktree、生产环境、密钥、付费模型、部署、非必要依赖/锁文件和原始大型产物；保留远端分支。
- 使用普通合并提交保留依赖祖先；有冲突时在本任务分支整合主线与 PR，验证后普通 push 到该 PR 头分支，不 force push。每次远端合并绑定核实的完整 head SHA；不跳过失败检查。
- 平台保护查询返回 403，不能声称必需检查已强制；仍按仓库约定等待实际 CI 通过。工作流仅检查和容器冒烟，不手动触发部署。

## 验证、交接与回退

- 现有干净 PR 检查以对应 head 的实际远端 CI 为准；代码冲突修复后执行 `npm run typecheck`、`npm test -- --maxWorkers=2 --testTimeout=15000`、`npm run build`、`git diff --check` 及暂存检查。
- 最终组合复验 V3 默认新建、随机故障、种子生命周期、策略准备、完整离线登车及复盘；浏览器和真实模型分别记录，伪响应不替代真实模型。
- 交付 [验证报告](../validation/PR-SERIAL-MERGE-002.md)，附各 PR 合并提交、CI、冲突选择、未验证项及最终开放 PR 复核。
- 以正常 revert 回退相应合并，保留旧世界读取和用户数据；人工审查未进行，AI 核对不代表人工批准。
