import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { screeningQueue } from '@/lib/services/screening-queue'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { positionId, aiConfigId } = body as Record<string, string>

    const resume = await prisma.resume.findUnique({
      where: { id },
      select: { id: true, status: true, extractedText: true },
    })

    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    const allowedStatuses = ['PENDING', 'SCREENED']
    if (!allowedStatuses.includes(resume.status)) {
      return NextResponse.json(
        { error: '当前状态不允许筛选（仅已解析、待筛选和已筛选状态可以）' },
        { status: 400 }
      )
    }

    if (!resume.extractedText) {
      return NextResponse.json(
        { error: '简历文本未提取，无法进行AI筛选' },
        { status: 400 }
      )
    }

    // 设置状态为 SCREENING，同时清除可能残留的旧 screeningBatchId（防止被 stopBatch 意外回退）
    await prisma.resume.update({
      where: { id },
      data: { status: 'SCREENING', screeningBatchId: null },
    })

    await screeningQueue.enqueue([{ resumeId: id, aiConfigId, positionId }])

    return NextResponse.json({ queued: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
