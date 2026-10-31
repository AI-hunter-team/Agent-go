# CHARACTER-HOME-PR-001：角色、首页与场景收口整合

状态：2026-11-01，本地整合及所列检查完成，交付目标为既有 [PR #68](https://github.com/AI-hunter-team/Agent-go/pull/68)，不自动合并或部署。

## 基线与来源

- 本轮基于远端 `d40d1386dfc4870d230293174852f69e82038f77`，保留PR68新加入的站内细节、世界版本兼容、入站流程与测试预算。
- 角色来源stash：`f0aa408f47e53f4bd0983957711f027b60bf8857`；首页保护stash：`c2fb71a95b0c0d3d0549c324178aeacd3fd7b493`。两份均保留，没有pop或清理。
- 合入失败动画、豆包预设及静止Idle、选角问候首帧/去重、实时3D首页；用户追加截图要求修复门口黄色导向线穿模。
- 上述来源任务记录是各自写作时的历史快照；当前整合/检查/交付状态以本报告和PR为准。

## 整合与函数说明

| 文件/函数 | 本轮职责 |
|---|---|
| `App.tsx` / `App`、`chooseCharacter` | 保留新世界旅程与设置/首页，只接入选角请求序号；每次选择传递新的问候请求 |
| `GameScene.tsx` / `Contents`、内部 `inspect` | 在新版世界与休息室渲染链传递主角请求；保留世界版本/地图/层级筛选，并增加失败与问候只读状态 |
| `Character.tsx` / `Character`、`ImportedModel` | 合并休息室姿态、连续入站、楼层显示与失败/问候。选角加载完成后首帧接管；失败仅在对局结束的展示中播放，不影响休息室姿势 |
| `scenePerformance.ts` / `sync`、`setClips`、`setAsset`、`defeatTime`、`greet`、`greetSelection`、`needsFrames`、`getScenePerformance` | 分别管理新局清理、动作能力登记/换模型清理、单次失败进度、普通/选角问候、按需绘制及终局事实接线；原功能来自角色stash |
| `avatarAnimator.ts` / `findPerformanceClips`、`AvatarAnimator.update` | 识别自身失败片段并采样，选角不先混入站姿；普通点选、胜利、减少动态行为保留 |
| `useJourney.ts` / `CHARACTERS` | 在新版旅程清单增加豆包，不覆盖世界保存和恢复逻辑 |
| `appearancePreferences.ts` / `readDefaultCharacter`、`saveDefaultCharacter` | 默认外观允许豆包；保留存储不可用时的回退和保存失败语义，补职责注释 |
| `worldLibrary.ts` / `isSavedWorld` | 保存世界允许豆包角色，防止新预设造成记录被过滤 |
| `loungeLayout.ts` / `LOUNGE_PORTAL` | 共享内外门框尺寸，供收口与实体构造统一使用 |
| `controlRoomModels.ts` / `createControlRoomAsset` | 导向线从墙面起点延伸到外门框近边，变为薄饰线；横梁与立柱端面对接，消除共面重叠和伸入门洞的黄条 |
| `ControlRoom.module.css` | 冲突中保留当前参考图布局及桌面透明次入口，并恢复窄屏暖白底色可读性 |
| `tests/lounge.test.ts` / 门框回归、`stripeHits` | 用真实三维射线证明墙面黄线仍存在，内外门框之间无悬空黄条；仅新增这一项集成回归 |
| 同文件的偏好用例、`tests/controlRoom.test.ts` 原记录用例 | 补豆包默认外观/保存世界兼容断言，不增加用例数量 |
| `public/models/dafeiyu.glb`、`doubao.glb`、生成脚本及原动画测试 | 恢复已核验的失败片段、豆包Idle/Walk与来源回归；生成脚本函数说明见DOUBAO-IDLE-001 |

完整首页文件/函数职责见 [HOME-MATCH-001](HOME-MATCH-001.md)，角色来源见 [失败动作](FAILURE-ANIMATION-001.md)、[豆包预设](DOUBAO-PRESET-001.md)、[静止站姿](DOUBAO-IDLE-001.md)、[选角问候](SELECTION-GREETING-001.md)。没有新增公共API、改模拟规则或模型调用协议。

## 软件检查

- `npm run typecheck`：通过。
- 第一轮 `npm test` 配合 `VITEST_MAX_FORKS=2`、`VITEST_MIN_FORKS=1`：903项通过，1项既有生成世界导航检查超过默认5秒，未出现断言失败。
- 按仓库CI参数复验：`node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=15000`，103文件/904项全部通过，193.79秒。命令与npm test指向同一Vitest入口；不改断言或用例预算，保留1000种子检查。
- `npm run build`：类型、前端/展厅、服务端通过；既有大分包提示保留。产物 `dist/`、`dist/showroom.html`、`build/server.js`，不提交构建文件。
- 整合前32项角色/休息室定向检查通过；本轮新增测试仅1个门框穿模回归，另带入角色来源已有4项回归。
- 冲突标记、diff空白及提交范围检查通过。两轮只读探子均返回partial，不将其表述为完整独立审查或人工批准。

## 实际浏览器检查

- 本地生产预览5201，独立标签，无真实/付费模型调用。门口黄线已止于外框，截图中的突出黄条消失，框体横梁/立柱收口核对完成。
- 豆包在新外观菜单可选，站立姿势正常；保存后刷新仍选中豆包。保存世界恢复时也保留豆包，未被允许列表过滤。
- 切回大肥鱼，实际快照观察到 `greetingTime≈1.0476`、`greetingImmediate=true`、`greetingDuration≈2.8333`，世界时间为0。新版选角问候正常。
- 生成车站、离线模式、120秒时限：种子1实际在85.2秒登车成功，胜利展示存在且失败进度为空；种子4自然在120.0秒失败，失败进度停在5.583333秒末帧，骨骼为新失败姿势。未注入或强制结算。
- 种子4失败位于安检队列，部分人物被乘客遮挡；失败状态及真实骨骼末帧已读取，不据此承诺失败镜头总能无遮挡。截图 `artifacts/character-home-pr/failure.png` 本地保存。
- 浏览器应用error日志为空。高负载入站加载期间工具曾超时，后续页面正常运行；一次只读调试表达式拼写错误已更正，没有改写应用状态。
- 当前普通预览的外观与测试世界记录为本地浏览器状态；截图/测试录屏/个人路径、凭据和大型原始日志均不入库。

## 限制与回退

- 首页仍是参考图的实时3D重建，原HOME-MATCH记录的材质/光照等1:1差异仍存在；本轮修复具体门框穿模，不把整体视觉QA改写为完全通过。
- 真实模型、移动真机、远端CI及人工审查未在本地流程中替代验证。远端检查以PR当前头为准。
- 本轮全部增量按用户授权普通提交/推送并更新PR68；发布结果回填到进度记录。不合并main、不部署。回退本轮集成提交即可恢复d40d138代码树；原角色与首页stash继续可恢复。
