# CI-MAIN-STABILITY-001 验证报告

状态：两轮实现及本地软件检查完成；首轮PR的Windows展厅已通过、难度会话检查超时，第二轮PR及main检查待完成，不把旧PR成功当作主线成功。任务见[简报](../tasks/CI-MAIN-STABILITY-001.md)。

## 版本与故障

- 执行人：本聊天Codex；2026-11-01，Asia/Shanghai。独立工作区，初始干净基线 `a492fac0a3043ec3443a0a20147af4a4a6205c6d`。
- Windows、Node 24.21.0 / npm 12.1.0；`npm ci`成功，未更改依赖或锁文件，既有审计/弃用提示未自动修复。
- [main CI 41252390204](https://github.com/AI-hunter-team/Agent-go/actions/runs/41252390204)：Ubuntu成功，Windows 111文件/1005项通过，showroom目录整体几何用例超过原15秒，无几何断言差异。失败job为124688408019；日志通过GitHub接口核对。
- 本地基线 `npm test -- tests/showroom.test.ts --maxWorkers=2 --testTimeout=15000`：5项通过，文件3.532秒，其中目录聚合检查1.148秒；本地通过不掩盖托管Windows失败。

## 修改与边界

原单一测试在一个预算内构建整个EXHIBITS目录及SURFACES的lit/normal/roughness三通道。改为逐目录项、逐材质通道的数据驱动用例，名称直接标识资产和通道；目录ID唯一性独立检查。

保留全部原输入、非空/有限包围盒、落地高度、尺寸、缩放、材质几何和其余所有权/视角断言。源kit仍如原循环一样共享，模型句柄每项创建并在finally释放，kit及调色板在afterAll统一释放。没有修改生产代码、资产、阈值、测试并发、超时或工作流。测试数增加来自聚合检查展开，不代表新增资产或玩法。

## 检查与交接

- 修改后专项：`npm test -- tests/showroom.test.ts --maxWorkers=2 --testTimeout=15000`，157项全部通过，文件3.551秒；覆盖107个目录项、15种材质的45个通道，其他4个原测试和目录唯一性仍在。原聚合检查展开使总测试数增加152，检查输入和断言没有减少。
- `npm run typecheck`通过；`npm test -- --maxWorkers=2 --testTimeout=15000`：112文件 / 1158项全部通过，88.07秒；`npm run build`通过，既有大chunk提示保留。diff检查通过，暂存检查及本地文档链接目标检查提交前执行。
- 本地文档审计范围为本简报、验证及索引/中央记录：检查相对目标存在性，未把它当成仓库已有npm检查命令或外部链接验证。
- 纯测试组织变化，生产页面/游戏路径未改，浏览器、真实模型和新性能复验不适用；人工审查未进行。
- 实现、本地软件、远端PR检查、已合入及main复跑分别以实际结果追加，目标为确认最终main CI成功。无部署、付费模型、生产数据或用户世界变更。

## PR #72 第二轮修复（2026-11-01）

- 首轮提交 `8804f0b6ecf980fdf402ed6601c252cf68a7eaa4` 的 [CI 41260146057](https://github.com/AI-hunter-team/Agent-go/actions/runs/41260146057)：Ubuntu成功；Windows展厅157项全部通过，但 `difficultySession` 的预览/启动/重试设置保持用例17.499秒超时，其余1157项通过，Windows整套355.36秒。此失败保留，不把第一轮本地通过当作远端恢复。
- 该用例原为设置保持检查而等待整局自然结束。改为等待同一离线Agent的初次请求、推进真实tick再主动停止，读取结束报告，并新增phase已结束和elapsed大于0的断言；原种子、设置及预览/启动/报告/重试断言保留。该用例现在验证主动结束路径，不宣称仍覆盖自然结束；`difficulty.test.ts` 的真实截止结算及 `gameSession.test.ts` 六组完整双对局报告对照保持原样。
- 第二轮专项：`npm test -- tests/difficultySession.test.ts tests/difficulty.test.ts tests/showroom.test.ts --maxWorkers=2 --testTimeout=15000`，3文件/174项通过；难度会话3项31毫秒，自然截止等难度14项427毫秒，展厅157项3.696秒。
- 第二轮完整检查：`npm run typecheck`通过；`npm test -- --maxWorkers=2 --testTimeout=15000`：112文件/1158项通过，93.67秒；`npm run build`通过。所有测试超时、并发和CI工作流不变。diff、暂存及本地文档目标检查在提交前执行。
- 变更限定为测试与任务记录，未修改生产代码、游戏规则、依赖或资产。最终合入SHA、PR及main CI实际结果在 [PR #72](https://github.com/AI-hunter-team/Agent-go/pull/72) 中追加，仓库本报告为第二轮推送前快照。
