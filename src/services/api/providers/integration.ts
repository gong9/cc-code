/**
 * Provider 集成模块
 * 
 * 提供与现有 Gong Code 代码的集成点，允许渐进式迁移到多模型架构。
 * 
 * 使用方式：
 * 1. 在项目初始化时调用 `initializeMultiModelSupport()`
 * 2. 使用 `queryWithProvider()` 替代原有的 API 调用
 */

import type { Message, AssistantMessage, StreamEvent as InternalStreamEvent } from '../../../types/message.js'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type { Tool, Tools } from '../../../Tool.js'
import {
  initializeProviderFromEnv,
  getActiveProvider,
  isUsingAnthropic,
  getCurrentProviderName,
} from './config.js'
import type {
  ChatParams,
  ChatResponse,
  StreamEvent,
  UnifiedMessage,
  UnifiedContent,
  UnifiedTool,
} from './types.js'

// 初始化状态
let isInitialized = false

/**
 * 初始化多模型支持
 * 
 * 应在应用启动时调用一次。
 */
export async function initializeMultiModelSupport(): Promise<void> {
  if (isInitialized) {
    return
  }

  await initializeProviderFromEnv()
  isInitialized = true

  const providerName = getCurrentProviderName()
  if (providerName !== 'anthropic') {
    console.log(`[Provider] Using ${providerName} instead of Anthropic`)
  }
}

/**
 * 检查是否应该使用多模型 Provider
 * 
 * 如果用户配置了非 Anthropic 的 Provider，返回 true。
 */
export function shouldUseMultiModelProvider(): boolean {
  // Default to 'minimax' - always use multi-model provider unless explicitly using Anthropic
  const modelProvider = (process.env.MODEL_PROVIDER || 'minimax').toLowerCase()
  return modelProvider !== 'anthropic'
}

/**
 * 将内部消息格式转换为统一格式
 */
export function convertToUnifiedMessages(messages: Message[]): UnifiedMessage[] {
  return messages.map(msg => {
    const role =
      msg.type === 'user'
        ? 'user'
        : msg.type === 'system'
          ? 'system'
          : 'assistant'
    const content = msg.message?.content

    if (typeof content === 'string') {
      return { role, content }
    }

    if (Array.isArray(content)) {
      const unifiedContent: UnifiedContent[] = content.map(c => {
        if (typeof c === 'string') {
          return { type: 'text' as const, text: c }
        }

        const block = c as { 
          type: string
          text?: string
          id?: string
          name?: string
          input?: unknown
          tool_use_id?: string
          content?: unknown
          source?: { type?: string; media_type?: string; data?: string; url?: string }
        }
        
        switch (block.type) {
          case 'text':
            return { type: 'text' as const, text: block.text || '' }
          case 'image':
            // 处理图片内容块
            return {
              type: 'image' as const,
              source: {
                type: (block.source?.type as 'base64' | 'url') || 'base64',
                mediaType: block.source?.media_type,
                data: block.source?.data,
                url: block.source?.url,
              },
            }
          case 'tool_use':
            return {
              type: 'tool_use' as const,
              id: block.id || '',
              name: block.name || '',
              input: (block.input as Record<string, unknown>) || {},
            }
          case 'tool_result':
            return {
              type: 'tool_result' as const,
              toolUseId: block.tool_use_id || '',
              content: typeof block.content === 'string' ? block.content : '',
            }
          default:
            return { type: 'text' as const, text: '' }
        }
      })

      return { role, content: unifiedContent }
    }

    return { role, content: '' }
  })
}

/**
 * 将内部工具格式转换为统一格式
 */
export function convertToUnifiedTools(tools: Tools): UnifiedTool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    inputSchema: {
      type: 'object' as const,
      properties: (tool.inputJSONSchema as { properties?: Record<string, unknown> })?.properties || {},
      required: (tool.inputJSONSchema as { required?: string[] })?.required || [],
    },
  }))
}

/**
 * 将统一响应转换为内部消息格式
 */
export function convertFromUnifiedResponse(response: ChatResponse): Partial<AssistantMessage> {
  const content = response.content.map(c => {
    switch (c.type) {
      case 'text':
        return { type: 'text' as const, text: c.text }
      case 'tool_use':
        return {
          type: 'tool_use' as const,
          id: c.id,
          name: c.name,
          input: c.input,
        }
      case 'thinking':
        return { type: 'thinking' as const, thinking: c.thinking }
      default:
        return { type: 'text' as const, text: '' }
    }
  })

  return {
    type: 'assistant',
    message: {
      id: response.id,
      role: 'assistant',
      content,
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
      },
    },
  }
}

/**
 * 使用多模型 Provider 进行查询
 * 
 * 这是一个高级 API，用于在现有代码中集成多模型支持。
 */
export async function queryWithProvider({
  messages,
  systemPrompt,
  tools,
  model,
  maxTokens,
  signal,
}: {
  messages: Message[]
  systemPrompt?: SystemPrompt
  tools?: Tools
  model?: string
  maxTokens?: number
  signal?: AbortSignal
}): Promise<Partial<AssistantMessage>> {
  await initializeMultiModelSupport()

  const provider = getActiveProvider()

  const params: ChatParams = {
    messages: convertToUnifiedMessages(messages),
    systemPrompt: systemPrompt,
    tools: tools ? convertToUnifiedTools(tools) : undefined,
    model,
    maxTokens,
    signal,
  }

  const response = await provider.chatSync(params)
  return convertFromUnifiedResponse(response)
}

/**
 * 使用多模型 Provider 进行流式查询
 */
export async function* queryWithProviderStreaming({
  messages,
  systemPrompt,
  tools,
  model,
  maxTokens,
  signal,
}: {
  messages: Message[]
  systemPrompt?: SystemPrompt
  tools?: Tools
  model?: string
  maxTokens?: number
  signal?: AbortSignal
}): AsyncGenerator<StreamEvent, void, unknown> {
  await initializeMultiModelSupport()

  const provider = getActiveProvider()

  const params: ChatParams = {
    messages: convertToUnifiedMessages(messages),
    systemPrompt: systemPrompt,
    tools: tools ? convertToUnifiedTools(tools) : undefined,
    model,
    maxTokens,
    signal,
  }

  yield* provider.chat(params)
}

/**
 * 获取当前 Provider 的能力信息
 */
export function getProviderCapabilities() {
  const provider = getActiveProvider()
  return {
    name: provider.name,
    displayName: provider.displayName,
    capabilities: provider.capabilities,
  }
}
