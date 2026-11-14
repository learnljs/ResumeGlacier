import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { diffLines } from '@/lib/services/prompt-service'

interface Params {
  params: Promise<{ positionId: string }>
}

/**
 * GET /api/prompts/positions/[positionId]/diff?v1=3&v2=5
 * 对比两个版本的差异（开发方案 6.1、7.3 行级文本 diff）
 * 返回每个字段的行级 diff
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { positionId } = await params
    const { searchParams } = new URL(request.url)
    const v1 = parseInt(searchParams.get('v1') || '', 10)
    const v2 = parseInt(searchParams.get('v2') || '', 10)

    if (Number.isNaN(v1) || Number.isNaN(v2)) {
      return NextResponse.json({ error: '缺少合法的 v1 / v2 参数' }, { status: 400 })
    }

    const [oldRec, newRec] = await Promise.all([
      prisma.promptRecord.findUnique({
        where: { positionId_version: { positionId, version: v1 } },
      }),
      prisma.promptRecord.findUnique({
        where: { positionId_version: { positionId, version: v2 } },
      }),
    ])

    if (!oldRec) {
      return NextResponse.json({ error: `版本 v${v1} 不存在` }, { status: 404 })
    }
    if (!newRec) {
      return NextResponse.json({ error: `版本 v${v2} 不存在` }, { status: 404 })
    }

    return NextResponse.json({
      v1,
      v2,
      diff: {
        bodyText: diffLines(oldRec.bodyText, newRec.bodyText),
        knowledgeContent: diffLines(oldRec.knowledgeContent, newRec.knowledgeContent),
        skillContent: diffLines(oldRec.skillContent, newRec.skillContent),
        overallRules: diffLines(oldRec.overallRules, newRec.overallRules),
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
