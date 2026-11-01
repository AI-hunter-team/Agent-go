# BEHAVIOR-LAB-010 测试入口隔离验证

- 日期：2026-11-01；基线1032a9155aec1801249054da63a98ffbbd96b093，codex/behavior-lab，保留既有全部未提交改动。
- 用户澄清：页面能够出现，但刷新/回到根路径时变成正式网页，不是游戏行为错误。
- 根因核对：实验台与正式页共用仓库根目录，5175的根入口/index.html及默认SPA回退仍可使用正式入口。修复前lab.html为实验台，index.html源码为/src/ui/main.tsx；没有发现业务代码主动跳转到5174的逻辑。
- 修改：仅vite.lab.config.ts及测试BAT。根路径、/index.html和/lab统一302转到/lab.html，保留查询参数并禁止缓存重定向；appType改为mpa以停止默认正式首页回退；依赖缓存独立。BAT显式指定behavior-lab模式。
- 当前服务：5175和8790原本已在运行。Vite检测配置变化后重新加载，未终止其他服务，也未调用付费模型。

## 通过

- HTTP：5175/ → /lab.html，最终200且只含实验台入口；/index.html?debug=1 → /lab.html?debug=1，最终200；直接/lab.html最终200；5175/api/health代理200。
- Edge：从5175根地址新建页面后显示“行为实验台”，URL为/lab.html；随后真实reload仍为同一标题和URL，场景控件正常显示。已为用户保留页面，截图behavior-lab-entry-fixed.png存于本会话外部可视化产物目录，未入库。
- npm run typecheck、npx vite build --config vite.lab.config.ts、git diff --check通过。

## 范围与未运行

- 没有修改正式index.html、vite.config.ts、正式BAT或业务规则。检查时5174未监听，因此正式页实时访问不计为通过；早期批量HTTP输出对该失败保留了上一请求变量，忽略该条陈旧输出。正式配置保持原样由源码核对。
- 没有重复业务/全量测试、真实模型调用或重新部署。此任务只修测试入口与刷新隔离。
- 未提交、推送或合并。启动脚本窗口仍需在服务使用期间保持运行。
