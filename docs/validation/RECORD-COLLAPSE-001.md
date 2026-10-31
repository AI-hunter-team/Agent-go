# RECORD-COLLAPSE-001 验证快照

日期：2026-10-31（Asia/Shanghai）。执行者：本聊天 Codex。任务：[开局默认收起行程记录](../tasks/RECORD-COLLAPSE-001.md)。

- 版本：`codex/watch-ui-improvements` / `304c45ee88c443d76b3cc9fa1b617acb52e2de23`，包含开始前已有的未提交改动；本次仅增补 `src/ui/App.tsx` 的三处行程记录状态及两份任务文档。
- 环境：macOS，Node.js `v22.23.1`、npm `10.9.8`，使用现有锁文件依赖；未另验 README 建议的 Node.js 24。
- 实现：记录主动展开的局次，只有与当前 `generation` 相同才展开；初次进入和下一局均默认收起，同一局 HUD 更新保持用户选择。现有按钮、`aria-expanded`、`aria-controls` 和内容 `hidden` 随状态同步。

## 软件检查

| 检查 | 结果 |
|---|---|
| 改动前已有相关测试 | `npm test -- tests/journeyFlow.test.ts tests/gameSession.test.ts tests/headMessages.test.ts --maxWorkers=2 --testTimeout=15000`：匹配到两个现有测试文件，18 项通过；仓库没有 `journeyFlow.test.ts`，未将该筛选项视为实际测试 |
| `npm run typecheck` | 通过 |
| `npm run build` | 类型、前端和服务端构建通过；保留既有 Three.js 大文件提示 |
| 完整测试初次运行 | 沙箱不允许回环端口监听，`tests/modelConfig.test.ts` 的下列三个 HTTP 用例各超时 15 秒，随后中断该轮；最小 `node:http` 监听复现 `EPERM listen 127.0.0.1` |
| 完整测试复验 | 在允许本机回环端口的环境运行相同命令 `npm test -- --maxWorkers=2 --testTimeout=15000`：88 个文件、710 项全部通过，退出 0，用时 38.76 秒 |
| `git diff --check` | 通过；新文档另行检查链接与尾空白 |

初轮受环境影响的用例名称：

- `explains an advertised but unavailable model, logs its probe safely and allows selecting another model`
- `activates only the requesting browser and pins each game's model`
- `session without a model cannot invoke NPC dialogue`

测试内容和断言未改动。复验全部通过；Debug 日志写入失败是既有故障处理用例的预期 stderr。

## 浏览器检查

使用应用内浏览器访问本地 `http://127.0.0.1:8081/`，明确选择离线体验，无真实模型调用。

1. 修改前，开局显示“收起行程记录”，内容默认展开，复现原行为。
2. 刷新加载新生产构建，开局显示“展开行程记录”，可访问性状态为 collapsed，内容隐藏。
3. 点击展开，显示当前行动、最近决策和两个记录入口，状态为 expanded。
4. 等待正常 HUD 与行动更新后，再次收起、展开均正常，用户选择不被刷新覆盖。
5. 保持上一局展开，点击“结束 → 再来一局 → 开始行动”，新一局恢复默认收起。
6. 新一局暂停后仍保持收起，截图确认左上角只有展开按钮；本地服务直接提供新构建，无需重启模型服务。新前端主包为 `index-CAYZ3SjI.js`。

本次实现、软件检查及所列浏览器操作均已完成。本地交付未提交，保留已有无关改动；未推送、合并或公网部署。未验证真实模型整局、手机真机与额外屏幕尺寸。

## 接续：最新主线上的独立 PR 交付

- 用户追加授权 commit 和创建 GitHub PR。重新 fetch 核实 `origin/main` 为 `f9c7f96497bc37a1cf56931218000c815cc35680`，新建独立 `codex/collapse-journey-record` / `Agent-go-record-collapse-pr` 工作区。
- 仅移植本任务三处状态修改和两份记录；主线已有的动画、停电开关及其他实现均保留。原预览和其他任务的未提交改动保留，未混入本次 PR。
- 依赖清单、锁文件与原预览已安装基线逐字一致，复用该依赖安装；不提交依赖链接、构建产物、截图或本机配置。
- `npm run typecheck`：通过。
- `npm run build`：前端与服务端构建通过，既有 Three.js 大文件提示保留。
- `npm test -- --maxWorkers=2 --testTimeout=15000`：允许本机回环监听的环境，88 个文件、692 项全部通过，退出 0，用时 52.20 秒。与前述 710 项的差异来自原预览中的其他任务增量，未删改测试或断言。
- `git diff --check` 及两份任务记录的相对链接、末尾换行、尾空白检查通过。提交时进一步核对暂存文件仅为三处代码和本任务记录。
- 当前交付分支未重新执行浏览器操作；前述首次开局/展开/收起/下一局的浏览器证据限定于原预览版本。本次代码仅调整相同状态逻辑，软件检查不能替代新主线浏览器完整验收。
- 人工审查、真实模型、手机真机与公网部署未进行；远端 CI、PR 编号及最终提交以 GitHub PR 为准，本次交付不执行合入。
