# HOME-MATCH-001：实时3D首页还原记录

状态：本地实现与软件/交互检查通过；参考图逐像素1:1视觉验收尚未通过，差异见根目录 `design-qa.md`。2026-11-01，负责人及集成人：本聊天Codex。

## 基线与范围

- PR68 `55dab41ef48598f0032ea28b170881e9b2d247ff`，当前 `codex/worldgen-lounge-minimap-pr`。保留原SWITCH-PR-068文档与命名stash；本轮没有提交、推送或合并。
- 参考：用户提供1672×941首页截图，本地证据副本 `artifacts/home-match/reference.png`。用户明确选择整个房间保持实时3D，未使用截图背景替代房间。
- 复用已有世界创建、世界列表、外观与设置功能；继续准备入口移入我的世界弹窗，以保持首页三个主入口。
- 无依赖或锁文件变化；新增图标为Google Material Design Icons原始SVG，Apache2.0许可及出处随文件保存在 `public/assets/icons/`。

## 文件与函数职责

| 文件/函数 | 改动作用 |
|---|---|
| `ControlRoomMenu.tsx` / `ControlRoomMenu` | 按参考摆放品牌、三个菜单入口与左侧透白遮罩；沿用原回调，继续准备移入世界列表 |
| `ControlRoom.module.css` | 对齐品牌/菜单位置、字号、按钮尺寸及窄屏布局 |
| `App.tsx` / `App`、`App.module.css` | 左下设置入口换为Material图标，调整尺寸、位置及文字 |
| `loungeLayout.ts` | 定义参考图的镜头、家具、门洞和角色锚点及连续入站路径 |
| `controlRoomLayout.ts` / `ControlRoomState.update` | 首页采用50度近景镜头，沿已有展示时间线接回对局镜头，模拟时钟不变 |
| `controlRoomModels.ts` / `createControlRoomAsset` | 调整房间边界、分色墙、线条、软包沙发、圆桌/杯子、门框、壁灯和通道；全部仍为三维实体 |
| 同文件 / `matte`、`rounded` | 分别创建独立材质和圆角实体，不修改共享车站材质 |
| `ControlRoom.tsx` / `ControlRoom` | 暖色灯光、开放式门洞、标准画质地面反射/接触阴影；进入对局后卸载新增反射和接触阴影；克隆地面纹理独立释放 |
| `controlRoomLighting.ts` | 休息室灯光强度配置，沿已有混合规则恢复车站照明 |
| `Sign.tsx` / `Sign` | 新增透明底墙面文字模式，现有站牌默认行为不变 |
| `GameScene.tsx` / `Contents` | 向休息室传递当前阶段以控制首页效果生命周期 |
| `Character.tsx` / `ImportedModel` | 首页从模型自身问候片段取迎宾姿势；内部 `height` 采样模型局部脚尖高度，使迎宾姿态贴地 |
| 同文件 / `Character` | 首页人物按参考比例显示，连续入站时平滑恢复正常尺寸 |
| `tests/controlRoom.test.ts` | 原有门洞路径检查改为相对共享门洞中心，保留0.35米以内的偏移约束及完整入站终点/时钟断言；未增加测试数量 |
| `public/assets/icons/` | 原始设置/前进SVG及Apache许可，避免用文本符号替代图标 |
| 任务、验证、PROGRESS/TODO、design-qa.md | 记录已完成范围和未达到的视觉精度 |

## 验证

- `npm run build`：含类型检查，前端/展厅与服务端构建通过。既有较大分包提示保留；产物 `dist/`、`dist/showroom.html`、`build/server.js`。
- `node node_modules/vitest/vitest.mjs run tests/controlRoom.test.ts tests/lounge.test.ts tests/characterClick.test.ts tests/victory.test.ts --maxWorkers=2 --testTimeout=15000`：28项通过。最后将门洞允许偏移进一步收紧到0.35米后，13项controlRoom复验通过。无新增用例或无关整局测试。
- 初轮两个失败：修改品牌实体宽度导致原矢量镂空检查不匹配，已恢复实体默认宽度，首页使用同源品牌SVG；原门洞测试写死旧位置3.5，已据新门洞位置改为共享锚点与人物净空约束。原失败未作为最终通过结果。
- 开发预览新引入Drei子模块时Vite依赖重新预打包，曾出现新旧React缓存混用错误；刷新后的画面可用。最终使用独立生产预览5201验证完整渲染，console error为空，不将开发阶段错误隐去。
- 四个入口检查：创建世界打开独立创建窗口；我的世界显示空列表及创建入口；角色外观进入选角并能返回；设置抽屉可开关。未调用真实模型。
- 390×844：横向溢出0，三个主按钮都位于可视范围（y609–778）；临时视口最后恢复。
- 标准画质为实时WebGL场景。截图对照与细节裁图见 `artifacts/home-match/comparison.png`、`menu-comparison.png`；源1672×941，浏览器CSS视口1672×941，截图因像素舍入为1671×941，比较时仅校正1像素宽度。
- impeccable机械检查返回 `[]`；diff及新文档检查通过。没有新增运行时依赖，没有发布部署。

## 视觉限制与交接

- 品牌和菜单已接近参考位置/尺寸，但实时场景的布料/石材、灯光柔和度、入口纵深与角色姿态仍可见差异，不能称为逐像素1:1完成。详见 `design-qa.md` 的P2项。
- 原图未提供对应三维场景/材质/灯光数据；本轮以仓库现有模型重建，未将参考图光照冒充本机渲染效果。
- 未做完整真实对局、真实设备性能采样、20次资源循环或远端CI。新增反射/接触阴影仅标准画质休息室启用，低画质沿用基础材质。
- 当前本地未提交。开发预览5199，生产预览5201；软件检查通过不替代剩余视觉验收。
