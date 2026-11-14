import { prisma } from '@/lib/prisma'
import { getAIConfigByPurpose } from '@/lib/services/ai-config-helper'
import { loadAndAssemblePrompt, validateAIOutput } from '@/lib/services/prompt-assembler'
import { autoCalculateScores } from '@/lib/services/evaluation-service'
import { logAiUsage } from '@/lib/services/ai-usage-log'
import type { ItemProgress } from '@/types/resume'

interface ScreeningInput {
  resumeId: string
  positionId?: string
  aiConfigId?: string
  type?: 'initial' | 'reevaluate'
  onProgress?: (progress: ItemProgress) => void
}

/** AI 返回的单个维度结构（开发方案 4.4） */
interface AiDimension {
  star: number
  comment: string
  scoringApplied?: string
  directions: Array<{
    name?: string
    star: number
    comment?: string
    questions: Array<{ key: string; text?: string; answer: boolean; evidence: string | null }>
  }>
}

interface ScreeningOutput {
  knowledge: AiDimension
  skill: AiDimension
  summary?: string
  strengths?: string[]
  weaknesses?: string[]
  extracted_tags?: string[]
}

/**
 * AI 筛选简历（开发方案 4.2 评分流程）
 *
 * 评分逻辑不再由代码计算，改为 AI 根据 knowledgeContent / skillContent 中的
 * ### 评分规则 + overallRules 自行打分，代码仅负责拼接 prompt、解析 JSON、Schema 校验。
 */
export async function screenResume(input: ScreeningInput): Promise<ScreeningOutput> {
  const resume = await prisma.resume.findUnique({
    where: { id: input.resumeId },
  })

  if (!resume) {
    throw new Error('简历不存在')
  }

  if (!resume.extractedText) {
    throw new Error('简历文本未提取或解析失败，无法进行AI筛选')
  }

  const positionId = input.positionId || resume.positionId
  // 开发方案 10.2：无职位则无 PromptRecord，评估直接报错，不走硬编码 fallback
  if (!positionId) {
    throw new Error('简历未分配职位，无法评估（评估提示词按职位配置）')
  }

  // 仅在简历尚未分配职位时（首次评估）设置职位归属，重新评估不改变原有归属
  const resumeUpdateData: { status: string; positionId?: string } = { status: 'SCREENING' }
  if (!resume.positionId) {
    resumeUpdateData.positionId = positionId
  }
  await prisma.resume.update({
    where: { id: resume.id },
    data: resumeUpdateData,
  })

  const startTime = Date.now()
  input.onProgress?.({ stage: 'AI筛选分析', percent: 5 })

  try {
    const { client, model, configId } = await getAIConfigByPurpose('screening', input.aiConfigId)

    // 开发方案 5.1：从 DB 读取 PromptRecord + Position + WeightModel，动态拼接完整 prompt
    const { systemPrompt, userPrompt, knowledgeData, skillData } = await loadAndAssemblePrompt(
      positionId,
      resume.extractedText,
    )

    const apiStart = Date.now()
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 8000,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || ''
    const tokenUsage = response.usage?.total_tokens || 0
    const processingTime = Date.now() - startTime
    const apiMs = Date.now() - apiStart
    // usage 明细拆解（DeepSeek 变体字段兼容，逻辑与替换前一致）
    const usageDetail = response.usage as unknown as {
      prompt_tokens_details?: { cached_tokens?: number }
      completion_tokens_details?: { reasoning_tokens?: number }
      input_tokens_details?: { cached_tokens?: number }
      output_tokens_details?: { reasoning_tokens?: number }
    } | undefined
    const cachedTokens =
      usageDetail?.prompt_tokens_details?.cached_tokens ??
      usageDetail?.input_tokens_details?.cached_tokens ??
      0
    const reasoningTokens =
      usageDetail?.completion_tokens_details?.reasoning_tokens ??
      usageDetail?.output_tokens_details?.reasoning_tokens ??
      0
    logAiUsage({
      ts: new Date().toISOString(),
      resumeId: resume.id,
      stage: 'screening',
      model: response.model || model,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      cachedTokens,
      reasoningTokens,
      totalTokens: tokenUsage,
      apiMs,
      finishReason: response.choices[0]?.finish_reason,
      contentLen: content.length,
    })

    const parsed = parseAIResponse(content)

    // 开发方案 4.4 / 5.1：动态 schema 校验，逐方向逐题检查 answer/evidence
    const validation = validateAIOutput(parsed, knowledgeData, skillData)
    if (!validation.valid) {
      console.error(`[screenResume] 校验失败 errors: ${validation.errors.join(' | ')}`)
      console.error(`[screenResume] AI 原始返回前 800 字: ${content.slice(0, 800)}`)
      throw new Error(`AI返回结构校验失败：${validation.errors.join('；')}`)
    }

    const result = parsed as unknown as ScreeningOutput

    input.onProgress?.({ stage: '保存筛选结果', percent: 95 })

    // 查找该简历对同一岗位的旧评估记录（upsert 语义）
    // 注意：不能用 deleteMany + create 替换旧记录，PositionEvaluation 被删除会级联删除
    // 挂在其上的 FollowUpRecord（onDelete: Cascade），导致重新评估后跟进记录丢失
    const existingEvaluation = await prisma.positionEvaluation.findUnique({
      where: { resumeId_positionId: { resumeId: resume.id, positionId } },
    })

    // === 计算标签（本地结构化数据规则 + AI 补充） ===
    const { detectTagsFromStructuredData } = await import('./tag-detector')
    let ruleTags: string[] = []
    if (resume.structuredData) {
      try {
        const data = JSON.parse(resume.structuredData)
        ruleTags = detectTagsFromStructuredData(data)
      } catch {
        throw new Error('简历结构化数据损坏，无法检测标签')
      }
    } else {
      throw new Error('简历缺少结构化数据，无法检测标签')
    }

    const aiTags = (result.extracted_tags || []).filter((t: string) =>
      t === '大厂背景' || t === '管理经验'
    )
    const allTags = [...new Set([...ruleTags, ...aiTags])]

    if (allTags.includes('往届') && allTags.includes('应届')) {
      const idx = allTags.indexOf('应届')
      if (idx > -1) allTags.splice(idx, 1)
    }

    // 创建 EvaluationDimension 记录（AI 评分）
    // 开发方案 10.3：仍只存 knowledge 和 skill 两行，方向级评分通过 aiDetail 携带
    await prisma.evaluationDimension.deleteMany({
      where: {
        resumeId: resume.id,
        positionId,
        source: 'ai',
        dimension: { in: ['knowledge', 'skill'] },
      },
    })

    await prisma.evaluationDimension.createMany({
      data: [
        {
          resumeId: resume.id,
          positionId,
          dimension: 'knowledge',
          rating: result.knowledge.star,
          comment: result.knowledge.comment,
          aiDetail: JSON.stringify(result.knowledge),
          source: 'ai',
        },
        {
          resumeId: resume.id,
          positionId,
          dimension: 'skill',
          rating: result.skill.star,
          comment: result.skill.comment,
          aiDetail: JSON.stringify(result.skill),
          source: 'ai',
        },
      ],
    })

    // 更新或创建 PositionEvaluation 记录（保留已有 id，避免级联删除跟进记录）
    const evaluationData = {
      aiConfigId: configId,
      summary: result.summary ?? '',
      strengths: JSON.stringify(result.strengths ?? []),
      weaknesses: JSON.stringify(result.weaknesses ?? []),
      aiTags: allTags.length > 0 ? JSON.stringify(allTags) : null,
      aiModel: response.model || model,
      tokenUsage,
      // usage 缺失时存 null（而非 0），保持「老记录只显示总数」的展示约定
      promptTokens: response.usage?.prompt_tokens ?? null,
      completionTokens: response.usage?.completion_tokens ?? null,
      cachedTokens: response.usage ? cachedTokens : null,
      reasoningTokens: response.usage ? reasoningTokens : null,
      processingTime,
      conditions: null,
      screenedAt: new Date(),
    }
    if (existingEvaluation) {
      await prisma.positionEvaluation.update({
        where: { id: existingEvaluation.id },
        data: evaluationData,
      })
    } else {
      await prisma.positionEvaluation.create({
        data: {
          resumeId: resume.id,
          positionId,
          ...evaluationData,
        },
      })
    }

    // 自动计算得分（确定性加权平均，保留以供给前端排序/得分卡，冰山维度亦依赖此函数）
    await autoCalculateScores(resume.id, positionId)

    // 更新简历状态
    await prisma.resume.update({
      where: { id: resume.id },
      data: { status: 'SCREENED' },
    })

    return result
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error(`[screenResume] 异常 resumeId=${resume.id}: ${message}`)
    throw error
  }
}

// === AI 标签关联 ===

/** 标签分类映射表（从标签名推断分类） */
const TAG_CATEGORY_MAP: Record<string, string> = {
  '985': 'hard', '211': 'hard', '海归': 'hard', '应届': 'hard', '往届': 'hard',
  '1-3年经验': 'hard', '3-5年经验': 'hard', '5-10年经验': 'hard', '10年+经验': 'hard',
  '大厂背景': 'hard', '管理经验': 'hard',
}

/** 为简历应用 AI 识别的标签 */
async function applyAITags(resumeId: string, tagNames: string[]) {
  // 仅当已有跟进记录时才打标签（不自动创建跟进记录）
  const record = await prisma.followUpRecord.findFirst({ where: { resumeId } })
  if (!record) return

  // 找到所有 AI 来源的标签 ID
  const aiTags = await prisma.followUpTag.findMany({
    where: { name: { in: tagNames } },
  })
  const existingAiTagNames = new Set(aiTags.map(t => t.name))

  // 创建不存在的标签
  for (const name of tagNames) {
    if (!existingAiTagNames.has(name)) {
      const category = TAG_CATEGORY_MAP[name] || 'hard'
      const tag = await prisma.followUpTag.create({
        data: { name, source: 'ai', category, color: '#3b82f6' },
      })
      aiTags.push(tag)
    }
  }

  const aiTagIds = aiTags.map(t => t.id)

  if (aiTagIds.length === 0) return

  // 删除旧的 AI 标签关联（仅 source='ai' 的标签）
  const oldAiTagIds = (await prisma.followUpTag.findMany({
    where: { source: 'ai' },
    select: { id: true },
  })).map(t => t.id)

  await prisma.followUpRecordTag.deleteMany({
    where: {
      followUpRecordId: record.id,
      followUpTagId: { in: oldAiTagIds },
    },
  })

  // 创建新的关联
  for (const followUpTagId of aiTagIds) {
    await prisma.followUpRecordTag.create({
      data: { followUpRecordId: record.id, followUpTagId },
    })
  }

  // 清理孤立 AI 标签（不再被任何记录引用）
  const usedAiTagIds = (await prisma.followUpRecordTag.findMany({
    where: { followUpTagId: { in: oldAiTagIds } },
    select: { followUpTagId: true },
    distinct: ['followUpTagId'],
  })).map(t => t.followUpTagId)

  const orphanIds = oldAiTagIds.filter(id => !usedAiTagIds.includes(id))
  if (orphanIds.length > 0) {
    await prisma.followUpTag.deleteMany({
      where: { id: { in: orphanIds }, source: 'ai' },
    })
  }
}

/**
 * 解析 AI 返回的 JSON（开发方案 4.4 新格式）
 * 兼容 AI 在 JSON 前后加说明文字的情况
 */
function parseAIResponse(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content)
  } catch (e1) {
    const reason1 = e1 instanceof Error ? e1.message : String(e1)
    const contentLen = content.length
    const contentPreview = content.slice(0, 200) + '...' + content.slice(-200)
    console.error(`[parseAIResponse] JSON.parse 失败 (len=${contentLen}): ${reason1}`)
    console.error(`[parseAIResponse] 原始内容预览: ${contentPreview}`)

    // 尝试正则提取 JSON（兼容 AI 在 JSON 前后加说明文字的情况）
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch (e2) {
        const reason2 = e2 instanceof Error ? e2.message : String(e2)
        const matchLen = jsonMatch[0].length
        const matchPreview = jsonMatch[0].slice(0, 200) + '...' + jsonMatch[0].slice(-200)
        console.error(`[parseAIResponse] 正则提取后 JSON.parse 仍失败 (len=${matchLen}): ${reason2}`)
        console.error(`[parseAIResponse] 提取内容预览: ${matchPreview}`)
      }
    } else {
      console.error('[parseAIResponse] 正则未匹配到 JSON（内容中可能没有有效的花括号结构）')
    }
    throw new Error('AI返回格式异常，无法解析筛选结果')
  }
}
