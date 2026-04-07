/**
 * 阿里云百炼千问 (Qwen) API 适配器
 * 
 * 专门为阿里云百炼平台 Qwen 系列模型优化的适配器，支持：
 * - Qwen3.6-Plus / Qwen3.6 / Qwen3.5 系列
 * - Qwen-Long (100万 Token 超长上下文)
 * - Qwen-VL 系列 (视觉模型)
 * - Tool Use (Function Calling)
 * - Streaming 流式输出
 * 
 * API 文档: https://help.aliyun.com/zh/model-studio/
 */

import { logForDebugging } from 'src/utils/debug.js'
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

/** Qwen API 消息格式 (OpenAI 兼容) */
interface QwenMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** Qwen API 工具格式 */
interface QwenTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** Qwen API 响应格式 */
interface QwenResponse {
  id: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: QwenMessage
    finish_reason: string | null
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** Qwen 流式响应块 */
interface QwenStreamChunk {
  id: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: Partial<QwenMessage> & {
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
 * Qwen 适配器
 */
export class QwenAdapter extends BaseAdapter {
  readonly name = 'qwen'
  readonly displayName = '阿里千问 (Qwen)'

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true, // Qwen-VL 支持
    thinking: false,
    systemPrompt: true,
    maxContextLength: 1_000_000, // 100万 Token (Qwen3.6-Plus)
    maxOutputTokens: 8_192,
  }

  constructor(config: {
    apiKey?: string
    baseUrl?: string
    model?: string
    timeout?: number
    maxRetries?: number
  } = {}) {
    super(config)
    // 阿里云百炼 DashScope OpenAI 兼容接口
    this.baseUrl = config.baseUrl || process.env.QWEN_BASE_URL || process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    this.apiKey = config.apiKey || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY
    this.model = config.model || process.env.QWEN_MODEL || 'qwen3.6-plus'
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
   * 将统一消息转换为 Qwen 格式
   */
  private toQwenMessages(
    messages: UnifiedMessage[],
    systemPrompt?: string | string[]
  ): QwenMessage[] {
    const result: QwenMessage[] = []

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

          // 检查是否包含图片 (Qwen-VL)
          const hasImage = msg.content.some(c => c.type === 'image')
          if (hasImage) {
            const contentArray: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
            for (const c of msg.content) {
              if (c.type === 'text') {
                contentArray.push({ type: 'text', text: c.text })
              } else if (c.type === 'image') {
                const imageUrl = c.source.url || 
                  (c.source.data ? `data:${c.source.mediaType || 'image/png'};base64,${c.source.data}` : '')
                contentArray.push({ type: 'image_url', image_url: { url: imageUrl } })
              }
            }
            result.push({ role: 'user', content: contentArray })
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
   * 将统一工具转换为 Qwen 格式
   */
  private toQwenTools(tools: UnifiedTool[]): QwenTool[] {
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
    const model = params.model || this.model || 'qwen3.6-plus'
    const url = `${this.baseUrl}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: this.toQwenMessages(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 8192,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 0.9,
      stream: true,
      stream_options: { include_usage: true },
    }

    // 添加工具
    if (params.tools && params.tools.length > 0) {
      body.tools = this.toQwenTools(params.tools)
      body.tool_choice = 'auto'
    }

    // Debug: 打印请求信息
    logForDebugging(`[QwenAdapter] Request: url=${url} model=${model} tools=${params.tools?.length || 0} messages=${params.messages?.length || 0}`)
    if (body.tools) {
      logForDebugging(`[QwenAdapter] Tools: ${JSON.stringify(body.tools)}`, { level: 'verbose' })
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
          `Qwen API error: ${errorText}`,
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
      let messageStopped = false

      // 统一的停止事件发射函数
      const emitStopEvents = async function* (): AsyncGenerator<StreamEvent, void, unknown> {
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
      }

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
              yield* emitStopEvents()
              messageStopped = true
              return
            }

            try {
              const chunk: QwenStreamChunk = JSON.parse(data)
              const choice = chunk.choices[0]
              if (!choice) continue

              const delta = choice.delta

              // Debug: 打印原始 chunk
              logForDebugging(`[QwenAdapter] Chunk: ${JSON.stringify(chunk)}`, { level: 'verbose' })

              // 处理文本内容
              if (delta.content && typeof delta.content === 'string') {
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
                logForDebugging(`[QwenAdapter] Tool calls delta: ${JSON.stringify(delta.tool_calls)}`)
                for (const tc of delta.tool_calls) {
                  const existing = toolCalls.get(tc.index) || { id: '', name: '', arguments: '' }
                  if (tc.id) existing.id = tc.id
                  if (tc.function?.name) existing.name = tc.function.name
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments
                  toolCalls.set(tc.index, existing)
                }
              }

              // 处理 finish_reason
              if (choice.finish_reason) {
                logForDebugging(`[QwenAdapter] Finish reason: ${choice.finish_reason} toolCalls: ${toolCalls.size}`)
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

      // 处理流结束但没收到 [DONE] 的情况
      if (!messageStopped) {
        logForDebugging('[QwenAdapter] EOF without [DONE], emitting stop events', { level: 'warn' })
        yield* emitStopEvents()
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error
      }
      throw this.wrapError(error, 'Qwen API request failed')
    }
  }

  /**
   * 非流式 Chat 请求
   */
  async chatSync(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.model || 'qwen3.6-plus'
    const url = `${this.baseUrl}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: this.toQwenMessages(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 8192,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 0.9,
      stream: false,
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = this.toQwenTools(params.tools)
      body.tool_choice = 'auto'
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
          `Qwen API error: ${errorText}`,
          response.status === 401 ? 'authentication_error' :
          response.status === 429 ? 'rate_limit_error' :
          response.status === 400 ? 'invalid_request_error' : 'api_error',
          response.status,
          this.name
        )
      }

      const data: QwenResponse = await response.json()

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
        if (typeof message.content === 'string') {
          content.push({ type: 'text', text: message.content })
        }
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
      throw this.wrapError(error, 'Qwen API request failed')
    }
  }

  /**
   * 验证 API Key
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/chat/completions`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
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
    // 阿里云百炼 Qwen 已知模型列表
    return [
      // Qwen3.6 系列 (最新)
      'qwen3.6-plus',
      'qwen3.6',
      // Qwen3.5 系列
      'qwen3.5-plus',
      'qwen3.5',
      'qwen3.5-flash',
      // Qwen 长文本系列
      'qwen-long',
      // Qwen-Turbo (快速)
      'qwen-turbo',
      'qwen-turbo-latest',
      // Qwen-Plus
      'qwen-plus',
      'qwen-plus-latest',
      // Qwen-Max
      'qwen-max',
      'qwen-max-latest',
      // Qwen 视觉模型
      'qwen-vl-plus',
      'qwen-vl-max',
      // Qwen 代码模型
      'qwen-coder-plus',
      'qwen-coder-turbo',
    ]
  }
}
