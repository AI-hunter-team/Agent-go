# ASSET-KIT-001 V1 验证报告（历史快照）

状态：V1 独立美术资产与预览的历史快照，V2 见[新版报告](ASSET-KIT-001-V2.md)。以下数量、哈希与证据只适用于 V1，不代表当前 V2 或正式游戏资源替换/已合入。

## 版本与环境

- [任务简报](../tasks/ASSET-KIT-001.md)；执行人：本聊天 Codex；日期：2026-10-31，Asia/Shanghai。
- 基线：`392f050034dadeaa8d7991621d0c9b7ff410ca69`，分支 `codex/station-asset-kit`；修改均未提交。主工作区不变，未 fetch/同步远端。
- Windows，Node.js v24.21.0，npm 12.1.0；`npm ci` 按既有 package-lock 安装；manifest/锁文件未改。
- Chrome/156.0.8078.79，headless，1500×1060，ANGLE / SwiftShader 软件渲染；不等同于真实 GPU 性能测试。
- Khronos glTF Validator npm 2.0.0-dev.3.10 独立安装在仓库外，不成为业务依赖。工具依据：[官方项目](https://github.com/KhronosGroup/glTF-Validator)。
- 范围：源代码、生成模型/贴图、导出格式、独立预览与拼装示例。排除：角色、现有游戏展示替换、模拟规则/导航变化、真实模型和外部发布。

## 实际执行

以下路径参数只保留任务相对名称；机器专属工具/证据目录脱敏。原始 JSON/截图作为本聊天仓库外交付附件保存，不将大型原始产物和个人绝对路径入库。

| 检查 | 实际命令/操作 | 实际结果 |
|---|---|---|
| 安装 | `npm ci` | 通过，退出0；333包；审计提示3项告警（1 moderate / 2 critical），未执行升级或 audit fix；另有既有依赖弃用及安装脚本提示 |
| 资产生成 | `npm exec tsx -- scripts/station-kit/build.ts` | 通过，退出0；16类模块，22个带内嵌PBR材质的GLB；9张512×512贴图；模型总计9,618,644字节，独立贴图1,145,851字节 |
| 可重复生成 | 记录 manifest SHA256，重复同一 build 命令并比较 | 通过，结果一致；manifest SHA256 `F97EBF45E5E18F9F6C78748F5ED69EDD3886B21C5915367BDC72152AF7411F9A`，其中包含全部GLB SHA256 |
| 规范校验 | `node scripts/station-kit/validate.mjs <validator目录> <报告文件>` | 通过，退出0；22文件的内容哈希、基础尺寸和设备三状态齐全；glTF 0错误、0警告；纯色材质上的未使用UV提示属信息级 |
| 类型 | `npm run typecheck` | 通过，退出0 |
| 现有测试 | `npm test` | 通过，退出0；24文件、191测试；debug失败写入测试产生预期stderr，测试通过 |
| 完整构建 | `npm run build` | 通过，退出0；前端及Node服务端均构建；保留Vite大chunk提示 |
| 独立预览构建 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts` | 通过，退出0；静态HTML/CSS/JS及本地资产；JS约596.5KB，保留chunk提示 |
| 开发预览 | Vite独立配置，端口5190；`node scripts/station-kit/browser-check.mjs <Chrome> <证据目录>` | 通过，退出0；全部22文件真实GLTFLoader载入；全部22包络与清单相符；3种布局按钮、状态、下载所选变体、闸机双铰链、6材质球检查通过；控制台error为0 |
| 生产静态预览 | `node scripts/station-kit/serve.mjs dist/station-kit-preview 5191`，同一browser-check加该预览URL | 通过，退出0；同样22/22载入及包络检查，开合±1.50796447弧度，状态与下载匹配；控制台error为0 |
| 交付包预览 | 打包后用serve脚本直接服务包内preview目录，重复browser-check | 通过，退出0；22/22载入及包络、三布局、状态、双铰链和下载检查通过；包含Three.js许可证；完整包位于本聊天交付附件 |
| 可视检查 | 查看实际浏览器截图（样板厅、闸机、材质球） | 通过本次小样范围；墙体和色带重叠面已分段修正，消除可见闪烁；不等同于最终艺术批准 |
| diff与文档 | `git diff --check`；新文本行尾与任务链接审计 | 通过（交付前复核）；PNG按根规则忽略且可重建；ZIP/截图位于仓库外 |

## 修复和复验

- 首次开发预览失败：HTML入口跨根路径未正确解析，验证未能找到ready状态。改用预览根目录内的 `main.ts` 转入源模块后，开发版及静态版复验通过。
- 首次画面检查发现墙体/顶端色带/踢脚线共面，存在闪烁；改为实际分段几何，并修正样板隔断重叠，重新导出及截图复验。
- 首次规范校验为0错误、61切线警告；合并几何顶点、计算并导出显式切线后，重新校验为0错误、0警告。不靠忽略告警掩盖问题。
- 交付包预览初次尝试5192端口被Windows拒绝（EACCES）；停止本任务的临时5191预览后复用已确认可用端口，交付包复验通过。启动脚本现在对端口失败给出可换端口的明确提示。

## 证据索引与结论

- `station-kit-glTF-validation.json`：22文件的逐项规范校验与哈希结果。
- `station-kit-browser-check.json`：浏览器版本、渲染器、22/22载入/尺寸、布局和铰链状态。
- `station-kit-scene.png`、`station-kit-dogleg.png`、`station-kit-gate.png`、`station-kit-materials.png`：浏览器真实渲染，非生图示意。
- 开发与静态两套检查分别保存证据；正文只记录脱敏结论。

| 状态维度 | 结论 |
|---|---|
| 实现完成 | 本次非角色美术小样与导出/预览完成；没有替换正式游戏场景 |
| 软件检查通过 | 类型、191测试、前后端构建、独立预览构建与资产规范检查通过 |
| 实际验收通过 | 仅独立预览和GLB导入范围通过；正式游戏、角色、真实模型与硬件性能未运行 |
| 已合入 | 未合入；没有提交、推送、远端合并或部署；人工审查未进行 |

后续接入应读取模拟器的坐标、设施状态和碰撞事实；这些模型不新增通行权或地图生成规则。墙/柱尺寸以现行代码为准，概念板中的简化高度不作为实现标准。
