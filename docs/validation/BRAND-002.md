# BRAND-002 名称统一验证

状态：本地修改后的验证快照；实现与软件/浏览器检查完成，用户后续授权的PR交接见末节，未合入或部署。

## 版本与范围

- [任务简报](../tasks/BRAND-002.md)，执行人为本次Codex会话，2026-10-31，Asia/Shanghai。
- 分支 `codex/agent-go-name-consistency`；fetch核实的基线 `b1bde9ddb24edbcee7d621eb0b9dae7fee91997e`，受测为其上的本任务未提交修改。没有更改其他工作区。
- Windows、Node.js v24.21.0、npm 12.1.0；Chrome 156.0.8078.79；WebGL为SwiftShader。真实GPU性能、真实模型、生产部署和最终美术验收不在本次范围。
- 产品显示名和技术标识均为 `agent-go`；只清理名称和相关元数据，不改变玩法、API、JSON内容结构、依赖版本及模型资产约定。

## 实际验证

| 检查 | 实际命令/方法 | 结果 |
|---|---|---|
| 安装/锁文件 | `npm ci`；对比基线package与lock解析对象，除根名称外深比较 | 通过；依赖版本与其余元数据一致；已有1 moderate/2 critical审计和弃用提示仍在，未越界修依赖 |
| 类型 | `npm run typecheck` | 通过 |
| 自动化 | `npm test` | 40文件/372项通过；debug写入失败stderr是既有预期用例 |
| 主程序构建 | `npm run build` | 前端/Node服务通过；GameScene 915.54KB，保留chunk提示 |
| 素材构建 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts` | 通过；预览JS 883.38KB，保留chunk提示 |
| 资产重建 | `node node_modules/tsx/dist/cli.mjs scripts/station-kit/build.ts` | 30 GLB/9贴图；模型总计11,346,656字节 |
| 规范/哈希 | `node scripts/station-kit/validate.mjs <独立校验器目录> <仓库外报告>` | Khronos 2.0.0-dev.3.10：30文件，0错误、0警告；全部SHA256和基础尺寸通过 |
| 资产兼容 | 分别解析HEAD及新GLB的JSON/BIN chunk，对比移除`asset.generator`后的全部JSON及BIN字节 | 30文件全部一致；只有生成器名称变化，不改几何、纹理、节点、锚点或材质 |
| 首页品牌 | 编译后Node服务；1440×1000和390×844真实Chrome页面 | 标题均为`agent-go`，品牌为`agent-go / METRO THEATRE`；无中文项目别名；窄屏品牌右界164.64px、设置左界254.22px，无重叠/横向溢出；截图已通过图像工具核对 |
| 实际下载 | UI选择离线Agent→准备→出发→主动结束，点击报告和Debug下载；读取实际落盘JSON | 两者分别为`agent-go-report-seed1-<时间戳>.json`、`agent-go-debug-<runId>.json`，内容可解析且runId一致。此用例主动结束、状态failed，只验证下载，不宣称整局通关 |
| 素材浏览器 | `node scripts/station-kit/browser-check.mjs <Chrome> <仓库外目录> <静态预览URL>`，另核对标题/品牌 | `agent-go · Station Kit`及新品牌正确；30/30载入/包络、三布局导向、状态/铰链/下载、材质球/阴影/视图切换通过，6张截图，控制台error为0 |
| 名称/格式/文档 | `rg`核对当前源码、配置、设计入口和生成资产；`git diff --check`，路径白名单和本任务Markdown链接检查 | 当前产品入口无旧项目名；历史证据与真实GitHub组织地址是明确保留项；无机器绝对路径或凭据入库 |

新manifest SHA256：`2AB87CF61180058C1CBD9E90409F3FCB8184A21CD74CE89C87C6F3F7255D777F`。旧ASSET-KIT验证哈希保留原快照，不改写其结果。

## 证据与限制

- 仓库外证据标识：`brand-002-semantic-check.json`、`brand-002-gltf-validation.json`、`brand-002-browser-check-final/brand-browser-check.json`及桌面/窄屏/报告截图；素材证据为`brand-002-kit-check/`。原始图片、下载JSON和日志不入库。
- 主页面首轮自动检查被`/favicon.ico`的404误记为业务异常；复验只对这一明确资源单列警告，其余控制台错误仍阻断。最终主页面无JS异常、无其他错误；该404仍保留，未在改名任务中增加范围外图标修改。素材页无该警告。
- 首次启动检查因PowerShell取得多个Node路径导致启动命令失败；改为取首个实际可执行文件后启动成功，未将失败启动算作通过。
- 本任务未新增字符串替换单测，使用既有全量测试、实际页面/下载和资产语义比较覆盖；不重复与改名无关的整局或付费模型验证。
- 唯一消费方兼容影响为下载文件前缀；若外部脚本按旧前缀筛选，需要同步。JSON结构、历史下载文件和GLB导入约定不变。
- 人工审查未进行；本会话代码与图像核对不能冒充人工批准。后续从本任务分支、简报和本报告接手。

## PR准备复核

- 用户随后明确要求“创建pr并提交”；授权本任务提交、推送及创建PR，未授权合并或部署。
- 重新fetch后main仍为上述 `b1bde9d` 基线，同名分支无既有PR；检查范围与受测源码/资产一致，提交前只补本文和简报/中央记录的授权交接说明，不重复与该文档变更无关的业务验证。
- 暂存检查限定为任务允许路径，30个GLB及清单与已验证版本一致；检查 `git diff --cached --check`、文档链接及敏感内容，不暂存PNG、ZIP、日志、浏览器产物或本机路径。
- 最终commit/本地上游一致性、PR链接及CI状态以PR交接为准；本地快照不提前宣称远端操作成功。
