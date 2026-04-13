/**
 * 交互式模型配置组件
 * 在启动时让用户选择模型并输入 API Key
 */

import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from '../ink.js'
import { Select, type OptionWithDescription } from './CustomSelect/select.js'
import {
  setProviderConfig,
  readProvidersConfig,
  PROVIDER_OPTIONS,
  isXmapiBaseUrl,
} from '../services/api/providers/providerConfig.js'
import {
  getCategoryOptions,
  getModelOptions,
  AIHUBMIX_BASE_URL,
  AIHUBMIX_API_KEY_URL,
} from '../services/api/providers/aihubmixModels.js'
import { Clawd } from './LogoV2/Clawd.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'

type Step = 
  | 'select-provider' 
  | 'input-key' 
  | 'select-category'  // AIHubMix 专用
  | 'select-model'     // AIHubMix 专用
  | 'input-model'      // AIHubMix 自定义输入
  | 'done'

interface Props {
  onDone: () => void
}

// 各 Provider 的 API Key 获取地址
const API_KEY_URLS: Record<string, string> = {
  xmapi: 'https://docs.xmapi.cc/guide/cli-claude-code',
  minimax: 'https://platform.minimax.chat/user-center/basic-information/interface-key',
  glm: 'https://open.bigmodel.cn/usercenter/apikeys',
  qwen: 'https://bailian.console.aliyun.com/',
  openai: 'https://platform.openai.com/api-keys',
  aihubmix: AIHUBMIX_API_KEY_URL,
}

export function ProviderSetup({ onDone }: Props): React.ReactNode {
  const [step, setStep] = useState<Step>('select-provider')
  const [selectedProvider, setSelectedProvider] = useState<string>('minimax')
  const [apiKey, setApiKey] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [customModel, setCustomModel] = useState<string>('')
  const [error, setError] = useState<string>('')

  // 处理 Ctrl+C 退出
  useKeybinding('app:interrupt', () => {
    process.exit(0)
  }, { context: 'Global', isActive: true })

  // Provider 选项
  const providerOptions: OptionWithDescription<string>[] = PROVIDER_OPTIONS.map(
    (opt) => ({
      value: opt.value,
      label: opt.label,
      description: opt.description,
    }),
  )

  // 处理 Provider 选择
  const handleProviderSelect = useCallback((value: string) => {
    setSelectedProvider(value)
    setStep('input-key')
    setError('')
  }, [])

  // 处理分类选择 (AIHubMix)
  const handleCategorySelect = useCallback((value: string) => {
    setSelectedCategory(value)
    if (value === 'custom') {
      setStep('input-model')
    } else {
      setStep('select-model')
    }
    setError('')
  }, [])

  // 处理模型选择 (AIHubMix)
  const handleModelSelect = useCallback((modelId: string) => {
    setProviderConfig(selectedProvider, apiKey.trim(), modelId, AIHUBMIX_BASE_URL)
    setStep('done')
    onDone()
  }, [selectedProvider, apiKey, onDone])

  // 处理按键输入
  useInput(
    (input, key) => {
      if (step === 'input-key') {
        if (key.return) {
          if (apiKey.trim().length < 10) {
            setError('API Key 太短，请输入有效的 Key')
            return
          }
          
          // AIHubMix 需要继续选择模型
          if (selectedProvider === 'aihubmix') {
            setStep('select-category')
          } else {
            setProviderConfig(selectedProvider, apiKey.trim())
            setStep('done')
            onDone()
          }
        } else if (key.escape) {
          setStep('select-provider')
          setApiKey('')
          setError('')
        } else if (key.backspace || key.delete) {
          setApiKey((prev) => prev.slice(0, -1))
          setError('')
        } else if (input && !key.ctrl && !key.meta) {
          setApiKey((prev) => prev + input)
          setError('')
        }
      } else if (step === 'input-model') {
        if (key.return) {
          if (customModel.trim().length < 2) {
            setError('模型 ID 太短')
            return
          }
          setProviderConfig(selectedProvider, apiKey.trim(), customModel.trim(), AIHUBMIX_BASE_URL)
          setStep('done')
          onDone()
        } else if (key.escape) {
          setStep('select-category')
          setCustomModel('')
          setError('')
        } else if (key.backspace || key.delete) {
          setCustomModel((prev) => prev.slice(0, -1))
          setError('')
        } else if (input && !key.ctrl && !key.meta) {
          setCustomModel((prev) => prev + input)
          setError('')
        }
      }
    },
    { isActive: step === 'input-key' || step === 'input-model' },
  )

  // Step 1: 选择 Provider
  if (step === 'select-provider') {
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="row" gap={2} marginBottom={1}>
          <Clawd pose="default" />
          <Box flexDirection="column" justifyContent="center">
            <Text bold color="cyan">Gong Code v{MACRO.VERSION}</Text>
            <Text dimColor>AI 编程助手</Text>
          </Box>
        </Box>
        <Select
          options={providerOptions}
          onChange={handleProviderSelect}
        />
        <Text dimColor>回车确认</Text>
      </Box>
    )
  }

  // Step 2: 输入 API Key
  if (step === 'input-key') {
    const maskedKey = apiKey.length > 0 ? '*'.repeat(Math.min(apiKey.length, 20)) + (apiKey.length > 20 ? '...' : '') : ''
    const providerLabel = PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || selectedProvider
    const apiKeyUrl = API_KEY_URLS[selectedProvider] || ''
    
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text bold color="cyan">🔑 输入 {providerLabel} API Key</Text>
        {apiKeyUrl && <Text dimColor>获取地址: {apiKeyUrl}</Text>}
        <Box marginTop={1}>
          <Text>API Key: </Text>
          <Text color="green">{maskedKey}</Text>
          <Text color="gray">▌</Text>
        </Box>
        {error && <Text color="red">{error}</Text>}
        <Text dimColor>输入后按回车确认，Esc 返回</Text>
      </Box>
    )
  }

  // Step 3: 选择模型分类 (AIHubMix 专用)
  if (step === 'select-category') {
    const categoryOptions = getCategoryOptions()
    
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text bold color="cyan">🎯 选择模型分类</Text>
        <Text dimColor>AIHubMix 支持多种模型</Text>
        <Box marginTop={1}>
          <Select
            options={categoryOptions}
            onChange={handleCategorySelect}
          />
        </Box>
        <Text dimColor>回车确认</Text>
      </Box>
    )
  }

  // Step 4: 选择具体模型 (AIHubMix 专用)
  if (step === 'select-model') {
    const modelOptions = getModelOptions(selectedCategory)
    
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text bold color="cyan">🤖 选择模型</Text>
        <Box marginTop={1}>
          <Select
            options={modelOptions}
            onChange={handleModelSelect}
          />
        </Box>
        <Text dimColor>回车确认</Text>
      </Box>
    )
  }

  // Step 5: 自定义输入模型 ID (AIHubMix 专用)
  if (step === 'input-model') {
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text bold color="cyan">📝 输入模型 ID</Text>
        <Text dimColor>从 aihubmix.com/models 复制模型 ID</Text>
        <Box marginTop={1}>
          <Text>Model ID: </Text>
          <Text color="green">{customModel}</Text>
          <Text color="gray">▌</Text>
        </Box>
        {error && <Text color="red">{error}</Text>}
        <Text dimColor>输入后按回车确认，Esc 返回</Text>
      </Box>
    )
  }

  return null
}

/**
 * 检查是否需要显示配置界面
 */
export function needsProviderSetup(): boolean {
  // 如果环境变量中有任意 API Key，不需要配置
  if (
    (process.env.ANTHROPIC_AUTH_TOKEN && isXmapiBaseUrl(process.env.ANTHROPIC_BASE_URL)) ||
    process.env.MINIMAX_API_KEY ||
    process.env.GLM_API_KEY ||
    process.env.QWEN_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.OPENAI_API_KEY
  ) {
    return false
  }

  // 检查配置文件中默认 Provider 是否有 API Key
  const config = readProvidersConfig()
  const defaultProviderConfig = config.providers[config.defaultProvider]
  
  return !defaultProviderConfig?.apiKey
}
