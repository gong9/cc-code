# 多模型适配器 (Multi-Model Providers)

这个模块为 Gong Code 提供了多模型支持能力，允许使用不同的大模型后端。

**默认配置：MiniMax M2.7**

## 支持的模型

| Provider | 模型 | 能力 | 默认 |
|----------|------|------|------|
| `minimax` | MiniMax-M1, M2, **M2.7** | streaming, tool use, thinking (M2.7) | ✅ |
| `minimax` | **abab6.5s**, abab6.5, abab7-preview | streaming, tool use, **vision** | 自动切换 |
| `anthropic` | Claude 4, Claude 3.5, Claude 3 | 完整支持 (streaming, tool use, vision, thinking) | |
| `openai-compat` | GPT-4, GPT-3.5, 及兼容 API | streaming, tool use, vision | |
| `glm` | GLM-4, GLM-5, GLM-4V | streaming, tool use, vision | |

> 💡 **MiniMax Vision 支持**: 当检测到图片时，系统会自动从 M2.7 切换到 abab 系列模型（支持 Vision）。
> 可通过 `MINIMAX_VISION_MODEL` 环境变量指定 Vision 模型（默认：`abab6.5s-chat`）。

## 快速开始

### 1. 环境变量配置

```bash
# 选择 Provider (默认已经是 minimax，可以不设置)
# export MODEL_PROVIDER=minimax  # anthropic | openai-compat | minimax | glm

# MiniMax 配置 (只需设置 API Key，模型默认是 M2.7)
export MINIMAX_API_KEY=your-api-key
# export MINIMAX_MODEL=MiniMax-M2.7  # 可选，默认就是 M2.7

# GLM 配置
export GLM_API_KEY=your-api-key
export GLM_MODEL=glm-4-plus

# OpenAI 兼容配置 (如 OneAPI, LiteLLM)
export OPENAI_BASE_URL=https://your-proxy.com/v1
export OPENAI_API_KEY=your-api-key
export OPENAI_MODEL=gpt-4o
```

### 2. 配置文件 (`~/.gong/settings.json`)

```json
{
  "modelProvider": "minimax",
  "minimax": {
    "apiKey": "your-api-key",
    "model": "MiniMax-M2.7",
    "baseUrl": "https://api.minimaxi.com/v1"
  }
}
```

或使用 OpenAI 兼容模式连接其他服务：

```json
{
  "modelProvider": "openai-compat",
  "openaiCompat": {
    "baseUrl": "https://your-oneapi.com/v1",
    "apiKey": "sk-xxx",
    "model": "claude-3-sonnet"
  }
}
```

## 代码使用

```typescript
import {
  initializeProviderFromEnv,
  getActiveProvider,
  isUsingAnthropic,
} from './providers'

// 初始化 (根据环境变量自动选择 Provider)
await initializeProviderFromEnv()

// 获取当前 Provider
const provider = getActiveProvider()

// 检查能力
if (provider.capabilities.toolUse) {
  console.log('支持工具调用')
}

// 发送请求
const response = await provider.chatSync({
  messages: [{ role: 'user', content: 'Hello!' }],
  systemPrompt: 'You are a helpful assistant.',
  maxTokens: 1000,
})

console.log(response.content)
```

### 流式请求

```typescript
const provider = getActiveProvider()

for await (const event of provider.chat({
  messages: [{ role: 'user', content: 'Write a story' }],
  maxTokens: 2000,
})) {
  if (event.type === 'content_block_delta' && event.delta?.text) {
    process.stdout.write(event.delta.text)
  }
}
```

### 工具调用

```typescript
const response = await provider.chatSync({
  messages: [{ role: 'user', content: 'What is 2+2?' }],
  tools: [{
    name: 'calculator',
    description: 'Perform calculations',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string' }
      },
      required: ['expression']
    }
  }],
})

// 检查是否有工具调用
const toolUses = response.content.filter(c => c.type === 'tool_use')
```

## 自定义适配器

你可以通过继承 `BaseAdapter` 来添加新的模型支持：

```typescript
import { BaseAdapter, ProviderCapabilities, ChatParams, ChatResponse, StreamEvent } from './providers'

export class MyModelAdapter extends BaseAdapter {
  readonly name = 'my-model'
  readonly displayName = 'My Custom Model'
  
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: false,
    thinking: false,
    systemPrompt: true,
  }

  async *chat(params: ChatParams): AsyncGenerator<StreamEvent> {
    // 实现流式请求
  }

  async chatSync(params: ChatParams): Promise<ChatResponse> {
    // 实现非流式请求
  }
}

// 注册适配器
import { registerProvider } from './providers'
registerProvider(new MyModelAdapter())
```

## 注意事项

1. **Tool Use 兼容性**：不同模型的 Function Calling 格式略有差异，适配器会自动转换
2. **Thinking 能力**：仅 Claude 和 MiniMax M2.7 支持扩展思考，其他模型会忽略此配置
3. **Vision 能力**：需要确认目标模型是否支持图片输入
4. **Token 计算**：不同模型的 tokenizer 不同，token 计数可能有差异

## 文件结构

```
providers/
├── types.ts              # 类型定义
├── registry.ts           # Provider 注册中心
├── config.ts             # 配置解析
├── BaseAdapter.ts        # 适配器基类
├── AnthropicAdapter.ts   # Anthropic 适配器
├── OpenAICompatAdapter.ts # OpenAI 兼容适配器
├── MiniMaxAdapter.ts     # MiniMax 适配器
├── GLMAdapter.ts         # GLM 适配器
├── index.ts              # 统一导出
└── README.md             # 本文档
```
