import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { deletePromptVersion } from '@/lib/services/prompt-service'

interface Params {
  params: Promise<{ positionId: string; version: string }>
}

/**
 * GET /api/prompts/positions/[positionId]/versions/[version]
 * 某职位某个版本的完整内容
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { positionId, version } = await params
    const versionNum = parseInt(version, 10)
    if (Number.isNaN(versionNum)) {
      return NextResponse.json({ error: '版本号必须是数字' }, { status: 400 })
    }

    const record = await prisma.promptRecord.findUnique({
      where: { positionId_version: { positionId, version: versionNum } },
    })

    if (!record) {
      return NextResponse.json({ error: `版本 v${versionNum} 不存在` }, { status: 404 })
    }

    return NextResponse.json({ prompt: record })
  } catch (error: unknown) {
    return apiErrorResponse(error, '获取版本内容失败')
  }
}

/**
 * DELETE /api/prompts/positions/[positionId]/versions/[version]
 * 删除指定版本（仅非当前生效版本可删）
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { positionId, version } = await params
    const versionNum = parseInt(version, 10)
    if (Number.isNaN(versionNum)) {
      return NextResponse.json({ error: '版本号必须是数字' }, { status: 400 })
    }

    await deletePromptVersion(positionId, versionNum)
    return NextResponse.json({ success: true, message: `v${versionNum} 已删除` })
  } catch (error: unknown) {
    // 「当前生效版本不可删除」是业务错误（400），其余统一走 apiErrorResponse
    const message = error instanceof Error ? error.message : ''
    if (message.includes('当前生效')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return apiErrorResponse(error, '删除版本失败')
  }
}
