/**
 * OpenAI 兼容 API 适配器
 * 
 * 支持所有兼容 OpenAI Chat Completions API 格式的模型，包括：
 * - OpenAI (GPT-4, GPT-3.5)
 * - Azure OpenAI
 * - 国产模型 (通过 OneAPI/LiteLLM 等代理)
 * - 其他兼容服务
 */

import { BaseAdapter } from './BaseAdapter.js'
import type {
  ChatParams,
  ChatResponse,
  ProviderCapabilities,
  StreamEvent,
  UnifiedContent,
} from './types.js'
import { ProviderError } from './types.js'

/** OpenAI API 消息格式 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

/** OpenAI API 响应格式 */
interface OpenAIResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: OpenAIMessage
    finish_reason: string | null
    delta?: Partial<OpenAIMessage>
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** 流式响应行 */
interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: Partial<OpenAIMessage> & {
      tool_calls?: Array<{
        index: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
}

/**
 * OpenAI 兼容适配器
 */
export class OpenAICompatAdapter extends BaseAdapter {
  readonly name = 'openai-compat'
  readonly displayName = 'OpenAI Compatible'

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    thinking: false, // 大多数 OpenAI 兼容模型不支持
    systemPrompt: true,
    maxContextLength: 128_000,
    maxOutputTokens: 16_384,
  }

  constructor(config: {
    apiKey?: string
    baseUrl?: string
    model?: string
    timeout?: number
    maxRetries?: number
  } = {}) {
    super(config)
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o'
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
   * 流式 Chat 请求
   */
  async *chat(params: ChatParams): AsyncGenerator<StreamEvent, void, unknown> {
    const model = params.model || this.model || 'gpt-4o'
    const url = `${this.baseUrl}/chat/completions`

    const body = {
      model,
      messages: this.messagesToOpenAIFormat(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature,
      top_p: params.topP,
      stop: params.stopSequences,
      stream: true,
      ...(params.tools && params.tools.length > 0 && {
        tools: this.toolsToOpenAIFormat(params.tools),
        tool_choice: 'auto',
      }),
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
          `OpenAI API error: ${errorText}`,
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
        message: { id: '', model, role: 'assistant', content: [], stopReason: null, usage: { inputTokens: 0, outputTokens: 0 } },
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
              // 发送 content_block_stop
              if (currentContent) {
                yield { type: 'content_block_stop', index: contentIndex }
              }
              // 发送工具调用
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
              const chunk: OpenAIStreamChunk = JSON.parse(data)
              const choice = chunk.choices[0]
              if (!choice) continue

              const delta = choice.delta

              // 处理文本内容
              if (delta.content) {
                if (!currentContent) {
                  // 第一个内容块
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

              // 处理完成原因
              if (choice.finish_reason) {
                yield {
                  type: 'message_delta',
                  usage: { inputTokens: 0, outputTokens: 0 },
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
      throw this.wrapError(error, 'OpenAI compatible API request failed')
    }
  }

  /**
   * 非流式 Chat 请求
   */
  async chatSync(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.model || 'gpt-4o'
    const url = `${this.baseUrl}/chat/completions`

    const body = {
      model,
      messages: this.messagesToOpenAIFormat(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature,
      top_p: params.topP,
      stop: params.stopSequences,
      stream: false,
      ...(params.tools && params.tools.length > 0 && {
        tools: this.toolsToOpenAIFormat(params.tools),
        tool_choice: 'auto',
      }),
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
          `OpenAI API error: ${errorText}`,
          response.status === 401 ? 'authentication_error' :
          response.status === 429 ? 'rate_limit_error' :
          response.status === 400 ? 'invalid_request_error' : 'api_error',
          response.status,
          this.name
        )
      }

      const data: OpenAIResponse = await response.json()
      const { content, stopReason, usage } = this.contentFromOpenAIResponse(data)

      return {
        id: data.id,
        model: data.model,
        role: 'assistant',
        content,
        stopReason,
        usage,
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error
      }
      throw this.wrapError(error, 'OpenAI compatible API request failed')
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
    try {
      const url = `${this.baseUrl}/models`
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json() as { data: Array<{ id: string }> }
      return data.data.map(m => m.id)
    } catch {
      return []
    }
  }
}
