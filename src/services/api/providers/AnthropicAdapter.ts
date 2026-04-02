/**
 * Anthropic API 适配器
 * 
 * 封装现有的 Anthropic SDK 调用逻辑，实现 ModelProvider 接口。
 * 这是默认的适配器，保持与现有代码的完全兼容。
 */

import type Anthropic from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { BaseAdapter } from './BaseAdapter.js'
import type {
  ChatParams,
  ChatResponse,
  ProviderCapabilities,
  StreamEvent,
  UnifiedContent,
  UnifiedMessage,
  UnifiedTool,
} from './types.js'
import { ProviderError } from './types.js'

/**
 * Anthropic 适配器
 * 
 * 将统一接口转换为 Anthropic SDK 调用。
 */
export class AnthropicAdapter extends BaseAdapter {
  readonly name = 'anthropic'
  readonly displayName = 'Anthropic Claude'

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    thinking: true,
    systemPrompt: true,
    maxContextLength: 200_000,
    maxOutputTokens: 128_000,
  }

  private client: Anthropic | null = null

  constructor(config: {
    apiKey?: string
    baseUrl?: string
    model?: string
    timeout?: number
    maxRetries?: number
  } = {}) {
    super(config)
    this.model = config.model ?? 'claude-sonnet-4-20250514'
  }

  /**
   * 获取或创建 Anthropic 客户端
   */
  private async getClient(): Promise<Anthropic> {
    if (this.client) {
      return this.client
    }

    // 动态导入以减少启动时间
    const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
    
    this.client = new AnthropicSDK({
      apiKey: this.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: this.baseUrl || process.env.ANTHROPIC_BASE_URL,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
    })

    return this.client
  }

  /**
   * 将统一消息转换为 Anthropic 格式
   */
  private toAnthropicMessages(messages: UnifiedMessage[]): BetaMessageParam[] {
    return messages
      .filter(msg => msg.role !== 'system') // Anthropic 的 system 是单独参数
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: this.toAnthropicContent(msg.content),
      }))
  }

  /**
   * 将统一内容转换为 Anthropic 格式
   */
  private toAnthropicContent(
    content: string | UnifiedContent[]
  ): string | BetaContentBlock[] {
    if (typeof content === 'string') {
      return content
    }

    return content.map(c => {
      switch (c.type) {
        case 'text':
          return { type: 'text' as const, text: c.text }
        case 'image':
          return {
            type: 'image' as const,
            source: {
              type: c.source.type as 'base64',
              media_type: (c.source.mediaType || 'image/png') as 'image/png',
              data: c.source.data || '',
            },
          }
        case 'tool_use':
          return {
            type: 'tool_use' as const,
            id: c.id,
            name: c.name,
            input: c.input,
          }
        case 'tool_result':
          return {
            type: 'tool_result' as const,
            tool_use_id: c.toolUseId,
            content:
              typeof c.content === 'string'
                ? c.content
                : this.toAnthropicContent(c.content),
            is_error: c.isError,
          }
        case 'thinking':
          return {
            type: 'thinking' as const,
            thinking: c.thinking,
          }
        default:
          return { type: 'text' as const, text: '' }
      }
    }) as BetaContentBlock[]
  }

  /**
   * 将统一工具转换为 Anthropic 格式
   */
  private toAnthropicTools(tools: UnifiedTool[]): BetaToolUnion[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as BetaToolUnion['input_schema'],
    }))
  }

  /**
   * 将 Anthropic 响应转换为统一格式
   */
  private fromAnthropicContent(content: BetaContentBlock[]): UnifiedContent[] {
    return content.map(c => {
      switch (c.type) {
        case 'text':
          return { type: 'text' as const, text: c.text }
        case 'tool_use':
          return {
            type: 'tool_use' as const,
            id: c.id,
            name: c.name,
            input: c.input as Record<string, unknown>,
          }
        case 'thinking':
          return {
            type: 'thinking' as const,
            thinking: (c as { thinking: string }).thinking,
          }
        default:
          return { type: 'text' as const, text: '' }
      }
    })
  }

  /**
   * 流式 Chat 请求
   */
  async *chat(params: ChatParams): AsyncGenerator<StreamEvent, void, unknown> {
    const client = await this.getClient()
    const model = params.model || this.model || 'claude-sonnet-4-20250514'

    try {
      const response = await client.messages.stream({
        model,
        max_tokens: params.maxTokens || 8192,
        messages: this.toAnthropicMessages(params.messages),
        system: this.systemPromptToString(params.systemPrompt),
        tools: params.tools ? this.toAnthropicTools(params.tools) : undefined,
        temperature: params.temperature,
        top_p: params.topP,
        stop_sequences: params.stopSequences,
      })

      for await (const event of response) {
        yield this.convertStreamEvent(event)
      }
    } catch (error) {
      throw this.wrapError(error, 'Anthropic API request failed')
    }
  }

  /**
   * 转换流式事件
   */
  private convertStreamEvent(event: unknown): StreamEvent {
    const e = event as {
      type: string
      index?: number
      content_block?: unknown
      delta?: unknown
      message?: unknown
      usage?: unknown
    }

    switch (e.type) {
      case 'message_start':
        return {
          type: 'message_start',
          message: e.message as Partial<ChatResponse>,
        }
      case 'content_block_start':
        return {
          type: 'content_block_start',
          index: e.index,
          contentBlock: e.content_block as Partial<UnifiedContent>,
        }
      case 'content_block_delta':
        return {
          type: 'content_block_delta',
          index: e.index,
          delta: e.delta as StreamEvent['delta'],
        }
      case 'content_block_stop':
        return {
          type: 'content_block_stop',
          index: e.index,
        }
      case 'message_delta':
        return {
          type: 'message_delta',
          usage: e.usage as Partial<ChatResponse['usage']>,
        }
      case 'message_stop':
        return { type: 'message_stop' }
      default:
        return { type: 'message_stop' }
    }
  }

  /**
   * 非流式 Chat 请求
   */
  async chatSync(params: ChatParams): Promise<ChatResponse> {
    const client = await this.getClient()
    const model = params.model || this.model || 'claude-sonnet-4-20250514'

    try {
      const response = await client.messages.create({
        model,
        max_tokens: params.maxTokens || 8192,
        messages: this.toAnthropicMessages(params.messages),
        system: this.systemPromptToString(params.systemPrompt),
        tools: params.tools ? this.toAnthropicTools(params.tools) : undefined,
        temperature: params.temperature,
        top_p: params.topP,
        stop_sequences: params.stopSequences,
      })

      return {
        id: response.id,
        model: response.model,
        role: 'assistant',
        content: this.fromAnthropicContent(response.content as BetaContentBlock[]),
        stopReason: this.convertStopReason(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      }
    } catch (error) {
      throw this.wrapError(error, 'Anthropic API request failed')
    }
  }

  /**
   * 转换停止原因
   */
  private convertStopReason(
    reason: string | null
  ): ChatResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn'
      case 'max_tokens':
        return 'max_tokens'
      case 'stop_sequence':
        return 'stop_sequence'
      case 'tool_use':
        return 'tool_use'
      default:
        return null
    }
  }

  /**
   * 验证 API Key
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
      const tempClient = new AnthropicSDK({
        apiKey,
        baseURL: this.baseUrl,
        timeout: 10_000,
        maxRetries: 0,
      })

      await tempClient.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      })

      return true
    } catch {
      return false
    }
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<string[]> {
    // Anthropic 目前没有公开的模型列表 API，返回已知模型
    return [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ]
  }
}
