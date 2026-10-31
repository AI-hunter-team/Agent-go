# PR-SERIAL-MERGE-001 串行集成验证

状态：逐轮记录，未完成的步骤不视为已验收。范围与授权见[任务简报](../tasks/PR-SERIAL-MERGE-001.md)。执行：本聊天 Codex，2026-10-31（Asia/Shanghai），Windows PowerShell、Node v24.21.0、npm 12.1.0。

## #34：普通乘客外观

- 原 PR 头 `e6d68344ff8f6e3687e22e63edb81855942b6bca`，合入前核对 main `20f0fe6dff0f03b25a001d41525d4e5dcbaa1003`、无未解决审查线程，Ubuntu、Windows 和 Compose 检查均通过；详细本地及浏览器证据见 [NPC-DETAIL-PR-001](NPC-DETAIL-PR-001.md)。
- 用户授权后 squash 合入，主线提交 `4c230aef41cb4f4536268412e01f817d53545dd0`。原 NPC 脏工作区未改动。
- 旧 seed 22 在扶梯候梯超时的现象在无该外观的基线上也能复现，根因未定位；不把软件通过扩展为所有种子通过。

## #32：交互 2.0 加入 #34

- 集成基线：PR #32 `b663394d3b9787ff9f87710bfbd2c05709cb4758` 与 main `4c230aef41cb4f4536268412e01f817d53545dd0`。合并时验证索引及中央工作记录各一处冲突，保留两侧记录；源码接受已合入的乘客外观。
- `npm run typecheck`：通过。`npm test`：82 文件 / 654 项通过。`npm.cmd test -- --maxWorkers=2 --testTimeout=15000`：82 文件 / 654 项通过，包括六种子完整报告对照。`npm run build`：前后端通过，保留已有的大分块提示。差异空白及冲突标记在提交前核对。
- 生产构建和隔离伪模型 fixture 的应用内浏览器：首屏看到细化乘客，切节能预设后用离线模式、seed 1、无背包、150 秒/+3 人进行整局；131.0 秒沿楼梯到站、无违规，交互面板及复盘正常，浏览器 warning/error 为空。不调用真实模型。
- 原排队对话与背包槽位审查问题的复现和修复见 [IV2-REVIEW-001](IV2-REVIEW-001.md)；本轮全量测试包含相关用例，两个旧审查线程经核对后标记解决。集成头 `c5846369273dc18a0c821c7405a87e627b9d4710` 的 Ubuntu、Windows、Compose 检查通过；#32 以 merge commit `81e9aafe0b6055b6be321b00d5ebd9184db3f496` 合入 main，保留 #35 的祖先关系。

## #33 与 #35

- #33 已整合 #34/#32；拖动离开角色后返回误触发招呼的问题已在浏览器复现并修复。合成版本 662 项测试、构建及离线到站/舞蹈/镜头复验通过，详见 [VICTORY-REVIEW-001](VICTORY-REVIEW-001.md)。集成头 `39daf71ca6765743dcae2e4c3684bc856909b114` 的 Ubuntu、Windows、Compose 检查通过，审查线程经验证解决；以 squash 提交 `db499ec4fd0f1dfb17a4b20441cbabf9b077c6c7` 合入 main。
- #35 已吸收 #33 合入后的 main，并接续其他工作合入的 #36 `09a315a`；保留旅程开局、交互与胜利展示，解决页面/镜头/共享文档冲突。本地 674 项测试及浏览器复验详见 [UI-JOURNEY-FINAL-001](UI-JOURNEY-FINAL-001.md)；远端 CI 和合入以 PR 为准。

## 限制

- 未执行真实供应商或付费模型、跨设备、长期性能及人工视觉验收；上述浏览器只代表所列本机与种子。
- 没有部署或清理用户已有的工作区、分支和未提交文件。最终合入和后续轮次以实际提交及 PR 状态为准。
