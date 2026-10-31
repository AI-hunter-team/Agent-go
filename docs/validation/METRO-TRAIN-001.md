# METRO-TRAIN-001 验证报告

状态：本地资产设计小样验证快照，不代表用户外观批准、正式游戏接入或已合入。

## 版本与环境

- 简报：[METRO-TRAIN-001](../tasks/METRO-TRAIN-001.md)；设计与来源：[模型说明](../../design/metro-train/README.md)。
- 执行：本聊天 Codex；2026-10-31，Asia/Shanghai。
- 基线：本地 `main` 的 `186682486f46615f86e915088067c53ab02b95d9`；独立分支 `codex/china-metro-train`，所有交付文件未提交；未 fetch。
- Windows / Node v24.21.0 / npm 12.1.0；独立工作区执行 `npm ci`，沿用现有 package-lock，未修改依赖或锁文件。
- 实际浏览器：Chrome/156.0.8078.79，无头 SwiftShader；不是实体设备或硬件 GPU 性能验收。
- 允许路径仅为本任务资产、生成/校验脚本、独立预览及简报/本报告。未修改站厅、模拟器、API、主应用或中央共享文档。

## 实际检查

| 层次 | 命令/操作 | 结果与证据 |
|---|---|---|
| 生成 | `npx tsx scripts/metro-train/build.ts` | 通过；两种 GLB、manifest、sources；每车 20 片独立门扇、坐标有限、比例检查通过 |
| glTF 2.0 | `node scripts/metro-train/validate.mjs` | 通过；Khronos gltf-validator 2.0.0-dev.3.10，2 文件、0 errors、0 warnings；大小、SHA256、门元数据及包围盒通过；校验器仅安装于本地忽略目录 `tmp/metro-tools/` |
| 类型 | `npm run typecheck` | 通过，退出 0 |
| 主应用测试 | `npm test` | 初轮 411 通过；中间一次 410 通过 / 1 失败（见下）；相关 32 项复跑通过；最后完整 46 文件 / 411 项通过，退出 0 |
| 主应用构建 | `npm run build` | 通过，退出 0；保留既有大 chunk 提示，不以此证明站台接入 |
| 独立预览类型 | `npx tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck --types vite/client --lib 'ES2022,DOM' design/metro-train/main.ts` | 通过；该目录不在根 tsconfig include 中，因此另行检查 |
| 独立预览构建 | `npx vite build --config design/metro-train/vite.config.ts` | 通过，退出 0；JS 约 591kB / gzip 152kB，有大 chunk 提示 |
| 实际 GLB 浏览器 | `node scripts/metro-train/browser-check.mjs <本机 Chromium 可执行文件>` | 通过；实际 HTTP 200 获取两种 GLB，非源代码内存模型替代；控制台错误 0，无失败资源请求 |
| 门动画 | 打开、关闭双侧门，切换车型 | 20 片门扇到达 `closedX + travel`，复位后等于 `closedX`；三车 60 门扇；截图可见真实通道、座椅及扶手 |
| 车型、视角与颜色 | 车头/中间/三车；整车/近景/侧面/车顶；青绿/红/蓝 | 通过；线路材质十六进制核对通过；GLB 下载请求 200；下载的是预生成青绿版本 |
| 窗口与外观 | 1500×1060、480×860 截图 | 通过无水平页面溢出；修复窄屏及三车取景；Codex 已查看实际渲染截图，人工审查未进行 |
| 文档与 diff | 新文件相对链接、行尾空白、范围检查；`git diff --check` | 通过；未暂存文件额外检查，非仅空 diff |

本地忽略证据：`tmp/metro-train-gltf-validation.json`、`tmp/metro-train-browser/game-browser-check.json`、`tmp/metro-train-browser-result.json`、`tmp/metro-train-tests-final.txt`、`tmp/metro-train-npc-retry.txt`、`tmp/metro-train-project-build.txt`、`tmp/metro-train-preview-build.txt`。原始截图/日志不入库；交接后可用脚本重建。

浏览器截图编号：01 整车、02 车头近景、03 侧面、04 开门、05 中间车、06 三车示意、07 车顶、08 窄屏、09 最终默认视角，位于上述本地浏览器证据目录。

## 产物与尺寸

| 文件 | 字节 | 三角形 | Mesh | 外包围尺寸 X×Y×Z（m） |
|---|---:|---:|---:|---|
| `metro-head-car.glb` | 2,366,260 | 23,619 | 114 | 23.117×3.913×3.093 |
| `metro-trailer-car.glb` | 2,496,692 | 24,996 | 112 | 23.300×4.628×3.093 |

名义车长 22.8m、车宽 3m；表中包围尺寸额外包含车钩/风挡/门边、空调与受电弓。轨面 Y=0，客室地板 Y=1.1。三车仅为连接查看，不宣称真实编组；正式接入时保持米制比例。

静态细节按材质合批，保留门节点。默认单车浏览器快照约 183 draw calls / 24,801 三角形（包括轨道/地面与透明双面绘制），不是帧率或功耗承诺。

## 失败、修复与边界

- 首次端口 5194 已被占用，改用本任务 5197；未停止其他进程。
- 首次独立构建因顶层 await 的默认浏览器目标限制失败；改为异步加载函数后构建通过。第一次独立类型命令因 PowerShell 逗号参数及 TS7 的 ignoreConfig 要求失败，修正命令后通过。
- 初轮截图发现车头封面背向、曲面贴层穿插和三车/窄屏裁切；修正面朝向、共面前窗与司机侧窗范围，并按实际包围盒调整取景；最终截图已重新检查。
- 第一轮浏览器资源断言发现 favicon 404，补空图标后复跑通过。
- 中间一次 `npm test` 的 `npcApi.test.ts` 在 Node fetch 报 `bad port`；该已有测试使用 `listen(0)` 随机端口，推测与受限端口碰撞有关，未记录具体端口，不能确认根因。未扩大范围修改测试；同文件 32 项及最后完整 411 项均复跑通过。
- `npm ci` 报告现有依赖漏洞与 blocked install-script 提示；本任务未升级依赖，未执行 audit fix。实际类型/构建已运行成功。
- 未进行正式游戏站台集成、运行整局、列车到发/上车规则、屏蔽门联动、真实模型 API、实体设备或生产预览浏览器检查。美术完成度仍需用户判断。

## 状态与交接

| 状态 | 结论 |
|---|---|
| 实现完成 | 独立 3D 资产小样及交互预览完成；正式游戏接入未实施 |
| 软件检查通过 | 上述最终类型、测试、主应用与预览构建、GLB 校验及文档检查通过；中间失败如实保留 |
| 实际验收通过 | 资产预览列出的浏览器路径通过；用户外观验收待反馈，游戏集成验收未运行 |
| 已合入 | 未提交、未推送、未合入；本地独立分支交付 |

接手方式：先阅读设计说明，启动 5197 独立预览，收集车头轮廓/色带/细节反馈；正式接入另确定轨道位置和路径归属。回退仅移除本任务新增路径，不改变主工作区及游戏数据。
