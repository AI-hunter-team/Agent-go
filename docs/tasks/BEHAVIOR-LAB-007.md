# BEHAVIOR-LAB-007：正式链路匹配与真实投掷反应

状态：本地实现完成；93文件852项、类型/正式前后端/实验台构建及无费用浏览器组件与测试页验收通过，见[验证报告](../validation/BEHAVIOR-LAB-007.md)。真实模型完整对局未验收，未提交/推送/合并/部署。负责人、共享文件集成与交接：本聊天 Codex，串行接续，不并行修改。

- 授权：用户要求读取当前测试页修改并匹配正式游戏；投掷有真实物品位置，前端按世界数据显示，保安实际听到后转向和移动，角色观察真实视线后再翻越。
- 基线：`codex/behavior-lab` / `1032a9155aec1801249054da63a98ffbbd96b093` 加 LAB-001–006 既有未提交修改。复用 latest-main 工作区，不覆盖其他任务、环境和 debug；不推送、合并、部署。
- 依据：现行交互规则、共享 Engine/动作原语、测试页 controller/scenarios 与正式 GameRunner。保安移动及朝向不能由前端假造；投掷不保证分心或安全，仍按听觉、目击与可达性结算。
- 允许范围：`server/{actionKnowledge,responses,prompts,boss,app}.ts`；`src/shared/{interaction,types,journey}.ts` 及必要动作来源模块；`src/sim/{intent,items,events,guards,observation,engine}.ts`、`src/sim/actions/{executor,instructionAudit,primitives,preconditions}.ts`；正式运行器与实验台 controller 的公共处理；`src/ui/{presentation,gameSession,render}.ts`、`src/ui/scene/Interactions.tsx`；对应测试与本任务文档、中央记录。先约定数据，再模拟、调用方、展示与检查。
- 排除：依赖/锁文件、模型资产、006命中率及其测试、其他任务文档、已有环境与历史报告。发现其他问题只记录，不扩大规则。
- 用户追加改用易拉罐：同步物品类型、定义、便利架库存、自然语言识别、模型枚举和实验台场景。允许相应扩展到 `server/{tools,npcDialogue}.ts`、`src/shared/physicalIntent.ts`、`src/sim/{layout,content/items}.ts`、`src/sim/actions/physical.ts`、`src/lab/{scenarios,feedback,LabStage}.tsx/ts` 及隔离的浏览器验收夹具。历史日志不改写；新局不再生成报纸。没有修改命中率。
- 同链路增补：`src/sim/perception.ts` 在实际抛出当帧、同时看见角色时保留目击归因；不能因原动作刚结束把目击当成未知声音。落地听觉不据此自动识别行为人；有向追踪仍优先于普通声响。
- 完成条件：记录两入口差异及匹配项；正式规划知道实际游戏肢体动作；解释不能把投掷/未来目的变成当下翻越；抛出物有权威起点/终点/时间与落地事件，落地后可观察/拾取；保安可依据真实声音移动并改变视线；前端消费相同数据；相关与全量软件检查、构建及无费用可视验证。真实供应商或完整模型对局若未运行须明确说明。
- 交接：本地源代码及 `docs/validation/BEHAVIOR-LAB-007.md`，不以离线测试冒充真实模型验收。用户按 BAT 重启后新局体验；不代改密钥或自动运行付费整局。
