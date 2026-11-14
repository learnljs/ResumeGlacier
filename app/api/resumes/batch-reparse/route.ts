import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { prisma } from '@/lib/prisma'
import { resumeParsingQueue } from '@/lib/services/resume-parsing-queue'
import { createBatch } from '@/lib/services/task-batch-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { ids } = body as { ids?: string[]; force?: boolean }

    let resumeIds: string[]
    if (ids && ids.length > 0) {
      resumeIds = ids
    } else {
      // 默认只解析 ERROR 状态的简历
      const errorResumes = await prisma.resume.findMany({
        where: { status: 'ERROR' },
        select: { id: true },
      })
      resumeIds = errorResumes.map(r => r.id)
    }

    if (resumeIds.length === 0) {
      return NextResponse.json({
        queued: 0,
        message: ids ? '未找到指定简历' : '没有需要重新解析的简历',
      })
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

    // 将简历加入解析队列（异步处理）
    const enqueued = await resumeParsingQueue.enqueue(resumeIds, {
      autoExtract: true,
    })

    return NextResponse.json({
      queued: enqueued,
      batchId: batch.id,
      batchNo: batch.batchNo,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
