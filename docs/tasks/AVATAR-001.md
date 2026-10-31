# AVATAR-001：主角、保安模型与本地导入

状态：本地实现与验证完成，待集成。2026-10-31，用户明确要求用提供的“大肥鱼.glb”替换主角，并增加自定义模型导入设置；随后追加“奶娃.glb”替换保安，保安也支持独立的自定义模型。

## 目标与分工

- 负责人兼集成人：本聊天 Codex；子代理只读定位，不修改代码。
- 基线：`codex/responses-deepseek` 的已提交 HEAD `633f941783478b242fbd7f9cd530cf1a887fd5b1`；未拉取远端。原目录的未提交 Responses 开发完整保留。
- 任务分支：`codex/custom-character`；独立托管工作区 `custom-character/AgentGo`。
- 完成条件：默认显示大肥鱼；显示设置可导入自包含 GLB、刷新恢复、恢复默认；错误不破坏当前模型和对局；姿态/大小/动画适配；软件检查及浏览器核验有记录。
- 依据：[技术方案 §15](../MVP技术方案.md#15-浏览器三维展示升级3d-mig-001)。用户本次授权扩大原仅调试路径加载的限制；外观不进入模拟器/API/报告格式。

## 路径边界与决定

- 允许：`public/models/dafeiyu.glb`、`public/models/naiwa.glb`、`public/models/README.md`、`src/ui/App.tsx`、新增角色外观设置/持久化/加载辅助模块及样式、`src/ui/scene/Character.tsx`、必要的场景属性接线、相关有限测试、本简报与验证报告、`PROGRESS.md`、`TODO.md`、中央记录及验证索引。
- 排除：服务端、角色 AI、模拟器、共享业务类型、模型 API 设置、依赖/锁文件、其他未提交工作、远端提交/合并/发布。
- 自定义范围：单文件 GLB 2.0，贴图和缓冲区须内嵌，最大 20 MiB；IndexedDB 分别保存主角与保安的当前文件，不上传服务器。导入前加载检查；失败保留原角色；浏览器拒绝存储时明确告知仅本次生效。两名保安共享选择的外观，各自克隆场景；视野与巡逻规则不变。
- 自动按包围盒居中、落地并适配 1.7 米；支持常见中英文动画名；外观朝向设置仅作用于模型，不修改世界中的方向。
- 风险/回退：模型质量及任意资产兼容性不做普遍承诺；恢复默认清除自定义保存；撤销本任务文件可回退，无业务数据迁移。

## 验证与交接

- 类型检查、有限导入边界测试、完整现有测试、生产构建、`git diff --check`；浏览器检查默认模型、导入/错误/刷新/恢复和窄窗口。
- 证据入口：[AVATAR-001 验证](../validation/AVATAR-001.md)。不调用付费模型，不测试与此无关的玩法扩展。
- 本地交付；未获本次授权不提交、推送、合并或部署。

## 文件及函数说明

| 文件 | 函数的作用 |
|---|---|
| `src/ui/AvatarSettings.tsx` 与对应 CSS | `AvatarSettings`：显示这一角色的名称、导入按钮、恢复默认、朝向及错误；样式负责分隔、间距和长文件名换行。主角与保安复用它 |
| `src/ui/useAvatarModel.ts` | `useAvatarModel`：管理一个角色的完整外观状态；`restore`：启动时读取本机文件；`importFile`：检查并导入/保存文件；`reset`：删除这一角色的保存并恢复默认；`rotate`：保存朝向；`applyPath`：保留调试路径入口；`onError`：显示对应角色的渲染错误 |
| `src/ui/avatarStorage.ts` | `avatarStorage`：在完整 IndexedDB 事务成功后读、写或删除对应角色的记录，主角与保安使用不同 key |
| `src/ui/avatarModel.ts` | `validateAvatarBuffer`：验证 GLB 容器与内嵌资源；`findAvatarClip`：识别中英文动画名；`disposeAvatar`：释放不再使用的几何、材质及贴图；默认配置分别指定两份资产及方向 |
| `src/ui/avatarValidation.ts` | `validateAvatarFile`：先真实加载并确认有有效立体网格，完成后释放预检资源，避免坏文件覆盖当前角色 |
| `src/ui/scene/Character.tsx` | `ImportedModel`：克隆骨骼、更新坐标、居中落地、适配大小与动作，并释放克隆骨架；`Character`：按世界快照插值位置/方向，应用额外模型旋转；`GeometricPerson`：NPC 与加载回退占位；`ModelBoundary.getDerivedStateFromError`：标记加载失败，`componentDidCatch`：反馈错误，`render`：选择模型或回退角色 |
| `src/ui/scene/GameScene.tsx` | `Contents`：把主角/保安各自的外观传给角色；`GameScene`：建立画布；`CameraRig`：跟随、环绕和避墙；`GuardVision`：调试视距；`DebugGround`：调试轨迹与路线。后三者只补注释，行为保留 |
| `src/ui/App.tsx` | `App`：接入两组外观与显示设置；`applyAsset`：调试路径交给统一外观管理器。原有 `prepare/start/edit/retryScene` 分别整理指导、开局、返回编辑和重建画面；`Brand/downloadMetrics` 显示标识与导出性能摘要；`SceneBoundary.getDerivedStateFromError/render` 切换场景失败提示，原流程仅补注释 |
| `tests/avatarModel.test.ts` | `glb`：构造最小容器以核对损坏文件与外部资源拒绝边界；3 项测试覆盖两份真实资产、格式错误及动画名 |
| `public/models/` | 两份用户原始 GLB 及来源/使用说明；不含函数 |
| 工作/验证文档 | `PROGRESS.md`、`TODO.md`、中央记录、验证索引、本简报及报告：保存实际进展、完成条件、验证与接手信息 |

## 本地交接

- 当前分支 `codex/custom-character`，基线 HEAD 未变；本任务文件均未提交。原 Responses 分支及其未提交工作保留。
- 实现完成、软件检查及本次浏览器路径通过；完整结果和未验证项见[验证报告](../validation/AVATAR-001.md)。
- 生产前端在 `dist/`，后端在 `build/server.js`；本地静态预览端口 5195，仅用于前端外观/离线观战。
- 尚未指定后续集成人；应只移交本简报范围内改动，整合其他 UI/API 分支时复核 App 接线，避免覆盖其他工作。

## 追加：替换“行走大肥鱼”（2026-10-31）

- 用户追加要求用新提供的“行走大肥鱼.glb”替换默认主角，沿用本任务负责人、基线和工作区。
- 范围：替换 `public/models/dafeiyu.glb`，按新资产校准 `src/ui/avatarModel.ts` 默认朝向，更新资产来源、进度、待办及本任务验证快照。保安、自定义模型功能与游戏规则不变。
- 文件事实：新 GLB 为 Tripo 导出的自包含 glTF 2.0，未包含 `animations`；沿用既有的程序行走起伏，不宣称提供骨骼行走动画。
- 完成条件：新文件完整复制，已有资产校验通过，生产预览加载新主角、朝向与脚底正确；只运行相关检查及前端构建，不增加测试。

### 追加授权：为导出的骨骼制作行走

- 用户确认快速开发期间新改动直接同步预览，不要求保留正在进行的对局；允许刷新当前预览。
- 新文件具有 65 根 Mixamo 骨骼和蒙皮权重，只缺动画片段。新增 `src/ui/scene/proceduralLocomotion.ts`，并接入 `Character.tsx`，为缺少行走片段的主角生成运行时站立/行走动画，已有资产动画优先。
- 只改变展示姿态，不制作路径根运动，不修改世界坐标、规则或 API；保安外观保持原样。补充少量动画循环/骨架兼容性检查及必要构建/浏览器复验，不扩展玩法测试。

本次追加已完成：新 GLB 原样替换，默认朝向 0°；为主角运行时生成 `Idle` 与 `Walk`，已有行走片段优先。4 项相关检查、类型和前端构建通过，生产预览已刷新并核对站姿、迈腿/摆臂、暂停、4× 及控制台无动画错误。详见验证报告追加快照。

| 本次函数 | 作用 |
|---|---|
| `createProceduralLocomotion`（新模块） | 从绑定骨架创建站立和一秒循环步态，缺少必要骨骼时保持原有回退 |
| 内部 `findBone` | 识别带命名空间的 Mixamo 骨骼 |
| 内部 `add` | 将骨骼摆动轴换算到父节点坐标，保留绑定姿态 |
| 内部 `relaxedArm` | 把平举的手臂放低，并保留裙子外侧空间 |
| 内部 `makeClip` | 生成闭合的四元数关键帧，可由现有动画混合器播放 |
| `ImportedModel`（已有） | 优先资产动画，否则为主角补步态；平滑切换动作，遵循暂停与倍速 |
| 测试 `loadPlayerRig` | 在 Node 中载入真实骨架和蒙皮，仅移除测试环境不需解码的贴图 |

`avatarModel.ts` 本次只修改默认朝向常量，没有新增或改变其中校验、动画名匹配及释放资源函数。全部新增函数及修改的加载函数均有注释。

最新预览方式：5195 已从静态产物切换为 `npm run dev:web -- --host 127.0.0.1 --port 5195 --strictPort`，环境开启 `CHOKIDAR_USEPOLLING=true`，避免 Windows GLB 文件监听锁定；代码修改热更新，构建产物仍保留 `dist/`。

## 追加统一交付授权

- 用户现明确要求全部本地修改提交、推送、处理冲突并合并。由当前 ALL-LOCAL-001 集成会话接手；本工作区先提交现有外观和保安功能，再与已合入的 Responses/UI/性能版本协调 App、GameScene 接线。
- 原本不提交/推送的阶段边界保留为历史，不含部署或付费调用。模型、动画、导入与规则边界不改变；最终检查及合入证据由集成任务记录。
