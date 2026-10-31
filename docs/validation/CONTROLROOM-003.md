# CONTROLROOM-003：移除电脑屏幕验证

2026-10-31本地快照；基线为codex/world-generator-v1 / 1032a9155aec1801249054da63a98ffbbd96b093及既有未提交组合。

- 已移除三台桌面显示器及支架、侧墙规则屏和ControlMonitor贴图组件；说明牌移到墙面。操作台、键盘、指示灯、沙盘和界面规则入口保留。
- 游戏和展厅共用同一操作台构建器，目录描述同步更新。生产展厅实测control-console最高点约1.035米，无显示器占高。
- npm run typecheck通过；已有controlRoom/showroom专项18项通过；npm run build通过；git diff --check及本次文本/链接检查通过。
- Edge156生产浏览器实际查看控制室和单件操作台，创建seed1世界、旋转沙盘、打开规则页均可用，无页面脚本错误。正式角色加载后重新保存最终截图。
- 此次为低风险可逆展示删除，未新增镜像测试、未重跑完整模拟批次/全部测试或真实模型。没有修改模拟、接口、照明参数、依赖或锁文件。
- 原始screens-removed-room/showroom截图、screens-build日志留在工作区外。本地未提交/推送/合入，预览8797已更新。
