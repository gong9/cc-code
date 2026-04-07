/**
 * AIHubMix 模型分类和列表
 * https://aihubmix.com - 模型聚合平台
 */

export interface AIHubMixModel {
  id: string
  name: string
  description?: string
}

export interface ModelCategory {
  label: string
  description: string
  models: AIHubMixModel[]
}

/**
 * AIHubMix 模型分类
 * 基于 /v1/models API 返回的模型列表整理
 */
export const AIHUBMIX_MODEL_CATEGORIES: Record<string, ModelCategory> = {
  free: {
    label: '免费模型',
    description: '无需付费，适合体验和轻度使用',
    models: [
      { id: 'gpt-4.1-free', name: 'GPT-4.1', description: 'OpenAI 最新' },
      { id: 'gpt-4o-free', name: 'GPT-4o', description: 'OpenAI 多模态' },
      { id: 'gemini-3-flash-preview-free', name: 'Gemini 3 Flash', description: 'Google 最新' },
      { id: 'gemini-3.1-flash-image-preview-free', name: 'Gemini 3.1 Flash', description: 'Google 图像' },
      { id: 'coding-glm-5.1-free', name: 'Coding GLM 5.1', description: '编程专用' },
      { id: 'coding-minimax-m2.7-free', name: 'Coding MiniMax', description: '编程专用' },
      { id: 'glm-4.7-flash-free', name: 'GLM-4.7 Flash', description: '智谱快速' },
      { id: 'step-3.5-flash-free', name: 'Step 3.5 Flash', description: '阶跃快速' },
    ],
  },
  gpt: {
    label: 'GPT 系列',
    description: 'OpenAI 模型',
    models: [
      { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', description: '最新旗舰' },
      { id: 'gpt-5.4', name: 'GPT-5.4', description: '最新通用' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: '快速版本' },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', description: '编程优化' },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', description: '编程版本' },
      { id: 'o3-pro', name: 'o3 Pro', description: '推理旗舰' },
      { id: 'o3', name: 'o3', description: '推理模型' },
      { id: 'o4-mini', name: 'o4 Mini', description: '推理快速' },
    ],
  },
  claude: {
    label: 'Claude 系列',
    description: 'Anthropic 模型',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: '最新旗舰' },
      { id: 'claude-opus-4-6-think', name: 'Claude Opus 4.6 Think', description: '旗舰思考' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: '最新平衡' },
      { id: 'claude-sonnet-4-6-think', name: 'Claude Sonnet 4.6 Think', description: '平衡思考' },
      { id: 'claude-opus-4-5-think', name: 'Claude Opus 4.5 Think', description: '深度思考' },
      { id: 'claude-sonnet-4-5-think', name: 'Claude Sonnet 4.5 Think', description: '快速思考' },
      { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', description: '稳定旗舰' },
      { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', description: '经典版本' },
    ],
  },
  gemini: {
    label: 'Gemini 系列',
    description: 'Google 模型',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: '最新旗舰' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', description: '旗舰版本' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: '快速版本' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '稳定专业' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '稳定快速' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '经济版本' },
    ],
  },
  deepseek: {
    label: 'DeepSeek 系列',
    description: '国产高性价比',
    models: [
      { id: 'DeepSeek-R1-0528', name: 'DeepSeek R1', description: '最新推理' },
      { id: 'DeepSeek-V3.1-Think', name: 'DeepSeek V3.1 Think', description: '思考版本' },
      { id: 'DeepSeek-V3.1-Fast', name: 'DeepSeek V3.1 Fast', description: '快速版本' },
      { id: 'deepseek-v3.2-speciale', name: 'DeepSeek V3.2 SE', description: '特别版' },
      { id: 'DeepSeek-V3.1-Terminus', name: 'DeepSeek V3.1 Terminus', description: '终端版' },
    ],
  },
  custom: {
    label: '自定义输入',
    description: '输入任意模型 ID',
    models: [],
  },
}

/**
 * 获取分类选项（用于 Select 组件）
 */
export function getCategoryOptions() {
  return Object.entries(AIHUBMIX_MODEL_CATEGORIES).map(([key, category]) => ({
    value: key,
    label: category.label,
    description: category.description,
  }))
}

/**
 * 获取指定分类的模型选项
 */
export function getModelOptions(categoryKey: string) {
  const category = AIHUBMIX_MODEL_CATEGORIES[categoryKey]
  if (!category) return []
  
  return category.models.map((model) => ({
    value: model.id,
    label: model.name,
    description: model.description,
  }))
}

/**
 * AIHubMix Base URL
 */
export const AIHUBMIX_BASE_URL = 'https://aihubmix.com/v1'

/**
 * AIHubMix API Key 获取地址
 */
export const AIHUBMIX_API_KEY_URL = 'https://aihubmix.com/token'

/**
 * 动态获取模型列表（可选，用于更新缓存）
 */
export async function fetchAIHubMixModels(apiKey: string): Promise<AIHubMixModel[]> {
  try {
    const response = await fetch(`${AIHUBMIX_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }
    
    const data = await response.json() as { data: Array<{ id: string }> }
    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
    }))
  } catch {
    return []
  }
}
