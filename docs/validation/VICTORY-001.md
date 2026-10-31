# VICTORY-001：胜利舞蹈、电影运镜与点击问候

日期：2026-10-31。性质：本地实现与验证快照，不代表远端合入或人工审查。

## 版本与结果

- 基线 `331bdecca2265aa4c9931fd32db16149f932bf6e`，分支 `codex/victory-celebration`；在本任务未提交工作区验证。
- Windows，Node v24.21.0、npm 12.1.0、Chrome 156.0.8078.76（headless、硬件渲染）。沿用已有 npm 安装，未改依赖。
- 实现完成：是。软件检查通过：是。实际验收：以下前端/离线范围通过。已合入：否。人工审查：未进行。
- 新默认 GLB 为用户提供的4,696,216字节文件，SHA256 `b86d3340d38f8255bc5ba0a268de9d3f0460ee4ddab3fe7bf7bfdf62a0a111d0`；65根骨骼、三段舞蹈及一段问候。

## 软件检查

| 命令或检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test -- tests/victory.test.ts tests/avatarModel.test.ts tests/followCamera.test.ts` | 13项通过；新建的 victory 文件仅5项必要回归 |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | 最终64文件/523项通过；沿用仓库 CI 已记录的命令行预算，没有改断言或业务时限 |
| `npm run build` | 最终前后端构建通过；既有 Three/GLTFLoader 大分块提示保留 |
| `git diff --check` 与新增文件空白检查 | 通过；有 Git LF/CRLF 提示，无差异空白错误 |
| impeccable `detect --json`（本任务 UI 文件） | 返回 `[]` |

测试覆盖实际 GLB 的三舞蹈骨骼变化、水平根约束与循环接缝、行走时问候的腿部保持、动作恢复、StrictMode 重绑定、单局抽取/新局清理、隐藏时钟和两个终点镜头安全性。

初轮回归暴露了清理后复用旧 Three 动作绑定的问题，已改为惰性重建绑定；独立只读审查提示问候会被同模型重挂载截断，已修正为仅在更换资源/动作能力时重置。最终版本复跑了上述全量检查。

## 浏览器证据与边界

本地原始证据在 Git 忽略目录 `.codex/victory-001/`，不提交截图、模型调用配置或大型原始日志。

- `app/`：真实 App，离线 Agent，seed 27，300秒时限，225.0秒乘扶梯到 `(73, 22)` 通关。问候改变骨骼但不推进世界；拖动不误触；结算舞蹈与镜头持续变化，成绩和角色世界位置不变；报告可打开，手动接管只停止运镜；减少动态效果、重试和手动结束无胜利动作均通过。控制台无非预期错误。早期脚本结果字段写成 `stairsVictory`，按实际坐标和报告应解读为扶梯通关，不以字段名冒充楼梯整局证据。
- `assets/`：显式终局展示夹具，调用相同正式场景/角色组件。三段舞蹈均跨循环边界观察，楼梯 `(73, 9)` 和扶梯 `(73, 22)` 构图正常；390px窄画幅可见完整主体。隐藏时钟不推进，恢复不跳进度；画质切换不重抽，减少动态效果时骨架与镜头静止；错误模型路径回退几何角色并显示错误，预期加载错误单列。
- 资产脚本前两次在画质重建瞬间读取已卸载 debug 回调而中断；等待条件改为新场景就绪后，仅补跑未完成部分。另发现简化乘客和调试地面沿用相同 generation key，已加独立前缀并通过复验。没有忽略 React 错误来宣布通过。
- `production/`：最终 `dist/` 与正式本地服务5198；场景与真实模型加载、键盘 Enter 问候通过，无控制台错误；`/api/health` 为 `llm:false`。5192已被其他服务占用，未停止该服务，改用空闲5198。
- 未调用付费模型；未验证真实模型策略、未导出视频、未做设备性能基准。楼梯终点使用展示夹具验证，非第二次楼梯完整对局；文件名中的“03”不覆盖实际问候 clip `greet_04.001`。

## 文件与函数说明

| 文件/函数 | 作用 |
|---|---|
| `public/models/dafeiyu.glb` | 替换默认主角为用户四动作资产；现有程序 Idle/Walk 继续补齐普通行为 |
| `scenePerformance.ts` — `ScenePerformance.constructor` | 接收画面唤醒回调和独立随机源，不读写模拟随机数 |
| `sync` | 按 generation 清理新局，并在胜利时启动随机舞蹈序列 |
| `setClips`、`setAsset` | 登记当前模型动作及真实时长；换资源清理，同资源重挂载保留当前段和进度 |
| `chooseDance` | 每段结束从候选舞蹈重新随机，多段时排除刚播完的片段，保存上段末帧用于过渡 |
| `victoryTime`、`danceTime`、`greetingTime`、`cinematic` | 分别读取镜头总时间、当前舞蹈时间、问候时间及镜头是否自动控制 |
| `greet` | 拒绝胜利/重复触发，开始一次问候或减少动态效果下的短暂高亮 |
| `dismissCamera` | 只取消自动运镜，舞蹈继续 |
| `setVisible`、`advance`、`needsFrames` | 隐藏暂停、丢弃恢复首帧休眠时间、推进1×展示时钟并决定是否续帧 |
| `getScenePerformance` | 用会话 WeakMap 保留 Canvas 重建前后的展示状态 |
| `avatarAnimator.ts` — `findPerformanceClips` | 从当前资源识别舞蹈与问候，缺少时安全保持原显示 |
| `upperBodyTracks` | 根据脊柱子树生成上/下半身遮罩，不写死骨骼序号 |
| `AvatarAnimator.constructor` | 创建本实例播放器、普通动作索引、舞蹈副本与问候遮罩 |
| `add`、`bind` | 保存片段并创建绑定；StrictMode 清理后可以重新绑定 |
| `sample` | 以给定时间和权重采样动作，跳过缺失/空遮罩 |
| `danceTransition` | 上段完整播放结束后，以末帧过渡到下一段开头约0.25秒，不缩短片段时长 |
| `update` | 混合普通步态、静止全身问候、行走上半身问候或舞蹈；减少动态效果选静态姿态 |
| `dispose` | 停止动作、解除绑定并释放播放器引用 |
| `victoryCamera.ts` — `smooth` | 提供平滑起止插值 |
| `VictoryCamera.capture` | 记录真实当前相机起点和朝向 |
| `VictoryCamera.update` | 生成进入/推进/16秒往返镜头，适配画幅和模型朝向并裁剪碰撞 |
| `Character.tsx` — `ImportedModel` | 归一化模型、补齐普通动作、登记能力、采样后约束水平根位移，并清理资源 |
| `Character` | 仍由快照控制位置与朝向；连接主角点选和脚下高亮 |
| `down`、`move`、`up`（Character） | 记录按下点、累计拖动判定、仅在未拖动的抬起时问候；取消事件清理指针状态 |
| `GameScene.tsx` — `RenderSchedule` | 让终局表演续帧并沿用帧率限制；在角色和相机之前更新展示时钟 |
| `active`、`frame`、`wake`、`visibility` | 判断续帧、节流绘制、响应会话变化、连接文档及 IntersectionObserver 可见性 |
| `CameraRig` | 协调跟随/总览/电影相机，保留主线 FollowCamera 防抖 |
| `takeControl` | 手动操作时从电影镜头当前位置推导普通相机参数 |
| `down`、`move`、`up`、`wheel`（CameraRig） | 分别处理拖动开始、跨阈值接管并环绕、拖动结束、滚轮接管及缩放 |
| `CharacterKeyboard`、内部 `greet` | 给画布添加焦点，Enter/空格调用同一问候入口并忽略连发 |
| `Contents`、内部 `inspect` | 组合组件；debug=1仅暴露只读动画/骨骼/相机证据；修正兄弟组件重复 key |
| `App.tsx` — `App`、`start` | 胜利自动采用透视模式，用户镜头命令取消运镜；开局保留命令字段及重置行为，报告不等待动画 |
| `App.module.css` | 缩小胜利字幕避免遮挡，补充画布键盘焦点样式 |
| `tests/victory.test.ts` — `beforeAll`、`player`、`frame` | 读取真实骨架、建立隔离播放器、提供验证输入；5项回归覆盖本报告所列行为 |
| 任务、中央记录、索引、`PROGRESS.md`、`TODO.md` | 保存授权范围、状态、验证和交接；保留原历史记录 |

## 产物与移交

- 前端：`dist/`；后端：`build/server.js`。
- 本地预览：`http://127.0.0.1:5198/`，使用正式应用服务，当前未配置模型凭据。
- 代码与资产已提交并普通推送至 [PR #33](https://github.com/AI-hunter-team/Agent-go/pull/33)，尚未合入。重现本任务只需仓库资产，不依赖个人下载目录。

## PR 交付追加验证

- 用户在本地交付后明确要求“推送pr”，授权提交、普通 git push 和创建 PR；不含远端合并或部署。
- 功能提交 `7493088`；整合 main `20f0fe6`（CI-SESSION-001）时仅四处协作文档冲突，保留双方全部记录。`src/`、`server/`、`public/` 与依赖文件相对已验收功能提交无变化。
- 主线新增变化仅既有会话测试预算及协作文档；`npm test -- tests/gameSession.test.ts` 复验8/8通过，合并的该测试与 origin/main 一致。其余523项、类型、构建与浏览器证据沿用上述相同业务代码结果，不新增或无差别重跑测试。
- 暂存差异检查通过，不提交 `.codex/` 证据、构建产物、实际配置或凭据。本轮仅修改交付记录及保留上游测试预算，无业务函数变化。
- 普通 SSH push 成功，PR #33 为非草稿，目标 main；功能 `7493088`、主线整合 `578c1c0`，最新头和远端 CI 见 PR。PR 交付不是合并/部署授权。

## 按段随机播放修正（用户追加要求）

- 用户明确纠正原“每局固定一段”的方案：每段完整播完之后重新随机下一段，以此持续播放。多段素材避免紧接着重复，单段素材循环自身。
- 修改 `ScenePerformance.advance/chooseDance/setClips`：按 GLB 实际时长调度并记录当前片段进度；相机仍使用独立累计胜利时间。减少动态效果暂停片段调度，同一资源重挂载不重新抽取。
- `AvatarAnimator.danceTransition` 用上段末帧平滑混合下一段，替代原提前交叠的固定片段循环。`ImportedModel` 传入片段真实时长和过渡状态；`RenderSchedule` 传递减少动态效果，`inspect` 只读输出当前段进度。
- 原5项回归内替换旧策略断言，未新增测试数量。`npm run typecheck`、`npm test -- --maxWorkers=2 --testTimeout=15000`（523/523）、`npm run build`、差异检查通过。
- Chrome真实展示夹具自然等待片段结束，观察到 `dance_02.001 → dance_05.001 → dance_02.001`；切换前最后采样分别约12.806秒、2.875秒（轮询间隔80ms），与12.833秒/2.917秒完整时长相符；位置/世界时间不变，切换画质保留当前片段与进度，控制台无错误。证据位于忽略目录 `.codex/victory-001/sequence/`。
- 本轮未重复完整对局，原问候/报告路径证据保留；5198使用的 `dist/` 已更新，刷新页面加载新代码。产物仍为 `dist/`、`build/server.js`。
