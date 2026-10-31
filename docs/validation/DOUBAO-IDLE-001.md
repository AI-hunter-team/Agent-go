# DOUBAO-IDLE-001：豆包静止站立验证

状态：2026-11-01，本地实现及所列检查通过，main未提交。

## 实现与文件/函数说明

- 基线main `e4376f4` 加本聊天前三项未提交增量，全部保留；范围见 [任务简报](../tasks/DOUBAO-IDLE-001.md)。依赖、规则和展示运行时代码均未改变。
- `public/models/doubao.glb`：新增2秒 `Idle`。片段首尾及中间姿势完全相同，手臂自然向下、双脚站稳，不呼吸摆动或原地迈步；文件默认骨架姿势同步该站姿，缩略图也不再平举双臂。原 `walk.001` 保留。
- 模型3,490,256字节，比原始文件增加48,476字节；SHA256 `3aada1c3c384ee9f7ea6c059b5dee958996e5ce0b440c76880d260eab1d5c03a`。
- `scripts/build-doubao-idle.ts` / `main`：读取用户原始GLB，借助既有骨架辅助生成站立基础姿势，将双臂调为接近垂直、向外约9度，烘焙全部骨骼静态轨道和默认站姿；保留原有行走/蒙皮/材质/贴图。
- 同脚本 / `accessor`：把新关键帧写入追加的Float32缓冲，原缓冲内容不覆盖。
- 同脚本 / `pack`：将JSON和二进制按GLB2.0要求四字节对齐并写回完整文件。
- 同脚本 / 末尾错误回调：生成失败时输出原因并设非零退出状态。新增函数均有职责注释。
- `tests/proceduralLocomotion.test.ts` / 唯一新增用例回调：加载真实豆包，比较不同Idle时刻的全部骨骼与脚位，核对手臂下垂和原行走片段仍会迈步。
- 同步本任务简报、验证索引、中央记录、PROGRESS/TODO；不修改前序任务记录或扩展其他功能。

## 验证

- `node --import tsx scripts/build-doubao-idle.ts` 搭配用户原始豆包文件参数执行成功，输出默认 `public/models/doubao.glb`；脚本支持可选输出文件参数，不依赖个人路径。
- `npm run build`：含类型检查，前后端通过；既有Three.js约688KB大分包提示保留。产物 `dist/`、`build/server.js`。
- `node node_modules/vitest/vitest.mjs run tests/proceduralLocomotion.test.ts tests/avatarModel.test.ts tests/victory.test.ts --maxWorkers=2 --testTimeout=15000`：17项通过，仅新增一个直接资产回归。
- 新GLB调用现有 `validateAvatarBuffer` 通过，与 `dist/models/doubao.glb` 字节相同。对比用户原始文件：原BIN前缀、walk动画定义、skin、网格、材质、贴图及图像定义保持一致；只追加Idle缓冲/定义并修改默认骨骼姿势。
- 真实浏览器5199独立临时页：选豆包后全身自然站立，双臂放下、双脚在地面上，预设缩略图同步站姿；error日志为空。截图 `artifacts/doubao-idle/standing.png` 不入库；临时页关闭，原页面保留。
- `git diff --check` 与新增文件空白/链接检查通过。没有新增运行时UI源码，未重复设计机械检测。

## 边界与交接

- 未重新跑完整对局、真机或远端CI，浏览器行走未重跑；原生行走数据保持及真实骨架迈步由直接回归核对。未调用真实/付费模型。
- 当前main为未提交本地增量，前序失败动画、豆包预设、选角问候保持。构建产物 `dist/models/doubao.glb` 可单独取用；没有提交/推送/发布。
