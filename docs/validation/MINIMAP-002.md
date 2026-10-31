# MINIMAP-002：完整取景与居中验证

身份：2026-11-01本地快照。范围及授权见[任务简报](../tasks/MINIMAP-002.md)。

## 问题与修正

用户截图显示站厅底部被裁切且内容偏位。原默认局部视图上限为48米高，跟随角色取景，当前车站不一定能完整装入。现在楼层最长边不超过160米时默认全层取景，取景中心固定为楼层包络中心，按卡片实际宽高等比例适配，额外留18像素边距容纳图标。超大楼层保持附近视图，卡片新增“全层／附近”切换。

不旋转或拉伸地图，不修改世界坐标、导航、路线、观察权限或模拟时间。

## 环境与检查

- 基线：`codex/world-generator-v1` / `1032a9155aec1801249054da63a98ffbbd96b093`及现有未提交组合。
- Windows、Node24.21.0/npm12.1.0、Edge156；生产本地8797，1440×1000与390×844。
- `npm run typecheck`：通过。
- 专项 `tests/minimap.test.ts`与`tests/controlRoom.test.ts`：27项通过。
- 完整 `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=15000`：92文件/760项通过；`minimap-fit-tests.txt`。
- `npm run build`：通过；`minimap-fit-build.txt`，既有Three.js块大小提示仍在。
- `git diff --check`及新增文档相对链接/空白检查：通过。

新增回归验证三类车站各层/入口在238×176、168×132、360×240画幅中完整入框、四边至少18像素留白、中心对齐、移动中画幅不变和等比适配；800×400米多层夹具仍支持自动附近和手动全层。

## 生产浏览器

- 种子1/2/4：入口与站厅默认whole，全层/附近切换通过；种子4在角色移动后viewBox不变，viewBox与真实SVG宽高比一致。
- 种子4站厅全层viewBox为`-53.475 -24.878571 150.45 111.257143`，附近为`-7.909091 -13.5 64.909091 48`；真实画布238×176，完整边界与正确比例均有回归覆盖。
- 390视口：卡片画布168×132；页面scrollWidth=390，卡片scrollWidth/clientWidth均168，头部模式按钮没有造成横向溢出。
- 固定种子1离线完整到站台，回放跳到末尾后platform仍为whole；318×176画幅等比适配，站台未被裁切。
- 最终生产页面无页面异常；原始JSON/图片存外部会话证据目录：`minimap-fit-browser.json`、`minimap-fit-full.png`、`minimap-fit-1.png`、`minimap-fit-2.png`、`minimap-fit-phone.png`、`minimap-fit-platform.png`。

## 边界

没有真实模型、远端CI、提交/推送/合入/部署、实际手机硬件或新的GPU性能对照。此次只修正取景；旧验证报告保留其历史结论。
