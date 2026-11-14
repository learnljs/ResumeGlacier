import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

/**
 * GET /api/positions/[id]/has-initial-model
 * 检查岗位是否有默认初筛模型，前端据此判断「发起 AI 评估」按钮是否可用
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const position = await prisma.position.findUnique({
      where: { id },
      select: { defaultInitialModelId: true },
    })

    if (!position) {
      return NextResponse.json({ error: '岗位不存在' }, { status: 404 })
    }

    return NextResponse.json({
      hasModel: position.defaultInitialModelId !== null,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
