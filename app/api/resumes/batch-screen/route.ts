import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { screeningQueue } from '@/lib/services/screening-queue'
import { createBatch } from '@/lib/services/task-batch-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { ids, aiConfigId } = body as { ids?: string[]; aiConfigId?: string }

    const screenableResumes = await prisma.resume.findMany({
      where: {
        status: { in: ['PENDING', 'SCREENED'] },
        extractedText: { not: null },
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      select: { id: true, positionId: true },
    })

    if (screenableResumes.length === 0) {
      return NextResponse.json({ queued: 0 })
    }

    const resumeIds = screenableResumes.map((r) => r.id)

    // 创建筛选批次
    const sourceDetail = ids && ids.length > 0 ? '批量AI筛选' : '全部AI筛选'
    const batch = await createBatch({
      source: 'rescreen',
      sourceDetail,
      resumeIds: [], // 不通过 createBatch 关联，手动处理 screeningBatchId
    })

    // 更新简历状态为 SCREENING 并关联到筛选批次
    await prisma.resume.updateMany({
      where: { id: { in: resumeIds } },
      data: { status: 'SCREENING', screeningBatchId: batch.id },
    })

    // 更新批次的总简历数
    await prisma.taskBatch.update({
      where: { id: batch.id },
      data: { totalResumes: resumeIds.length },
    })

    const items = screenableResumes.map((r) => ({
      resumeId: r.id,
      positionId: r.positionId ?? undefined,
      aiConfigId,
      batchId: batch.id,
    }))
    await screeningQueue.enqueue(items)

    return NextResponse.json({ queued: resumeIds.length, batchId: batch.id, batchNo: batch.batchNo })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
