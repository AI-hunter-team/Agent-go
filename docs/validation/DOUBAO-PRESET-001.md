# DOUBAO-PRESET-001：豆包预设验证

状态：2026-11-01，本地实现及以下检查完成，未提交/推送。

- 基线：main `e4376f4e405d25068402e8df4ca9ac2cb026710b` 加上一轮失败动画未提交增量，均保留。范围见 [任务简报](../tasks/DOUBAO-PRESET-001.md)。沿用现有Node v24.21.0/npm12.1.0及依赖。
- 新增 `public/models/doubao.glb`：原样复制用户素材，3,441,780字节，GLB2.0、67节点、1个蒙皮/网格，内嵌贴图/缓冲，无外部资源；包含2.375秒 `walk.001` 行走动作。
- `src/ui/useJourney.ts`：仅给 `CHARACTERS` 常量新增 `doubao` 条目，显示名“豆包”，使用 `/models/doubao.glb`，排列在自定义入口之前；无额外介绍文案。
- 没有新增或修改函数。现有 `useJourney` 根据选中ID取预设；既有角色组件加载/适配尺寸，既有动画器匹配行走片段。没有将大肥鱼专属舞蹈/失败动作移植给豆包。
- `npm run build`：内含类型检查，前后端通过，原有Three.js大分包提示保留；产物 `dist/`、`build/server.js`。豆包在 `dist/models/doubao.glb`，与源文件字节一致。
- `node node_modules/vitest/vitest.mjs run tests/avatarModel.test.ts tests/journey.test.ts --maxWorkers=2 --testTimeout=15000`：14项通过，未增加测试。预设数据追加未改业务函数，不重跑无关整局测试；上一轮747项结果仍为该轮快照。
- 直接调用现有 `validateAvatarBuffer` 检查新GLB通过；设计机械检查返回 `[]`，diff及新文档空白检查通过。
- 本地5199应用内浏览器：角色列表四个入口可见，豆包缩略图/三维全身加载正常，选中标题与按钮状态同步；大肥鱼→豆包往返切换通过，浏览器error日志为空。保留豆包选中页面。
- 控制接口一度不可用，重建工具会话后恢复，未更改产品来绕过。截图 `artifacts/doubao-preset/selected.png` 本地保留、不入库。
- 已同步任务简报、验证索引、中央记录、PROGRESS/TODO。未运行真实模型、真机、豆包完整对局或远端CI；没有提交/推送/发布。
