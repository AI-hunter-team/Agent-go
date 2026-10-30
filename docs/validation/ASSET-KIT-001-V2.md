# ASSET-KIT-001 V2 风格修整验证

状态：V2 技术与独立预览验证快照；最终美术相似度待用户评价。V1 的报告和交付包保留，不将用户反馈不满意改写为批准。

## 版本与范围

- 日期/执行人：2026-10-31，Asia/Shanghai，本聊天 Codex。
- 分支 `codex/station-asset-kit`；最初验证基线 `392f050034dadeaa8d7991621d0c9b7ff410ca69`，当时本任务修改未提交。最新PR基线与复验见下节。[任务简报](../tasks/ASSET-KIT-001.md)。
- 依据：用户反馈 V1 “感觉没有这个感觉”，重新附上既有站厅参考图。将实际三维小样向室内纵深、圆角赭黄结构、完整顶面/灯带、窗侧暖光和连续导向带调整。
- 范围：现有资产工厂、程序材质、GLB导出、独立预览/打包、任务交接。角色仍由用户提供；未修改模拟器、正式Station或根依赖/锁文件。
- Node.js v24.21.0，npm 12.1.0，Chrome/156.0.8078.79，1500×1060，ANGLE SwiftShader软件渲染；不能据此声称真实GPU性能达标。

## 实现与验证

| 项目 | 实际结果 |
|---|---|
| 模块扩展 | 24类/30GLB，9张512×512贴图；新增6m圆角结构框、顶板/侧封板、灯带、窗墙、导向直/弯/分流段；售票机增加深柜体和斜面控制台，闸机增加金属面板 |
| 真实导入 | GLTFLoader重新加载全部导出文件；开发预览已通过30/30包络检查 |
| 人眼高度 | 默认相机Y=1.62m，室内视角包含48块顶板；总览切换隐藏顶板与平面反射，保留模块观察 |
| 渲染 | 环境预滤波、暖色面积补光、窗框投影、柔化平面反射、可开关接触阴影；太阳高度按侧窗调整，使侧光进入室内而非被顶面挡住；后期使用多采样目标避免轮廓锯齿；这些效果只在预览，不写成GLB烘焙光照 |
| 空间尺寸 | 基础墙仍3.5m，方柱源GLB仍2×2×3.5m；预览高顶4.25m、结构框4.2m，0.7m侧封板补齐基础墙；柱实例沿Y适配，高度变化不进入模拟器 |
| 设备与布局 | 开放/停用/故障、下载变体、双翼开合±1.50796447弧度，3种布局、6材质球；开发预览检查通过，控制台error为0 |
| 规范检查 | Khronos glTF Validator 2.0.0-dev.3.10：30文件，0错误、0警告；UV未使用为信息级；文件哈希和基础尺寸检查通过 |
| 类型/测试 | `npm run typecheck`、`npm test`通过；24个测试文件/191项；debug失败写入stderr为原测试预期 |
| 完整构建 | `npm run build`通过：原前端/服务端；独立Vite预览构建通过；原GameScene约915KB、V2预览JS约882KB，保留大chunk提示 |
| 可重复生成 | 同一源代码连续生成两次，manifest及其记录的全部GLB哈希一致；manifest SHA256 `76A864B834CF0329ACFB67788DDDAEC0BCB31ED9ED14BBE220CAB2677C3B7F18` |
| 二进制体量 | 模型11,346,676字节，独立贴图1,157,647字节；GLB自含所用贴图 |
| 实际截图 | 已查看真实浏览器室内截图，确认售票区、安检、后方闸机、圆角框和顶板/灯带同时可见；不是再次生成概念图 |
| 静态交付包 | 实际包在本机5191端口通过30/30载入/包络、48块顶板/1个反射面、阴影开关、总览去顶、3种布局、设备状态/铰链/下载与材质球检查；5张截图，控制台error为0 |

## 方法与证据

实际命令（机器专属Chrome/工具/证据路径以占位说明脱敏）：

```sh
npm exec tsx -- scripts/station-kit/build.ts
node scripts/station-kit/validate.mjs <Khronos校验器目录> <仓库外报告>
npm run typecheck
npm test
npm run build
node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts
node scripts/station-kit/browser-check.mjs <Chrome> <仓库外证据目录> <本地预览URL>
git diff --check
```

仓库外证据目录标识为 `station-kit-v2-preview`：`glTF-validation.json`、`station-kit-browser-check.json`，以及 `station-kit-scene.png`、`station-kit-overview.png`、`station-kit-dogleg.png`、`station-kit-gate.png`、`station-kit-materials.png`。静态包最终复验使用独立证据目录 `station-kit-v2-package-check`，包含同名浏览器报告及5张截图，最终室内截图已由本会话通过图像工具查看；不代表人工批准。

## 已知边界与交接

- 开发预览与静态包通过；V2归档另外核对30个GLB哈希、9张贴图以及必要的源码和Three.js许可证，不覆盖V1。
- 软件检查通过不等于最终艺术认可；本报告不代替用户对参考图“感觉”的判断，也没有人工审查批准。
- 角色、正式游戏内接入、真实模型整局、运行时地图变形和硬件性能均未测试/实现；保持原任务边界。
- 原本地交付阶段源码与资产留在独立worktree，尚未提交或推送；用户追加授权后的PR交接见下节。V1 ZIP保持原样，V2单独打包；未合入或部署。

## PR准备与最新基线复验（2026-10-31）

- 用户明确要求“检查确认后，创建pr并提交”；本任务负责检查、commit、push及创建面向main的PR，未获合并或部署授权。
- fetch后在独立worktree快进到 `633f941783478b242fbd7f9cd530cf1a887fd5b1`。中央记录新增行冲突保留全部上游条目，再追加本任务；原main工作区未切分支、未改文件。没有根依赖或锁文件变化，现有安装继续有效。
- 同步后的源代码检查补上两个问题：输出目标不得在源码仓库内，避免递归复制；切换材质视图时释放临时球体/底座几何，避免GPU资源随切换累计。

| 检查 | 实际结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | 39个文件 / 355项通过；debug写入失败的stderr是已有预期 |
| `npm run build` | 前端与Node服务构建通过；GameScene约915.54KB，保留chunk提示 |
| 独立Vite构建 | 通过；预览JS约882.52KB，保留chunk提示 |
| 重新生成/规范校验 | 30 GLB / 9贴图；0错误、0警告；尺寸和SHA256核对通过，manifest哈希与上表一致 |
| 打包边界 | 仓库内新目录在写入前拒绝；仓库外新目录成功打包；对既有目标拒绝覆盖且README哈希不变 |
| 最终静态包浏览器 | 30/30载入和包络、室内顶板/反射、阴影开关、总览去顶、3种布局、设备状态/开合/下载、6材质球均通过；5张截图，控制台error为0 |
| 视图切换资源 | 样板站厅/材质球连续切换3轮，GPU几何数80→80 |
| 暂存与文档检查 | 本任务路径白名单；diff空白、相对链接和机器路径/凭据扫描通过；未强制加入被忽略的PNG/ZIP/截图 |

命令包括上节所列生成、类型/测试/构建/浏览器检查，以及 `git diff --cached --check`。一次为缩减输出而追加的 `npm test -- --reporter=dot` 被本机npm 12以不支持的CLI参数拒绝，随后改用规范中的 `npm test` 完整通过；不将该参数失败记作测试用例失败。

仓库外复验证据标识：`station-kit-v2-pr-glTF-validation.json` 与 `station-kit-pr-review-check/`；本地待审包为 `ai-hunter-station-kit-pr-review/`。PNG按现有忽略规则由生成脚本重建；30个最终GLB自含所用材质，仓库提交包含其清单和源码，不含ZIP、截图或校验器依赖。

本节是提交准备快照；最终提交、PR号和远端CI以PR为准。模型规范及浏览器检查不代表最终美术批准、正式场景接入、真实模型整局或硬件性能验收；本次未调用付费模型，人工审查未进行。
