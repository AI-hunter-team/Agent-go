# BEHAVIOR-LAB-002：独立动作传输、真实交付与性格对照

状态：本地实现、软件检查及所列浏览器离线验收完成；真实模型未复测。2026-10-31 用户明确要求修复组合行动和交票、扩大默认乘客差异，并让测试页默认每条输入清空现场记忆且支持性格参数。

- 负责人兼集成人：本聊天 Codex，串行接续 BEHAVIOR-LAB-001，复用 codex/behavior-lab 工作区。
- Git 基线：1032a9155aec1801249054da63a98ffbbd96b093；已有未提交实验台及 LATEST-WEB-001 记录全部保留，不提交或推送。
- 范围：src/shared/interaction.ts、src/sim/actions/{physical,executor,primitives}.ts、src/sim/{engine,persona,dialogue,intent}.ts、src/sim/content/personas.ts、server/{tools,prompts,boss,npcDialogue}.ts、src/lab/**、相关 tests/**、本任务记录、interaction-v2/design.md、中央工作记录。消费者按类型检查核对，必要的展示格式只追加新动作标签。
- 接口原因与兼容：新增 additive 的 physical_action 类型/工具，显式传送动作枚举与可选独立 speech；转换为既有 talk/strike/push/snatch 计划。旧 talk/act 与已有存档保留。自然语言不直接改写成败，程序仍逐步校验与结算。
- 默认行为：在正式生成器中使用分布更鲜明的性格组合；对话模型获得性格含义。允许真实持有物在自愿说服/赠送时转移，保留所有权、容量、在场、交易原子性和旧让位校验。共享 src/shared/physicalIntent.ts 只用于识别明确且无条件的动作遗漏；不解释条件句为无条件执行。
- 测试页：每条新输入默认恢复初始世界与 NPC 记忆，保留历次实验记录；连续现场显式选择。可选择性格模板、NPC 对象和五项性格/赶时间/疲惫参数；新输入复用所选参数。后果观察按钮保持当前现场。
- 明确边界：不删除正式游戏三轮限制或警戒/反抗；不强制 NPC 同意、不保证击打成功；不把威胁台词、否定/条件描述自动当作已经要求攻击。测试页修正显式行动被纯对话吞掉的情况，并展示修正记录。
- 验证：模拟工具与传输、组合对话后肢体事件、拒绝/异常、说服/赠票原子转移、默认性格分布和不同回复、自动重置/手动连续、迟到响应；类型、相关/全量测试、正式/实验台构建、空白检查。
- 浏览器仅使用用户已启动的服务；不得代启开发服务器。真实模型调用、提交/推送/远端合入/部署不在本次范围内。
- 完成与交接见 docs/validation/BEHAVIOR-LAB-002.md；软件检查、浏览器、真实模型状态分别记录。
