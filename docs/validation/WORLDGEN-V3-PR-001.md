# WORLDGEN-V3-PR-001：V3 后续PR整合验证

日期：2026-11-01。负责人及集成负责人为本聊天Codex，串行执行。[简报](../tasks/WORLDGEN-V3-PR-001.md)。用户明确要求创建PR，授权本分支普通push与PR；不合并、部署或调用付费模型。

## 基线与范围

来源V3为干净e3e5c977a4b1a54fdee1246880c18d1015908d74，最新实现修复4e8d3c3522368c1d84f482d2840f903b2c555bec。独立codex/worldgen-v3-pr worktree进行交付，原V3工作区、预览及其他任务不改动。

本轮fetch核实main为fa5551b8ac725377ace494866141e7109342cee2；前置[PR #68](https://github.com/AI-hunter-team/Agent-go/pull/68)尚未合入，head为codex/worldgen-lounge-minimap-pr的6409272ce8efe933eb1753e1b4128ad5298672fa。新增首页/豆包/角色动画已整合，合并提交085d46e770669038059b3ed536352317e906dd7e。

唯一文本冲突为docs/开发计划.md的任务表，保留双方任务条目；GameScene和useJourney自动合并后人工逐段核对。相对前置分支，public资产、Character、controlRoomModels、worldLibrary等父分支角色/首页文件无回退差异，V3的默认创建、连接器、取景与只读性能探针保留。PR以#68分支为base，只审阅V3增量；#68合入后需独立改base至main并重新核对差异/CI。

## 本轮重新执行

- npm ci：沿用原锁文件和依赖；既有弃用/安全告警未通过自动升级扩大本轮范围。
- npm run typecheck、npm run build通过；构建保留原大包提示。
- npm.cmd test -- --maxWorkers=2 --testTimeout=15000：110文件、976项全部通过，97.81秒。包括前置分支新增角色回归与V3全部测试；本轮无断言失败。
- git diff --check及暂存检查通过；无未解决冲突标记。相对前置分支的差异不包含角色GLB或依赖/锁文件变化。
- Edge生产构建，以无费用本地fixture启动独立预览，未使用真实模型。最初独立端口监听EACCES后改用空闲测试端口，未改权限或终止其他服务。
- 正式页面无worldgen开关创建seed1，显示78米偏置入口V3；三维预览、豆包选择、默认150秒/背包离线准备、连续入场、购票/安检/闸机、下楼、实际登车79.1秒通过。复盘显示“地铁末班车 · 豆包”、12次决策/0违规，返回场景可用。页面未收集到脚本警告/错误。
- 浏览器工具在模型/场景重建时曾等待超时，重新读状态确认操作已进入出发阶段后继续，没有重复强制启动或伪造成功。

整合截图create-v3.jpg、doubao-live.jpg、doubao-result.jpg留本次本地证据目录的pr-integration子目录，原图不入库，不在PR中写个人绝对路径。

## 来源证据及边界

[V3完整集成](WORLDGEN-V3-003.md)记录三类建筑/78–150米、1000种子、默认离线44/50对照V1的43/50、三类60秒P95及20次换图；[最新实机验收](WORLDGEN-V3-004.md)记录13种子52镜位、12整局+B扶梯、低净空穿模与二维柱体/标题修复、537521人次位置检查、末节车厢与窄屏。这些是对应来源版本的证据，本轮未声称再次完成该全矩阵或性能采样。

旧存档/报告、两种V3样板摘要、两个V2来源及历史V1恢复继续由本轮完整测试覆盖；未知版本不静默重建。时限、服务速度、额外排队人数及实际登车条件不改。

本轮未重新运行1000种子/50局、13种子实机矩阵、60秒性能、20次切图、移动真机/低端设备、其他浏览器或真实模型。人工审查与用户美术方向批准未进行；当前Node CI仅自动触发目标main的PR，本PR创建后在最终分支提交手动启动现有CI，不改CI规则。Compose smoke沿既有PR路径规则运行。[PR #71](https://github.com/AI-hunter-team/Agent-go/pull/71)已创建；远端CI绑定最终分支head手动启动，实际运行链接与状态见PR正文/检查页，不预写通过。

## 容器CI发现及修复

首轮[Compose smoke](https://github.com/AI-hunter-team/Agent-go/actions/runs/41245735983)在镜像构建阶段失败：Vite无法解析validation.html；新多入口构建已包含该文件，但.dockerignore沿用旧白名单将其排除。仅新增!validation.html，保持其他排除规则、Docker运行权限和部署配置不变。失败未按通过记载。修复后类型/构建/diff通过，完整110文件976项再次通过（90.96秒）；普通push后在最新提交再次启动Node CI及Compose，远端实际结果见PR。

## 交接

实现完成；本轮软件检查及上述浏览器冒烟通过；未合入或部署。新建默认V3，可用?worldgen=v2回退新建，保留已存V3和旧版本读取；回退代码不删除用户数据。合入#68后再检查本PR目标和冲突，重点复验角色准备/入场、默认V3、旧世界恢复、楼扶梯与登车；来源性能数据不可替代新首页下的性能复测。

交付[PR #71](https://github.com/AI-hunter-team/Agent-go/pull/71)，head为codex/worldgen-v3-pr，base为codex/worldgen-lounge-minimap-pr。文档交付提交f8b5932，后续仅追加PR指针；检查绑定最终head，完整SHA及远端CI以PR实际记录为准。普通push完成，本地交接检查分支干净。接手入口为本任务和PR；后续维护人待认领，未合入/部署。
