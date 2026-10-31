# Guidance Follow-through Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline in this chat. User has authorized implementation of the discussed fix.

**Goal:** 被拒后有明确重试要求时，角色必须调整话术再试，或说明模拟器确认的阻碍。

**Architecture:** 模拟器产生公开结构化对话结果。Runner 内独立跟踪器读取原始指导、记录待重试进度、检查候选动作；模型继续生成话术和计划。

**Tech Stack:** 现有 TypeScript、Vitest、Responses；不新增依赖。

**Spec:** [任务简报及已授权聊天方案](../../tasks/GUIDANCE-RETRY-001.md)。

## Global Constraints

- 新共享字段可选，兼容旧报告；不泄露 NPC 隐藏信息。
- NPC 自主决定，世界事实只由模拟器结算；不强迫 NPC 同意。
- 不覆盖并发修改，不执行真实模型付费或远端操作。

## Review Focus

- 无明确重试要求时不强制重试；否定重试条件不能误触发。
- 接受但实际让位/转移失败不宣称目标成功。
- 纠正请求有界、计入已有调用预算，停止时迟到结果不执行。
- 三轮结束、对象离开或规则阻碍能退出，不卡死。
- act 与 talk 一致检查；准备动作不被误判为放弃。

### Task 1: 公开对话结果及原始条件保留

Files: `src/shared/types.ts`, `src/sim/dialogue.ts`, `src/shared/journey.ts`, `server/app.ts`, `server/responses.ts`, `server/prompts.ts`; tests `dialogue.test.ts`, `journey.test.ts`。

- [x] 写失败测试：拒绝保持队位且 dialogue.goalAchieved=false；同意后实际结算失败仍 false；prepare 返回/绑定原文规则。
- [x] 对话结算定向测试确认 RED；实现兼容字段和提示词，验证 GREEN。HTTP 首轮受沙箱监听权限阻断，随后在允许回环监听的环境验证通过。

### Task 2: 条件跟踪与候选动作核对

Files: 新增 `src/agent/dialogueFollowThrough.ts`, `src/agent/runner.ts`, `server/prompts.ts`; tests 新增 `guidanceRetry.test.ts` 及 Runner 集成。

Interfaces: tracker `record(result: ActionResult)`, `progress(engine: Engine)`, `check(action: AgentAction | ActionPlan, engine: Engine)`；AgentTurn 携带公开进度；纠正最多一次/决策并计入预算。

- [x] 先写失败测试：被拒后直接等待先纠正；改话术后成功可正常等待；重复原话、同人约束、无要求/否定、物理阻碍、act 绕过、停止和预算边界。
- [x] 运行确认 RED，实现最小跟踪和边界处理，定向测试 GREEN。
- [x] 独立审查发现的物理结算提前成功、复合计划后缀两项问题均补 RED→GREEN；新增 in_progress 状态与 executor 实际让位结算回调，并在首轮被拒时暂停原复合后缀。
- [x] 完整 `npm run typecheck`、`npm test -- --maxWorkers=2 --testTimeout=15000`、`npm run build`、`git diff --check`；已运行并记录真实结果：全量仍有 3 项已知基线失败，不宣称全绿。详见验证报告。
