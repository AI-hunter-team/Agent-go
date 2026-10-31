# CAMERA-STABILITY-001：跟随镜头与 NPC 稳定性修复

状态：实现及本地验证完成，用户已授权提交 PR、处理冲突并最终合并，正在交付。

- 负责人及集成人：本聊天 Codex，串行修复；用户要求加急修复，补充现象为整个镜头在碰到 NPC 和交互时疯狂左右摇晃。
- 基线：2026-10-31（Asia/Shanghai），`codex/sync-cloud-20261031` / `26ddb2bd983be5be2a64bb0c58912a8e3614a0df`；原有未跟踪工作记录及 `.worktrees/iv2-phase2` 保留。
- 工作区与任务分支：独立工作区代号 `camera-stability`，分支 `codex/camera-stability`；与其他开发工作区隔离。修复通过后将本任务补丁同步到根工作区的 5173 预览供用户查看，不复制无关修改。
- 允许范围：`src/ui/scene/GameScene.tsx`、`src/ui/scene/cameraCollision.ts`、必要的独立镜头数学模块、`src/ui/presentation.ts`，相应 `tests/cameraCollision.test.ts` / 镜头回归测试 / `tests/presentation.test.ts`；本简报、对应验证、`docs/开发计划.md`、`docs/validation/README.md`（集成人串行更新）。
- 排除：模型/API、凭据、依赖与锁文件、玩法/模拟器结算、其他任务代码；不推送、合并远端或部署，不发起付费模型调用。
- 追加范围（用户本聊天要求 NPC 也稳定）：允许 `src/sim/movement.ts`、`src/sim/world.ts`、`src/ui/scene/Character.tsx`、`src/ui/scene/SimpleCrowd.tsx`、`src/ui/presentation.ts`、必要的角色朝向数学模块和相应移动/展示回归；先量化 NPC 翻转及折返再修复，保留人体间距、设施阻挡和模拟器结算权威，不靠取消碰撞掩盖问题。
- 依据：[开发流程](../DEVELOPMENT.md)、[技术方案](../MVP技术方案.md)及现有镜头/展示快照；既有角色避让修复见 [CHARACTER-JITTER-001](CHARACTER-JITTER-001.md)，不以放宽碰撞或修改规则掩盖镜头缺陷。
- 完成条件：定位可复现根因，镜头对碰撞造成的角色朝向/微小移动保持稳定，镜头碰撞仍有效，用户手动环绕/回正/总览仍可用；有定向回归和浏览器证据。
- 验证：相关定向检查、`npm run typecheck`、`npm test -- --maxWorkers=2 --testTimeout=15000`、`npm run build`、`git diff --check`；浏览器离线复验，不触发真实模型。
- 交接：结果与未验证项写入 [验证记录](../validation/CAMERA-STABILITY-001.md)；未授权不提交/推送。回退仅撤销本任务允许路径内补丁，保留用户其他改动及对局记录。

## 最终交接（2026-10-31）

- 镜头仅初始化/回正时采纳角色朝向，正常跟随缓动位置，遇障碍立即收近、清障后缓慢回拉；手动环绕和总览保留。
- NPC 在被占用的最终排队落点旁等候，中间路点仍可绕行；可视朝向限速为每秒 4 弧度，静止保留朝向。模拟位置、人体间距和保安判定不作展示滤波。
- 最终代码范围共 7 文件：`src/ui/scene/followCamera.ts`、`src/ui/scene/GameScene.tsx`、`src/sim/world.ts`、`src/ui/presentation.ts`、`tests/followCamera.test.ts`、`tests/movement.test.ts`、`tests/presentation.test.ts`。`movement.ts` 试验已撤回，其他允许但无必要的路径未改。
- 类型检查、57 文件/483 项测试、生产构建通过；生产浏览器离线 seed 27 在 115.5 秒成功，控制台无 error。具体边界与诊断见验证报告。
- 7 个代码/测试文件已逐字节同步至根工作区的 5173 预览；文档一并交付。用户刷新页面并新开局即可使用。其他未提交记录和独立工作区保留。

## PR 交付追加授权（2026-10-31）

- 用户在本聊天明确要求“提交 PR 并处理冲突 最后合并”，取代本简报原本地阶段的未授权提交/推送/合并限制；部署与付费模型调用仍不在范围内。
- 负责人及集成人仍为本聊天 Codex，沿用独立 `camera-stability` 工作区与 `codex/camera-stability` 分支；仅提交原 7 个代码/测试文件与本任务 4 个文档文件，不包含根目录其他未跟踪记录。
- 已重新 fetch 并核实远端 main 为 `26ddb2bd983be5be2a64bb0c58912a8e3614a0df`，与修复基线相同；目前无需内容冲突解决。推送前及合并前继续核实，若 main 推进则在任务分支集成并重跑适用检查。
- 其他开放 PR #28/#29 属于地图任务，不纳入本修复交付；不代为合并或关闭。
- 完成条件：代码提交、普通推送、创建面向 main 的 PR，远端 CI 通过后合并并核实合并 commit。PR 留下验证、限制、回退及人工审查未进行的事实；最终结果追加于验证报告。
