# 术语表

| 术语 | 定义 | 章节 |
|------|------|------|
| Provider | 模型 API 抽象层，通过统一接口支持多种大模型（Anthropic、MiniMax、GLM、OpenAI 兼容） | 第 3 章 |
| ModelProvider | Provider 接口定义，包含 `chat()`、`chatSync()` 等核心方法 | 第 3 章 |
| ProviderRegistry | Provider 注册中心单例，管理所有 Provider 的注册和获取 | 第 3 章 |
| StreamEvent | 统一流式事件格式，用于 Provider 到 UI 的事件流转 | 第 3 章 |
| QueryEngine | 会话级状态管理器，管理消息历史、Token 使用量、文件缓存等 | 第 4 章 |
| Query Loop | 查询循环核心引擎，处理多轮对话、工具调用、上下文压缩 | 第 4 章 |
| StreamingToolExecutor | 流式工具执行器，支持在 API 流式输出时就开始执行工具 | 第 4 章 / 第 6 章 |
| State | 查询循环的跨迭代状态类型，包含 messages、turnCount、transition 等 | 第 4 章 |
| transition | 查询循环的继续原因枚举，记录上一次迭代为何继续 | 第 4 章 |
| AutoCompact | 自动摘要压缩，在上下文达到 13k Token 阈值时触发 | 第 4 章 / 第 5 章 |
| Microcompact | 每轮轻量截断，清理超过限制的旧工具结果 | 第 5 章 |
| History Snip | 僵尸消息移除，删除孤儿 tool_result 消息对 | 第 5 章 |
| compact_boundary | 压缩边界消息类型，标记上下文压缩操作 | 第 5 章 |
| Transcript | 会话持久化记录，写入 session.jsonl 支持 resume | 第 5 章 |
| File History | 文件历史快照，记录会话中每个被操作文件的快照 | 第 5 章 |
| Tool | 工具接口定义，包含 name、inputSchema、call()、checkPermissions() 等 | 第 6 章 |
| ToolUseContext | 工具执行时的完整环境快照，包含 abortController、messages 等 | 第 6 章 |
| PermissionResult | 权限决策结果类型，behavior 可为 allow/deny/ask/passthrough | 第 6 章 |
| Sandbox | 基于 Linux namespace 和 bubblewrap 的隔离执行环境 | 第 7 章 |
| Bubblewrap | Linux 沙箱工具，用于创建轻量级命名空间隔离 | 第 7 章 |
| MCP | Model Context Protocol，多工具服务器通信协议 | 第 7 章 |
| Bootstrap State | 模块级单例，管理 sessionId、cost、cwd 等会话元数据 | 第 8 章 |
| AppState | React Context 管理的响应式状态，包含 theme、messages 等 | 第 8 章 |
| Store | Zustand 风格的不可变状态容器，提供 getState/setState/subscribe | 第 8 章 |
| feature() | 特性开关函数，在构建时被 bun:bundle 替换，运行时始终返回 false | 第 2 章 |
| MACRO | 全局变量，注入构建时常量（VERSION、BUILD_TIME 等） | 第 2 章 |
| Polyfill | 运行时填充物，为反编译产物提供缺失的函数实现 | 第 2 章 |
