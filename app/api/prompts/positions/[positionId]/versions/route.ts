import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

interface Params {
  params: Promise<{ positionId: string }>
}

/**
 * GET /api/prompts/positions/[positionId]/versions
 * 某职位的历史版本列表（开发方案 6.1）
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { positionId } = await params
    const versions = await prisma.promptRecord.findMany({
      where: { positionId },
      select: {
        id: true,
        version: true,
        isCurrent: true,
        changeNote: true,
        savedBy: true,
        createdAt: true,
      },
      orderBy: { version: 'desc' },
    })

    return NextResponse.json({ versions })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
