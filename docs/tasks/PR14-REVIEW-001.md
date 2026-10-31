# PR14-REVIEW-001：布局导向带与开口同步

状态：本地实现及适用验证完成；交付状态见原 PR。遵循 [开发流程](../DEVELOPMENT.md)。

## 目标与责任

- 单一负责人及集成人：本聊天 Codex 执行会话，串行修改和验证。
- 授权：用户要求修复最新 PR 中 Codex review 提出的问题；修复后提交、普通 git push 更新原 PR，不合并或部署。
- 基线：已 fetch 核实的 `codex/station-asset-kit` / `0715d0f15aadd3de988a7dade702bf8b96afa8c1`，2026-10-31（Asia/Shanghai）。
- 工作区：复用开工干净的相邻 `AgentGo-latest`；原 `AgentGo` 的本地记录全部保留。
- 问题依据：[PR #14 的 P2 意见](https://github.com/AI-hunter-team/Agent-go/pull/14#discussion_r4427270933)。直线布局左支和绕柱布局右支沿用固定坐标，穿过安检实墙。
- 完成条件：三种布局的连续导向、弯道与箭头匹配实际开口；必要软件检查及浏览器核对通过，更新原 PR。

## 路径边界与决定

- 允许：`src/assets/station-kit/preview.ts`、`scripts/station-kit/browser-check.mjs`、本简报、`docs/validation/PR14-REVIEW-001.md`、`PROGRESS.md`、`TODO.md`；中央记录只增加本任务行。
- 排除：模型/贴图二进制、正式游戏场景、模拟器、Agent/API、根配置/依赖/锁文件及其他任务记录。
- 开口与导向共用布局坐标；直线布局保持直行，分流布局保留分支，绕柱布局按实际开口延长分支并避开柱体。不改变外部接口、资产格式或游戏规则，无迁移。
- 本次不增业务测试套件；若有必要，仅在已有素材浏览器检查中加入针对本问题的断言。

## 验证与交接

- 提交前：`npm run typecheck`、`npm test`、`npm run build`、独立预览 Vite 构建、`git diff --check` 与暂存 diff 检查。
- 浏览器：三种布局的开口、连续性、转角和箭头核对；截图只存忽略的本地产物。
- [验证报告](../validation/PR14-REVIEW-001.md)记录实际结果与限制。没有真实模型、部署或远端合并操作。
- 回退：revert 本次修复提交即可；不影响原主工作区及导出资产。
- 当前状态：实现、适用软件检查和三布局浏览器核对完成，未合入；最终提交与推送状态见 [PR #14](https://github.com/AI-hunter-team/Agent-go/pull/14)。没有更改导出 GLB 或正式游戏，浏览器原始证据仅保留在本地忽略目录。

## 追加合并授权与集成（2026-10-31）

- 用户随后要求“合并pr”，明确授权将本 PR 合入 main；此前不合并的边界保留为上一阶段记录，不包含部署授权。
- 开工修复头为 `4c034e5f9580ca6f2eea1ba28012e8b51081af9c`，其 CI 与 Compose 检查均通过，唯一审查意见已解决。
- 新 fetch 核实 main 前进至 `d25ac92`（PR #15 的 DeepSeek thinking 修复）；允许将其整合进本分支，保留上游实现，仅解决中央记录的冲突。
- 本会话仍为单一集成人；路径边界增加上述 main 的正常合并引入，禁止改写 DeepSeek 业务逻辑。原主工作区已切换其他任务分支，不在那里操作。
- 集成版本执行仓库要求的类型、现有测试、构建及 diff 检查，然后普通 git push 更新原 PR；远端检查通过后使用期望 head SHA 合并，最终状态以 PR 为准。
