/**
 * 多模型适配器类型定义
 * 
 * 提供统一的消息格式和 Provider 接口，使项目能够支持多种大模型。
 */

// ============================================================================
// 统一内容类型 (与 Anthropic SDK 解耦)
// ============================================================================

/** 文本内容块 */
export interface UnifiedTextContent {
  type: 'text'
  text: string
}

/** 图片内容块 */
export interface UnifiedImageContent {
  type: 'image'
  source: {
    type: 'base64' | 'url'
    mediaType?: string
    data?: string  // base64 数据
    url?: string   // 图片 URL
  }
}

/** 工具调用内容块 */
export interface UnifiedToolUseContent {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/** 工具结果内容块 */
export interface UnifiedToolResultContent {
  type: 'tool_result'
  toolUseId: string
  content: string | UnifiedContent[]
  isError?: boolean
}

/** 思考内容块 (仅部分模型支持) */
export interface UnifiedThinkingContent {
  type: 'thinking'
  thinking: string
}

/** 统一内容类型 */
export type UnifiedContent =
  | UnifiedTextContent
  | UnifiedImageContent
  | UnifiedToolUseContent
  | UnifiedToolResultContent
  | UnifiedThinkingContent

// ============================================================================
// 统一消息类型
// ============================================================================

/** 统一消息格式 */
export interface UnifiedMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | UnifiedContent[]
}

/** 系统提示词 */
export type UnifiedSystemPrompt = string | string[]

// ============================================================================
// 工具定义
// ============================================================================

/** 工具参数 JSON Schema */
export interface ToolInputSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/** 统一工具定义 */
export interface UnifiedTool {
  name: string
  description: string
  inputSchema: ToolInputSchema
}

// ============================================================================
// 请求/响应类型
// ============================================================================

/** 思考配置 */
export interface ThinkingConfig {
  type: 'enabled' | 'disabled'
  budgetTokens?: number
}

/** Chat 请求参数 */
export interface ChatParams {
  messages: UnifiedMessage[]
  systemPrompt?: UnifiedSystemPrompt
  tools?: UnifiedTool[]
  model?: string
  maxTokens?: number
  temperature?: number
  topP?: number
  stopSequences?: string[]
  thinking?: ThinkingConfig
  signal?: AbortSignal
}

/** Token 使用量 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

/** 流式事件类型 */
export type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'error'

/** 流式事件 */
export interface StreamEvent {
  type: StreamEventType
  index?: number
  contentBlock?: Partial<UnifiedContent>
  delta?: {
    type: string
    text?: string
    partialJson?: string
    thinking?: string
  }
  message?: Partial<ChatResponse>
  usage?: Partial<TokenUsage>
  error?: {
    type: string
    message: string
  }
}

/** Chat 响应 */
export interface ChatResponse {
  id: string
  model: string
  role: 'assistant'
  content: UnifiedContent[]
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null
  usage: TokenUsage
}

// ============================================================================
// Provider 能力声明
// ============================================================================

/** Provider 支持的能力 */
export interface ProviderCapabilities {
  /** 是否支持流式响应 */
  streaming: boolean
  /** 是否支持工具调用 (Function Calling) */
  toolUse: boolean
  /** 是否支持视觉/图片输入 */
  vision: boolean
  /** 是否支持扩展思考 (Extended Thinking) */
  thinking: boolean
  /** 是否支持系统提示词 */
  systemPrompt: boolean
  /** 最大上下文长度 */
  maxContextLength?: number
  /** 最大输出 token 数 */
  maxOutputTokens?: number
}

// ============================================================================
// Provider 接口
// ============================================================================

/** 模型 Provider 接口 */
export interface ModelProvider {
  /** Provider 名称 (用于注册和查找) */
  readonly name: string

  /** Provider 显示名称 */
  readonly displayName: string

  /** 能力声明 */
  readonly capabilities: ProviderCapabilities

  /**
   * 流式 Chat 请求
   * @param params 请求参数
   * @returns 流式事件生成器
   */
  chat(params: ChatParams): AsyncGenerator<StreamEvent, void, unknown>

  /**
   * 非流式 Chat 请求
   * @param params 请求参数
   * @returns Chat 响应
   */
  chatSync(params: ChatParams): Promise<ChatResponse>

  /**
   * 验证 API Key 是否有效
   * @param apiKey API Key
   * @returns 是否有效
   */
  validateApiKey?(apiKey: string): Promise<boolean>

  /**
   * 获取可用模型列表
   * @returns 模型名称列表
   */
  listModels?(): Promise<string[]>
}

// ============================================================================
// Provider 配置
// ============================================================================

/** Provider 配置基类 */
export interface BaseProviderConfig {
  /** Provider 类型 */
  provider: string
  /** API Key */
  apiKey?: string
  /** 基础 URL */
  baseUrl?: string
  /** 默认模型 */
  model?: string
  /** 请求超时 (毫秒) */
  timeout?: number
  /** 最大重试次数 */
  maxRetries?: number
}

/** Anthropic Provider 配置 */
export interface AnthropicProviderConfig extends BaseProviderConfig {
  provider: 'anthropic'
}

/** OpenAI 兼容 Provider 配置 */
export interface OpenAICompatProviderConfig extends BaseProviderConfig {
  provider: 'openai-compat'
  /** 是否跳过模型验证 */
  skipModelValidation?: boolean
}

/** MiniMax Provider 配置 */
export interface MiniMaxProviderConfig extends BaseProviderConfig {
  provider: 'minimax'
  /** Group ID (MiniMax 特有) */
  groupId?: string
}

/** GLM Provider 配置 */
export interface GLMProviderConfig extends BaseProviderConfig {
  provider: 'glm'
}

/** Qwen Provider 配置 */
export interface QwenProviderConfig extends BaseProviderConfig {
  provider: 'qwen'
}

/** 所有 Provider 配置类型 */
export type ProviderConfig =
  | AnthropicProviderConfig
  | OpenAICompatProviderConfig
  | MiniMaxProviderConfig
  | GLMProviderConfig
  | QwenProviderConfig

// ============================================================================
// 错误类型
// ============================================================================

/** Provider 错误类型 */
export type ProviderErrorType =
  | 'authentication_error'
  | 'rate_limit_error'
  | 'invalid_request_error'
  | 'api_error'
  | 'connection_error'
  | 'timeout_error'
  | 'unknown_error'

/** Provider 错误 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly type: ProviderErrorType,
    public readonly statusCode?: number,
    public readonly providerName?: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
