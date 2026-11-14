import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { repairCurrentFlags } from '@/lib/services/prompt-service'

/**
 * GET /api/prompts/positions
 * 所有职位的提示词状态列表（职位名 + 当前版本号）（开发方案 6.1）
 */
export async function GET() {
  try {
    // 懒触发 isCurrent 一致性自检修复（开发方案 11）
    await repairCurrentFlags()

    const positions = await prisma.position.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        title: true,
        department: true,
        promptRecords: {
          where: { isCurrent: true },
          select: { version: true, savedBy: true, createdAt: true, changeNote: true },
          take: 1,
          orderBy: { version: 'desc' },
        },
        _count: { select: { promptRecords: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const list = positions.map((p) => {
      const current = p.promptRecords[0]
      return {
        id: p.id,
        title: p.title,
        department: p.department,
        currentVersion: current ? current.version : null,
        savedBy: current?.savedBy || null,
        savedAt: current?.createdAt || null,
        changeNote: current?.changeNote || null,
        totalVersions: p._count.promptRecords,
        configured: p._count.promptRecords > 0,
      }
    })

    return NextResponse.json({ positions: list })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
