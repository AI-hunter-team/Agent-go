# BRAND-002：统一 agent-go 名称并清理旧技术标识

状态：本地实现与验证完成，待集成。流程见 [DEVELOPMENT](../DEVELOPMENT.md)。

## 目标与分工

- 授权：用户要求将原项目名统一为 `agent-go`，不使用中文项目名。显示名与技术标识均采用该英文拼写；功能说明继续使用中文。
- 单一负责人/集成负责人：本次 Codex 会话，串行实施及维护本任务中央记录，无并行文件分配。
- 基线：fetch核实的 `origin/main` / `b1bde9ddb24edbcee7d621eb0b9dae7fee91997e`，2026-10-31；独立分支 `codex/agent-go-name-consistency`，worktree代号 `Agent-go-name-consistency`。原main与素材工作区保持原状。
- 前置：BRAND-001曾只调整首页显示，明确排除了包名、导出名等；本任务依据用户新要求扩大清理范围。素材PR #14已合入，可统一其预览与生成器。无需付费模型或外部凭据。
- 完成条件：当前产品名、npm包元数据、报告/Debug下载前缀、素材预览、生成器及最终GLB元数据使用同一英文名；完整软件检查、模型规范/哈希及浏览器核对完成；保留真实历史证据和可接续记录。

## 路径边界

- 允许：`README.md`、`index.html`、`package.json`、`package-lock.json`（仅根包名称）；`src/ui/App.tsx`、`src/ui/ReportView.tsx`、`src/ui/DebugPanel.tsx`；`design/station-kit/README.md`、`design/station-kit/index.html`；`scripts/station-kit/build.ts`、`scripts/station-kit/glb.ts`、`scripts/station-kit/browser-check.mjs`；`public/assets/station-kit/manifest.json`、`public/assets/station-kit/models/*.glb`、`public/models/sample-sculpture.gltf`；本简报、`docs/validation/BRAND-002.md`、`docs/tasks/BRAND-001.md`（只加后续入口）、`docs/validation/README.md`和中央记录的本任务条目。
- 排除：玩法/模拟器、模型/API调用、JSON报告内容/共享类型、依赖版本、CSS、历史验证数据、已生成的仓库外图片与ZIP，以及其他任务文件。
- 不更名真实GitHub组织/仓库地址，不重写历史提交、验证截图文件名或旧报告的事实；它们不作为当前产品名称来源。

## 决定、兼容与迁移

- 首页品牌及浏览器标题使用 `agent-go`；品牌副标题使用英文，避免被误认为中文别名。素材页面可保留中文功能说明。
- npm私有包和锁文件根记录仅改名称，依赖解析不变；Docker镜像已为 `agent-go:local`。
- 下载文件前缀统一为 `agent-go-report-` / `agent-go-debug-`，不改变JSON结构。用户新要求是该命名变更的授权依据；按旧文件名前缀扫描下载目录的外部脚本需要改用新前缀，已下载文件仍有效。
- 浏览器临时目录及其清理保护前缀同步更新；仅影响未来创建的本任务临时目录。
- GLB只改生成器名称元数据，重新导出全部30文件并同步清单哈希；保留模型尺寸、节点、材质和锚点约定。旧验证哈希保留为旧版本快照，新哈希在本任务报告记录。

## 验证与交接

- 执行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`、独立预览构建、`git diff --check`；新文件检查相对链接和敏感内容。
- 运行资产生成及Khronos校验，核对全部模型哈希、尺寸与节点兼容；浏览器检查首页英文名称、报告下载和素材预览。
- [验证报告](../validation/BRAND-002.md)记录实际结果和未验证项；不把软件或AI核对视为人工批准。
- 原授权为本地修改与验证；用户随后明确要求“创建pr并提交”，授权本任务commit、push和创建面向main的PR，未授权合并或部署。回退本任务差异即可，无数据迁移。
- 接手负责人待认领；任务结束前补实际版本、状态、证据和后续入口。

## 本地交付快照

- 分支 `codex/agent-go-name-consistency`，HEAD仍为基线 `b1bde9ddb24edbcee7d621eb0b9dae7fee91997e`；本任务差异未提交、未推送、未创建PR，未合入或部署。
- 首页/素材页品牌、npm包名和锁文件根名称、两类下载前缀、浏览器临时目录及GLB生成器已统一；原历史名称仅留在真实组织地址和历史证据中。
- `npm ci`、类型、372测试、主程序/素材预览构建、30模型规范/哈希与语义比较通过；桌面/390px品牌、实际报告/Debug下载及素材三布局浏览器检查通过。详细环境、证据及边界见[验证报告](../validation/BRAND-002.md)。
- JSON格式及模型几何/贴图/场景节点未变；下载前缀的消费方迁移见上文。未新增镜像字符串替换的单测，使用既有检查和实际浏览器下载核对。
- 主工作区和素材工作区未被修改。后续入口为本分支及报告；若提交PR，按仓库模板交接并核对远端状态。人工审查未进行。

## PR交接准备

- 用户追加授权后已重新fetch；main仍为 `b1bde9ddb24edbcee7d621eb0b9dae7fee91997e`，没有需纳入的基线变化；同名分支尚无PR。
- 仅补授权/交接记录，受测源码和资产未再变化；沿用本任务372测试、构建、资产及实际浏览器结果。提交前再核对暂存路径、格式、敏感内容和文档链接。
- 提交与推送后核对本地/上游SHA一致，创建PR并查看最新CI。最终commit、PR号和远端状态在PR中承载；不将PR创建视为合并或人工批准。
