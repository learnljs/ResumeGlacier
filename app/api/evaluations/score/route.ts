/**
 * 评估得分计算 API
 *
 * GET /api/evaluations/score?resumeId=xxx&weightModelId=yyy
 *
 * 计算指定简历在指定权重模型下的得分，不修改数据库。
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { calculateScore } from '@/lib/services/evaluation-service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const resumeId = searchParams.get('resumeId')
    const weightModelId = searchParams.get('weightModelId')
    const positionId = searchParams.get('positionId') || undefined

    if (!resumeId) {
      return NextResponse.json({ error: '缺少 resumeId 参数' }, { status: 400 })
    }

    if (!weightModelId) {
      return NextResponse.json({ error: '缺少 weightModelId 参数' }, { status: 400 })
    }

    // 校验简历是否存在
    const resume = await prisma.resume.findUnique({ where: { id: resumeId } })
    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    // 校验权重模型是否存在
    const weightModel = await prisma.weightModel.findUnique({ where: { id: weightModelId } })
    if (!weightModel) {
      return NextResponse.json({ error: '权重模型不存在' }, { status: 404 })
    }

    // 计算得分（可选按岗位过滤维度评分）
    const result = await calculateScore(resumeId, weightModelId, positionId)

    return NextResponse.json(result)
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
