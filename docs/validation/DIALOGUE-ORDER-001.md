# DIALOGUE-ORDER-001 验证报告

日期：2026-10-31（Asia/Shanghai）。执行/串行集成：本聊天 Codex，另有独立只读Agent审查。任务：[DIALOGUE-ORDER-001](../tasks/DIALOGUE-ORDER-001.md)。

## 版本与状态

- 继续本聊天独立工作区 `Agent-go-guidance-follow-through` / `codex/guidance-follow-through`；基线 `eaf19961e1230036b75b1a00343da49d19fcf6ba` 加此前指导执行与布局修复；本次代码、测试及记录未提交。
- 环境沿用 Node.js v22.23.1、npm10.9.8，相同锁文件与已安装依赖；无依赖、共享协议、模拟规则、模型或凭据修改。
- 实现完成；定向软件及所列浏览器验收通过；完整测试仍有已知3项失败；未推送、合入或公网部署，未调用真实模型。人工审查未进行。

## 软件检查

| 检查 | 真实结果 |
|---|---|
| RED→GREEN | 初始多气泡/现实时间、完整问答、历史及障碍避让先失败后通过；审查补倍速/后台首次渲染，以及背景抢占/旧API pending顺序回归 |
| 定向 | `npm test -- tests/headMessages.test.ts tests/dialogueDock.test.ts tests/headMessageLayout.test.ts --maxWorkers=2`：27项通过 |
| 全量 | `npm test -- --maxWorkers=2 --testTimeout=15000`：91文件，89通过、2失败；753项，750通过、3失败；38.79秒，退出1 |
| 类型与构建 | `npm run typecheck`、最终 `npm run build` 退出0；保留已有Three.js大包提示；一次findLast库目标不支持已改为ES2022兼容写法并复验 |
| Diff | `git diff --check`通过；新增文件另查末尾换行与行尾空白 |
| 独立审查 | 倍速提前过期、隐藏后迟到首帧缺少唤醒两项已修复，均有失败测试；无遗留次要项 |

全量失败与此前基线相同，未改相关代码/断言：

1. `tests/heuristicAgent.test.ts` / `original orderly fixture also passes on seed 4`：success/failed差异。
2. `tests/heuristicAgent.test.ts` / `new fixed crowd can time out orderly play while retaining a legal route on other seeds`：success/failed差异。
3. `tests/runner.test.ts` / `the integrated map has a legal route within the 150-second dense default`：122秒大于120秒断言。

## 实际浏览器验收

使用忽略文件 `logs/dialogue-order-fixture.ts` 在8893启动无费用伪模型，实际App、GameSession、Runner及3D场景走完整生成/开始路径。依次向p20交涉两轮均被拒，再向p26请求并获同意；第三轮等待9现实秒用于观察pending，后续模型决策固定延迟方便冻结验证。原8084用户页没有点击开始、刷新或修改配置。

- 完整当前卡：等待时显示新问题及“等待回复”；答复后替换为真实本轮文本及“同意请求”，没有把同意说成实际移动完成。
- 三轮切换：当前卡只显示p26当前一轮；记录入口计数3。打开记录后，p20组两轮、p26组一轮；原问题/回复均保留，未显示NPC内部reason。
- 冻结：暂停后剩余时间保持02:19；旧场景文字和背景图标仍到期消失，卡片闲置8秒收成一行；手动展开恢复完整问答。
- 气泡：第三轮pending超过4秒后头顶只有思考图标；暂停后的到期检查没有可见旧文字气泡。数量上限/同文新轮次/4×时间与后台迟到首帧另外由确定性测试覆盖。
- 637×854：展开卡片位于控制条上方；收起卡边界 y=688–754，控制条 y=772–830。展开/记录按钮可点击，正文没有挤出窗口。
- 390×844：展开卡 x=12、宽366、y=517.22–712；控制条 y=780–832。头部展开目标48px、记录目标44px；elementFromPoint均命中对应按钮。
- 1280×720：展开卡 x=360、宽560、y=433.51–620；控制条y=638–696，保持18px间距。
- 证据：`logs/dialogue-order-637.jpg`已打开核对，另存`logs/dialogue-order-history.jpg`。临时视口覆盖已清除，原用户标签仍保留结束页。

此次未在浏览器运行真实模型对照或手动切换2D；2D与3D共用同一消息选择器，场景规则未变。多NPC批量上限、过期、正文不裁剪由相关单测与上述当前卡实际页面分别证明，不把单次浏览器流程当成全部产品验收。

## 本地交付

- 正式本地修复页仍为 `http://127.0.0.1:8084`。HTTP核对首页、入口 `index-DGyuR5l4.js` 和 `index-Dm60xF2V.css` 与当前dist逐字节一致。仅前端更新，无需重启API。刷新后新开一局生效；刷新需要重新连接临时模型。当前用户复盘未刷新。
- 额外保留无费用演示 `http://127.0.0.1:8893`，浏览器标签已标记交付，暂停于上述三轮之后，可展开当前卡及记录。该页面使用伪响应，不代表模型策略表现。
- 演示命令：在本工作区运行 `node --import tsx logs/dialogue-order-fixture.ts`；本次工具会话86282维持进程。停止前确认该进程的cwd/8893监听归属，再发送TERM。日志与夹具均不入库、不含密钥。
- 完整测试日志：`logs/dialogue-order-tests-final.log`；本地代码接续入口为任务简报列出的分支和文件。无远端操作。
