# Contributing / 参与贡献

欢迎提交问题、文档改进和代码修复。现阶段界面及详细开发文档以中文为主；English issues and pull requests are welcome.

## 报告问题 / Report an issue

使用仓库的 Bug 模板，填写版本或 commit、系统/浏览器、复现步骤、预期与实际结果。模型问题附供应商、模型 ID 和脱敏错误即可；不要附 Key、连接令牌、未经检查的完整日志或私密指导。安全问题请先读 [SECURITY](SECURITY.md)。

Use the issue templates and include a revision, environment, reproduction steps, expected behavior and actual result. Redact credentials and personal information. Report vulnerabilities through the [security policy](SECURITY.md).

## 开发流程 / Development

1. 使用 Node.js 24 和 npm，运行 `npm ci`；不要新增其他包管理器锁文件。
2. 阅读 [AGENTS](AGENTS.md) 及[开发流程](docs/DEVELOPMENT.md)，从 `main` 建立独立分支。功能或修复先写简短[任务简报](docs/templates/task-brief.md)，明确范围和验收标准。
3. 保留无关修改。模拟器裁定世界事实；共享类型或 API 改动需核对所有消费者。新的模型调用不能混入默认自动化测试。
4. 执行 `npm run check` 和 `git diff --check`。UI 改动补充浏览器验证；纯文档可仅运行 `npm run docs:check` 和差异检查。
5. 使用 PR 模板，链接简报与[验证报告](docs/templates/validation-report.md)，列出实际结果、未运行项、风险和回退办法。未经实际验证不声称通过。

Use Node.js 24 and npm, work on a focused branch, and preserve unrelated changes. Read the repository rules and development guide before changing code. Run `npm run check` and `git diff --check`; add browser verification for UI changes. Document actual validation and remaining limitations in your PR. Tests must not call paid models.

## 许可与素材 / Licensing

提交你有权提供的内容。你为本项目提供的原创贡献按 [GPL-3.0-only](LICENSE) 许可；引入第三方代码或素材时，保留原许可、作者和来源，并更新 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。社区角色二创必须说明原角色来源，不能仅凭模型文件许可宣称角色设计完全原创。

Only submit material you have the right to contribute. Original contributions are provided under GPL-3.0-only. Preserve upstream licenses and attribution for third-party material, and document asset provenance. Keep discussions respectful and focus reviews on reproducible behavior.
