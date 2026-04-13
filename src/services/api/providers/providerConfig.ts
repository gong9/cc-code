/**
 * 多模型配置存储和读取模块
 * 配置保存在 ~/.gong/providers.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface ProviderSettings {
  provider: string
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface ProvidersConfig {
  defaultProvider: string
  providers: Record<string, ProviderSettings>
}

export const XMAPI_BASE_URL = 'https://www.xmapi.cc'

const DEFAULT_CONFIG: ProvidersConfig = {
  defaultProvider: 'minimax',
  providers: {
    xmapi: {
      provider: 'xmapi',
      model: 'gpt-5.4',
      baseUrl: XMAPI_BASE_URL,
    },
    minimax: {
      provider: 'minimax',
      model: 'MiniMax-M2.7',
    },
    glm: {
      provider: 'glm',
      model: 'glm-5',
    },
    qwen: {
      provider: 'qwen',
      model: 'qwen3.6-plus',
    },
    openai: {
      provider: 'openai',
      model: 'gpt-4o',
    },
    aihubmix: {
      provider: 'aihubmix',
      model: 'gpt-4o-free',
      baseUrl: 'https://aihubmix.com/v1',
    },
  },
}

export const PROVIDER_OPTIONS = [
  { value: 'xmapi', label: 'Xmapi (Claude 兼容)', description: '固定接入 xmapi Anthropic 兼容网关' },
  { value: 'minimax', label: 'MiniMax (推荐)', description: 'MiniMax M2.7 大模型' },
  { value: 'qwen', label: '阿里千问 (Qwen)', description: 'Qwen3.6-Plus 百万上下文' },
  { value: 'glm', label: '智谱 GLM', description: 'GLM-5 旗舰 Agentic 模型' },
  { value: 'aihubmix', label: 'AIHubMix (聚合)', description: 'GPT/Claude/Gemini 多模型' },
] as const

function getConfigDir(): string {
  return process.env.GONG_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.gong')
}

function getConfigPath(): string {
  return join(getConfigDir(), 'providers.json')
}

export function isXmapiBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) {
    return false
  }

  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'www.xmapi.cc'
  } catch {
    return false
  }
}

function clearProviderEnvForSwitch(): void {
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.ANTHROPIC_MODEL
  delete process.env.MINIMAX_API_KEY
  delete process.env.MINIMAX_MODEL
  delete process.env.GLM_API_KEY
  delete process.env.GLM_MODEL
  delete process.env.QWEN_API_KEY
  delete process.env.QWEN_MODEL
  delete process.env.DASHSCOPE_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_MODEL
  delete process.env.OPENAI_BASE_URL
}

/**
 * 读取配置文件
 */
export function readProvidersConfig(): ProvidersConfig {
  const configPath = getConfigPath()
  
  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(content) as Partial<ProvidersConfig>
      const parsedProviders = parsed.providers ?? {}
      const mergedProviders = Object.fromEntries(
        Object.entries({
          ...DEFAULT_CONFIG.providers,
          ...parsedProviders,
        }).map(([providerName, providerConfig]) => [
          providerName,
          {
            ...DEFAULT_CONFIG.providers[providerName],
            ...providerConfig,
          },
        ]),
      ) as ProvidersConfig['providers']

      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        providers: mergedProviders,
      }
    }
  } catch {
    // 配置文件损坏，返回默认配置
  }
  
  return DEFAULT_CONFIG
}

/**
 * 保存配置文件
 */
export function saveProvidersConfig(config: ProvidersConfig): void {
  const configDir = getConfigDir()
  const configPath = getConfigPath()
  
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to save providers config:', e)
  }
}

/**
 * 检查是否有有效的 API Key 配置
 */
export function hasValidApiKey(): boolean {
  // 首先检查环境变量
  if (
    (process.env.ANTHROPIC_AUTH_TOKEN && isXmapiBaseUrl(process.env.ANTHROPIC_BASE_URL)) ||
    process.env.MINIMAX_API_KEY ||
    process.env.GLM_API_KEY ||
    process.env.QWEN_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.OPENAI_API_KEY
  ) {
    return true
  }
  
  const config = readProvidersConfig()
  const defaultProvider = config.providers[config.defaultProvider]
  
  return !!(defaultProvider?.apiKey)
}

/**
 * 获取当前激活的 Provider 配置
 */
export function getActiveProviderConfig(): ProviderSettings | null {
  const config = readProvidersConfig()
  return config.providers[config.defaultProvider] ?? null
}

// Provider 默认模型
const DEFAULT_MODELS: Record<string, string> = {
  xmapi: 'gpt-5.4',
  minimax: 'MiniMax-M2.7',
  qwen: 'qwen3.6-plus',
  glm: 'glm-5',
  openai: 'gpt-4o',
  aihubmix: 'gpt-4o-free',
}

/**
 * 设置 Provider 配置并应用到环境变量
 */
export function setProviderConfig(
  providerName: string,
  apiKey: string,
  model?: string,
  baseUrl?: string,
): void {
  const config = readProvidersConfig()
  
  // 确定模型：优先使用传入的 model，其次是已配置的，最后是默认值
  const finalModel = model ?? config.providers[providerName]?.model ?? DEFAULT_MODELS[providerName]
  
  // 确定 baseUrl
  const finalBaseUrl = baseUrl ?? config.providers[providerName]?.baseUrl
  
  config.defaultProvider = providerName
  config.providers[providerName] = {
    ...config.providers[providerName],
    provider: providerName,
    apiKey,
    model: finalModel,
    ...(finalBaseUrl && { baseUrl: finalBaseUrl }),
  }
  
  saveProvidersConfig(config)
  applyProviderToEnv(providerName, apiKey, finalModel)
}

/**
 * 应用 Provider 配置到环境变量
 */
export function applyProviderToEnv(
  providerName?: string,
  apiKey?: string,
  model?: string,
): void {
  const config = readProvidersConfig()
  const provider = providerName ?? config.defaultProvider
  const providerConfig = config.providers[provider]
  
  // 设置 MODEL_PROVIDER（aihubmix 映射到 openai-compat，xmapi 复用 anthropic）
  process.env.MODEL_PROVIDER =
    provider === 'aihubmix'
      ? 'openai-compat'
      : provider === 'xmapi'
        ? 'anthropic'
        : provider
  
  // 保存原始 provider 名称（用于 UI 显示）
  process.env.GONG_ORIGINAL_PROVIDER = provider
  
  clearProviderEnvForSwitch()

  // 需要设置 base URL 的 provider
  if (provider === 'aihubmix') {
    process.env.OPENAI_BASE_URL = providerConfig?.baseUrl || 'https://aihubmix.com/v1'
  } else if (provider === 'xmapi') {
    process.env.ANTHROPIC_BASE_URL = providerConfig?.baseUrl || XMAPI_BASE_URL
  }
  
  // 设置 API Key
  const key = apiKey ?? providerConfig?.apiKey
  if (key) {
    switch (provider) {
      case 'xmapi':
        process.env.ANTHROPIC_AUTH_TOKEN = key
        break
      case 'minimax':
        process.env.MINIMAX_API_KEY = key
        process.env.ANTHROPIC_API_KEY = key  // MiniMax 使用 Anthropic SDK 兼容协议
        process.env.ANTHROPIC_BASE_URL = 'https://api.minimaxi.com/anthropic'
        break
      case 'glm':
        process.env.GLM_API_KEY = key
        break
      case 'qwen':
        process.env.QWEN_API_KEY = key
        process.env.DASHSCOPE_API_KEY = key
        break
      case 'openai':
        process.env.OPENAI_API_KEY = key
        break
      case 'aihubmix':
        // AIHubMix 使用 OpenAI 兼容接口
        process.env.OPENAI_API_KEY = key
        break
    }
  }
  
  // 设置模型
  const modelName = model ?? providerConfig?.model
  if (modelName) {
    switch (provider) {
      case 'xmapi':
        process.env.ANTHROPIC_MODEL = modelName
        break
      case 'minimax':
        process.env.MINIMAX_MODEL = modelName
        break
      case 'glm':
        process.env.GLM_MODEL = modelName
        break
      case 'qwen':
        process.env.QWEN_MODEL = modelName
        break
      case 'openai':
        process.env.OPENAI_MODEL = modelName
        break
      case 'aihubmix':
        process.env.OPENAI_MODEL = modelName
        break
    }
  }
}

/**
 * 初始化：从配置文件加载设置并应用到环境变量
 */
export function initializeProviderConfig(): boolean {
  // 优先从配置文件加载（支持 aihubmix 等需要特殊处理的 provider）
  const config = readProvidersConfig()
  const providerConfig = config.providers[config.defaultProvider]
  
  if (providerConfig?.apiKey) {
    applyProviderToEnv(config.defaultProvider, providerConfig.apiKey, providerConfig.model)
    return true
  }
  
  // 如果配置文件没有，检查环境变量
  if (process.env.MINIMAX_API_KEY) {
    process.env.MODEL_PROVIDER = 'minimax'
    process.env.ANTHROPIC_BASE_URL = 'https://api.minimaxi.com/anthropic'
    return true
  }
  if (process.env.ANTHROPIC_AUTH_TOKEN && isXmapiBaseUrl(process.env.ANTHROPIC_BASE_URL)) {
    process.env.MODEL_PROVIDER = 'anthropic'
    process.env.GONG_ORIGINAL_PROVIDER = 'xmapi'
    return true
  }
  if (process.env.GLM_API_KEY) {
    process.env.MODEL_PROVIDER = 'glm'
    return true
  }
  if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) {
    process.env.MODEL_PROVIDER = 'qwen'
    return true
  }
  if (process.env.OPENAI_API_KEY) {
    process.env.MODEL_PROVIDER = 'openai-compat'
    return true
  }
  
  return false
}

/**
 * 清除所有 Provider 的 API Key
 */
export function clearAllApiKeys(): void {
  const config = readProvidersConfig()
  
  // 清除所有 provider 的 API Key
  for (const providerName of Object.keys(config.providers)) {
    if (config.providers[providerName]) {
      config.providers[providerName].apiKey = undefined
    }
  }
  
  // 保存配置
  saveProvidersConfig(config)
  
  // 清除环境变量中的 API Key
  delete process.env.MINIMAX_API_KEY
  delete process.env.GLM_API_KEY
  delete process.env.QWEN_API_KEY
  delete process.env.DASHSCOPE_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
}
