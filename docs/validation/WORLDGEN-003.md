# WORLDGEN-003：生成车站模型与材质验证

身份：2026-10-31 本地验证快照。基线与授权见[任务简报](../tasks/WORLDGEN-003.md)，素材/比例/贴图配方及复建见[素材说明](../../design/world-generation/README.md)。本地未提交，不代表合入或人工批准。

## 环境与范围

- 分支 `codex/world-generator-v1`，HEAD `1032a9155aec1801249054da63a98ffbbd96b093` 加未提交 WORLDGEN-001/002/003。保留其他工作区及其未提交修改。
- Windows PowerShell、Node24.21.0/npm12.1.0，依赖未改；开发预览5196、API8796，离线规则 Agent。
- 浏览器：本机 Edge156/Playwright，RTX5090 Laptop GPU，1440×1000/DPR1/标准画质；另测780×900。

## 软件检查

| 检查 | 实际结果 |
|---|---|
| 类型检查 | `npm run typecheck` 通过 |
| 完整测试 | `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=15000`：88文件/723项通过，包含既有1000种子及游戏整局回归 |
| 新资产专项 | 18项：8种纹理确定性/非空法线、米制UV、5种站台长度未缩放编组、闭合楼梯/扶梯与端点、8类双变体、三类地图建模不修改世界定义 |
| 生产构建 | `npm run build` 通过，保留已有Three大chunk提示，无新依赖 |
| 差异检查 | `git diff --check` 通过；累计80个改动/新增文本无尾随空白或缺失末尾换行，本轮3份任务/素材/验证文档相对链接与个人绝对路径检查通过 |

首次专项检查发现新材质容器释放时把其dispose方法也当成材质遍历，已改为独立材质快照容器；重新跑专项/完整测试，并在浏览器连续换图与正式资源失败分支验证，无页面脚本错误。

## 浏览器与视觉

- 三类布局：seed1双端/摘要50e78bc1、seed2中央/529d1c22、seed4侧向/617c8fb1，检查入口角色视角与站厅总览。材质检查入口列出27个带颜色图的材质条目（含未命名标识纹理）；与 WORLDGEN-002 相同摘要，未改模拟/地图数据。
- seed1实际离线完整旅程79.8秒成功，与本次改动前同seed结果一致。中途下楼与到站台截图确认石材踏面/防滑槽、金属玻璃栏杆、平齐站台的列车门槛、门窗/车内座椅与吊环；正式车体替代旧白色方块。
- seed1每侧3节、seed2/4每侧2节；调试清单保留scale=[1,1,1]、railTop=-1.1、passengerFloor=0。平台长度专项核对48/54/66/72/78米。
- 侧向布局的开口护栏按真实连接向量布置，两条长边及下行末端有围护，入梯短边保持通行；不按固定东西方向摆放。
- 中止正式station-kit清单请求后，仍显示完整入口与新列车/楼扶梯、本地PBR备用纹理，seed1摘要不变；新模型不依赖额外网络资产。
- 780×900时页面宽度=scrollWidth=780，无横向溢出。暂停/继续、1×/4×、总览/跟随及连续换种子已经操作。
- 节能预设实测low/30FPS/simpleCrowd=1，入口与新材质仍正常；已操作二维/三维切换及实际WebGL lose_context后的“使用二维画面”，随后恢复标准画质。
- 同指导同种子重试后重新开始仍为50e78bc1、入口A及27个有颜色图材质，未出现资源释放异常。
- 最终生产构建在临时5216端口完成seed1离线整局，79.8秒成功、同摘要、每侧3节列车，无页面脚本错误；随后关闭临时预览。开发预览5196和原API8796继续保留。
- 终局总览曾被站台顶板遮住；现总览隐藏顶板形成剖视，角色视角保留顶板。最终浏览器总览截图可见完整岛式站台、两侧编组及楼扶梯。近看修正售货柜/消防箱的真实玻璃开口，并将扶梯顶面的槽纹转到行进方向。

## 性能

同WORLDGEN-002设备、seed1、分辨率、DPR、标准画质、60FPS目标，最终代码活动场景采样60.02秒/3623帧：60.37FPS、P95 **17.0ms**。原WORLDGEN-002同条件P95为17.1ms，本次未观察到超过20%的恶化。

采样开始的绘制调用快照765（原1094，约减少30%），三角形877898（原673636），geometry433（原331），texture77（原53）。静态顶板合批抵消了新增车体/细节的绘制调用；面数与纹理数增加如实保留，未测实际GPU显存字节。初次样品采样60.01秒为60.39FPS/P95 17.1ms，最终近看修正与顶板剖视后另采上述最终结果。

最终采样JSON保存后的收尾按钮定位超时；JSON已在超时前落盘，此收尾工具超时不计为运行期页面脚本错误，未据此补写其他验收结果。

本项是单机开发预览、固定分辨率和帧率目标的观测，不表示跨设备性能保证。原始JSON为materials-final-performance，现场未同时运行其他验收页面或测试任务。

## 交接与未运行

- 全部资产由项目原创代码/已有正式站厅纹理复现；无第三方图片下载、无付费模型调用。静态几何按材质合并；共享贴图与生成场景资源分别归属。
- 当前未提交/推送/合入。真实模型、移动真机、远端CI、人工审查未运行；本页不扩大 WORLDGEN-001/002 的真实验收结论。
- 原始证据位于本会话本地产物目录，不入Git：materials-entry-first、materials-hall-overview、materials-stairs-first、materials-platform-first、materials-side/central-entry/overview、materials-narrow、materials-fallback-entry、materials-release-tests、materials-final-build、materials-connectors-models、materials-detail-models、materials-economy、materials-2d、materials-production-entry/success/overview、materials-final-platform-overview、materials-final-performance。
