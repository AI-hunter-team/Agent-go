# CONTROLROOM-005：首页菜单桌面底色

状态：本地实现及验证完成，待追加至 PR。负责人及集成负责人：本次 Codex 会话。

## 目标与基线

- 用户希望桌面休息室首页的次级菜单按钮使用与手机相同的暖白底色，并将修改追加至 [PR #68](https://github.com/AI-hunter-team/Agent-go/pull/68)。
- 基线：`codex/worldgen-lounge-minimap-pr` 的 `55dab41ef48598f0032ea28b170881e9b2d247ff`；独立集成工作区 `Agent-go-worldgen-unified-pr`，原世界生成器工作区及其他工作区不变。
- 完成条件：桌面和窄屏的次级菜单均使用一致的暖白底色，黄色主操作及交互正常；记录桌面、手机尺寸浏览器核验与软件检查，提交并推送至同一 PR，不合并或部署。

## 边界与交接

- 允许修改：`src/ui/ControlRoom.module.css`、本简报、`docs/validation/CONTROLROOM-005.md`、验证索引和中央工作记录；集成负责人负责共享文档。
- 排除：模拟规则、世界生成、服务端接口、依赖、其他工作区及无关 UI。
- 验证：桌面及390像素窄屏比较按钮样式和点击路径，执行类型检查、完整测试、生产构建和差异检查；实际结果记录至[验证报告](../validation/CONTROLROOM-005.md)。
- 回退本任务提交即可恢复桌面透明底色，不影响世界数据或报告格式。
