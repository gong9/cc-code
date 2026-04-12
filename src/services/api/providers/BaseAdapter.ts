/**
 * 模型适配器基类
 * 
 * 提供通用的消息转换逻辑和辅助方法，子类只需实现具体的 API 调用。
 */

import type {
  ChatParams,
  ChatResponse,
  ModelProvider,
  ProviderCapabilities,
  ProviderError,
  StreamEvent,
  UnifiedContent,
  UnifiedMessage,
  UnifiedTool,
  UnifiedToolResultContent,
  UnifiedToolUseContent,
} from './types.js'

/**
 * 适配器基类
 * 
 * 实现了通用的消息处理逻辑，子类需要实现：
 * - chat(): 流式 API 调用
 * - chatSync(): 非流式 API 调用
 * - toProviderMessages(): 将统一消息转换为 Provider 格式
 * - fromProviderResponse(): 将 Provider 响应转换为统一格式
 */
export abstract class BaseAdapter implements ModelProvider {
  abstract readonly name: string
  abstract readonly displayName: string
  abstract readonly capabilities: ProviderCapabilities

  // 配置
  protected apiKey?: string
  protected baseUrl?: string
  protected model?: string
  protected timeout: number
  protected maxRetries: number

  constructor(config: {
    apiKey?: string
    baseUrl?: string
    model?: string
    timeout?: number
    maxRetries?: number
  } = {}) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
    this.model = config.model
    this.timeout = config.timeout ?? 600_000 // 10 分钟
    this.maxRetries = config.maxRetries ?? 2
  }

  // ============================================================================
  // 抽象方法 - 子类必须实现
  // ============================================================================

  abstract chat(params: ChatParams): AsyncGenerator<StreamEvent, void, unknown>
  abstract chatSync(params: ChatParams): Promise<ChatResponse>

  // ============================================================================
  // 消息转换辅助方法
  // ============================================================================

  /**
   * 提取消息中的纯文本内容
   */
  protected extractTextContent(content: string | UnifiedContent[]): string {
    if (typeof content === 'string') {
      return content
    }
    return content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n')
  }

  /**
   * 提取消息中的工具调用
   */
  protected extractToolUses(content: UnifiedContent[]): UnifiedToolUseContent[] {
    return content.filter(
      (c): c is UnifiedToolUseContent => c.type === 'tool_use'
    )
  }

  /**
   * 提取消息中的工具结果
   */
  protected extractToolResults(content: UnifiedContent[]): UnifiedToolResultContent[] {
    return content.filter(
      (c): c is UnifiedToolResultContent => c.type === 'tool_result'
    )
  }

  /**
   * 将系统提示词转换为字符串
   */
  protected systemPromptToString(systemPrompt?: string | string[]): string {
    if (!systemPrompt) return ''
    if (typeof systemPrompt === 'string') return systemPrompt
    return systemPrompt.join('\n')
  }

  /**
   * 将工具定义转换为 OpenAI 格式 (大多数模型兼容)
   */
  protected toolsToOpenAIFormat(tools: UnifiedTool[]): Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }> {
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
   * 将统一消息转换为 OpenAI 格式 (大多数模型兼容)
   */
  protected messagesToOpenAIFormat(
    messages: UnifiedMessage[],
    systemPrompt?: string | string[]
  ): Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content?: string
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    tool_call_id?: string
    name?: string
  }> {
    const result: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool'
      content?: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
      tool_call_id?: string
      name?: string
    }> = []

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
            // 工具结果作为单独的 tool 消息
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
   * 从 OpenAI 格式响应中提取内容
   */
  protected contentFromOpenAIResponse(response: {
    choices: Array<{
      message: {
        role: string
        content?: string | null
        tool_calls?: Array<{
          id: string
          type: string
          function: { name: string; arguments: string }
        }>
      }
      finish_reason: string
    }>
    usage?: {
      prompt_tokens: number
      completion_tokens: number
    }
  }): {
    content: UnifiedContent[]
    stopReason: ChatResponse['stopReason']
    usage: ChatResponse['usage']
  } {
    const choice = response.choices[0]
    if (!choice) {
      return {
        content: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    }

    const content: UnifiedContent[] = []
    const message = choice.message

    // 添加文本内容
    if (message.content) {
      content.push({ type: 'text', text: message.content })
    }

    // 添加工具调用
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          // 安全解析 JSON
          let parsedInput: Record<string, unknown> = {}
          const args = toolCall.function.arguments
          if (args) {
            try {
              parsedInput = JSON.parse(args)
            } catch {
              console.warn(`[BaseAdapter] Failed to parse tool call arguments for ${toolCall.function.name}`)
              // 尝试基本修复
              parsedInput = this.tryFixToolCallJson(args) ?? { _raw: args, _parseError: true }
            }
          }
          content.push({
            type: 'tool_use',
            id: toolCall.id || `tool_call_${toolCall.function.name}`,
            name: toolCall.function.name || 'unknown_tool',
            input: parsedInput,
          })
        }
      }
    }

    // 转换停止原因
    let stopReason: ChatResponse['stopReason'] = 'end_turn'
    switch (choice.finish_reason) {
      case 'stop':
        stopReason = 'end_turn'
        break
      case 'length':
        stopReason = 'max_tokens'
        break
      case 'tool_calls':
      case 'function_call':
        stopReason = 'tool_use'
        break
    }

    return {
      content,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    }
  }

  // ============================================================================
  // JSON 解析与修复
  // ============================================================================

  /**
   * 安全解析工具调用参数
   * 
   * 统一处理 JSON 解析和错误恢复，供所有适配器使用
   * 
   * @param args - 原始 JSON 字符串
   * @param toolName - 工具名称（用于日志）
   * @param adapterName - 适配器名称（用于日志）
   * @returns 解析后的对象
   */
  protected parseToolCallArguments(
    args: string | undefined,
    toolName: string,
    adapterName: string = this.name
  ): Record<string, unknown> {
    if (!args) {
      return {}
    }
    
    try {
      return JSON.parse(args)
    } catch {
      // 尝试修复常见的 JSON 问题
      const fixed = this.tryFixToolCallJson(args)
      if (fixed !== null) {
        return fixed
      }
      console.warn(`[${adapterName}] Failed to parse tool call arguments for ${toolName}`)
      // 返回带错误标记的对象，让上层处理
      return { _raw: args, _parseError: true }
    }
  }

  /**
   * 尝试修复常见的 JSON 解析问题
   */
  protected tryFixToolCallJson(jsonStr: string): Record<string, unknown> | null {
    let working = jsonStr.trim()

    // 1. 尝试移除多余的转义
    try {
      const unescaped = working.replace(/\\\\/g, '\\').replace(/\\"/g, '"')
      if (unescaped !== working) {
        try {
          return JSON.parse(unescaped)
        } catch {
          working = unescaped // 使用转义后的版本继续
        }
      }
    } catch {
      // 继续
    }

    // 2. 先移除尾部逗号（在添加括号之前）
    if (working.endsWith(',')) {
      const withoutComma = working.slice(0, -1)
      try {
        return JSON.parse(withoutComma)
      } catch {
        working = withoutComma // 继续使用去掉逗号的版本
      }
    }

    // 3. 尝试添加缺失的闭合括号
    const openBraces = (working.match(/{/g) || []).length
    const closeBraces = (working.match(/}/g) || []).length
    if (openBraces > closeBraces) {
      working += '}'.repeat(openBraces - closeBraces)
      try {
        return JSON.parse(working)
      } catch {
        // 继续
      }
    }

    // 4. 尝试添加缺失的方括号
    const openBrackets = (working.match(/\[/g) || []).length
    const closeBrackets = (working.match(/]/g) || []).length
    if (openBrackets > closeBrackets) {
      working += ']'.repeat(openBrackets - closeBrackets)
      try {
        return JSON.parse(working)
      } catch {
        // 继续
      }
    }

    // 5. 再次检查尾部逗号（添加括号后可能产生新的尾部逗号问题）
    if (working.includes(',}') || working.includes(',]')) {
      working = working.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
      try {
        return JSON.parse(working)
      } catch {
        // 继续
      }
    }

    return null
  }

  // ============================================================================
  // 错误处理
  // ============================================================================

  /**
   * 包装错误为 ProviderError
   */
  protected wrapError(error: unknown, defaultMessage: string): ProviderError {
    // 动态导入以避免循环依赖
    const { ProviderError } = require('./types.js') as typeof import('./types.js')
    
    if (error instanceof ProviderError) {
      return error
    }

    if (error instanceof Error) {
      // 尝试从错误中提取更多信息
      const statusCode = (error as unknown as { status?: number }).status
      let errorType: import('./types.js').ProviderErrorType = 'unknown_error'

      if (statusCode === 401 || statusCode === 403) {
        errorType = 'authentication_error'
      } else if (statusCode === 429) {
        errorType = 'rate_limit_error'
      } else if (statusCode === 400) {
        errorType = 'invalid_request_error'
      } else if (statusCode && statusCode >= 500) {
        errorType = 'api_error'
      } else if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      ) {
        errorType = 'connection_error'
      } else if (
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT')
      ) {
        errorType = 'timeout_error'
      }

      return new ProviderError(
        error.message || defaultMessage,
        errorType,
        statusCode,
        this.name,
        error
      )
    }

    return new ProviderError(defaultMessage, 'unknown_error', undefined, this.name)
  }

  // ============================================================================
  // 可选方法 - 子类可覆盖
  // ============================================================================

  /**
   * 验证 API Key (默认不实现)
   */
  async validateApiKey?(apiKey: string): Promise<boolean> {
    return true
  }

  /**
   * 获取可用模型列表 (默认不实现)
   */
  async listModels?(): Promise<string[]> {
    return []
  }
}
