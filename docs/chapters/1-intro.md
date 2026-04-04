# 第 1 章：项目概览与设计思想

## 什么是 Gong Code

Gong Code 是一个终端 AI 编程助手，基于多模型 Provider 架构，支持 Anthropic、MiniMax、GLM、OpenAI 兼容等多种大模型。通过统一的消息格式和工具抽象，提供了可扩展的 Agent 系统，能够在终端环境中完成代码编写、文件操作、Bash 命令执行等复杂任务。

## 核心设计哲学

### 1. Provider 抽象 — 多模型支持

Gong Code 的 API 层通过 `ModelProvider` 接口实现多模型支持。这个接口定义了统一的消息格式 `UnifiedMessage`、工具格式 `UnifiedTool`、流式事件 `StreamEvent`，使得新增 Provider 只需要实现接口而不需要改变上层逻辑。

```typescript
// src/services/api/providers/types.ts
export interface ModelProvider {
  readonly name: string
  readonly displayName: string
  readonly capabilities: ProviderCapabilities

  // 流式请求
  chat(params: ChatParams): AsyncGenerator<StreamEvent, void, unknown>

  // 非流式请求
  chatSync(params: ChatParams): Promise<ChatResponse>

  // 验证 API Key
  validateApiKey?(apiKey: string): Promise<boolean>

  // 获取可用模型
  listModels?(): Promise<string[]>
}
```

Provider 配置通过 `providers.json` 文件管理，支持默认 Provider 设置和模型参数配置。在 `cli.tsx` 入口处通过 `loadProviderConfig()` 函数加载配置：

```typescript
// src/entrypoints/cli.tsx
function loadProviderConfig(): void {
    const configPath = join(configDir, 'providers.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const defaultProvider = config.defaultProvider || 'minimax';
    process.env.MODEL_PROVIDER = defaultProvider;
}
```

### 2. 工具抽象 — 可扩展工具系统

Gong Code 的工具系统通过 `Tool` 接口实现，每个工具是独立模块，包含输入验证、权限检查、进度报告、渲染逻辑等完整功能。

```typescript
// src/Tool.ts
export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  readonly name: string
  readonly inputSchema: Input

  // 核心执行方法
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>

  // 权限检查
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionResult>

  // UI 渲染
  renderToolResultMessage?(content: Output, ...): React.ReactNode
  renderToolUseMessage(input: Partial<z.infer<Input>>, ...): React.ReactNode
}
```

工具目录结构清晰，每个工具独立目录：

```
src/tools/
  BashTool/       # Bash 命令执行
  FileEditTool/   # 文件编辑
  FileReadTool/   # 文件读取
  GlobTool/       # 文件搜索
  GrepTool/       # 内容搜索
  AgentTool/      # 子 Agent
  MCPTool/        # MCP 协议工具
  ...
```

### 3. 状态分离 — 会话状态 vs 应用状态

Gong Code 严格区分两种状态：

**Bootstrap 状态** (`src/bootstrap/state.ts`) — 模块级单例，存储会话级别信息：
- `sessionId` — 每次启动生成唯一 UUID
- `projectRoot` — 项目根目录（启动时固定）
- `cwd` — 当前工作目录
- `modelUsage` — Token 使用量统计

```typescript
// src/bootstrap/state.ts
const STATE: State = getInitialState()

export function getSessionId(): SessionId {
  return STATE.sessionId
}

export function getProjectRoot(): string {
  return STATE.projectRoot
}
```

**AppState** (`src/state/AppState.tsx`) — React Context 管理的响应式状态：
- UI 相关状态（主题、verbose 模式）
- 权限上下文
- 消息历史
- 文件状态缓存

```typescript
// src/state/AppState.tsx
export type AppState = {
  theme: ThemeName
  verbose: boolean
  toolPermissionContext: ToolPermissionContext
  messages: Message[]
  fileHistory: FileHistoryState
  attribution: AttributionState
}
```

这种分离确保了：
- Bootstrap 状态在模块加载时初始化，整个会话生命周期内保持稳定
- AppState 可以响应式更新，UI 自动重渲染
- 状态更新有明确的更新源，避免意外修改

## 整体架构图

```mermaid
flowchart TB
    subgraph Entry["入口层"]
        CLI[cli.tsx] --> MAIN[main.tsx]
        MAIN --> REPLL[replLauncher.tsx]
        REPLL --> INK[ink.ts render()]
    end

    subgraph Core["Agent 核心"]
        QE[QueryEngine]
        QE --> QM[query.ts]
        QM --> QMW[queryModelWithStreaming]
    end

    subgraph Provider["Provider 层"]
        QMW --> ANTH[Anthropic Provider]
        QMW --> MINI[MiniMax Provider]
        QMW --> GLM[GLM Provider]
        QMW --> OAI[OpenAI 兼容 Provider]
    end

    subgraph Tool["工具层"]
        QE --> TE[toolExecution.ts]
        TE --> STE[StreamingToolExecutor]
        STE --> TB[BashTool]
        STE --> TFE[FileEditTool]
        STE --> TFR[FileReadTool]
        STE --> TAG[AgentTool]
        STE --> TMC[MCP Tool]
    end

    subgraph UI["UI 层"]
        INK --> APP[App.tsx]
        APP --> REPL[REPL.tsx]
        REPL --> MSG[Messages.tsx]
        REPL --> INP[PromptInput.tsx]
    end

    Entry --> Core
    Core --> Provider
    Core --> Tool
    Tool --> UI

    style Entry fill:#e1f5ff
    style Core fill:#fff3e0
    style Provider fill:#e8f5e9
    style Tool fill:#fce4ec
    style UI fill:#f3e5f5
```

> **图 1.1: Gong Code 整体架构图** — 来源：[src/entrypoints/cli.tsx:1](https://github.com/gongzhen/2026/claude-code/blob/main/src/entrypoints/cli.tsx)

## 关键路径

### 启动路径

```
cli.tsx → main.tsx → replLauncher.tsx → ink.ts → render()
```

1. **`cli.tsx`** (`src/entrypoints/cli.tsx`) — 真正入口
   - 加载 Provider 配置
   - 注入 `feature()` polyfill（始终返回 `false`）
   - 注入 `globalThis.MACRO`（VERSION, BUILD_TIME）

2. **`main.tsx`** (`src/main.tsx`) — Commander.js CLI 定义
   - 解析命令行参数
   - 初始化 telemetry
   - 调用 `launchRepl()`

3. **`replLauncher.tsx`** (`src/replLauncher.tsx`) — REPL 启动器
   - 动态导入 `App` 和 `REPL` 组件
   - 调用 `renderAndRun(root, <App><REPL /></App>)`

4. **`ink.ts`** (`src/ink.ts`) — Ink 渲染封装
   - `render(node)` 调用 Ink 的 `createRoot()`
   - 使用 `ThemeProvider` 包装所有组件

### 查询路径

```
QueryEngine.submitMessage() → query() → queryModelWithStreaming() → Provider.chat()
```

1. **`QueryEngine.submitMessage()`** (`src/QueryEngine.ts`)
   - 管理会话状态（消息历史、Token 使用量）
   - 调用 `processUserInput()` 处理用户输入
   - 调用 `query()` 执行 API 请求

2. **`query()`** (`src/query.ts`)
   - 构建系统提示词
   - 管理工具调用循环
   - 处理流式响应事件

3. **`queryModelWithStreaming()`** — 封装 Provider 调用
   - 将用户消息转为 `UnifiedMessage` 格式
   - 调用 `Provider.chat()` 获取流式响应

4. **`Provider.chat()`** — 具体 Provider 实现
   - `AnthropicProvider` — 使用 `@anthropic-ai/sdk`
   - `MiniMaxProvider` — 使用 Anthropic 协议，baseUrl 指向 MiniMax
   - `GLMProvider` — 兼容 OpenAI 协议
   - `OpenAICompatProvider` — 兼容任意 OpenAI 兼容 API

### 工具路径

```
QueryEngine → toolExecution.ts → StreamingToolExecutor → Tool.call()
```

1. **`toolExecution.ts`** — 工具执行编排层
   - 管理工具并发执行
   - 处理进度事件流
   - 协调权限检查

2. **`StreamingToolExecutor`** — 流式工具执行器
   - 实时输出工具执行进度
   - 支持长时间运行的工具（如 Bash）
   - 管理工具中断逻辑

3. **`Tool.call()`** — 具体工具实现
   - 接收 `ToolUseContext` 访问状态
   - 通过 `onProgress` 回调报告进度
   - 返回 `ToolResult` 包含执行结果和新消息

```typescript
// 工具调用示例
async call(
  args: z.infer<Input>,
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  parentMessage: AssistantMessage,
  onProgress?: ToolCallProgress<P>,
): Promise<ToolResult<Output>> {
  // 1. 权限检查
  const permission = await canUseTool(this, args, context)

  // 2. 执行工具逻辑
  const result = await this.execute(args, context, onProgress)

  // 3. 返回结果
  return { data: result }
}
```

## 总结

Gong Code 的架构围绕三个核心抽象展开：

1. **Provider 抽象** 使得多模型支持成为可能，业务层无需关心具体使用哪个模型
2. **工具抽象** 通过统一接口实现了工具的可插拔架构，每个工具独立完整
3. **状态分离** 明确了哪些状态是会话级别稳定存在的，哪些是需要响应式更新的

下一章我们将深入分析启动流程，从 `cli.tsx` 到 `main.tsx` 再到 REPL 渲染的全过程。

> **交叉引用**: 工具执行详见 [第 6 章：工具执行与权限系统](./6-tool-execution.md)；沙箱安全详见 [第 7 章：沙箱与安全系统](./7-sandbox.md)。
