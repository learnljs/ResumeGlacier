import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { screeningQueue } from '@/lib/services/screening-queue'
import { createBatch } from '@/lib/services/task-batch-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { positionId, resumeIds, conditions } = body as {
      positionId?: string
      resumeIds?: string[]
      conditions?: Record<string, unknown>
    }

    if (!positionId) {
      return NextResponse.json({ error: '请选择目标岗位' }, { status: 400 })
    }
    if (!resumeIds || resumeIds.length === 0) {
      return NextResponse.json({ error: '请选择至少一份简历' }, { status: 400 })
    }

    // 验证岗位存在
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      select: { id: true, defaultInitialModelId: true },
    })
    if (!position) {
      return NextResponse.json({ error: '岗位不存在' }, { status: 404 })
    }
    if (!position.defaultInitialModelId) {
      return NextResponse.json(
        { error: '目标岗位未配置默认初筛模型，无法评估' },
        { status: 400 }
      )
    }

    // 验证简历存在且可评估
    const existing = await prisma.resume.findMany({
      where: {
        id: { in: resumeIds },
        structuredData: { not: null },
      },
      select: { id: true },
    })
    const validIds = existing.map((r) => r.id)
    if (validIds.length === 0) {
      return NextResponse.json(
        { error: '所选简历均缺少结构化数据，无法评估' },
        { status: 400 }
      )
    }

    // 创建 reevaluate 批次
    const batch = await createBatch({
      source: 'reevaluate',
      sourceDetail: `复用评估 - ${resumeIds.length} 份简历`,
      resumeIds: [],
    })

    // 入队（type='reevaluate'）
    const items = validIds.map((resumeId) => ({
      resumeId,
      positionId,
      type: 'reevaluate' as const,
      conditions,
      batchId: batch.id,
    }))

    await screeningQueue.enqueue(items)

    // 更新批次总数
    await prisma.taskBatch.update({
      where: { id: batch.id },
      data: { totalResumes: validIds.length },
    })

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      batchNo: batch.batchNo,
      count: validIds.length,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
