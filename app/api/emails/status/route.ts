import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

export async function GET() {
  try {
    const configs = await prisma.emailConfig.findMany({
      where: { isActive: true },
      select: {
        id: true,
        alias: true,
        user: true,
        lastFetchedAt: true,
        lastFetchedUid: true,
        _count: {
          select: {
            emails: true,
            resumes: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const items = configs.map((cfg) => ({
      id: cfg.id,
      alias: cfg.alias,
      user: cfg.user,
      lastFetchedAt: cfg.lastFetchedAt,
      lastFetchedUid: cfg.lastFetchedUid,
      emailCount: cfg._count.emails,
      resumeCount: cfg._count.resumes,
    }))

    return NextResponse.json({ items })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
