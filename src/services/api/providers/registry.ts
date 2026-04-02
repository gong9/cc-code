/**
 * Provider 注册中心
 * 
 * 管理所有已注册的模型 Provider，提供统一的获取和切换机制。
 */

import type { ModelProvider, ProviderConfig } from './types.js'

/**
 * Provider 工厂函数类型
 */
type ProviderFactory = (config?: ProviderConfig) => ModelProvider

/**
 * Provider 注册中心
 * 
 * 单例模式，全局管理所有 Provider。
 */
class ProviderRegistry {
  private static instance: ProviderRegistry

  /** 已注册的 Provider 实例 */
  private providers = new Map<string, ModelProvider>()

  /** Provider 工厂函数 */
  private factories = new Map<string, ProviderFactory>()

  /** 当前激活的 Provider 名称 (默认使用 MiniMax) */
  private activeProviderName: string = 'minimax'

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry()
    }
    return ProviderRegistry.instance
  }

  /**
   * 注册 Provider 工厂函数
   * 
   * @param name Provider 名称
   * @param factory 工厂函数
   */
  registerFactory(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory)
  }

  /**
   * 注册 Provider 实例
   * 
   * @param provider Provider 实例
   */
  register(provider: ModelProvider): void {
    this.providers.set(provider.name, provider)
  }

  /**
   * 获取 Provider 实例
   * 
   * @param name Provider 名称 (默认返回当前激活的 Provider)
   * @param config 配置 (用于创建新实例)
   * @returns Provider 实例
   */
  get(name?: string, config?: ProviderConfig): ModelProvider {
    const providerName = name || this.activeProviderName

    // 先检查已有实例
    const existing = this.providers.get(providerName)
    if (existing && !config) {
      return existing
    }

    // 尝试通过工厂创建
    const factory = this.factories.get(providerName)
    if (factory) {
      const provider = factory(config)
      // 如果没有传入 config，缓存实例
      if (!config) {
        this.providers.set(providerName, provider)
      }
      return provider
    }

    // 回退到 minimax (默认 Provider)
    const fallback = this.providers.get('minimax')
    if (fallback) {
      console.warn(`Provider "${providerName}" not found, falling back to minimax`)
      return fallback
    }

    throw new Error(
      `Provider "${providerName}" not found and no fallback available. ` +
      `Available providers: ${this.listProviders().join(', ')}`
    )
  }

  /**
   * 设置当前激活的 Provider
   * 
   * @param name Provider 名称
   */
  setActiveProvider(name: string): void {
    if (!this.providers.has(name) && !this.factories.has(name)) {
      throw new Error(
        `Cannot set active provider to "${name}": not registered. ` +
        `Available providers: ${this.listProviders().join(', ')}`
      )
    }
    this.activeProviderName = name
  }

  /**
   * 获取当前激活的 Provider 名称
   */
  getActiveProviderName(): string {
    return this.activeProviderName
  }

  /**
   * 获取当前激活的 Provider 实例
   */
  getActiveProvider(): ModelProvider {
    return this.get(this.activeProviderName)
  }

  /**
   * 检查 Provider 是否已注册
   * 
   * @param name Provider 名称
   */
  has(name: string): boolean {
    return this.providers.has(name) || this.factories.has(name)
  }

  /**
   * 获取所有已注册的 Provider 名称
   */
  listProviders(): string[] {
    const names = new Set<string>()
    for (const name of this.providers.keys()) {
      names.add(name)
    }
    for (const name of this.factories.keys()) {
      names.add(name)
    }
    return Array.from(names)
  }

  /**
   * 获取所有 Provider 的能力信息
   */
  listCapabilities(): Array<{
    name: string
    displayName: string
    capabilities: ModelProvider['capabilities']
  }> {
    const result: Array<{
      name: string
      displayName: string
      capabilities: ModelProvider['capabilities']
    }> = []

    for (const provider of this.providers.values()) {
      result.push({
        name: provider.name,
        displayName: provider.displayName,
        capabilities: provider.capabilities,
      })
    }

    return result
  }

  /**
   * 清除所有注册的 Provider (用于测试)
   */
  clear(): void {
    this.providers.clear()
    this.factories.clear()
    this.activeProviderName = 'minimax'
  }

  /**
   * 移除指定 Provider
   * 
   * @param name Provider 名称
   */
  unregister(name: string): boolean {
    const hadProvider = this.providers.delete(name)
    const hadFactory = this.factories.delete(name)

    // 如果移除的是当前激活的 Provider，重置为 minimax
    if (this.activeProviderName === name) {
      this.activeProviderName = 'minimax'
    }

    return hadProvider || hadFactory
  }
}

/**
 * 全局 Provider 注册中心实例
 */
export const providerRegistry = ProviderRegistry.getInstance()

/**
 * 便捷函数：获取 Provider
 */
export function getProvider(name?: string, config?: ProviderConfig): ModelProvider {
  return providerRegistry.get(name, config)
}

/**
 * 便捷函数：获取当前激活的 Provider
 */
export function getActiveProvider(): ModelProvider {
  return providerRegistry.getActiveProvider()
}

/**
 * 便捷函数：设置当前激活的 Provider
 */
export function setActiveProvider(name: string): void {
  providerRegistry.setActiveProvider(name)
}

/**
 * 便捷函数：注册 Provider
 */
export function registerProvider(provider: ModelProvider): void {
  providerRegistry.register(provider)
}

/**
 * 便捷函数：注册 Provider 工厂
 */
export function registerProviderFactory(name: string, factory: ProviderFactory): void {
  providerRegistry.registerFactory(name, factory)
}
