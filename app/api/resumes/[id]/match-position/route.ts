import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { prisma } from '@/lib/prisma'
import { matchPositionForResume } from '@/lib/services/position-matcher'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const resume = await prisma.resume.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        status: true,
        email: { select: { subject: true } },
      },
    })

    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    const match = await matchPositionForResume(
      resume.fileName,
      resume.email?.subject || null
    )

    if (!match) {
      return NextResponse.json({
        matched: false,
        message: '未匹配到职位，请检查文件名/邮件主题中的关键词或手动分配',
      })
    }

    const data: Record<string, unknown> = {
      positionId: match.positionId,
    }

    const updated = await prisma.resume.update({
      where: { id },
      data,
      include: { position: true },
    })

    return NextResponse.json({
      matched: true,
      position: { id: match.positionId, title: match.positionTitle },
      resume: {
        id: updated.id,
        status: updated.status,
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '匹配失败')
  }
}
