# PR14-REVIEW-001 验证报告

状态：本地修复与验证快照；最终提交与推送状态见原 PR，不代表合入或完整美术验收。

## 版本与范围

- [任务简报](../tasks/PR14-REVIEW-001.md)；执行人：本聊天 Codex 会话，2026-10-31（Asia/Shanghai）。
- 分支 `codex/station-asset-kit`，基线 `0715d0f15aadd3de988a7dade702bf8b96afa8c1`；受测为其上的预览源码和已有浏览器脚本修改，检查时尚未提交。
- Windows，Node.js `v24.21.0`，npm `12.1.0`，执行 `npm ci` 使用既有锁文件；Chrome `155.0.8059.80`，SwiftShader 软件渲染。
- 范围为 [Codex P2 意见](https://github.com/AI-hunter-team/Agent-go/pull/14#discussion_r4427270933)：导向带随布局开口同步。正式游戏、模拟器、模型资产、API、依赖无改动。

## 实际执行

| 检查 | 实际命令或操作 | 结果 |
|---|---|---|
| 安装 | `npm ci` | 通过，退出 0；沿用既有 three-mesh-bvh 弃用提示、3 项依赖审计告警及 npm 安装脚本拦截提示，未调整依赖 |
| 类型 | `npm run typecheck` | 通过，退出 0 |
| 现有测试 | `npm test` | 通过，39 文件 / 355 项，退出 0；debug 写入失败提示为既有错误分支测试输出 |
| 游戏构建 | `npm run build` | 通过，退出 0，输出 `dist/` 与 `build/server.js` |
| 素材预览构建 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts` | 通过，退出 0，输出 `dist/station-kit-preview/`；两套前端保留原有大 chunk 提示 |
| 静态预览 | `node scripts/station-kit/serve.mjs dist/station-kit-preview 5192` | 成功监听本地地址；浏览器检查使用实际构建文件 |
| 浏览器 | `node scripts/station-kit/browser-check.mjs <Chrome可执行文件> artifacts/pr14-review http://127.0.0.1:5192/` | 通过，退出 0；30/30 GLB 加载和尺寸核对，三种布局的开口、模块端点连续性、箭头位置与朝向通过，控制台 error 为 0 |
| 原有预览检查 | 同一浏览器脚本中的眼高、总览、阴影、设备、下载和材质检查 | 通过；三轮模式切换几何数 80 → 80 |
| 截图复核 | 核对 split 总览、dogleg 室内及 straight 总览 | 已核对；6 张截图和 JSON 位于忽略的 `artifacts/pr14-review/`，不入库原始产物 |
| 差异 | `git diff --check`、`git diff --cached --check` | 通过；仅暂存本任务 7 个文件，原始产物与主工作区记录未混入 |
| 首次推送 | `git push` | 失败，退出 1；GitHub `GH007` 拒绝发布私人邮箱。后续提交改用 GitHub noreply 邮箱，仍以普通 git push 重试；最终交付状态见原 PR |

## 结论与边界

- 实现完成：直线布局直接经过 X=-1.5；分流经过 X=-4.5/1.5；绕柱经过 X=-4.5/4.5，延长横向直段、提前分流并在右侧下游回折。箭头使用同一组路线坐标。
- 软件检查：适用的本地检查全部通过；没有增加业务测试套件，仅给既有浏览器脚本补充本问题的三种布局断言。
- 实际验收：本次素材构建的浏览器范围通过；不代表正式游戏接入、全部障碍碰撞验收、真实 GPU 性能或最终美术认可。
- 未运行：真实模型、Docker 冒烟和其他真实设备检查；本次预览修复不涉及这些路径。人工批准未进行。
- 已合入：否；修复将以普通 git push 更新 [PR #14](https://github.com/AI-hunter-team/Agent-go/pull/14)，不执行合并或部署。回退本次修复提交即可。
