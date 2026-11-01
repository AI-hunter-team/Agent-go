# CI-MAIN-STABILITY-001 验证报告

状态：实现及本地软件检查完成，远端待验证；最终PR及main检查待完成，不把旧PR成功当作主线成功。任务见[简报](../tasks/CI-MAIN-STABILITY-001.md)。

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
