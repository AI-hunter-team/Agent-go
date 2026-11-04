# Security / 安全说明

## 报告漏洞 / Reporting a vulnerability

请使用仓库 **Security → Report a vulnerability** 私密报告入口（需要维护者启用 GitHub private vulnerability reporting）。在该入口启用前，可先通过不含漏洞细节的普通 Issue 请求私密联系渠道。不要在公开 Issue 中发布可利用细节、真实凭据或个人数据。维护者尚未承诺固定响应时限。

Use GitHub's **Security → Report a vulnerability** private reporting feature once enabled by the maintainer. If unavailable, open an issue requesting a private contact channel without disclosing exploit details. Do not publish credentials, personal data or actionable vulnerabilities in public issues. No fixed response SLA is currently promised.

## 适用环境 / Deployment boundary

当前版本面向可信的本地或个人自托管环境，无账号鉴权、公网限流及竞技防作弊。API 允许配置自定义模型网关，包括本机和内网地址；服务端默认模型会向可访问该实例的用户提供调用能力。默认保持回环地址监听，公网暴露前应配置访问控制、HTTPS 和网络出口限制。

The application targets trusted local/personal deployments. It has no account authentication, public rate limits or competitive anti-cheat. Custom model gateways may include local and private-network addresses. Server-default credentials can be used by clients with access to the instance. Keep loopback binding by default; internet-facing hosting requires separate access control, HTTPS and egress restrictions.

## 凭据与数据 / Credentials and data

- 密钥及连接令牌默认仅在页面/服务端临时内存中使用。明确勾选「在此设备记住密钥」才持久化到浏览器 localStorage；这是明文站点存储，不是加密保险库，不适合共享设备。
- 旧版保存记录保留原保存选择；取消记住或清除页面配置会尝试删除新旧记录。删除失败会提示，可通过浏览器清除本站数据。
- 模型验证、对局、主动复盘和指导整理可能发送输入给所选供应商并消耗额度；刷新不自动触发付费验证。自定义角色文件留在浏览器中。
- `.env`、调试日志和原始报告均不应提交。日志虽做脱敏，指导、观察和模型响应仍可能包含私密内容；共享前人工检查。不得将密钥放入 `VITE_*`。

Keys and capability tokens stay in memory unless remembering is explicitly selected. Remembered credentials use plaintext origin-scoped localStorage, not an encrypted vault. Legacy consent is preserved; unchecking or clearing removes saved records, with a warning if removal fails. Review logs and exports before sharing them. Provider calls can disclose supplied gameplay data and incur charges; page refresh does not automatically perform a paid probe.

## 维护范围 / Maintenance

当前仍为开发版本；优先在最新主线复现与修复，不承诺旧版本安全回补。依赖审计、代码检查和一次性泄密扫描只证明其列明版本与规则，不是绝对安全保证。
