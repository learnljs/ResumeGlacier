import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

/**
 * GET /api/evaluations/[id]
 * 获取单条 PositionEvaluation 详情
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const evaluation = await prisma.positionEvaluation.findUnique({
      where: { id },
      include: {
        resume: {
          select: {
            id: true,
            candidateName: true,
            candidatePhone: true,
            candidateEmail: true,
            fileName: true,
            status: true,
            structuredData: true,
          },
        },
        position: { select: { id: true, title: true, department: true } },
      },
    })

    if (!evaluation) {
      return NextResponse.json({ error: '评估记录不存在' }, { status: 404 })
    }

    return NextResponse.json({ evaluation })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
