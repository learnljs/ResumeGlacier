import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { resumeParsingQueue } from '@/lib/services/resume-parsing-queue'
import { createBatch } from '@/lib/services/task-batch-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resumeIds, autoExtract } = body as { resumeIds: string[]; autoExtract?: boolean }
    if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
      return NextResponse.json({ error: '请提供要解析的简历ID列表' }, { status: 400 })
    }

    // 创建解析批次
    const batch = await createBatch({
      source: 'parse',
      sourceDetail: '批量解析',
      resumeIds: [],
    })

    // 更新简历的 batchId 和状态
    await prisma.resume.updateMany({
      where: { id: { in: resumeIds } },
      data: {
        batchId: batch.id,
        status: 'PARSING',
      },
    })

    // 更新批次的总简历数
    await prisma.taskBatch.update({
      where: { id: batch.id },
      data: { totalResumes: resumeIds.length },
    })

    const enqueued = await resumeParsingQueue.enqueue(resumeIds, {
      autoExtract: autoExtract === true,
    })
    return NextResponse.json({ success: true, queued: enqueued, batchId: batch.id, batchNo: batch.batchNo })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
