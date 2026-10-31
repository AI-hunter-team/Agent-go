# MINIMAP-003：紧凑标记与滚轮缩放验证

身份：2026-11-01本地验证快照；范围与授权见[任务](../tasks/MINIMAP-003.md)。

## 环境与软件结果

- `codex/world-generator-v1`，HEAD `1032a9155aec1801249054da63a98ffbbd96b093`及已有未提交组合；Windows、Node24.21.0/npm12.1.0、Edge156。
- `npm run typecheck`：通过。
- 小地图及控制室专项：29项通过；新增覆盖指针锚点、缩放上下限、平移/默认复位及小地图/整站图标尺寸区分。
- 完整 `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=15000`：92文件/762项通过，65.65秒；证据`minimap-zoom-tests.txt`。
- `npm run build`：通过，含类型检查、Vite及服务端构建；原Three.js块大小提示保留。证据`minimap-zoom-build.txt`。
- `git diff --check`与新增文件文本/文档相对链接检查：通过。

## 生产浏览器

- 本地8797，1440×1000：设施标记主体实测约12.24像素，原为18像素；展开整站图仍约18像素。只改变标记显示尺寸，无设施几何/碰撞变化。
- 右侧小地图直接滚轮缩放，-350滚轮量后约169%；以真实WheelEvent位置核验，锚点偏移小于0.1屏幕像素。
- 缩放上限1200%、下限65%通过；拖动可平移；按钮与双击均恢复100%及原基准viewBox。
- 缩放/拖动不滚动页面，不改变主场景镜头；原暂停状态保留。整站图缩放、楼层选择和Escape关闭仍可用。
- 390×844：小地图滚轮缩至/放至157%后可复位；页面scrollWidth=390，小地图scrollWidth/clientWidth均168，无横向溢出。
- 浏览器无pageerror、console错误或passive监听警告；事件监听在SVG卸载时清理。
- 早期锚点检查夹具使用了理想浮点鼠标位置，与浏览器实际整数事件坐标不符；最终使用真实事件坐标和SVG变换后的屏幕像素容差检查，缩放实现未因此更改。

原始截图/JSON/日志保存在工作区外会话证据目录：`minimap-zoom-browser.json`、`minimap-zoom-before.png`、`minimap-zoom-after.png`、`minimap-zoom-final.png`、`minimap-zoom-phone.png`。不入库原始大型产物。

## 边界

无真实模型、远端CI、提交/推送/合入/部署、物理手机设备或新GPU性能基准。此次为地图展示交互增量，模拟规则、种子、世界定义与报告格式保持。
