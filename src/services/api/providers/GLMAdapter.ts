/**
 * 智谱 GLM API 适配器
 * 
 * 专门为智谱 AI GLM 系列模型优化的适配器，支持：
 * - GLM-5 (旗舰 Agentic 模型，200K 上下文，128K 输出)
 * - GLM-5-Turbo / GLM-4.7 / GLM-4.6 / GLM-4.5
 * - GLM-4V (视觉模型)
 * - Tool Use (Function Calling)
 * - 思考模式 (Thinking)
 * - Web Search 等插件
 * 
 * API 文档: https://docs.bigmodel.cn/
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

/** GLM API 消息格式 */
interface GLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** GLM API 工具格式 */
interface GLMTool {
  type: 'function' | 'web_search' | 'retrieval' | 'code_interpreter'
  function?: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
  web_search?: {
    enable?: boolean
    search_query?: string
  }
}

/** GLM API 响应格式 */
interface GLMResponse {
  id: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: GLMMessage
    finish_reason: string | null
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** GLM 流式响应块 */
interface GLMStreamChunk {
  id: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: Partial<GLMMessage> & {
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
 * GLM 适配器
 */
export class GLMAdapter extends BaseAdapter {
  readonly name = 'glm'
  readonly displayName = '智谱 GLM'

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true, // GLM-4V 支持
    thinking: true, // GLM-5 支持思考模式
    systemPrompt: true,
    maxContextLength: 200_000, // GLM-5: 200K
    maxOutputTokens: 128_000,  // GLM-5: 128K
  }

  constructor(config: {
    apiKey?: string
    baseUrl?: string
    model?: string
    timeout?: number
    maxRetries?: number
  } = {}) {
    super(config)
    this.baseUrl = config.baseUrl || process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
    this.apiKey = config.apiKey || process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY
    this.model = config.model || process.env.GLM_MODEL || 'glm-5.1'
  }

  /**
   * 检测消息中是否包含图片
   */
  private hasImageInMessages(messages: UnifiedMessage[]): boolean {
    for (const msg of messages) {
      if (typeof msg.content !== 'string' && Array.isArray(msg.content)) {
        if (msg.content.some(c => c.type === 'image')) {
          return true
        }
      }
    }
    return false
  }

  /** GLM 视觉模型列表 */
  private static readonly VISION_MODELS = new Set([
    'glm-5v-turbo',
    'glm-4.6v',
    'glm-4.6v-flash',
    'glm-4v',
    'glm-4v-plus',
    'glm-4v-flash',
    'glm-4.1v-thinking-flashx',
    'glm-4.1v-thinking-flash',
  ])

  /**
   * 检查模型是否是视觉模型
   */
  private isVisionModel(model: string): boolean {
    return GLMAdapter.VISION_MODELS.has(model.toLowerCase())
  }

  /**
   * 根据消息内容选择最合适的模型
   * - 有图片时使用 glm-5v-turbo（多模态模型）
   * - 否则使用配置的默认模型
   */
  private selectModel(params: ChatParams): string {
    const requestedModel = params.model || this.model || 'glm-5.1'
    
    // 如果消息中包含图片，自动切换到视觉模型
    if (this.hasImageInMessages(params.messages)) {
      // 如果用户已经指定了视觉模型，使用用户指定的
      if (this.isVisionModel(requestedModel)) {
        return requestedModel
      }
      // 否则自动切换到 glm-5v-turbo
      return 'glm-5v-turbo'
    }
    
    return requestedModel
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
   * 将统一消息转换为 GLM 格式
   */
  private toGLMMessages(
    messages: UnifiedMessage[],
    systemPrompt?: string | string[]
  ): GLMMessage[] {
    const result: GLMMessage[] = []

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

          // 检查是否包含图片 (GLM-4V)
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
   * 将统一工具转换为 GLM 格式
   * 
   * GLM API 需要标准的 JSON Schema 格式，包括：
   * - type: "object"
   * - properties: 属性定义
   * - required: 必需字段数组（很重要！）
   */
  private toGLMTools(tools: UnifiedTool[]): GLMTool[] {
    return tools.map(tool => {
      // 确保 parameters 是有效的 JSON Schema 格式
      const params = this.cleanSchemaForGLM(tool.inputSchema)
      
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: this.truncateDescription(tool.description, 500),
          parameters: params,
        },
      }
    })
  }

  /**
   * 清理 JSON Schema 使其兼容 GLM API
   */
  private cleanSchemaForGLM(schema: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {
      type: 'object',
    }

    // 获取 properties
    const properties = schema.properties as Record<string, unknown> | undefined
    if (properties) {
      const cleanedProps: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(properties)) {
        cleanedProps[key] = this.cleanPropertyForGLM(value as Record<string, unknown>)
      }
      result.properties = cleanedProps
    }

    // 直接使用传入的 required 数组
    // convertToUnifiedTools 已经通过 zodToJsonSchema 正确转换了 required 字段
    const required = schema.required as string[] | undefined
    if (required && required.length > 0) {
      // 过滤掉以 _ 开头的内部字段（如 _simulatedSedEdit）
      const filteredRequired = required.filter(key => !key.startsWith('_'))
      if (filteredRequired.length > 0) {
        result.required = filteredRequired
      }
    }

    // 复制其他有用的字段
    if (schema.additionalProperties !== undefined) {
      result.additionalProperties = schema.additionalProperties
    }

    return result
  }

  /**
   * 清理单个属性的 schema
   */
  private cleanPropertyForGLM(prop: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    
    // 复制基本类型信息
    if (prop.type) result.type = prop.type
    
    // 简化描述
    if (prop.description && typeof prop.description === 'string') {
      result.description = this.truncateDescription(prop.description, 200)
    }
    
    // 复制其他重要字段
    if (prop.enum) result.enum = prop.enum
    if (prop.default !== undefined) result.default = prop.default
    if (prop.minimum !== undefined) result.minimum = prop.minimum
    if (prop.maximum !== undefined) result.maximum = prop.maximum
    
    // 处理嵌套对象
    if (prop.properties) {
      result.properties = {}
      for (const [key, value] of Object.entries(prop.properties as Record<string, unknown>)) {
        (result.properties as Record<string, unknown>)[key] = 
          this.cleanPropertyForGLM(value as Record<string, unknown>)
      }
      // 复制嵌套对象的 required 字段
      if (prop.required && Array.isArray(prop.required)) {
        result.required = prop.required
      }
    }
    
    // 处理数组
    if (prop.items) {
      result.items = this.cleanPropertyForGLM(prop.items as Record<string, unknown>)
    }
    
    // 复制 anyOf/oneOf（用于联合类型）
    if (prop.anyOf && Array.isArray(prop.anyOf)) {
      result.anyOf = (prop.anyOf as Record<string, unknown>[]).map(
        item => this.cleanPropertyForGLM(item)
      )
    }
    if (prop.oneOf && Array.isArray(prop.oneOf)) {
      result.oneOf = (prop.oneOf as Record<string, unknown>[]).map(
        item => this.cleanPropertyForGLM(item)
      )
    }
    
    // 移除 GLM 可能不支持的字段
    // format 字段在某些模型上可能有问题
    // 不复制 format 字段

    return result
  }

  /**
   * 截断描述文本
   */
  private truncateDescription(desc: string, maxLen: number): string {
    if (desc.length <= maxLen) return desc
    return desc.slice(0, maxLen - 3) + '...'
  }

  /**
   * 流式 Chat 请求
   */
  async *chat(params: ChatParams): AsyncGenerator<StreamEvent, void, unknown> {
    const model = this.selectModel(params)
    const url = `${this.baseUrl}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: this.toGLMMessages(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 0.9,
      stream: true,
    }

    // 添加工具
    if (params.tools && params.tools.length > 0) {
      body.tools = this.toGLMTools(params.tools)
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
          `GLM API error: ${errorText}`,
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
                const parsedInput = this.parseToolCallArguments(tc.arguments, tc.name, 'GLM')
                yield {
                  type: 'content_block_start',
                  index: idx + 1,
                  contentBlock: {
                    type: 'tool_use',
                    id: tc.id || `tool_call_${idx}`,
                    name: tc.name || 'unknown_tool',
                    input: parsedInput,
                  },
                }
                yield { type: 'content_block_stop', index: idx + 1 }
              }
              yield { type: 'message_stop' }
              return
            }

            try {
              const chunk: GLMStreamChunk = JSON.parse(data)
              const choice = chunk.choices[0]
              if (!choice) continue

              const delta = choice.delta

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
      throw this.wrapError(error, 'GLM API request failed')
    }
  }

  /**
   * 非流式 Chat 请求
   */
  async chatSync(params: ChatParams): Promise<ChatResponse> {
    const model = this.selectModel(params)
    const url = `${this.baseUrl}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: this.toGLMMessages(params.messages, params.systemPrompt),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 0.9,
      stream: false,
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = this.toGLMTools(params.tools)
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
          `GLM API error: ${errorText}`,
          response.status === 401 ? 'authentication_error' :
          response.status === 429 ? 'rate_limit_error' :
          response.status === 400 ? 'invalid_request_error' : 'api_error',
          response.status,
          this.name
        )
      }

      const data: GLMResponse = await response.json()

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
          const parsedInput = this.parseToolCallArguments(
            toolCall.function.arguments,
            toolCall.function.name,
            'GLM'
          )
          content.push({
            type: 'tool_use',
            id: toolCall.id || `tool_call_${toolCall.function.name}`,
            name: toolCall.function.name || 'unknown_tool',
            input: parsedInput,
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
      throw this.wrapError(error, 'GLM API request failed')
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
          model: 'glm-4-flash',
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
    // 智谱 GLM 已知模型列表（2026年4月更新）
    return [
      // GLM-5.x 系列 (最新旗舰)
      'glm-5.1',         // 最新旗舰，Coding 对齐 Claude Opus 4.6，长程任务显著提升
      'glm-5',           // 高智能基座，200K 上下文，Agentic Coding
      'glm-5-turbo',     // 龙虾增强基座，复杂长任务执行连续性好
      // GLM-4.x 系列
      'glm-4.7',         // 高智能模型，通用对话、推理与智能体能力全面升级
      'glm-4.7-flashx',  // 轻量高速，适用于中文写作、翻译、长文本等
      'glm-4.7-flash',   // 免费模型，最新基座的普惠版本
      'glm-4.6',         // 超强性能，200K上下文，高级编码能力
      'glm-4.5-air',     // 高性价比，推理、编码和智能体任务表现强劲
      'glm-4.5-airx',    // 高性价比极速版
      'glm-4.5-flash',   // 免费模型，支持深度思考模式
      // GLM-4 系列
      'glm-4',
      'glm-4-plus',
      'glm-4-air',
      'glm-4-airx',
      'glm-4-flash',
      'glm-4-flash-250414',
      'glm-4-flashx-250414',
      'glm-4-long',      // 超长输入，支持 1M 上下文
      // 视觉模型 (多模态)
      'glm-5v-turbo',    // 多模态 Coding 基座，兼顾视觉与 Coding 能力，200K 上下文
      'glm-4.6v',        // 视觉推理，原生支持工具调用
      'glm-4.6v-flash',  // 免费视觉模型
      'glm-4v',
      'glm-4v-plus',
      'glm-4v-flash',
      // 代码模型
      'codegeex-4',
      // 嵌入模型
      'embedding-2',
      'embedding-3',
    ]
  }
}
