# CI-SESSION-001：双整局报告对照的执行预算

状态：本地检查通过，待PR验证及合入，2026-10-31（Asia/Shanghai）。

- 负责人及集成人：本聊天 Codex PR 巡检，串行实施；同仓库其他聊天空闲。
- 基线：已 fetch 的 main `331bdecca2265aa4c9931fd32db16149f932bf6e`（PR #30 合并提交）；独立分支及工作区代号 `codex/ci-game-session-budget` / `ci-game-session-budget`。旧 PR29 候选保留且不混入。
- 授权：用户已授权空闲巡检、修复 CI/BUG、普通提交推送及合并；通过修复 PR 交付，不直接绕过检查推送 main。
- 问题：[主线 CI](https://github.com/AI-hunter-team/Agent-go/actions/runs/41183784960) 的 Windows seed1报告对照运行15,818ms后报告超出15秒执行预算，未得出完整断言结果；其余517项和Ubuntu通过。该用例串行执行 runner 与展示驱动两个整局，属于功能一致性检查，没有15秒性能断言。
- 方案：仅六个种子的双整局用例设置30秒墙钟预算，保留完整报告相等、终局及插值断言，默认其他测试15秒和产品时限保持原样。无新增函数、用例、依赖或产品变化。
- 允许路径：`tests/gameSession.test.ts`；本简报、`docs/validation/CI-SESSION-001.md`、验证索引、`docs/DEVELOPMENT.md` 的预算说明、`docs/开发计划.md`、`PROGRESS.md`、`TODO.md`。
- 排除：业务源码、其他测试、工作流、依赖/锁文件、真实模型、其他工作区及部署。
- 完成条件：类型、现有全量测试、构建和diff检查通过；新PR当前头CI及review核实后合并，追踪合并后CI。无展示/业务变化，不重复浏览器或真实模型验收。
- 回退：revert本次提交；验证及交接见 [CI-SESSION-001](../validation/CI-SESSION-001.md)。
