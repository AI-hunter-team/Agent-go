# PR18-MERGE-001：解决名称统一 PR 冲突并合并

状态：冲突处理完成，适用验证及交付结果见报告和原 PR；2026-10-31（Asia/Shanghai）。

- 单一负责人及集成人：本聊天 Codex，串行解决冲突、验证与合入。
- 用户授权：“处理最新的pr冲突然后合并”，授权更新并合入 [PR #18](https://github.com/AI-hunter-team/Agent-go/pull/18)，不包含部署或付费模型调用。
- 基线：PR `codex/agent-go-name-consistency` / `32ef1ba43394cc5ab3d3a72154e5f57aa98fd064`；已 fetch 的 main 为 `257349aa7e63f2ed249b171361dabe02d23e992a`，包含 #16、#17、#19、#20 的已合入功能。PR 暂无行内审查意见。
- 工作区：应用管理的隐藏临时 `pr18-merge`，完成后归档；原 Responses 与自定义角色工作区均有未提交开发，不在那里切换分支、改文件或安装依赖。
- 目标：统一名称保持 `agent-go`，保留 main 的随机故障、NPC 展示、启动配置及独立 NPC 模型设置；解决冲突并在集成版本验证，然后普通 git push 更新原 PR，检查通过后合并。
- 允许：正常合并引入 main 的已提交内容；人工处理 `README.md`、`src/ui/App.tsx`、`docs/开发计划.md` 的交叉差异，以及本简报、`docs/validation/PR18-MERGE-001.md`、`PROGRESS.md`、`TODO.md`。发现其他冲突先扩充本范围。当前任务只维护中央记录自己的行并保留各任务记录。
- 排除：其他工作区的业务/测试/配置/依赖及未提交内容，不新增玩法、模型协议或重新生成资产；JSON 格式、下载命名约定沿用原 PR。
- 实际冲突定位后补充范围：`docs/validation/README.md` 的报告索引同样由本任务解决，保留 BRAND 与 NPC 的全部条目。实际只有该索引和中央记录两处冲突，README 与 App 自动合并后核对保留双方改动。
- 完成条件：无冲突标记，原 PR 与 main 功能并存；类型、现有测试、生产构建、素材预览构建及 diff 检查通过；适用远端检查通过并合入。
- 验证：[验证报告](../validation/PR18-MERGE-001.md)。不新增镜像实现的测试；按实际冲突风险决定是否需浏览器复验，不重跑与本次无关的模型或完整资产验收。
- 交接与回退：最终提交/CI/合入证据在原 PR；本地构建复制到原目录 `artifacts/pr18-merge/` 后再归档临时 worktree，避免新增常驻项目文件夹。合入后可按第一父提交 revert merge，无持久数据迁移。
