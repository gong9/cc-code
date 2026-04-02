/**
 * Provider 配置解析和初始化
 * 
 * 从环境变量和配置文件中读取 Provider 配置，自动注册和初始化适配器。
 */

import type { ProviderConfig } from './types.js'
import {
  providerRegistry,
  registerProvider,
  registerProviderFactory,
  setActiveProvider,
  getActiveProvider,
} from './registry.js'

// Re-export getActiveProvider for convenience
export { getActiveProvider }

// 延迟导入适配器以避免循环依赖
let adaptersInitialized = false

/**
 * 默认 Provider 配置
 * 修改这里可以更改默认使用的模型
 */
const DEFAULT_PROVIDER = 'minimax'
const DEFAULT_MINIMAX_MODEL = 'MiniMax-M2.7'

/**
 * 确保 MODEL_PROVIDER 环境变量被设置
 * 这样其他模块可以检测到正在使用非 Anthropic 的 Provider
 */
export function ensureModelProviderEnv(): void {
  if (!process.env.MODEL_PROVIDER) {
    process.env.MODEL_PROVIDER = DEFAULT_PROVIDER
  }
}

// 在模块加载时自动设置默认 Provider
ensureModelProviderEnv()

/**
 * 从环境变量解析 Provider 配置
 */
export function getProviderConfigFromEnv(): ProviderConfig {
  // 检查 MODEL_PROVIDER 环境变量，默认使用 MiniMax
  const providerType = process.env.MODEL_PROVIDER?.toLowerCase() || DEFAULT_PROVIDER

  switch (providerType) {
    case 'openai':
    case 'openai-compat':
    case 'openai_compat':
      return {
        provider: 'openai-compat',
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        timeout: parseInt(process.env.API_TIMEOUT_MS || '600000', 10),
        maxRetries: parseInt(process.env.API_MAX_RETRIES || '2', 10),
      }

    case 'minimax':
      return {
        provider: 'minimax',
        apiKey: process.env.MINIMAX_API_KEY,
        baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
        model: process.env.MINIMAX_MODEL || DEFAULT_MINIMAX_MODEL,
        groupId: process.env.MINIMAX_GROUP_ID,
        timeout: parseInt(process.env.API_TIMEOUT_MS || '600000', 10),
        maxRetries: parseInt(process.env.API_MAX_RETRIES || '2', 10),
      }

    case 'glm':
    case 'zhipu':
      return {
        provider: 'glm',
        apiKey: process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY,
        baseUrl: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
        model: process.env.GLM_MODEL || 'glm-4-plus',
        timeout: parseInt(process.env.API_TIMEOUT_MS || '600000', 10),
        maxRetries: parseInt(process.env.API_MAX_RETRIES || '2', 10),
      }

    case 'anthropic':
    default:
      return {
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        timeout: parseInt(process.env.API_TIMEOUT_MS || '600000', 10),
        maxRetries: parseInt(process.env.API_MAX_RETRIES || '2', 10),
      }
  }
}

/**
 * 从配置对象创建 Provider 配置
 */
export function parseProviderConfig(config: Record<string, unknown>): ProviderConfig {
  const providerType = (config.modelProvider as string)?.toLowerCase() || 'anthropic'

  switch (providerType) {
    case 'openai':
    case 'openai-compat':
    case 'openai_compat': {
      const openaiConfig = (config.openaiCompat || config.openai || {}) as Record<string, unknown>
      return {
        provider: 'openai-compat',
        apiKey: openaiConfig.apiKey as string,
        baseUrl: openaiConfig.baseUrl as string || 'https://api.openai.com/v1',
        model: openaiConfig.model as string || 'gpt-4o',
        timeout: openaiConfig.timeout as number,
        maxRetries: openaiConfig.maxRetries as number,
      }
    }

    case 'minimax': {
      const minimaxConfig = (config.minimax || {}) as Record<string, unknown>
      return {
        provider: 'minimax',
        apiKey: minimaxConfig.apiKey as string,
        baseUrl: minimaxConfig.baseUrl as string || 'https://api.minimaxi.com/v1',
        model: minimaxConfig.model as string || 'MiniMax-M1',
        groupId: minimaxConfig.groupId as string,
        timeout: minimaxConfig.timeout as number,
        maxRetries: minimaxConfig.maxRetries as number,
      }
    }

    case 'glm':
    case 'zhipu': {
      const glmConfig = (config.glm || config.zhipu || {}) as Record<string, unknown>
      return {
        provider: 'glm',
        apiKey: glmConfig.apiKey as string,
        baseUrl: glmConfig.baseUrl as string || 'https://open.bigmodel.cn/api/paas/v4',
        model: glmConfig.model as string || 'glm-4-plus',
        timeout: glmConfig.timeout as number,
        maxRetries: glmConfig.maxRetries as number,
      }
    }

    case 'anthropic':
    default: {
      const anthropicConfig = (config.anthropic || {}) as Record<string, unknown>
      return {
        provider: 'anthropic',
        apiKey: anthropicConfig.apiKey as string,
        baseUrl: anthropicConfig.baseUrl as string,
        model: anthropicConfig.model as string || 'claude-sonnet-4-20250514',
        timeout: anthropicConfig.timeout as number,
        maxRetries: anthropicConfig.maxRetries as number,
      }
    }
  }
}

/**
 * 初始化所有内置适配器
 */
export async function initializeBuiltinAdapters(): Promise<void> {
  if (adaptersInitialized) {
    return
  }

  // 注册适配器工厂
  registerProviderFactory('anthropic', (config) => {
    const { AnthropicAdapter } = require('./AnthropicAdapter.js') as typeof import('./AnthropicAdapter.js')
    return new AnthropicAdapter({
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
      model: config?.model,
      timeout: config?.timeout,
      maxRetries: config?.maxRetries,
    })
  })

  registerProviderFactory('openai-compat', (config) => {
    const { OpenAICompatAdapter } = require('./OpenAICompatAdapter.js') as typeof import('./OpenAICompatAdapter.js')
    return new OpenAICompatAdapter({
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
      model: config?.model,
      timeout: config?.timeout,
      maxRetries: config?.maxRetries,
    })
  })

  registerProviderFactory('minimax', (config) => {
    const { MiniMaxAdapter } = require('./MiniMaxAdapter.js') as typeof import('./MiniMaxAdapter.js')
    const minimaxConfig = config as import('./types.js').MiniMaxProviderConfig | undefined
    return new MiniMaxAdapter({
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
      model: config?.model,
      groupId: minimaxConfig?.groupId,
      timeout: config?.timeout,
      maxRetries: config?.maxRetries,
    })
  })

  registerProviderFactory('glm', (config) => {
    const { GLMAdapter } = require('./GLMAdapter.js') as typeof import('./GLMAdapter.js')
    return new GLMAdapter({
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
      model: config?.model,
      timeout: config?.timeout,
      maxRetries: config?.maxRetries,
    })
  })

  adaptersInitialized = true
}

/**
 * 根据环境变量初始化 Provider
 */
export async function initializeProviderFromEnv(): Promise<void> {
  await initializeBuiltinAdapters()

  const config = getProviderConfigFromEnv()
  
  // 获取并缓存 Provider 实例
  providerRegistry.get(config.provider, config)
  
  // 设置为激活的 Provider
  setActiveProvider(config.provider)
}

/**
 * 根据配置对象初始化 Provider
 */
export async function initializeProviderFromConfig(config: Record<string, unknown>): Promise<void> {
  await initializeBuiltinAdapters()

  const providerConfig = parseProviderConfig(config)
  
  // 获取并缓存 Provider 实例
  providerRegistry.get(providerConfig.provider, providerConfig)
  
  // 设置为激活的 Provider
  setActiveProvider(providerConfig.provider)
}

/**
 * 获取当前 Provider 名称
 */
export function getCurrentProviderName(): string {
  return providerRegistry.getActiveProviderName()
}

/**
 * 检查是否使用 Anthropic Provider
 */
export function isUsingAnthropic(): boolean {
  return getCurrentProviderName() === 'anthropic'
}

/**
 * 检查是否使用第三方 Provider
 */
export function isUsingThirdPartyProvider(): boolean {
  return !isUsingAnthropic()
}
