# 中国地铁栏杆资产与装配小样

状态：本地实现与浏览器验证快照，未合入。任务与完整证据见 [METRO-RAILING-001](../../docs/tasks/METRO-RAILING-001.md) 和 [验证报告](../../docs/validation/METRO-RAILING-001.md)。

## 两类样式

- A：银色不锈钢圆管、圆角外框、两道横杆、紧凑固定法兰和螺栓，用于安检和闸机分隔。参考 [成都地铁实景](https://www.sohu.com/picture/458382092)；固定底座为适配既有场景的设计选择。
- B：圆管连续扶手、细立柱、透明玻璃、圆形金属夹具，用于楼梯及洞口。参考 [广州二沙岛站实景](https://www.eguangzhou.gov.cn/gznewsphotos/content/post_33604.html)。
- 照片未复制或打包，所有模型和材质均为原创程序制作。楼梯踏面、防滑槽和梯身沿用 STATION-DISPLAY-001 的完整交付。

## 产物与尺寸

| 模块 | 可见包络 / m | 用途 |
|---|---|---|
| metal-straight | 3 × 1.1 × 0.16 | A 直段，两个圆角回弯、两道横杆 |
| metal-corner | 1.5 × 1.1 × 1.5 | A 90° 转角，共用角柱 |
| metal-end | 0.16 × 1.1 × 0.16 | A 固定收口柱 |
| glass-straight | 3 × 1.1 × 0.16 | B 水平段，分块夹持玻璃 |
| glass-corner | 1.5 × 1.1 × 1.5 | B 洞口转角，共用角柱 |
| glass-end | 0.16 × 1.1 × 0.16 | B 固定收口柱 |
| glass-stairs | 9 × 3.1 × 0.16 | B 斜段，末端标高 −2m，护栏自身高1.1m |

X 为跨度，Y 向上，Z 为厚度；根节点水平居中、起点参考标高为0。直段长度含两端各80mm的底座半径，柱心连接点间距为 `length - 0.16`。玻璃12mm厚，主杆50mm、A横杆32mm，固定底座直径160mm。尺寸是游戏资产选择，不代替施工设计或工程验收。

- `public/assets/metro-railings/models/`：7个无外部贴图的 GLB，总计约343KiB。
- 同目录 `manifest.json`：尺寸、材质槽、三角面、文件大小、SHA256、连接点；`sources.json`：制作来源与参考链接。
- `src/assets/metro-railings/index.ts`：几何、材质、任意长度和坡度装配。
- 两个站厅清单共40 GLB；旧站厅的3个密竖杆模型保留作兼容数据，正式场景与样板间已使用新栏杆。样板间选择器显示31类现用模块。

## 重建与查看

在仓库根目录执行（已有依赖无需重复安装）：

```powershell
npm ci
node node_modules/tsx/dist/cli.mjs scripts/metro-railings/build.ts
node node_modules/vite/bin/vite.js build --config design/metro-railings/vite.config.ts
node node_modules/vite/bin/vite.js preview --config design/metro-railings/vite.config.ts --host 127.0.0.1 --port 5288 --strictPort
```

打开 `http://127.0.0.1:5288/`，可比较A/B、转角、玻璃斜段，调节0.32–6m跨度。开发页运行 Vite 后位于 `/design/metro-railings/`。独立小样中的坡面仅为装配基准。

完整游戏重建用 `npm run build`；随后重新构建两个小样，因为主构建会清理 `dist/`。站厅样板间命令为 `node node_modules/vite/bin/vite.js build --config design/station-kit/vite.config.ts`。

## 装配与释放

使用 `createMetroRailingSpan(style, length, materials, options)`，或从实际载入的直段/斜段 GLB 调用 `fitMetroRailingSpan(prototype, length, options)`。不要整体缩放杆件、底座或夹具。

- `rise`：末端相对起点的高差；斜段立柱保持竖直，扶手顺坡，玻璃为平行四边形分块。
- `startPost: false` / `endPost: false`：共用端柱；A拼接同时把共用端的 `startReturn` / `endReturn` 设为false，保证顶管连续。
- `postBase(x, grade)`：仅调整底座/柱底标高，扶手和 `anchor_start` / `anchor_end` 继续使用参考坡线。正式楼梯从同一 `STAIR_DETAILS.count` 计算踏面落脚点，入口柱与洞口水平段共用。
- 玻璃导出为 glTF `BLEND`，载入后关闭透明材质的 `depthWrite`，不投射不透明阴影。正式场景的透明面板保持独立排序，钢管等不透明部件合批。
- 调整/卸载后调用 `disposeRailingGeometry`，只释放本次生成的曲管与玻璃几何；共享材质及基础几何由资源所有者管理。正式场景通过 `disposeBatches` 统一处理。

正式布局的参考柱心仍落在(48,0,13/17)与(57,−2,13/17)，未移动模拟器端点、障碍或角色路线。底座的可见半径可以跨过柱心连接边界。

## 本机交付入口

- 完整游戏：`http://127.0.0.1:5290/`，独立普通API，当前无模型凭据。
- A/B小样：`http://127.0.0.1:5288/`。
- 站厅样板间：`http://127.0.0.1:5291/`。

上述均为本地服务，不是部署。重启完整游戏可在生产构建后执行：

```powershell
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '5290'
node build/server.js
```
