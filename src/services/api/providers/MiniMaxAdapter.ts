/**
 * MiniMax API 适配器
 * 
 * 专门为 MiniMax 大模型优化的适配器，支持：
 * - MiniMax-M1 / MiniMax-M2.7 等模型
 * - Tool Use (Function Calling)
 * - Interleaved Thinking (M2.7)
 * 
 * API 文档: https://platform.minimaxi.com/docs
 */

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

/** MiniMax API 消息格式 */
interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  name?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** MiniMax API 工具格式 */
interface MiniMaxTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** MiniMax API 响应格式 */
interface MiniMaxResponse {
  id: string
  model: string
  created: number
  choices: Array<{
    index: number
    message: MiniMaxMessage
    finish_reason: string | null
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  base_resp?: {
    status_code: number
    status_msg: string
  }
}

/** MiniMax 流式响应块 */
interface MiniMaxStreamChunk {
  id: string
  model: string
  created: number
  choices: Array<{
    index: number
    delta: Partial<MiniMaxMessage> & {
      tool_calls?: Array<{
        index: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * MiniMax 适配器
 */
export class MiniMaxAdapter extends BaseAdapter {
  readonly name = 'minimax'
  readonly displayName = 'MiniMax'

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    thinking: true, // M2.7 支持 Interleaved Thinking
    systemPrompt: true,
    maxContextLength: 1_000_000, // MiniMax-M1 支持百万 token
    maxOutputTokens: 16_384,
  }

  private groupId?: string

  constructor(config: {
    apiKey?: string
    baseUrl?: string
    model?: string
    groupId?: string
    timeout?: number
    maxRetries?: number
  } = {}) {
    super(config)
    this.baseUrl = config.baseUrl || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1'
    this.apiKey = config.apiKey || process.env.MINIMAX_API_KEY
    this.model = config.model || process.env.MINIMAX_MODEL || 'MiniMax-M2.7'  // 默认使用 M2.7
    this.groupId = config.groupId || process.env.MINIMAX_GROUP_ID
  }

  /**
   * 构建请求头
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    return headers
  }

  /**
   * 将统一消息转换为 MiniMax 格式
   */
  private toMiniMaxMessages(
    messages: UnifiedMessage[],
    systemPrompt?: string | string[]
  ): MiniMaxMessage[] {
    const result: MiniMaxMessage[] = []

    // 添加系统提示词
    const sysPrompt = this.systemPromptToString(systemPrompt)
    if (sysPrompt) {
      result.push({ role: 'system', content: sysPrompt })
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({
          role: 'system',
          content: this.extractTextContent(msg.content),
        })
      } else if (msg.role === 'user') {
        // 检查是否包含工具结果
        if (typeof msg.content !== 'string') {
          const toolResults = this.extractToolResults(msg.content)
          if (toolResults.length > 0) {
            for (const toolResult of toolResults) {
              result.push({
                role: 'tool',
                tool_call_id: toolResult.toolUseId,
                content:
                  typeof toolResult.content === 'string'
                    ? toolResult.content
                    : this.extractTextContent(toolResult.content),
              })
            }
            continue
          }
        }
        result.push({
          role: 'user',
          content: this.extractTextContent(msg.content),
        })
      } else if (msg.role === 'assistant') {
        const toolUses =
          typeof msg.content === 'string' ? [] : this.extractToolUses(msg.content)
        const text = this.extractTextContent(msg.content)

        if (toolUses.length > 0) {
          result.push({
            role: 'assistant',
            content: text || undefined,
            tool_calls: toolUses.map(tu => ({
              id: tu.id,
              type: 'function' as const,
              function: {
                name: tu.name,
                arguments: JSON.stringify(tu.input),
              },
            })),
          })
        } else {
          result.push({
            role: 'assistant',
            content: text,
          })
        }
      }
    }

    return result
  }

  /**
   * 将统一工具转换为 MiniMax 格式
   */
  private toMiniMaxTools(tools: UnifiedTool[]): MiniMaxTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  /**
   * 流式 Chat 请求
   */
  async *chat(params: ChatParams): AsyncGenerator<StreamEvent, void, unknown> {
    const model = params.model || this.model || 'MiniMax-M2.7'
    const url = `${this.baseUrl}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: this.toMiniMaxMessages(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 0.9,
      stream: true,
    }

    // 添加工具
    if (params.tools && params.tools.length > 0) {
      body.tools = this.toMiniMaxTools(params.tools)
      body.tool_choice = 'auto'
    }

    // M2.7 的 Interleaved Thinking
    if (params.thinking?.type === 'enabled' && model.includes('M2')) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: params.thinking.budgetTokens || 10000,
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: params.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProviderError(
          `MiniMax API error: ${errorText}`,
          response.status === 401 ? 'authentication_error' :
          response.status === 429 ? 'rate_limit_error' :
          response.status === 400 ? 'invalid_request_error' : 'api_error',
          response.status,
          this.name
        )
      }

      if (!response.body) {
        throw new ProviderError('No response body', 'api_error', undefined, this.name)
      }

      // 发送 message_start 事件
      yield {
        type: 'message_start',
        message: {
          id: '',
          model,
          role: 'assistant',
          content: [],
          stopReason: null,
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let contentIndex = 0
      let currentContent = ''
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              if (currentContent) {
                yield { type: 'content_block_stop', index: contentIndex }
              }
              for (const [idx, tc] of toolCalls) {
                yield {
                  type: 'content_block_start',
                  index: idx + 1,
                  contentBlock: {
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.name,
                    input: JSON.parse(tc.arguments || '{}'),
                  },
                }
                yield { type: 'content_block_stop', index: idx + 1 }
              }
              yield { type: 'message_stop' }
              return
            }

            try {
              const chunk: MiniMaxStreamChunk = JSON.parse(data)
              const choice = chunk.choices[0]
              if (!choice) continue

              const delta = choice.delta

              // 处理文本内容
              if (delta.content) {
                if (!currentContent) {
                  yield {
                    type: 'content_block_start',
                    index: contentIndex,
                    contentBlock: { type: 'text', text: '' },
                  }
                }
                currentContent += delta.content
                yield {
                  type: 'content_block_delta',
                  index: contentIndex,
                  delta: { type: 'text_delta', text: delta.content },
                }
              }

              // 处理工具调用
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const existing = toolCalls.get(tc.index) || { id: '', name: '', arguments: '' }
                  if (tc.id) existing.id = tc.id
                  if (tc.function?.name) existing.name = tc.function.name
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments
                  toolCalls.set(tc.index, existing)
                }
              }

              // 处理 usage
              if (chunk.usage) {
                yield {
                  type: 'message_delta',
                  usage: {
                    inputTokens: chunk.usage.prompt_tokens,
                    outputTokens: chunk.usage.completion_tokens,
                  },
                }
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error
      }
      throw this.wrapError(error, 'MiniMax API request failed')
    }
  }

  /**
   * 非流式 Chat 请求
   */
  async chatSync(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.model || 'MiniMax-M2.7'
    const url = `${this.baseUrl}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: this.toMiniMaxMessages(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 0.9,
      stream: false,
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = this.toMiniMaxTools(params.tools)
      body.tool_choice = 'auto'
    }

    if (params.thinking?.type === 'enabled' && model.includes('M2')) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: params.thinking.budgetTokens || 10000,
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: params.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProviderError(
          `MiniMax API error: ${errorText}`,
          response.status === 401 ? 'authentication_error' :
          response.status === 429 ? 'rate_limit_error' :
          response.status === 400 ? 'invalid_request_error' : 'api_error',
          response.status,
          this.name
        )
      }

      const data: MiniMaxResponse = await response.json()

      // 检查业务错误
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new ProviderError(
          `MiniMax API error: ${data.base_resp.status_msg}`,
          'api_error',
          data.base_resp.status_code,
          this.name
        )
      }

      const choice = data.choices[0]
      if (!choice) {
        return {
          id: data.id,
          model: data.model,
          role: 'assistant',
          content: [],
          stopReason: 'end_turn',
          usage: {
            inputTokens: data.usage?.prompt_tokens || 0,
            outputTokens: data.usage?.completion_tokens || 0,
          },
        }
      }

      const content: UnifiedContent[] = []
      const message = choice.message

      if (message.content) {
        content.push({ type: 'text', text: message.content })
      }

      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments || '{}'),
          })
        }
      }

      let stopReason: ChatResponse['stopReason'] = 'end_turn'
      switch (choice.finish_reason) {
        case 'stop':
          stopReason = 'end_turn'
          break
        case 'length':
          stopReason = 'max_tokens'
          break
        case 'tool_calls':
          stopReason = 'tool_use'
          break
      }

      return {
        id: data.id,
        model: data.model,
        role: 'assistant',
        content,
        stopReason,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        },
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error
      }
      throw this.wrapError(error, 'MiniMax API request failed')
    }
  }

  /**
   * 验证 API Key
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/models`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<string[]> {
    // MiniMax 已知模型列表
    return [
      'MiniMax-M1',
      'MiniMax-M2',
      'MiniMax-M2.7',
      'abab6.5s-chat',
      'abab6.5g-chat',
      'abab6.5t-chat',
      'abab5.5s-chat',
      'abab5.5-chat',
    ]
  }
}
