/**
 * 多模型配置存储和读取模块
 * 配置保存在 ~/.claude/providers.json
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

const DEFAULT_CONFIG: ProvidersConfig = {
  defaultProvider: 'minimax',
  providers: {
    minimax: {
      provider: 'minimax',
      model: 'MiniMax-M2.7',
    },
    glm: {
      provider: 'glm',
      model: 'glm-4-plus',
    },
    openai: {
      provider: 'openai',
      model: 'gpt-4o',
    },
  },
}

export const PROVIDER_OPTIONS = [
  { value: 'minimax', label: 'MiniMax (推荐)', description: 'MiniMax M2.7 大模型' },
  { value: 'glm', label: '智谱 GLM', description: 'GLM-4 系列大模型' },
  { value: 'openai', label: 'OpenAI 兼容', description: 'OpenAI API 或兼容接口' },
] as const

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
}

function getConfigPath(): string {
  return join(getConfigDir(), 'providers.json')
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
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        providers: {
          ...DEFAULT_CONFIG.providers,
          ...parsed.providers,
        },
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
  if (process.env.MINIMAX_API_KEY || process.env.GLM_API_KEY || process.env.OPENAI_API_KEY) {
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

/**
 * 设置 Provider 配置并应用到环境变量
 */
export function setProviderConfig(
  providerName: string,
  apiKey: string,
  model?: string,
): void {
  const config = readProvidersConfig()
  
  config.defaultProvider = providerName
  config.providers[providerName] = {
    ...config.providers[providerName],
    provider: providerName,
    apiKey,
    model: model ?? config.providers[providerName]?.model,
  }
  
  saveProvidersConfig(config)
  applyProviderToEnv(providerName, apiKey, model)
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
  
  // 设置 MODEL_PROVIDER
  process.env.MODEL_PROVIDER = provider
  
  // 设置 API Key
  const key = apiKey ?? providerConfig?.apiKey
  if (key) {
    switch (provider) {
      case 'minimax':
        process.env.MINIMAX_API_KEY = key
        process.env.ANTHROPIC_API_KEY = key  // MiniMax 使用 Anthropic SDK 兼容协议
        process.env.ANTHROPIC_BASE_URL = 'https://api.minimaxi.com/anthropic'
        break
      case 'glm':
        process.env.GLM_API_KEY = key
        break
      case 'openai':
        process.env.OPENAI_API_KEY = key
        break
    }
  }
  
  // 设置模型
  const modelName = model ?? providerConfig?.model
  if (modelName) {
    switch (provider) {
      case 'minimax':
        process.env.MINIMAX_MODEL = modelName
        break
      case 'glm':
        process.env.GLM_MODEL = modelName
        break
      case 'openai':
        process.env.OPENAI_MODEL = modelName
        break
    }
  }
}

/**
 * 初始化：从配置文件加载设置并应用到环境变量
 */
export function initializeProviderConfig(): boolean {
  // 如果环境变量中已有 API Key，直接使用
  if (process.env.MINIMAX_API_KEY) {
    process.env.MODEL_PROVIDER = 'minimax'
    process.env.ANTHROPIC_BASE_URL = 'https://api.minimaxi.com/anthropic'
    return true
  }
  if (process.env.GLM_API_KEY) {
    process.env.MODEL_PROVIDER = 'glm'
    return true
  }
  if (process.env.OPENAI_API_KEY) {
    process.env.MODEL_PROVIDER = 'openai'
    return true
  }
  
  // 从配置文件加载
  const config = readProvidersConfig()
  const providerConfig = config.providers[config.defaultProvider]
  
  if (providerConfig?.apiKey) {
    applyProviderToEnv(config.defaultProvider, providerConfig.apiKey, providerConfig.model)
    return true
  }
  
  return false
}
