# GUARD-002 验证快照

2026-10-31，Asia/Shanghai；执行人本聊天 Codex。[任务与函数说明](../tasks/GUARD-002.md)。分支 `codex/custom-character`，基线 `633f941783478b242fbd7f9cd530cf1a887fd5b1` 加本聊天未提交外观功能。Windows、Node v24.21.0、npm 12.1.0，已有 npm 安装，依赖/锁文件未改。

## 产物

以下为最初版本快照；当前文件与握持方式见末尾“警棍握持修正”。

- `public/models/naiwa-security.glb`：3,198,120 字节；SHA256 `244924C86BD127DA224AC4E54CEE7433EA4F5E3661FFAE6E2A24602FE6CFF54E`。
- 原附件与 `naiwa.glb` 一致，原文件未覆盖。一次性脚本对比原/新 GLB 内嵌贴图的二进制 SHA256，相同。
- 模型包含头骨下的 `SecurityCap`（初版 88% 大小）与右手骨下的 `SecurityBaton`；Idle 4.2 秒，头部左右各约 0.5 弧度并在两侧减速；Walk 1 秒。模型默认姿态为放松站立，避免平举手臂和道具拉偏适配包围盒。

## 检查

| 操作 | 结果 |
|---|---|
| `npx tsx scripts/build-security-guard.ts` | 通过，输出完整 GLB；没有外部贴图依赖，9 个帽子及 10 个警棍部件 |
| `npm test -- tests/avatarModel.test.ts tests/proceduralLocomotion.test.ts` | 2 文件 5 项通过；新加 1 项独立 GLB 检查，验证闭合片段、头部/手部绑定、帽子比例和观察转头角度 |
| `npm run typecheck` | 通过 |
| `npm run build:web` | 通过，输出 `dist/`，含新模型；原有 Three 大分块提示保留，未改构建配置 |
| `git diff --check` 与新增文本空白检查 | 通过 |
| 独立 GLB 近景 | 帽冠/帽檐/徽章大小与位置正常，警棍位于右手；Idle 明显转头且帽子跟随，Walk 迈腿/摆臂且警棍跟随；未发现模型控制台错误 |
| 游戏接线 | 显示设置默认“奶娃保安”，站厅总览两名保安均使用新外观；不改变巡逻/视野结算 |
| 自定义导入 | 从保安设置导入新文件，显示 `naiwa-security.glb` 和朝向；刷新后恢复，恢复默认成功；主角设置保持原样 |

本地排除证据：`artifacts/avatar-review/security-guard.jpg`、`security-guard-game.jpg`。初期浏览器便捷入口返回 unavailable，随后通过同一应用内浏览器的文档 API 连接和核验；没有更换服务或绕过访问权限。

## 边界

- 本任务实现和所列软件/浏览器路径完成；未提交、推送、合并或部署，没有真实模型调用；人工审查未进行。
- 未重新跑完整业务测试/整局或性能矩阵，原模拟器/API 未改。不承诺任意非 Mixamo 骨架自动生成步态；自定义文件自身携带的动画优先。
- 独立文件包含实际动画，脱离游戏可播放。近景 QA 页面仅为本地检查，原始截图不入库。

## 警棍握持修正（2026-10-31）

- 用户指出手持方式不对，随后明确要求自然巡逻的低持姿态。修正前臂/手腕方向，四指闭合、拇指包握，握柄横穿掌心；棍身斜向下，Idle/Walk 均保持该握法，帽子和观察动作保持原样。
- 当前 `public/models/naiwa-security.glb` 为 3,210,908 字节；SHA256 `27F0456347362485ADDF76CC2D77A34770CFB90D0F13BDE0D2909BE4C6F04F5C`；与 `dist/models/naiwa-security.glb` 哈希相同。
- `npm test -- tests/avatarModel.test.ts tests/proceduralLocomotion.test.ts`：仍为 5 项通过，只在已有资产检查中加强掌心横轴、握柄位置、手指闭合与长端朝下的断言；`npm run typecheck`、`npm run build:web`、`git diff --check` 通过。
- 浏览器近景核对 Idle/Walk 中手型闭合，警棍跟随右手、朝下低持，无抬棍姿态。5195 开发预览已刷新；本地排除证据 `artifacts/avatar-review/security-guard-grip-idle.jpg` 与 `security-guard-grip-walk.jpg`。
- 修改范围为模型制作脚本、重新导出的 GLB、既有资产检查及文档；没有修改游戏规则或扩展动作。未重跑整局/完整业务测试，未提交或推送。

## 统一交付前检查（2026-10-31）

- 用户已追加授权全部本地工作提交、推送、处理冲突并合入。原阶段未提交结论保留为历史。
- 本源分支执行 `npm run typecheck`、`npm test -- --maxWorkers=2`、`npm run build`、`git diff --check` 均退出 0；41 文件 / 360 项全通过，未增加测试数量或放宽时限。
- 上述仍基于 `633f941` 的独立外观源版本；最终与新 main/Responses/UI/性能组合的证据由 ALL-LOCAL-001 记录，不以本次检查代替最终集成验收。未重跑浏览器或付费调用。
