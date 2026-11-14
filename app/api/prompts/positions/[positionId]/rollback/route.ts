import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { rollbackToVersion } from '@/lib/services/prompt-service'

interface Params {
  params: Promise<{ positionId: string }>
}

/**
 * POST /api/prompts/positions/[positionId]/rollback
 * 回滚到指定版本（开发方案 6.1、7.3）
 * body: { version: number }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { positionId } = await params
    const body = await request.json()
    const { version } = body as { version?: number }

    if (typeof version !== 'number' || !Number.isInteger(version)) {
      return NextResponse.json({ error: '缺少合法的 version 字段' }, { status: 400 })
    }

    const record = await rollbackToVersion(positionId, version)

    return NextResponse.json({
      success: true,
      prompt: record,
      message: `已回滚至 v${record.version}` ,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
