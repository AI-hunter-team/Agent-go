# 角色轨迹回放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对局结束后可按世界时间回放角色路线并查看对应决策。

**Architecture:** Engine 为轨迹采样添加时间并保留终点；纯函数从 GameReport 生成回放帧；React 控制器驱动现有地图的只读回放视图。

**Tech Stack:** TypeScript、React、Canvas 2D、Vitest；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-30-trajectory-replay-design.md`

## Global Constraints

- 保留已有 DeepSeek 修复及 `.env`，不执行付费模型验证。
- 回放不修改规则、计分与模拟结果，不实现 NPC 全场景回放；用户后续追加的保安巡逻与扫视单独调整保安行为。
- 保留导出报告结构，轨迹仅增加可选时间字段以兼容旧记录。

## Review Focus

- 非 0.5 秒采样点结束：终点和结束时间必须完整记录。
- 空轨迹或零时长：不崩溃，播放和进度条可正确禁用。
- 相同时间多次决策：显示该时刻最后一条记录，不泄漏未来决策。
- 暂停、拖动、倍速及重播：时间推进正确，结束后停止。
- 回放与新对局切换：清理动画与覆盖数据，不改变 Engine 或留下旧角色位置。

## Tasks

- [x] **1. 时间与采样。** 先增加失败测试，验证 Engine 起点、采样与精确终点，以及 `getReplayFrame(report, time)` 的插值、边界、旧记录及决策选择；实现 `src/replay/trajectory.ts` 与时间字段。
- [x] **2. 控制与地图。** 新增 `src/ui/TrajectoryReplay.tsx`，驱动播放/暂停、拖动、倍速、从头与决策跳转；在 `App.tsx` 结束阶段挂载，在 `render.ts` 只读显示角色和静态布局；扩展现有 CSS。
- [x] **3. 验证与评审。** 运行 `npm test`、`npm run build`、`git diff --check`；浏览器使用离线规则 Agent 完成对局并验证回放控制，保存截图；独立评审后处理重要问题。

## 执行记录

- 接口检查：轨迹原为无时间戳的 `Vec[]`，Engine 以 0.5 秒间隔采样，结束时缺少额外采样；地图通过可变 optionsRef 每帧读取覆盖参数，适合只读回放。
- 先前基线：111 项测试通过，构建通过；现有未提交修改为 DeepSeek 兼容修复。
- 用户追加：修复明确策略被默认守序指导覆盖的问题；同步整理指导与开局文案，仍由环境判定动作条件与成功。
- 用户追加：两名保安增加横纵巡逻路线，360° 连续扫视（10/12 秒一圈），投诉临时转向保持优先级。补充横向移动、四方向检测与确定性测试。
- 回放验证：已在浏览器完成离线对局，72.9 秒通过；4 倍速播放在终点自动停止，终点重播及拖动至 36.5 秒后暂停均正常。

- 最终验证：123/123 测试通过，生产构建通过，git diff --check 无错误。浏览器验证了新局清理回放状态、横纵巡逻、旋转视野与暂停行为。
- 独立评审：回放无阻断问题；归一化提示的残留守序表述已修正。新增保安路线运行 300 秒未穿越墙、闸机线或柱子，投诉恢复与四方向检测通过。
- 交付范围：保留本地 codex/trajectory-replay 分支和未提交修改，不推送或合并；未对真实模型策略执行效果作保证，未新增付费调用。
