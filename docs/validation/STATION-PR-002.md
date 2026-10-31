# STATION-PR-002 验证报告

状态：本地集成验证通过，待 PR/远端 CI，2026-10-31（Asia/Shanghai）；未合入。

- 任务与授权：[STATION-PR-002](../tasks/STATION-PR-002.md)。执行及集成人：本聊天 Codex。
- 分支：`codex/metro-railings`。接手 HEAD `186682486f46615f86e915088067c53ab02b95d9`，56个已有改动/新增文件；远端 main 已 fetch 核实为 `09d874bf010d72aa3fc531ad026fa6973c013df8`。
- 环境：Windows，Node v24.21.0，npm 12.1.0；现有锁定依赖安装可用，无依赖/锁文件变更。

## 合并前检查

同一聊天前一轮检查的完整本地源码快照（树 `1810d6d7b53acdd75d4ce7377a92a77927a491cc`，尚未包括本轮交付文档）通过以下检查：

| 检查 | 命令/结果 |
|---|---|
| 类型 | `npm run typecheck`，退出0 |
| 完整测试 | `npm test`，49文件/445项通过，退出0 |
| 主程序 | `npm run build`，前后端通过，退出0 |
| 站厅预览 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts`，退出0 |
| 栏杆预览 | `node node_modules/vite/bin/vite.js build --config design/metro-railings/vite.config.ts`，退出0 |
| 全部diff | 临时独立索引包含56个文件，`git diff --cached --check` 退出0；没有改变真实暂存区 |
| 合并预检 | `git merge-tree` 与 main 发现4处冲突：GameScene、技术方案、验证索引、中央记录；不代表合并后检查通过 |

本轮接手时重新核实相同分支、基线及文件范围。前一轮没有重跑浏览器，原任务的本机验收记录仅证明各自历史版本。

## 集成验证与交接

受测组合为本地源提交 `507d4d4` 加 main `09d874bf010d72aa3fc531ad026fa6973c013df8`，以下命令执行时合并尚未提交。业务冲突仅在 `GameScene.tsx` 一处：保留 `standard` 画质参数和 main 的 `onStationAssetError`；主角/保安独立 URL、旋转与错误回调原样保留。三份文档合并保留双方章节、任务和验证行。

| 检查 | 实际命令/操作 | 结果 |
|---|---|---|
| 类型 | `npm run typecheck` | 通过，退出0 |
| 全量 | `npm test` | 56文件/476项通过，退出0；没有新增业务测试或改断言/时限 |
| 主构建 | `npm run build` | 类型、前端、服务端通过，退出0 |
| 两个预览 | 分别执行前表的两条 Vite 构建命令 | 通过，退出0；主构建后重建预览 |
| 正式浏览器 | `scripts/metro-railings/game-check.mjs`，生产构建、隔离fixture8898、`debug=1` | 通过；7个新栏杆GLB HTTP200，635放置，6m顶板、2块反射、20级/40槽保持 |
| 离线整局 | 同一脚本，seed28、4倍速，下楼中暂停/缩放/继续 | 99.1秒到站台，screened/passedGate/onPlatform均true；控制台error0 |
| 主线角色 | 正式浏览器网络记录与实际截图 | dafeiyu.glb、naiwa-security.glb均HTTP200；截图确认主角、场景及楼梯共存，未修改Character/App/外观存储逻辑 |
| 正式视角切换 | 总览/跟随往返3轮 | 返回跟随后几何181/纹理40稳定，控制台error0；不作为跨机器性能承诺 |
| 失败恢复 | 同一脚本 `failure`，阻断glass-straight.glb后恢复并点击“重试三维素材” | 正确出现站厅提示/回退，重试恢复新栏杆，提示消失，控制台error0；验证独立站厅错误通道 |
| 站厅样板间 | `scripts/metro-railings/showroom-check.mjs`，生产预览5298 | 40/40模型及尺寸通过；三布局各3轮几何115稳定，控制台error0 |
| 独立栏杆 | `scripts/metro-railings/browser-check.mjs`，生产预览5299 | 7GLB、A/B/转角/斜段、0.32m/6m和480px布局通过；3轮几何42/纹理3稳定，error0 |
| 一次性审计 | Node读取相对main的58个文件，检查文本尾空白/冲突标记、Markdown相对文件链接，以及两份清单的模型哈希/大小 | 44文本、178相对文件链接、40模型哈希通过；不代替glTF规范校验或外链检查 |
| Git检查 | `git diff --check`、`git diff --cached --check`、未解决条目及冲突标记扫描 | 通过，无未解决冲突 |
| 主线复核 | 再次`git fetch --no-tags origin main` | 仍为`09d874b`；src/sim、src/agent、src/shared、server、App、Character、依赖/锁文件相对main无差异 |

浏览器：Chrome headless、硬件WebGL，ANGLE/NVIDIA RTX5090 Laptop；1500×1060，独立小样另覆盖480px。服务端使用仓库现有 `tests/browser-fixture.ts`，显式指定生产前端目录与独立端口，不加载dotenv/真实供应商。沿用 verification 技能按页面→HTTP资源→场景/对局事实→界面结果核对；没有读取实际凭据。

仓库外证据组为 `station-pr-002`，含 `game/`、`failure/`、`showroom/`、`railings/` 中的截图及JSON。实际查看了正式站厅和楼梯截图。原始截图/日志不入库；新组合GPU数量含主线角色，不能与旧任务直接比较。

## 结论与限制

- 实现/集成完成；本轮软件、上述浏览器路径及资产哈希通过。主线失败复盘等实现由476项全量测试覆盖，没有再次调用真实复盘模型。
- 构建保留既有大chunk提示；没有为本任务升级依赖。glTF规范检查、工程/安全标准、多设备/其他GPU、完整模型导入存储矩阵未在本轮重复，原版本证据保留其适用边界。
- 真实模型、部署、远端合并与人工审查均未执行。PR与远端CI在提交后核实，不将本地通过写成已合入。
- 原main和显示修复worktree未改动；本轮隔离验收服务在检查结束后停止。回退及后续接手见任务简报。
