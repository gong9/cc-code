# 更新日志

本文档记录项目的主要版本变更。

## [0.1.12] - 2026-04-07

### 新增
+ 🚀 新增 AIHubMix 模型聚合平台支持
+ 支持多步骤配置流程：选择 AIHubMix → 输入 API Key → 选择模型分类 → 选择具体模型
+ 支持 GPT-5.x、Claude 4.x、Gemini 3.x、DeepSeek 等最新模型
+ 新增免费模型分类（GPT-4.1、Gemini 3 Flash 等）
+ 支持自定义模型 ID 输入

### 修复
+ 🐛 修复 AIHubMix 配置重启后丢失的问题
+ 🐛 修复 OpenAI 兼容 API 空 assistant 消息导致的错误

## [0.1.10] - 2026-04-07

### 修复
+ 🐛 修复第三方 Provider（MiniMax/Qwen/GLM）401 认证错误无限重试的问题
+ 🔧 优化 Provider 选择界面，移除默认选中的绿色勾号

## [0.1.9] - 2026-04-07

### 新增
+ 🤖 新增 Qwen（通义千问）模型适配器支持
+ Provider 选择界面新增 Qwen 选项
+ QwenAdapter 调试日志集成项目日志系统

### 修复
+ 🐛 修复第三方 Provider（Qwen/GLM）工具调用不执行的问题
+ 🐛 修复版本号显示不正确的问题（动态读取 package.json）
+ 🐛 修复流式响应可能重复发送停止事件的问题

### 变更
+ 优化 queryModelWithProvider 正确传递 tool_use 给 UI
+ 更新类型定义和配置文件

## [0.1.6] - 2026-04-04

### 新增
+ 🐱 可爱小猫 Loading 动画：`(=^ω^=)` 表情动画
+ 中文化 Loading 动词：思考、喵喵、敲代码、摸鱼等趣味表达
+ 中文交互提示：登录成功、退出登录、恢复会话等

### 变更
+ 简化退出逻辑：`/logout` 改为清除 API Key 配置
+ 移除 OAuth 相关的复杂退出流程
+ Provider 选择界面优化：只保留 MiniMax，显示 API Key 获取地址

### 修复
+ 修复 `clearAuthRelatedCaches` 导出缺失问题

## [0.1.5] - 2026-04-04

### 变更
+ 品牌重塑：将产品名从 "Claude Code" 更名为 "Gong Code"
+ 替换 Logo 为可爱小猫 ASCII 艺术 🐱
+ CLI 命令名从 `claude` 更改为 `gong-code`
+ MCP 客户端标识更新为 `gong-code`
+ 更新系统提示词以反映新品牌

### 保留
+ 环境变量 `CLAUDE_CODE_*` 保持不变（向后兼容）
+ 配置路径 `.claude/` 保持不变（向后兼容）

## [0.1.4] - 2026-04-04

### 新增
+ 新增 MiniMax 图片输入支持，并增强流式事件兼容性。
+ 新增 VitePress 文档脚本和构建后清理 URL 的脚本。
+ 新增插件市场对 npm 包地址的解析与安装支持。

### 变更
+ 将文档工具链从 Mintlify 迁移到 VitePress，并移除旧文档资源。
+ 社区版禁用了 Anthropic 专用的 GCS 市场拉取和策略限制，简化插件市场流程。
+ 调整插件市场启动与刷新逻辑，改为依赖用户自行配置的来源。
+ 补充 `CLAUDE.md` 中的项目常用命令说明。

### 修复
+ 修复 MiniMax Provider 事件转换逻辑，确保响应能在界面中正确渲染。
+ 在社区版中禁用 Web Fetch 域名黑名单预检查。

## [0.1.3] - 2026-04-04

### 新增
+ 初始基础版本。
