/**
 * 评估维度 API
 *
 * GET  /api/evaluations — 获取指定简历的评估维度数据
 * POST /api/evaluations — 批量保存评估维度评分
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { getEvaluations, saveEvaluations } from '@/lib/services/evaluation-service'
import { DIMENSION_KEYS, EVALUATION_SOURCES, type DimensionKey } from '@/lib/constants/evaluation'

/**
 * GET /api/evaluations?resumeId=xxx&positionId=yyy
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const resumeId = searchParams.get('resumeId')
    const positionId = searchParams.get('positionId') || undefined

    if (!resumeId) {
      return NextResponse.json({ error: '缺少 resumeId 参数' }, { status: 400 })
    }

    const evaluations = await getEvaluations(resumeId, positionId)

    // 解析 aiDetail 字段（数据库存储为 JSON 字符串）
    const parsed = evaluations.map((e) => ({
      ...e,
      aiDetail: typeof e.aiDetail === 'string' ? (() => { try { return JSON.parse(e.aiDetail) } catch { return null } })() : e.aiDetail,
    }))

    return NextResponse.json({ evaluations: parsed })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

/**
 * POST /api/evaluations
 * Body: { resumeId, positionId?, dimensions: [{ dimension, rating, comment }], source }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resumeId, positionId, dimensions, source } = body as {
      resumeId?: string
      positionId?: string | null
      dimensions?: { dimension: string; rating?: number | null; comment?: string; aiDetail?: object | null }[]
      source?: string
    }

    // 校验 resumeId
    if (!resumeId) {
      return NextResponse.json({ error: '缺少 resumeId' }, { status: 400 })
    }

    // 校验简历是否存在
    const resume = await prisma.resume.findUnique({ where: { id: resumeId } })
    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    // 校验 positionId（如果传了的话）
    if (positionId) {
      const position = await prisma.position.findUnique({ where: { id: positionId } })
      if (!position) {
        return NextResponse.json({ error: '职位不存在' }, { status: 404 })
      }
    }

    // 校验 dimensions
    if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
      return NextResponse.json({ error: 'dimensions 不能为空' }, { status: 400 })
    }

    // 校验 source
    if (!source || !EVALUATION_SOURCES.includes(source as typeof EVALUATION_SOURCES[number])) {
      return NextResponse.json({ error: 'source 必须为 ai 或 manual' }, { status: 400 })
    }

    // 校验每个维度
    for (const dim of dimensions) {
      if (!dim.dimension || !DIMENSION_KEYS.includes(dim.dimension as DimensionKey)) {
        return NextResponse.json({ error: `无效的维度名称: ${dim.dimension}` }, { status: 400 })
      }
      if (dim.rating !== null && dim.rating !== undefined) {
        if (!Number.isInteger(dim.rating) || dim.rating < 0 || dim.rating > 5) {
          return NextResponse.json({ error: '评分必须在 0-5 之间' }, { status: 400 })
        }
      }
      if (dim.comment && dim.comment.length > 500) {
        return NextResponse.json({ error: '文本评价不能超过500字符' }, { status: 400 })
      }
    }

    // 保存评分
    const saved = await saveEvaluations(
      resumeId,
      positionId || null,
      dimensions.map((d) => ({
        dimension: d.dimension,
        rating: (d.rating === 0 ? null : (d.rating ?? null)),
        comment: d.comment,
        aiDetail: (d as { aiDetail?: object | null }).aiDetail,
      })),
      source as 'ai' | 'manual'
    )

    // 获取更新后的得分（从 PositionEvaluation 读取）
    const evaluation = await prisma.positionEvaluation.findFirst({
      where: { resumeId, positionId: positionId || undefined },
      select: { initialScore: true, compositeScore: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      saved,
      scores: {
        initialScore: evaluation?.initialScore ?? null,
        compositeScore: evaluation?.compositeScore ?? null,
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
