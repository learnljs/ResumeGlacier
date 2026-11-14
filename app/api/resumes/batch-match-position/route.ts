import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { prisma } from '@/lib/prisma'
import { matchPositionForResume } from '@/lib/services/position-matcher'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { ids } = body as { ids?: string[] }

    // 查找未分配职位的简历（可选指定 ids）
    const resumes = await prisma.resume.findMany({
      where: {
        positionId: null,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      select: { id: true, fileName: true, status: true, email: { select: { subject: true } } },
    })

    if (resumes.length === 0) {
      return NextResponse.json({
        total: 0,
        matched: 0,
        failed: 0,
        message: '没有需要匹配职位的简历',
      })
    }

    let matched = 0
    let failed = 0

    for (const resume of resumes) {
      const match = await matchPositionForResume(resume.fileName, resume.email?.subject || null)
      if (match) {
        await prisma.resume.update({
          where: { id: resume.id },
          data: {
            positionId: match.positionId,
          },
        })
        matched++
      } else {
        failed++
      }
    }

    return NextResponse.json({
      total: resumes.length,
      matched,
      failed,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '批量匹配失败')
  }
}
