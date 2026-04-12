# 更新日志

本文档记录项目的主要版本变更。

## [0.1.14] - 2026-04-12

### 新增
+ 🤖 **GLM 模型自动选择**：根据消息内容自动选择最合适的模型
  - 普通文本 → `glm-5.1`（最新旗舰，Coding 对齐 Claude Opus 4.6）
  - 包含图片 → `glm-5v-turbo`（多模态模型）
+ 📋 更新 GLM 模型列表，新增 GLM-5.1、GLM-5V-Turbo、GLM-4.7-Flash 等最新模型
+ 🔧 新增 `parseToolCallArguments()` 统一方法处理工具调用参数解析

### 修复
+ 🐛 **修复非 Claude 模型工具调用失败的问题**
  - 根本原因：`convertToUnifiedTools` 未将 Zod schema 转换为 JSON Schema
  - 修复后：正确调用 `zodToJsonSchema()` 转换，工具定义包含完整的 `properties` 和 `required`
+ 🔧 增强 JSON 解析健壮性：新增 `tryFixToolCallJson()` 处理尾部逗号、缺失括号等问题
+ 🔧 新增工具参数别名修复：支持 `cmd → command`、`path → file_path` 等常见别名转换
+ 🐛 修复 `OpenAICompatAdapter.ts` 代码缩进异常

### 优化
+ ♻️ 简化 GLMAdapter 的 `required` 字段逻辑，移除不准确的推断代码
+ ♻️ 统一 4 个适配器（GLM/Qwen/MiniMax/OpenAI）的 JSON 解析逻辑到 BaseAdapter
+ 📝 添加别名转换日志记录，便于分析模型行为
+ 🎯 改进视觉模型检测：使用明确的模型列表匹配，避免误判

## [0.1.13] - 2026-04-08

### 修复
+ 🐱 优化 Loading 小猫动画节奏，降低切换频率并平滑表情切换，减少抖动感。
+ 🔄 改进 REPL 加载反馈，区分“输出中”和“处理中”，避免流式文本出现后误以为任务已结束。
+ 📏 明确 spinner 中 token 为估算值，避免与真实计费用量混淆。
+ 🔌 修复 OpenAI 兼容 Provider 的流式 usage 回填，支持在兼容接口返回 usage 时显示更准确的 token 数据，并对不支持 `include_usage` 的服务自动回退。

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
