# METRO-RAILING-001 验证报告

状态：2026-10-31（Asia/Shanghai）本地实现与串行集成验证快照，未合入。执行人：本聊天Codex。范围/批准依据见[任务简报](../tasks/METRO-RAILING-001.md)，造型和接口见[素材说明](../../design/metro-railings/README.md)。

## 版本与环境

- HEAD：`186682486f46615f86e915088067c53ab02b95d9`，分支`codex/metro-railings`，全部修改未提交。未核实远端新状态，不声称main已更新。
- 在独立工作区保留STATION-DISPLAY-001完成的未提交快照，包括6m高度/磨石反射/安检/导视和20级楼梯。导入后比对所有依赖改动文件，文本规范化换行一致、模型二进制哈希一致；原工作区未被编辑。随后串行修改新栏杆消费者。
- Windows、Node v24.21.0、npm12.1.0，按原锁文件`npm ci`。安装提示已有3项依赖问题（1 moderate/2 critical）及three-mesh-bvh弃用，本任务不扩展升级依赖。
- 实际浏览器：本机Chrome headless、硬件WebGL，ANGLE/NVIDIA RTX5090 Laptop。标准画质/跟随/总览及独立小样480px窄屏；不代表多设备性能或生产部署验证。

## 实际执行

| 检查 | 实际命令或操作 | 结果 |
|---|---|---|
| 安装 | `npm ci` | 通过；未修改依赖/锁文件 |
| 资产生成 | `node node_modules/tsx/dist/cli.mjs scripts/metro-railings/build.ts` | 7GLB，共351120字节，独立尺寸/材质/来源/连接点/哈希清单 |
| 类型 | `npm run typecheck` | 通过；最终接入和踏面适配均覆盖 |
| 新增回归 | `npm test -- tests/metroRailings.test.ts tests/staircaseVisual.test.ts` | 22项通过，其中新栏杆18项；含变长包络、共享柱、杆径/间距、斜面/透明、短段夹具不重叠、排序中心、实际GLB导入和哈希、正式布局及按踏面落脚/释放 |
| 完整软件 | `npm test` | 最终49文件/445项通过；STATION-DISPLAY原427项与本任务18项 |
| 主构建 | `npm run build` | 类型、前端与服务端通过，既有大chunk提示保留 |
| 样板间构建 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts` | 通过；包含新旧两份清单与40GLB |
| 独立小样构建 | `node node_modules/vite/bin/vite.js build --config design/metro-railings/vite.config.ts` | 通过；约630KB脚本（含Three），大chunk提示记录，不扩大优化范围 |
| 新栏杆glTF | `node scripts/metro-railings/validate.mjs <独立validator> <证据目录>/gltf.json` | Khronos2.0.0-dev.3.10；7文件，0错误/0警告，大小/哈希通过 |
| 基础站厅glTF | `node scripts/station-kit/validate.mjs <独立validator> <证据目录>/station-gltf.json` | 同版本，33文件，0错误/0警告，大小/哈希/尺寸通过 |
| 独立小样浏览器 | `scripts/metro-railings/browser-check.mjs`，生产小样5288 | 实际7GLB成功载入；A/B、金属、玻璃、90°转角、9m/−2m斜段及0.32m/6m跨度通过；3轮切换几何42/纹理3稳定；480px无横向溢出；console error0 |
| 样板间浏览器 | `scripts/metro-railings/showroom-check.mjs`，生产样板间5291 | 40/40载入及尺寸通过；金属/玻璃/斜段/转角实际显示；三布局循环3轮几何115稳定；error0 |
| 正式生产浏览器 | `scripts/metro-railings/game-check.mjs`，隔离伪接口8897、`debug=1` | A安检/闸机、B洞口/楼梯均存在，旧railing-straight不用于场景；6m顶板、2反射面、20级/40道槽保持；3轮总览/跟随几何160/纹理35稳定 |
| 正式离线整局 | 上述脚本，seed28，4倍速，楼梯中暂停/缩放后继续 | 99.1秒到站台；screened/passedGate/onPlatform全true；新模型7个HTTP200；error0。没有付费模型调用 |
| 新资产失败/重试 | 同脚本`failure`，阻断glass-straight.glb后恢复 | 几何回退/单一提示/重试恢复新栏杆通过；预期错误单独记录，无恢复后error |
| 交付包 | `scripts/station-kit/package.ts <仓库外全新目录>`，检查包内新清单/7模型哈希及新源码 | 通过；不覆盖已有目录，两类栏杆的资产与源码均包含 |
| 格式与文档 | `git diff --check`，一次性Node审计改动/新增文本的尾空白与Markdown本地文件链接 | 56个改动/新增文件范围内通过；不等同于人工批准 |

所有浏览器命令均传入本机Chrome路径、独立仓库外证据目录和上述URL；脚本接口见各文件Usage。没有使用真实模型、生产数据或外部设备。

## 画面检查与修正

- 查看实际生产截图：A圆管双横杆/圆角回弯/紧凑法兰；B透明分块玻璃/圆形夹具/连续扶手；90°转角和斜段。素材未使用参考照片作为纹理。
- 初轮预览金属偏白，调整原创钢材参数和预览灯光；最终正式场景可见银色反光。玻璃用轻微绿边/透明面表达，没有实现物理折射。
- 最短玻璃段的相对夹具改为按可用长度内缩，避免相互重叠；面板几何居中以提供正确透明排序点。
- 实际接入检查发现入口双柱和按连续坡线放置的悬空底座；最终柱心对齐原(48/57,13/17)端点、共用入口柱，底座按同一20级踏面标高落脚，扶手与玻璃保持坡线，不改台阶或规则。
- React best-practices核对：保留依赖组件useMemo/useEffect及资源所有权；两份清单并发请求，GLB并发加载；新增透明面不进入不透明实例批次；反复切换资源稳定。未引入组件库或新依赖。

仓库外证据组`agent-go-metro-railings-evidence`：`final-production/`（8张小样截图及报告）、`final-showroom/`（场景/资产截图与报告）、`final-game/`（站厅、金属隔断、楼梯玻璃、细节与站台）、`failure/`、`gltf.json`、`station-gltf.json`。原始截图/日志不入库。早轮记录保留，但最终场景结论仅采用`final-game`的踏面适配版本。

## 结论与边界

| 状态维度 | 结论 |
|---|---|
| 实现完成 | 两类7GLB、独立小样、正式/样板间串行接入完成；保留已完成显示/楼梯依赖 |
| 软件检查通过 | 类型、445测试、3构建、40模型规范/哈希通过；无依赖变更 |
| 实际验收通过 | 上述本机浏览器范围、离线seed28整局、切换/透明/回退通过；最终艺术选择仍由用户审阅 |
| 已合入 | 未提交/推送/合入/部署；main保持原样 |

- 未运行：真实模型整局、多设备/手机/其他GPU验证、工程施工/安全标准验收、人工代码审查。玻璃透明排序和反射需要在其他硬件上继续观察。
- 回退：保留STATION-DISPLAY依赖，撤回本任务独占新目录及3处场景/预览消费者增量，恢复原栏杆位置/载入；无数据或协议迁移。不要清理或覆盖原显示任务的未提交工作区。
- 完整游戏5290为普通独立API、当前无模型凭据；独立小样5288、样板间5291。重启方式见[素材说明](../../design/metro-railings/README.md)。
