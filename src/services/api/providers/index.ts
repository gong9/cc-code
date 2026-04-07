/**
 * 多模型适配器模块
 * 
 * 提供统一的模型 Provider 接口，支持多种大模型：
 * - Anthropic Claude (默认)
 * - OpenAI 兼容 API
 * - MiniMax
 * - 智谱 GLM
 * 
 * 使用方式：
 * 
 * ```typescript
 * import { initializeProviderFromEnv, getActiveProvider } from './providers'
 * 
 * // 初始化 (根据环境变量选择 Provider)
 * await initializeProviderFromEnv()
 * 
 * // 获取当前 Provider
 * const provider = getActiveProvider()
 * 
 * // 发送请求
 * const response = await provider.chatSync({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   maxTokens: 1000,
 * })
 * ```
 * 
 * 环境变量配置：
 * 
 * ```bash
 * # 选择 Provider (anthropic | openai-compat | minimax | glm)
 * export MODEL_PROVIDER=minimax
 * 
 * # MiniMax 配置
 * export MINIMAX_API_KEY=xxx
 * export MINIMAX_MODEL=MiniMax-M1
 * 
 * # GLM 配置
 * export GLM_API_KEY=xxx
 * export GLM_MODEL=glm-4-plus
 * 
 * # OpenAI 兼容配置
 * export OPENAI_BASE_URL=https://api.example.com/v1
 * export OPENAI_API_KEY=xxx
 * export OPENAI_MODEL=gpt-4o
 * ```
 */

// 导出类型
export type {
  // 核心类型
  ModelProvider,
  ProviderCapabilities,
  ProviderConfig,
  ProviderErrorType,
  
  // 消息类型
  UnifiedMessage,
  UnifiedContent,
  UnifiedTextContent,
  UnifiedImageContent,
  UnifiedToolUseContent,
  UnifiedToolResultContent,
  UnifiedThinkingContent,
  UnifiedSystemPrompt,
  
  // 工具类型
  UnifiedTool,
  ToolInputSchema,
  
  // 请求/响应类型
  ChatParams,
  ChatResponse,
  StreamEvent,
  StreamEventType,
  TokenUsage,
  ThinkingConfig,
  
  // 配置类型
  BaseProviderConfig,
  AnthropicProviderConfig,
  OpenAICompatProviderConfig,
  MiniMaxProviderConfig,
  GLMProviderConfig,
  QwenProviderConfig,
} from './types.js'

// 导出错误类
export { ProviderError } from './types.js'

// 导出基类
export { BaseAdapter } from './BaseAdapter.js'

// 导出适配器
export { AnthropicAdapter } from './AnthropicAdapter.js'
export { OpenAICompatAdapter } from './OpenAICompatAdapter.js'
export { MiniMaxAdapter } from './MiniMaxAdapter.js'
export { GLMAdapter } from './GLMAdapter.js'
export { QwenAdapter } from './QwenAdapter.js'

// 导出注册中心
export {
  providerRegistry,
  getProvider,
  getActiveProvider,
  setActiveProvider,
  registerProvider,
  registerProviderFactory,
} from './registry.js'

// 导出配置函数
export {
  getProviderConfigFromEnv,
  parseProviderConfig,
  initializeBuiltinAdapters,
  initializeProviderFromEnv,
  initializeProviderFromConfig,
  getCurrentProviderName,
  isUsingAnthropic,
  isUsingThirdPartyProvider,
} from './config.js'

// 导出集成函数
export {
  initializeMultiModelSupport,
  shouldUseMultiModelProvider,
  queryWithProvider,
  queryWithProviderStreaming,
  getProviderCapabilities,
  convertToUnifiedMessages,
  convertToUnifiedTools,
  convertFromUnifiedResponse,
} from './integration.js'
