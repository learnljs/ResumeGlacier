/**
 * AI 配置辅助函数
 * 按用途获取 AI 配置，复用于 screening / extraction / ocr 三个场景
 */

import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/services/encryption'
import type { AIPurpose } from '@/types/resume'

interface AIConfigResult {
  client: OpenAI
  model: string
  configId: string | null
}

/**
 * 构造 OpenAI 客户端
 * 统一 timeout/maxRetries，避免多处构造时参数漂移（测试路由与生产通道保持一致）
 */
export function createOpenAIClient(apiKey: string, baseURL?: string | null): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    timeout: 120_000,
    maxRetries: 1,
  })
}

/**
 * 检查 AIConfig 的 purposes 字段是否包含指定用途
 */
function hasPurpose(purposes: string, purpose: AIPurpose): boolean {
  const list = purposes.split(',').map((p) => p.trim())
  return list.includes(purpose)
}

/**
 * 按用途获取 AI 配置
 * 优先级: 指定 configId > isDefault 且 purposes 包含该 purpose >
 *          第一个 active 且 purposes 包含该 purpose >
 *          回退到环境变量（仅 screening/extraction）
 */
export async function getAIConfigByPurpose(
  purpose: AIPurpose,
  aiConfigId?: string
): Promise<AIConfigResult> {
  // 如果指定了 configId，直接使用
  if (aiConfigId) {
    const dbConfig = await prisma.aIConfig.findUnique({
      where: { id: aiConfigId },
    })
    if (!dbConfig || !dbConfig.isActive) {
      throw new Error('指定的 AI 模型配置不存在或已禁用')
    }
    return createAIResult(dbConfig)
  }

  // 查找 isDefault 且包含该 purpose 的配置
  let dbConfig = await prisma.aIConfig.findFirst({
    where: { isDefault: true, isActive: true },
  })

  if (!dbConfig || !hasPurpose(dbConfig.purposes, purpose)) {
    // 查找第一个 active 且包含该 purpose 的配置
    const allConfigs = await prisma.aIConfig.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    })

    dbConfig = allConfigs.find((c) => hasPurpose(c.purposes, purpose)) || null

    if (!dbConfig) {
      // 回退：vision 先尝试 extraction 用途（常为视觉 capable 模型，如 gpt-4o）
      if (purpose === 'vision') {
        dbConfig = allConfigs.find((c) => hasPurpose(c.purposes, 'extraction')) || null
      }
      // 回退：尝试 screening 用途的配置（用于 extraction 和 ocr）
      if (!dbConfig && purpose !== 'screening') {
        dbConfig = allConfigs.find((c) => hasPurpose(c.purposes, 'screening')) || null
      }

      if (!dbConfig) {
        // 回退到环境变量（仅用于筛选和结构化提取；vision/ocr 不回退，因环境模型可能不支持视觉/OCR）
        if (purpose !== 'ocr' && purpose !== 'vision') {
          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) {
            throw new Error('未配置 AI 模型，请在「AI模型配置」页面配置 AI 模型参数')
          }
          return {
            client: createOpenAIClient(apiKey, process.env.OPENAI_BASE_URL),
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            configId: null,
          }
        }
        const purposeLabel =
          purpose === 'ocr' ? 'OCR' :
          purpose === 'vision' ? '头像识别（需支持视觉的模型）' :
          purpose === 'extraction' ? '结构化提取' : ''
        throw new Error(
          `未配置${purposeLabel}用途的AI模型，请在AI模型配置中添加配置`
        )
      }
    }
  }

  return createAIResult(dbConfig)
}

/**
 * 创建 AI 结果对象
 */
function createAIResult(
  dbConfig: {
    apiKey: string
    baseUrl: string | null
    model: string
    id: string
  }
): AIConfigResult {
  const apiKey = decrypt(dbConfig.apiKey)
  return {
    client: createOpenAIClient(apiKey, dbConfig.baseUrl),
    model: dbConfig.model,
    configId: dbConfig.id,
  }
}

/**
 * 获取所有 AI 配置（按用途分组）
 */
export async function getAllAIConfigs() {
  const configs = await prisma.aIConfig.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { evaluations: true } },
    },
  })

  return configs.map((c) => ({
    id: c.id,
    alias: c.alias,
    provider: c.provider,
    baseUrl: c.baseUrl,
    model: c.model,
    purposes: c.purposes,
    isDefault: c.isDefault,
    isActive: c.isActive,
    hasApiKey: true,
    _count: c._count,
  }))
}
