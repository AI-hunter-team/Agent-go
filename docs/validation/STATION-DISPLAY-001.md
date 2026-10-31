# STATION-DISPLAY-001 验证报告

状态：本地未提交版本的验证快照（2026-10-31，Asia/Shanghai），未合入。末节为楼梯追加的最新验证；前文保留原显示修复轮次。

## 版本与环境

- [任务简报](../tasks/STATION-DISPLAY-001.md)，执行/集成人为本聊天 Codex，串行实施。
- 基线 main `186682486f46615f86e915088067c53ab02b95d9`；受测分支 `codex/station-display-fixes`，同一 HEAD 加本任务展示、资产、检查与文档的未提交修改。未 fetch 远端。
- Windows、Node v24.21.0、npm 12.1.0；独立工作区执行 `npm ci`，使用现有锁文件，未修改依赖。
- 浏览器为应用内 Chromium，实际硬件渲染器为 NVIDIA GeForce RTX 5090 Laptop GPU / ANGLE D3D11；仅证明本机，不代表跨设备性能。
- 本轮只使用离线规则 Agent。隔离验收 API 为现有无费用 fixture；没有真实供应商请求、凭据读取或付费模型调用。

## 执行与结果

| 检查 | 实际命令/操作 | 结果 |
|---|---|---|
| 依赖 | `npm ci` | 通过；现有依赖审计提示3项告警，本任务未升级依赖 |
| 快速回归 | `npm test -- tests/stationDisplay.test.ts tests/stationKit.test.ts tests/cameraCollision.test.ts` | 3文件/26项通过 |
| 类型 | `npm run typecheck`；最终 `npm run build` 再执行 `tsc --noEmit` | 最终通过；首次新增测试的未使用导入和材质联合类型错误已修正 |
| 完整测试 | 最终入口模型调整后 `npm test` | 47文件/423项通过，退出0 |
| 资产生成 | `npm exec tsx -- scripts/station-kit/build.ts` | 33 GLB/9贴图生成成功；3种安检、柱、结构框、封板及入口更新 |
| 资产校验 | `node scripts/station-kit/validate.mjs <独立临时安装的gltf-validator目录> <外部证据报告>` | validator 2.0.0-dev.3.10；33模型、错误0、警告0；哈希/大小/尺寸通过 |
| 正式构建 | `npm run build` | 前端/服务端通过；保留既有大chunk提示 |
| 样板间构建 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts` | 通过；在正式构建之后执行，避免dist清理互相覆盖 |
| diff | `git diff --check`；新增文本单独检查尾空白及文档链接 | 通过；新文件未暂存 |

## 浏览器证据

证据组为本聊天外部附件目录 `station-display`，截图与JSON不入库。原版与修复版使用不同端口和工作区，未更改原试玩目录。

- 正式开发页5196与最终生产页5296均载入修复资产；最终生产页记录顶板6m、仅使用 `floor-sage`，635个静态放置、40个静态批次，标准跟随模式2块反射面。
- 安检门开放、停用、故障及转动镜头检查：原顶部黑色闪烁/穿插未再观察到。源几何回归确认立柱顶面止于横梁下缘，整体高度2.5m、锚点保持原位；不是通过关闭深度测试掩盖问题。证据 `security-open.png`、`security-open-angle.png`、`security-closed.png`、`security-broken.png`。
- 正式场景主导视、设施编号及样板间长短导视文字保持比例；共享画布尺寸按最终显示面计算，长文案不用maxWidth横向压缩。窗口覆盖1440×900与390×844，证据 `before-game-wide.png`、`after-game-wide.png`、`game-narrow.png`、`showroom-narrow.png`。
- 样板间三种布局均实际加载33/33 GLB、尺寸复核通过、6m顶板、48块顶板及1块柔和反射面；控制台error为0。证据 `after-showroom-wide.png`。
- 暂停于81.7s连续切换总览/跟随3次：总览反射0且不含顶板；跟随反射2。每次返回跟随均为116个GPU几何体、35个纹理，世界时间保持81.7s。低画质关闭阴影且反射0，恢复标准画质后反射2；不同画质的缓存数量不直接比较。
- 开发和生产离线seed 28均完成购票、安检、过闸、下楼，在99.1s到达站台。最终入口模型/635放置的生产构建再次整局复验同为99.1s；玩家 `screened/passedGate/onPlatform` 均true。证据 `production-result.png`、`game-platform.png`。
- 正式开发、生产、样板间三处检查的控制台error均为0；反射没有独立RAF循环，暂停和按需绘制仍由现有调度控制。本次没有记录可跨机器比较的帧率、功耗或显存指标。

## 状态、限制与交接

| 状态维度 | 结论 |
|---|---|
| 实现完成 | 本地完成；入口上沿一并接至6m，横梁厚度不拉伸、门洞净高5.25m |
| 软件检查 | 上述类型、423测试、正式/预览构建、资产校验和diff通过 |
| 实际验收 | 本机浏览器范围通过；未进行真实模型或跨设备性能验收 |
| 已合入 | 未提交、未推送、未创建PR或合并；未部署 |

- 样板间390px窄屏下既有布局工具条仍拥挤，本次未扩展为工具条响应式重做；场景标牌比例已覆盖。低画质按约定没有地板反射。
- API/动作/报告与模拟规则不变；设备/人物/栏杆尺寸及交互位置不变，楼梯和上下层地面位置保持原值。
- Docker、远端CI、人工审查、真实模型：未运行，均不属于本次本地授权范围。依赖审计及原始大chunk告警另行处理。
- 接手从任务简报的独立分支继续；原main工作区保持干净。可按任务文件回退显示与资产，无数据迁移。集成到其他版本后需复验。

### 本地重启

在独立工作区使用不同终端运行，保留终端/进程：

```powershell
# 终端一：普通API，不使用验收伪模型
$env:PORT = '8796'
npm run start:api
```

```powershell
# 终端二：修复版页面，API代理到8796
$env:PORT = '8796'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5196 --strictPort
```

```powershell
# 终端三：生产构建的样板间
node scripts/station-kit/serve.mjs dist/station-kit-preview 5297
```

当前修复版5196已切回普通API8796，未配置模型时提供离线试玩；5296仅用于隔离的无费用生产验收。原5173/5190服务不变。

## 追加验证：楼梯踏步与收边

追加授权和分工见[任务简报](../tasks/STATION-DISPLAY-001.md#追加楼梯踏步与收边)。同一基线、分支和未提交工作区，运行环境沿用前述本机环境。仅修改楼梯构造/组件、正式/回退挂载及对应测试与文档；没有更新模拟器、人物高度插值或GLB。

| 检查 | 实际命令/操作 | 结果 |
|---|---|---|
| 类型 | `npm run typecheck` | 通过，退出0 |
| 针对性 | `npm test -- tests/staircaseVisual.test.ts tests/stationDisplay.test.ts tests/stairs.test.ts` | 3文件/22项通过 |
| 完整测试 | `npm test` | 48文件/427项通过，退出0 |
| 生产构建 | `npm run build` | 类型、前后端构建通过；既有大chunk提示仍在 |
| 样板间 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts` | 通过；在主构建后重建，使原预览服务继续可用 |
| 浏览器 | 生产构建、离线seed28、4倍速，在下楼中暂停/缩放/转动视角，再继续 | 95.1秒停在楼梯中，99.1秒到站台；三项完成标志true、控制台error为0 |
| diff/链接 | `git diff --check`、新文本尾空白/相对链接检查 | 通过 |

- 几何参数：9m长、4m宽、2m落差；由12级改20级，进深0.45m、高差0.10m，端点仍为(48,0,15)/(57,−2,15)。每级两道宽8mm、凹入3mm的深灰槽，共40道；槽止于两侧石材边框内。
- 每级前缘为圆角石材踏鼻；阶梯剖面挤出完整封闭梯身，包含两侧与底面。上下平台使用同款石材窄收口与深灰伸缩缝；小收口覆盖现有地面，不改变通行端点。
- 射线回归检查了所有20个踏面、40道槽的实际命中高度、边框、侧面、底面和平台接缝；释放回归确认共享磨石材质不被误释放。全部细节仅2个静态网格，不逐条增加绘制对象。
- 画面证据：外部 `station-display` 证据组的 `stairs-treads.png`、`stairs-side.png`、`stairs-platform.png`、`stairs-browser-validation.json`。本机浏览器看到槽线、踏鼻、侧面封闭和平台连接，现有栏杆仍作为占位显示。
- 保留原线性人物下降插值和6秒规则；未新增脚步IK或物理贴阶。A/B圆管/玻璃新栏杆未制作或接入，由另一聊天独立负责，后续场景接入串行继续。
- 最新结论：本地实现、软件及上述浏览器范围通过；未提交/推送/合入/部署，未调用付费模型。本阶段共享场景文件完成，可按任务简报交接接续。
