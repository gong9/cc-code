# GONG.md

This file provides guidance to Gong Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
# 安装依赖
bun install

# 开发模式
bun run dev                    # 等同于 bun run src/entrypoints/cli.tsx
echo "hello" | bun run dev -p   # Pipe 模式

# 构建
bun run build                   # 构建到 dist/cli.js (~25MB)

# 代码检查与格式化
bun run lint                    # Biome 检查
bun run lint:fix               # 自动修复
bun run format                  # 格式化

# 测试
bun test                        # 运行测试

# 文档 (VitePress)
bun run docs:dev                # 开发服务器
bun run docs:build              # 构建文档
```

## 架构概述

### 入口与启动

1. **`src/entrypoints/cli.tsx`** — 真正入口，注入了运行时 polyfill:
   - `feature()` 始终返回 `false`（所有特性开关被禁用）
   - `globalThis.MACRO` — 模拟构建时宏注入 (VERSION, BUILD_TIME)
   - `BUILD_TARGET`, `BUILD_ENV`, `INTERFACE_TYPE` 全局变量

2. **`src/main.tsx`** — Commander.js CLI 定义，解析参数并启动 REPL

### 核心循环

- **`src/query.ts`** — API 查询函数，发送消息到 Claude，处理工具调用和流式响应
- **`src/QueryEngine.ts`** — 高级封装，管理会话状态、压缩、文件历史快照
- **`src/screens/REPL.tsx`** — 交互式 REPL 界面（React/Ink）

### API 层

- **`src/services/api/claude.ts`** — 核心 API 客户端，支持多 provider (Anthropic, AWS Bedrock, Google Vertex, Azure)
- Provider 选择在 `src/utils/model/providers.ts`

### 工具系统

- **`src/Tool.ts`** — 工具接口定义
- **`src/tools.ts`** — 工具注册表
- **`src/tools/<ToolName>/`** — 每个工具独立目录 (BashTool, FileEditTool, GrepTool, AgentTool 等)

### UI 层 (Ink)

- **`src/ink.ts`** — Ink 渲染封装
- **`src/components/`** — React 组件 (App.tsx, Messages.tsx, PromptInput 等)
- 使用 React Compiler runtime (`react/compiler-runtime`)

### 状态管理

- **`src/state/AppState.tsx`** — 中央应用状态类型和 context provider
- **`src/state/store.ts`** — Zustand 风格 store
- **`src/bootstrap/state.ts`** — 模块级单例 (session ID, CWD, project root)

### 特性开关

所有 `feature('FLAG_NAME')` 调用来自 `bun:bundle`。在 `cli.tsx` 中被 polyfill 为始终返回 `false`。这意味着 COORDINATOR_MODE, KAIROS, PROACTIVE 等实验性功能都不可用。

### 重要提示

- **不要尝试修复所有 tsc 错误** — 这些来自反编译，不影响运行时
- **`feature()` 始终返回 `false`** — 特性开关后的代码都是死代码
- **React Compiler 输出** — 组件有反编译的 memoization 样板 (`_c()` 调用)，这是正常的
- **`src/` 路径别名** — tsconfig 映射 `src/*` 到 `./src/*`
