# PR-REMAINING-001：剩余 PR 冲突解决与合并

状态：实施中（2026-10-30，Asia/Shanghai）。

## 目标与分工

| 项目 | 内容 |
|---|---|
| 目标与完成条件 | 串行解决当前剩余 PR #6、#8 与 main 的冲突；保留各 PR 功能及 main 既有能力，适用检查通过后合并，记录结果 |
| 单一负责人、集成负责人 | Codex 本次集成会话；串行执行，不启动其他开发 Agent |
| 基线 | main `392f050034dadeaa8d7991621d0c9b7ff410ca69`；PR #6 `7b9f7cec15ac9a2b646177553233a242233d8a41`；PR #8 `f471df74bb0518b26a82c26fc02b08d1fbe08432`；已 fetch 核实 |
| 分支与工作区 | 第一阶段 `codex/remaining-pr6-integration`，独立 worktree 代号 remaining-pr6；第二阶段另建 remaining-pr8 独立分支/worktree |
| 依赖与授权 | 用户明确要求处理项目剩余 PR 冲突并合并，包含必要提交、推送与远端合并；不包含发布、部署或付费模型实测 |
| 规范依据 | [文档导航](../README.md)、[开发流程](../DEVELOPMENT.md)、各 PR 原简报及设计；世界事实仍由模拟器结算 |

## 路径边界

- 第一阶段允许：`README.md`、`docs/DOCKER.md`、本简报、`docs/validation/PR-REMAINING-001.md`、验证索引、中央记录；原 PR 文档保留历史证据。
- 第二阶段允许：PR #8 已修改的 `server/`、`src/`、`tests/` 文件；与之直接相关的 3D 展示/运行快照/界面消费者及必要回归测试；README、PR #8 设计文档与上述集成交接文档。
- 共享文件由本会话串行协调：先 #6 教程，再 #8 代码/3D 消费者；不修改依赖锁文件、CI/容器配置、密钥、未关联功能或已有其他 worktree。
- 范围外问题记录到验证报告，不擅自扩展。

## 决定与接口

- 教程正式入口改为已具备 Compose 的 main，保留 3D、模型设置和调试说明。
- PR #8 的回放、调用记录、NPC 沟通、楼梯阶段与 main 的 3D 运行层协调；新增内部字段核对模拟器、运行器、服务端、UI 和报告消费者。此次合并授权以待合入 PR 的最终范围为依据，不伪造原产品批准。
- 不删除远端分支、不强制推送；冲突提交基于 PR head 合并最新 main。

## 验证与交付

- #6 纯文档检查：相对链接、部署命令/端口/分支、敏感内容、完整 diff、`git diff --check` 与暂存检查。
- #8 提交前：`npm run typecheck`、`npm test`、`npm run build`、diff 检查；按影响核对浏览器路径，真实模型与 Docker 实测不在本次范围。
- 远端 CI 通过后按顺序合并；合并后核对 main 状态与 CI，不绕过平台门禁。
- 证据：[验证报告](../validation/PR-REMAINING-001.md)。分别记录实现、软件检查、实际验收、已合入。
- 风险与回退：3D/回放及新规则消费者需要联动；必要时 revert 对应合并提交，不涉及数据迁移。

## 交接

- 当前进行 #6 文档集成；#8 待其合入后接续。
- PR 入口：[PR #6](https://github.com/AI-hunter-team/Agent-go/pull/6)、[PR #8](https://github.com/AI-hunter-team/Agent-go/pull/8)。最终提交及检查见验证报告与 PR 描述。
- 人工审查未进行；AI 核对不能代替人工批准。
