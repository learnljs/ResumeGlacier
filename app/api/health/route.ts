/**
 * GET /api/health — 容器探活与部署自检
 *
 * 只做两件事：确认进程活着、确认数据库能读写。
 * 不返回任何配置细节，避免暴露部署信息。
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      latencyMs: Date.now() - startedAt,
      uptimeSec: Math.round(process.uptime()),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : '未知错误',
      },
      { status: 503 }
    )
  }
}
