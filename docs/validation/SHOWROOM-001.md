# SHOWROOM-001：资产展厅与组合样板间验证

身份：2026-10-31 本地验证快照；不代表合入、人工批准或真实模型验收。范围与授权见[任务简报](../tasks/SHOWROOM-001.md)。

## 基线与环境

- `codex/world-generator-v1`，HEAD `1032a9155aec1801249054da63a98ffbbd96b093` 加未提交 WORLDGEN-001/002/003。本任务串行接续，保留其他工作区及预览。
- Windows PowerShell、Node24.21.0/npm12.1.0；沿用锁定依赖，没有安装或升级依赖。
- Playwright驱动Edge156/RTX5090 Laptop GPU；桌面1600×1000及1440×1000、窄屏760×1000及390×844/DPR1。开发页面5196，临时生产预览5216。

## 实现核对

- 新增独立 `showroom.html`，Vite多入口将其与原游戏一起输出到dist。样板间不创建GameSession、Runner或模型请求。
- 共用 `generatedStationPlacements`；游戏与样板间按相同地图放置地板、开口、柱网、门洞和设备；列车/入口/楼扶梯/8类细节及PBR复用已实现函数。
- 样板间使用固定seed1/云桥站/摘要50e78bc1、站厅0米与站台−6米。双层剖视轻透站厅地面并移去前侧墙，平台视图隐藏上层；没有把楼层错开或拉伸连接器。
- 新增47件资产目录、15种材质、6个空间镜头。支持模型搜索/分类、点选与单独查看、2种细节变体、设施状态、门扇开合、完整材质/凹凸/粗糙度、旋转/缩放/平移/复位、自动环绕、全屏与PNG保存。
- 展厅启用前侧轨道墙剖视；游戏 `createGeneratedPlatform` 的默认参数保持闭合原样。正式素材失败时回退到同一项目程序模型与本地PBR，可重试正式素材。

## 软件检查

| 检查 | 实际结果 |
|---|---|
| 类型 | `npm run typecheck` 通过；生产构建再次包含类型检查 |
| 新专项 | `node node_modules/vitest/vitest.mjs run tests/showroom.test.ts --maxWorkers=2`：5项通过；47件模型与15种材质全部通道、三类地图楼板开口、窄/宽自动取景、共享资产归属/释放、默认闭合平台兼容 |
| 既有资产 | `tests/generatedAssets.test.ts` 18项通过，原米制比例/端点/纹理与世界不可变检查保留 |
| 全量 | `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=15000`：89文件/728项通过 |
| 生产构建 | `npm run build` 通过，输出 `dist/index.html` 与 `dist/showroom.html`；保留已有Three大chunk提示 |
| 差异与文档 | `git diff --check` 通过；累计90个变更/新增文本无尾随空白或缺失末尾换行，任务/验证/素材文档链接及个人绝对路径检查通过 |

初次专项按重名的楼梯节点误选了入口楼梯；断言已限定到站内连接组，专项及全量复验通过。该调整没有更改模型端点或模拟数据。

## 浏览器检查

- 首屏组合样板间正式素材成功；六类镜头均可切换。剖视可见上下层关系，站台镜头移去前侧轨道墙后可见车体、轮轨、枕木和候车设施。
- 单件目录47件逐件通过实际点击打开，界面选择与有限几何包络一致；原始scale=[1,1,1]，长车体和楼梯自动完整取景。
- 头车车门0→100%、闸机开合与故障状态、售水组合A/B切换、分类筛选及无结果搜索均已操作。
- 材质试样完整/凹凸/粗糙度切换；玻璃等未使用贴图的表面禁用对应诊断通道。实际下载PNG为 `agent-go-showroom-material-tactile.png`。
- 场景中实际点选检票闸机，右侧信息及包络出现，点击“单独查看”进入fare-gate。返回游戏到大厅后浏览器后退，展厅重新恢复ready状态。
- 桌面全屏进入/退出、自动环绕实际改变镜头；390宽与760宽页面scrollWidth均等于窗口宽度，长车体重新取景，目录横向滚动、属性面板下移。
- 中止station-kit清单请求后formal=false/ready=true，使用本地模型；解除拦截后“重试正式材质”恢复formal=true。实际WebGL lose_context显示恢复提示，点击重新载入后恢复正式画面。
- 生产页直接打开 `showroom.html?mode=asset&asset=stairs` 为正式楼梯；组合站台、金属凹凸试样均正常，无404或页面脚本错误。
- 已等待系统偏好变更事件，减少动态效果模式实际禁用自动环绕，恢复偏好后启用。
- 原游戏浏览器seed1完整回归79.8秒成功、摘要50e78bc1；共用摆放提取及平台可选剖视未改变原旅程结果，无页面脚本错误。
- 展厅交互期间记录的 `/api/` 请求为0。未调用真实或付费模型；没有改变运行中的旅程或其他预览。

## 交接与限制

- 仍为本地未提交/推送/合入。开发入口 `/showroom.html`；默认开发端口5173，本次实际5196。临时生产预览收尾后关闭，原预览与API保留。
- 真实模型、移动真机、其他GPU/浏览器、远端CI及人工审查未运行；此任务不改变前述WORLDGEN验证边界。没有宣称跨设备帧率或生产部署。
- 页面按需绘制，自动环绕才持续请求帧；材质/几何按来源释放，正式资源由加载器持有。共享资源归属专项通过，不宣称完成长时间内存压力测试。
- 原始证据不入Git，保存在本会话本地产物目录：showroom-room、showroom-train/doors-open、showroom-commercial、showroom-gate-fault、showroom-material/normal/export、showroom-picked、showroom-phone、showroom-platform、showroom-local、showroom-production、showroom-full-tests及showroom-build-final。
