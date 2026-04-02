/**
 * 交互式模型配置组件
 * 在启动时让用户选择模型并输入 API Key
 */

import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from '../ink.js'
import { Select, type OptionWithDescription } from './CustomSelect/select.js'
import {
  PROVIDER_OPTIONS,
  setProviderConfig,
  readProvidersConfig,
} from '../services/api/providers/providerConfig.js'

type Step = 'select-provider' | 'input-key' | 'done'

interface Props {
  onDone: () => void
}

export function ProviderSetup({ onDone }: Props): React.ReactNode {
  const [step, setStep] = useState<Step>('select-provider')
  const [selectedProvider, setSelectedProvider] = useState<string>('minimax')
  const [apiKey, setApiKey] = useState<string>('')
  const [error, setError] = useState<string>('')

  const config = readProvidersConfig()

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

  // 处理按键输入
  useInput(
    (input, key) => {
      if (step !== 'input-key') return

      if (key.return) {
        // 提交
        if (apiKey.trim().length < 10) {
          setError('API Key 太短，请输入有效的 Key')
          return
        }
        setProviderConfig(selectedProvider, apiKey.trim())
        setStep('done')
        onDone()
      } else if (key.escape) {
        // 返回选择
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
    },
    { isActive: step === 'input-key' },
  )

  const getProviderLabel = (value: string): string => {
    return PROVIDER_OPTIONS.find((p) => p.value === value)?.label ?? value
  }

  if (step === 'select-provider') {
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text bold color="cyan">
          🤖 选择 AI 模型
        </Text>
        <Select
          options={providerOptions}
          defaultValue={config.defaultProvider}
          onChange={handleProviderSelect}
        />
        <Text dimColor>使用 ↑↓ 选择，回车确认</Text>
      </Box>
    )
  }

  if (step === 'input-key') {
    const maskedKey = apiKey.length > 0 ? '*'.repeat(Math.min(apiKey.length, 20)) + (apiKey.length > 20 ? '...' : '') : ''
    
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text bold color="cyan">
          🔑 输入 {getProviderLabel(selectedProvider)} API Key
        </Text>
        <Box>
          <Text>API Key: </Text>
          <Text color="green">{maskedKey}</Text>
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
  // 如果环境变量中有 API Key，不需要配置
  if (
    process.env.MINIMAX_API_KEY ||
    process.env.GLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  ) {
    return false
  }

  // 检查配置文件
  const config = readProvidersConfig()
  const activeProvider = config.providers[config.defaultProvider]
  
  return !activeProvider?.apiKey
}
