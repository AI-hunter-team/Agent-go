# 决策调用记录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 保留并展示每次模型调用返回的思考、中间文本、工具参数和最终执行结果。

**Architecture:** Decider 返回原始内容块；Runner 在发起请求时创建调用记录，完成后补齐响应和结果；UI 复用调用详情组件，JSON 报告包含全量记录。

**Tech Stack:** TypeScript、React、Vitest，不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-30-decision-trace-design.md`

## Global Constraints

- 只记录 API 实际返回的推理，不补写或声称拿到未返回的内部推理。
- 保留现有每次决策输出预算和最多一次重试；不自动执行付费模型验证。
- 不记录密钥、认证请求头；兼容旧记录，不影响回放。

## Review Focus

- 第一次失败后重试成功，两个输出和输入都不能丢失。
- 截断、异常和取消时的在途调用可查，迟到动作不能执行。
- 多个内容块保持顺序和原文；用量包含每次返回但不重复计数。

## Tasks

- [x] 先增加失败测试，覆盖原始内容块、失败重试及取消后的迟到返回。
- [x] 实现调用类型、API 输出保存、Runner 记录与用量累计。
- [x] 实现决策与报告调用详情，验证旧记录和完整 JSON 导出。
- [x] 完整测试、构建、浏览器验证及独立只读评审。

## 完成记录

- 先验证旧实现丢失原始输出和首次失败记录，再实现并通过回归测试；UI 失败重试与取消状态测试 RED→GREEN。
- 评审发现报告刷新会重置回放位置。浏览器以 0.5 秒游标触发刷新复现归零；移除按 report 对象变化重置控制器的 effect 后，刷新及调用完成游标仍停在 0.5 秒。
- 本地模拟 API 验证了原文、多内容块、工具参数、第一次失败与重试、取消后超时记录；模拟数据明确标记为测试内容，不调用付费模型。
- 用户追加四阶段展示：新增 JourneyProgress 和闸机区标注，4 项测试 RED→GREEN。浏览器实跑观察到 69.6 秒处于独立过闸机阶段、站台尚未完成；72.9 秒正常验票完成后，过闸机与站台标记完成。
- 独立只读评审通过；133 项测试通过，生产构建与 git diff --check 通过。已有 DeepSeek 配置及本地分支保留，不推送、不合并。
- 边界：只保存 API 已返回内容；HTTP 超时后服务端才生成但客户端未收到的内容无法补录。页面刷新前需导出 JSON，尚无历史局库。
