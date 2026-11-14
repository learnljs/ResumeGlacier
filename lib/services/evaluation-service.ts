/**
 * 评估维度评分服务
 *
 * 提供评估维度的读写接口和得分计算服务。
 */

import { prisma } from '@/lib/prisma'
import { EVALUATION_DIMENSIONS, DIMENSION_KEYS, type DimensionKey } from '@/lib/constants/evaluation'
import { computeWeightedScore } from '@/lib/utils/score-math'

/**
 * 算分公式已抽到 lib/utils/score-math.ts（纯函数、可单测）。
 * 这里 re-export 保持既有的 '@/lib/services/evaluation-service' 导入路径不变。
 */
export { computeWeightedScore } from '@/lib/utils/score-math'

/**
 * 获取指定简历的评估维度列表
 * @param resumeId 简历 ID
 * @param positionId 可选，职位 ID
 * @returns 评估维度数组，按固定顺序排列
 */
export async function getEvaluations(resumeId: string, positionId?: string) {
  // 获取该简历的评估维度，按 positionId 过滤（如果传了）
  const where: Record<string, unknown> = { resumeId }
  if (positionId) {
    where.positionId = positionId
  }
  const evaluations = await prisma.evaluationDimension.findMany({
    where,
    orderBy: { source: 'asc' }, // 'ai' 在前，'manual' 在后
  })

  // 按维度分组，优先使用 manual 评分
  const dimensionMap = new Map<string, typeof evaluations[0]>()
  for (const eval_ of evaluations) {
    const existing = dimensionMap.get(eval_.dimension)
    if (!existing || eval_.source === 'manual') {
      dimensionMap.set(eval_.dimension, eval_)
    }
  }

  // 转换为数组并按固定维度顺序排序
  const result = Array.from(dimensionMap.values())
  const orderMap = new Map(DIMENSION_KEYS.map((key, i) => [key, i]))
  result.sort((a, b) => {
    const orderA = orderMap.get(a.dimension as DimensionKey) ?? 99
    const orderB = orderMap.get(b.dimension as DimensionKey) ?? 99
    return orderA - orderB
  })

  return result
}

/**
 * 批量保存评估维度评分
 * 采用 upsert 逻辑：存在则更新，不存在则创建
 * @param resumeId 简历 ID
 * @param positionId 职位 ID（可空）
 * @param dimensions 维度评分数组
 * @param source 评分来源
 * @returns 保存的记录数
 */
export async function saveEvaluations(
  resumeId: string,
  positionId: string | null,
  dimensions: { dimension: string; rating: number | null; comment?: string; aiDetail?: object | null }[],
  source: 'ai' | 'manual'
): Promise<number> {
  let saved = 0

  for (const dim of dimensions) {
    // 查找已有记录（优先查找同 source 的记录）
    let existing = await prisma.evaluationDimension.findFirst({
      where: {
        resumeId,
        positionId: positionId || null,
        dimension: dim.dimension,
        source,
      },
    })

    // 如果没找到，查找同岗位同维度的记录（含 AI 评分），用于转为手动评分
    if (!existing) {
      existing = await prisma.evaluationDimension.findFirst({
        where: {
          resumeId,
          positionId: positionId || null,
          dimension: dim.dimension,
        },
      })
    }

    if (existing) {
      // 更新已有记录
      // 手动评分时保留原有的 aiDetail（永不自动清空），AI 评分时更新 aiDetail
      const updateData: Record<string, unknown> = {
        rating: dim.rating,
        comment: dim.comment ?? null,
        source,
        positionId: positionId || null,
      }
      if (source === 'ai') {
        updateData.aiDetail = dim.aiDetail ? JSON.stringify(dim.aiDetail) : null
      }
      // source === 'manual' 时不更新 aiDetail，保留 AI 原始依据

      await prisma.evaluationDimension.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      // 创建新记录
      await prisma.evaluationDimension.create({
        data: {
          resumeId,
          positionId: positionId || null,
          dimension: dim.dimension,
          rating: dim.rating,
          comment: dim.comment ?? null,
          aiDetail: dim.aiDetail ? JSON.stringify(dim.aiDetail) : null,
          source,
        },
      })
    }
    saved++
  }

  // 自动重新计算得分
  await autoCalculateScores(resumeId, positionId || undefined)

  return saved
}

/**
 * 计算指定简历在指定权重模型下的得分
 * 不修改数据库，仅计算返回
 * @param resumeId 简历 ID
 * @param weightModelId 权重模型 ID
 * @returns 得分详情
 */
export async function calculateScore(
  resumeId: string,
  weightModelId: string,
  positionId?: string
) {
  // 获取权重模型
  const weightModel = await prisma.weightModel.findUnique({
    where: { id: weightModelId },
  })
  if (!weightModel) {
    throw new Error('权重模型不存在')
  }

  // 获取该简历的评估维度（可选按岗位过滤）
  const where: Record<string, unknown> = { resumeId }
  if (positionId) {
    where.positionId = positionId
  }
  const evaluations = await prisma.evaluationDimension.findMany({
    where,
    orderBy: { source: 'asc' }, // 'ai' 在前，'manual' 在后，manual 会覆盖 ai
  })

  // 构建维度评分映射（优先使用 manual 评分）
  const ratingMap = new Map<string, { rating: number | null; comment: string | null }>()
  for (const eval_ of evaluations) {
    // 如果已经有 manual 评分，则不覆盖
    const existing = ratingMap.get(eval_.dimension)
    if (!existing || eval_.source === 'manual') {
      ratingMap.set(eval_.dimension, {
        rating: eval_.rating,
        comment: eval_.comment,
      })
    }
  }

  // 解析权重配置
  const weights: Record<string, number> = JSON.parse(weightModel.weights)

  // 计算各维度得分
  const dimensions = DIMENSION_KEYS
    .filter((key) => key in weights) // 只计算该模型包含的维度
    .map((key) => {
      const weight = weights[key]
      const evalData = ratingMap.get(key)
      const rating = evalData?.rating ?? null
      const comment = evalData?.comment ?? null
      const score = rating !== null ? computeWeightedScore(rating, weight) : 0

      return {
        dimension: key,
        label: EVALUATION_DIMENSIONS[key].label,
        rating,
        weight,
        score,
        comment,
      }
    })

  // 计算总分
  const totalScore = Number(
    dimensions.reduce((sum, d) => sum + d.score, 0).toFixed(1)
  )

  return {
    weightModel: {
      id: weightModel.id,
      name: weightModel.name,
      category: weightModel.category,
    },
    dimensions,
    totalScore,
  }
}

/**
 * 自动用职位默认模型计算初筛/综合得分并更新 PositionEvaluation 表
 * - 使用目标岗位的默认初筛模型计算 initialScore
 * - 使用目标岗位的默认冰山模型计算 compositeScore
 * - 如果目标岗位无关联或无默认模型，则得分为 null
 * @param resumeId 简历 ID
 * @param targetPositionId 目标岗位 ID（用于复用评估指定新岗位，不传则使用 resume.positionId）
 */
export async function autoCalculateScores(resumeId: string, targetPositionId?: string) {
  // 确定目标岗位 ID
  let effectivePositionId = targetPositionId

  // 如果没有传 targetPositionId，从简历上取
  if (!effectivePositionId) {
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: { positionId: true },
    })
    if (!resume) return
    effectivePositionId = resume.positionId || undefined
  }

  // 无目标岗位 → 无法计算分数，直接返回（不清除已有评估，避免误伤其他岗位的分数）
  if (!effectivePositionId) {
    return
  }

  // 获取目标岗位的默认模型
  const position = await prisma.position.findUnique({
    where: { id: effectivePositionId },
    select: {
      defaultInitialModelId: true,
      defaultIcebergModelId: true,
    },
  })

  if (!position) {
    await prisma.positionEvaluation.updateMany({
      where: { resumeId, positionId: effectivePositionId },
      data: { initialScore: null, compositeScore: null },
    })
    return
  }

  // 计算初筛得分（按岗位过滤维度评分）
  let initialScore: number | null = null
  if (position.defaultInitialModelId) {
    try {
      const result = await calculateScore(resumeId, position.defaultInitialModelId, effectivePositionId)
      if (result.totalScore > 0) {
        initialScore = result.totalScore
      } else {
        initialScore = null
      }
    } catch {
      initialScore = null
    }
  }

  // 计算综合得分（按岗位过滤维度评分）
  let compositeScore: number | null = null
  if (position.defaultIcebergModelId) {
    try {
      const result = await calculateScore(resumeId, position.defaultIcebergModelId, effectivePositionId)
      compositeScore = result.totalScore > 0 ? result.totalScore : null
    } catch {
      compositeScore = null
    }
  }

  // 写入 PositionEvaluation（按目标岗位查找）
  const latestEval = await prisma.positionEvaluation.findFirst({
    where: { resumeId, positionId: effectivePositionId },
    orderBy: { createdAt: 'desc' },
  })
  if (latestEval) {
    await prisma.positionEvaluation.update({
      where: { id: latestEval.id },
      data: { initialScore, compositeScore },
    })
  }
}
