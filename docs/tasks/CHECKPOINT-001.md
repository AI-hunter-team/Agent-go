# CHECKPOINT-001：设施移动目标对齐队尾

状态：待集成。2026-10-31 由本次 Codex 会话执行。

## 目标

修正移动到设施后才发现需要回到队尾排队的非必要检查点。设施编号作为 `move_to.target` 时直接前往该设施当前队尾；不改变 `join_queue`、队列结算和设施状态规则。

## 范围

允许修改：`src/sim/engine.ts`、`server/prompts.ts`、`server/tools.ts`、`tests/engine.test.ts`、`tests/runner.test.ts`。浏览器和真实模型验收不在本任务范围。

## 验证

定向测试、类型检查、生产构建和 `git diff --check` 已在本地通过；全量测试受工作区已有服务测试端口权限/超时影响，详见验证报告。

## 交接

分支：`codex/checkpoint-queue-tail`。目标：PR 合入 `main` 后在合并版本复验。
