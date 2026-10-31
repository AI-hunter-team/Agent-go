# PR18-MERGE-001 集成验证

状态：本地集成提交前快照；最终 CI 和合入证据见 [PR #18](https://github.com/AI-hunter-team/Agent-go/pull/18)。不代表部署或完整产品实际验收。

## 版本与范围

- [任务简报](../tasks/PR18-MERGE-001.md)，本聊天 Codex，2026-10-31（Asia/Shanghai）。
- PR 头 `32ef1ba43394cc5ab3d3a72154e5f57aa98fd064` + main `257349aa7e63f2ed249b171361dabe02d23e992a`，检查时为未提交合并结果及本任务文档。
- Windows；Node.js `v24.21.0`，npm `12.1.0`。在应用管理的独立临时 worktree 安装依赖和检查，未操作 Responses、自定义角色两个在途开发工作区。
- 两处实际冲突：`docs/validation/README.md`、`docs/开发计划.md`。保留名称任务和 NPC 任务全部条目，补充本任务入口；没有业务逻辑冲突。
- `README.md` 与 `src/ui/App.tsx` 自动合并：已亲自核对，保留英文名与 main 随机种子/开局功能。对 main 的 App 差异只有原 PR 品牌文案；模拟器、服务端、测试与 main 完全一致；素材源码、GLB 与原 PR 完全一致。

## 实际执行

| 检查 | 命令/操作 | 实际结果 |
|---|---|---|
| 安装 | `npm ci` | 通过，退出 0，333 包；保留既有弃用提示、3 项依赖审计告警及 npm 安装脚本提示，未调整依赖 |
| 类型 | `npm run typecheck` | 通过，退出 0 |
| 首次全量测试 | `npm test` | 失败，退出 1：413/416 通过；engine、gameSession seed 1、heuristicAgent 各一项超过默认 5000ms，没有断言错误 |
| 降低并发复验 | `npm test -- --maxWorkers=1` | 失败，退出 1：415/416 通过；上述三项通过，另 gameSession seed 5 超过 5000ms；未修改测试或时限 |
| 剩余定点复验 | `npm test -- tests/gameSession.test.ts -t 'presentation-driven seed 5' --maxWorkers=1` | 失败，退出 1：目标用例耗时约 9.31 秒并触发 5000ms 时限；7 项按过滤条件跳过，没有断言错误。停止重复本机运行，后续以独立 CI 实际结果核对 |
| 主程序构建 | `npm run build` | 通过，退出 0，生成 `dist/` 和 `build/server.js` |
| 素材预览构建 | `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts` | 通过，退出 0，生成 `dist/station-kit-preview/`；构建保留既有大 chunk 提示 |
| 冲突与差异 | 冲突标记搜索、`git diff --check`、模拟器/server/tests 与 main 比较、素材与 PR 原头比较 | 通过；无残留标记，上述代码和资产比较无差异；暂存检查见最终提交 |
| 构建保留 | 复制到原项目 `artifacts/pr18-merge/` | 74 文件逐个 SHA256 一致，使用本地 Git 排除，不覆盖在途开发的 dist/build |

超时在不同运行中落到不同用例，同机另有开发任务；资源竞争是可能原因，尚未证明。不把“没有断言错误”当作全量测试通过；最终仍检查独立远端 CI 的实际结果。

## 交付边界

- 实现完成：冲突已解决，原 PR 名称与上游功能同时保留。
- 软件检查：类型和两套构建通过；本地两轮全量测试存在上述超时，定点复验及远端 CI 结果单独记录，不隐去失败。
- 未运行：浏览器、真实模型、Docker 本地冒烟、Khronos 重跑；人工处理仅为文档冲突，UI 和资产未新增改动，沿用原 PR 已记录的实际验收范围。Docker/跨平台以当前集成提交的远端结果为准。
- 原工作区及自定义角色工作区没有被切换、安装或改写；当前任务记录仅写入临时 worktree，临时目录在交付后归档。
- 已合入：最终状态/提交/CI 以原 PR 为准。本地证据为提交前快照；不部署、不付费调用。
