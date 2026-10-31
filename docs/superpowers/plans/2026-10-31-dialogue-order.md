# Ordered Dialogue Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. 用户要求直接迭代并本地验收。

**Goal:** 完整当前对话集中展示，场景只突出当前说话人，历史可按NPC/轮次回看。

**Architecture:** 一个纯展示适配器统一当前/旧版记录与待回复请求；会话级现实寿命筛选服务两种渲染器。新增底部对话卡及分组历史，保留现有模型与世界状态。

**Tech Stack:** 现有 React、TypeScript、CSS Modules、Radix、R3F、Vitest。

**Spec:** [任务约定](../../tasks/DIALOGUE-ORDER-001.md)。

## Global Constraints

- 不改变游戏时间/判定或增加模型调用；不把NPC内部reason送入卡片。
- 保留此前指导重试和准备面板布局修复。
- 文字48字/4现实秒，背景最多2个图标/2.5秒；回复后8秒自动折叠当前卡。

## Review Focus

- 同一世界时刻的不同NPC/轮次不会堆叠或混淆；同文新一轮应重置展示。
- 冻结/按需渲染时仍能到点收起；手动展开不会被旧计时器折叠。
- 待回复不展示旧答复，历史保留原话且不泄露隐藏数据。
- 2D/3D均受相同数量限制；头顶气泡不覆盖对话卡。
- 手机/窄屏/宽屏下控制按钮和历史入口可达。

### Task 1: 展示适配与寿命

Files: `dialoguePresentation.ts`, `headMessages.ts`, `headMessages.test.ts`, `dialogueDock.test.ts`（同时覆盖纯展示适配）。

- [x] 写多NPC只一条文字、现实时间过期、新轮次/新局、等待替换答复等失败测试。
- [x] 运行确认RED；实现统一问答记录、分组和现实寿命；定向GREEN。

### Task 2: 固定卡与场景整合

Files: `DialogueDock.tsx`/module CSS、`App.tsx`、`Interactions.tsx`、`MessageBillboardLayout.tsx`、`headMessageLayout.ts`；组件/避让测试。

- [x] 写当前完整问答、等待状态、公开字段及避让行为测试，确认RED。
- [x] 接入当前卡、分组历史、折叠及按需刷新，限制头顶文字与背景图标，定向GREEN。
- [x] 独立审查后的倍速/迟到首帧回归修复；登记和刷新共享绝对现实期限；旧API pending与背景抢占均有回归。
- [x] 类型、全量测试、构建、diff；无费用浏览器覆盖多NPC、长内容、等待、折叠/展开/历史及三个视口；记录结果并更新8084。完整检查保留3项已知基线失败，未宣称全绿。
