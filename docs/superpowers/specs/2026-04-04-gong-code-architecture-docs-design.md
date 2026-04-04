# Gong Code 技术文档网站设计

## 概述

为 Gong Code 项目创建一个详细的技术文档网站，目标读者是**中级开发者**，让他们能够理解核心架构后自己实现一个类似的 CLI 项目。

## 文档特点

- **图表为主**：每个核心流程都有架构图、时序图、流程图
- **链路完整**：从入口到执行的完整代码追踪
- **重点突出**：Agent 编排（查询循环、会话压缩、工具执行、沙箱安全）为核心，UI 为辅助

---

## 文档结构（8 章）

### 第 1 章：项目概览与设计思想

**内容：**
- Gong Code 是什么（终端 AI 编程助手）
- 解决什么问题
- 核心设计哲学：
  - Provider 抽象（多模型支持）
  - 工具抽象（可扩展工具系统）
  - 状态分离（会话状态 vs 应用状态）
- 整体架构图

**配图：**
- 整体架构图（入口 → Agent Core → Provider → Tools → UI）

---

### 第 2 章：入口与启动流程

**内容：**
- `cli.tsx` 的 polyfill 系统
  - feature() 始终返回 false（特性开关）
  - globalThis.MACRO 注入（VERSION, BUILD_TIME）
  - 加载 ~/.gong/providers.json
- `main.tsx` 的 Commander.js CLI 定义
- REPL 启动流程：`replLauncher.tsx` → `ink.ts` → `render()`

**配图：**
- 启动流程时序图
- Polyfill 注入时机图

---

### 第 3 章：API 多 Provider 架构

**内容：**
- ProviderRegistry 单例模式
- Provider 接口定义（chat, chatSync, capabilities）
- 适配器模式：
  - MiniMaxAdapter（默认，100 万上下文）
  - GLMAdapter
  - OpenAICompatAdapter
  - AnthropicAdapter
- 事件格式转换（Provider → Anthropic SDK 格式）
- 流式事件类型（message_start, content_block_delta, message_delta, message_stop）

**配图：**
- Provider 架构图
- 事件流转换图
- API 调用时序图

---

### 第 4 章：Agent 编排核心 - 查询循环

**内容：**
- QueryEngine 与 Query 的职责划分
- Query.ts 状态机定义
- Pre-query 压缩管道：
  - applyToolResultBudget()
  - microcompact()
  - autocompact()
- API 流式调用 loopModelWithStreaming()
- 错误恢复：
  - 529 错误回退（max_output_tokens 升级）
  - prompt_too_long 处理（context collapse）
  - 模型回退（FallbackTriggeredError）

**配图：**
- 查询循环流程图
- 压缩管道示意图
- 错误恢复决策树

---

### 第 5 章：Agent 编排核心 - 会话与压缩

**内容：**
- QueryEngine 状态管理：
  - mutableMessages（可变消息队列）
  - permissionDenials（权限拒绝记录）
  - totalUsage（用量追踪）
  - readFileState（文件状态缓存）
- Transcript 持久化（recordTranscript）
- File History 快照（fileHistoryMakeSnapshot）
- 多级压缩机制：
  - Microcompact（每轮轻量截断）
  - Autocompact（自动摘要，阈值 13k tokens）
  - History Snip（移除僵尸消息）
- Compact 边界检测（compact_boundary 消息）

**配图：**
- 会话状态管理图
- 多级压缩流程图
- 消息生命周期图

---

### 第 6 章：Agent 编排核心 - 工具执行

**内容：**
- Tool 接口定义（name, inputSchema, call, description, isConcurrencySafe）
- ToolUseContext 上下文（abortController, getAppState, handleElicitation 等）
- 工具注册表（getAllBaseTools）
- StreamingToolExecutor 并发控制：
  - Concurrency-safe 工具并行（最多 10 个）
  - 非并发安全工具串行执行
  - Sibling abort（一个工具失败杀死同级工具）
- 权限解析流程：
  - hook 优先级最高
  - rule 规则匹配
  - classifier 分类器（auto 模式）
  - mode 权限模式（default/auto/plan/bypass）
- Pre/Post Tool Hooks
- 进度追踪（ToolProgressData）

**配图：**
- 工具执行时序图
- 并发控制流程图
- 权限决策流程图

---

### 第 7 章：沙箱与安全系统

**内容：**
- @anthropic-ai/sandbox-runtime 集成
- shouldUseSandbox() 判断逻辑
- BashTool 安全检查：
  - 不完整命令检测
  - 命令替换检测（$(), ${}`, <()`, `>()`）
  - Zsh 危险命令黑名单
  - 混淆检测（ID 检查）
- 限制配置：
  - FsReadRestrictionConfig（读路径白名单）
  - FsWriteRestrictionConfig（写路径白名单）
  - NetworkRestrictionConfig（网络访问控制）
  - allowedDomains（WebFetch 域名白名单）
- MCP 集成：
  - MCPClient 多传输支持（stdio/SSE/HTTP/WebSocket）
  - 工具命名规范（mcp__<serverName>__<toolName>）
  - 认证错误处理

**配图：**
- 沙箱执行流程图
- 安全检查层级图
- MCP 传输架构图

---

### 第 8 章：状态管理

**内容：**
- Bootstrap 状态（src/bootstrap/state.ts）：
  - 模块级单例 STATE
  - SessionId 管理（getSessionId, regenerateSessionId, switchSession）
  - Cost 追踪
  - Beta header latches
- AppState（src/state/AppState.tsx）：
  - React Context Provider
  - ThemeProvider 包装
  - MailboxProvider 包装
- Store 模式（src/state/store.ts）：
  - getState / setState / subscribe
  - Zustand 风格的不可变更新
- State 初始化流程

**配图：**
- 状态管理层次图
- State 初始化时序图

---

## 技术栈

- **VitePress**：文档框架
- **Mermaid**：流程图、时序图
- **代码高亮**：使用 highlight.js

## 文档路径

```
docs/
├── .vitepress/
│   └── config.ts
├── index.md
├── chapter1-intro.md
├── chapter2-entry.md
├── chapter3-provider.md
├── chapter4-query-loop.md
├── chapter5-session.md
├── chapter6-tool-execution.md
├── chapter7-sandbox.md
└── chapter8-state.md
```

## 实现顺序

1. 搭建 VitePress 基本结构
2. 实现第 1-2 章（入口、启动）
3. 实现第 3 章（Provider）
4. 实现第 4-6 章（Agent 编排核心）
5. 实现第 7 章（沙箱安全）
6. 实现第 8 章（状态管理）
7. 添加图注和交叉引用

---

## 成功标准

- 读者能说出 Gong Code 的完整请求链路
- 读者能自己实现一个最小化的 Agent CLI
- 读者理解 Provider 适配器模式
- 读者理解工具系统的扩展方式
- 读者理解沙箱安全的实现原理
