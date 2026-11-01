# BEHAVIOR-LAB-006 验证与交接

- 版本：1032a9155aec1801249054da63a98ffbbd96b093，codex/behavior-lab，加既有001–005未提交改动；本次只改判定下限及相关检查/记录。
- 启动：按用户明确要求直接运行 start-behavior-lab.bat；Vite报告5175就绪，接口8790监听，脚本自带打开lab.html。页面HTTP请求返回200，没有调用真实模型。
- 规则：hurt和knockout命中判定最低60%，适用于乘客/保安及所有朝向/胆量/警戒组合；surprised仍95%，helpless仍100%。不更改命中后的击晕率、距离检查、追近时限、抢夺和推搡。
- 通过：npm run typecheck；npm test -- tests/contest.test.ts tests/actions.test.ts tests/instructionPipeline.test.ts（3文件36项）；git diff --check。
- 未运行：全量测试、生产构建、浏览器交互和真实模型验收；按用户减少验证要求仅运行受影响检查。没有提交、推送、合并或部署。
- 共用范围核对：src/lab/scenarios.ts和src/ui/gameSession.ts均实例化同一src/sim/engine.ts；共用动作/物品/警戒/反应规则。实验台夹具、参数、控制节奏和界面独立，修改它们不自动改变正式默认设置。运行其他目录或已部署的旧包，需要更新/重新构建或启动对应版本后才生效。
