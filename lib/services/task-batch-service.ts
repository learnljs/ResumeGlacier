import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export interface CreateBatchInput {
  source: 'scheduled' | 'manual' | 'rescreen' | 'parse' | 'reevaluate'
  sourceDetail?: string
  emailConfigId?: string
  resumeIds: string[]
}

export interface BatchWithResumes {
  id: string
  batchNo: string
  source: string
  sourceDetail: string | null
  emailConfigId: string | null
  emailConfig: {
    id: string
    alias: string
    user: string
  } | null
  totalResumes: number
  parsedCount: number
  screenedCount: number
  errorCount: number
  screenErrorCount: number
  screeningCount: number
  status: string
  startedAt: Date
  completedAt: Date | null
  createdAt: Date
  progress: {
    parsing: number
    screening: number
  }
}

export interface BatchResumeItem {
  id: string
  fileName: string
  candidateName: string | null
  status: string
  errorMessage: string | null
  createdAt: Date
}

// 生成批次编号: YYYYMMDD-NNN
async function generateBatchNo(): Promise<string> {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')

  // 查询今天最大的批次编号
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const lastBatch = await prisma.taskBatch.findFirst({
    where: {
      createdAt: {
        gte: todayStart,
        lt: todayEnd,
      },
    },
    orderBy: { batchNo: 'desc' },
    select: { batchNo: true },
  })

  let nextSeq = 1
  if (lastBatch) {
    // 从最大编号中提取序号并 +1
    const lastSeq = parseInt(lastBatch.batchNo.split('-')[1] || '0')
    nextSeq = lastSeq + 1
  }

  return `${dateStr}-${String(nextSeq).padStart(3, '0')}`
}

// 创建新批次
export async function createBatch(input: CreateBatchInput): Promise<BatchWithResumes> {
  const batchNo = await generateBatchNo()

  const batch = await prisma.taskBatch.create({
    data: {
      batchNo,
      source: input.source,
      sourceDetail: input.sourceDetail,
      emailConfigId: input.emailConfigId,
      totalResumes: input.resumeIds.length,
      status: 'processing',
    },
    include: {
      emailConfig: {
        select: {
          id: true,
          alias: true,
          user: true,
        },
      },
    },
  })

  // 将简历关联到批次（rescreen/reevaluate 类型通过 screeningBatchId 关联，不在这里处理）
  if (input.source !== 'rescreen' && input.source !== 'reevaluate' && input.resumeIds.length > 0) {
    await prisma.resume.updateMany({
      where: {
        id: {
          in: input.resumeIds,
        },
      },
      data: {
        batchId: batch.id,
      },
    })
  }

  return {
    ...batch,
    screeningCount: 0,
    progress: {
      parsing: 0,
      screening: 0,
    },
  }
}

// 更新批次进度（基于关联简历的实际状态计算）
export async function updateBatchProgress(batchId: string): Promise<void> {
  const batch = await prisma.taskBatch.findUnique({
    where: { id: batchId },
  })

  if (!batch) return

  // 根据批次类型查询不同的关联简历
  let resumes: { id: string; status: string }[]
  if ((batch.source === 'rescreen' || batch.source === 'reevaluate')) {
    // 筛选批次：通过 screeningBatchId 查询
    resumes = await prisma.resume.findMany({
      where: { screeningBatchId: batchId },
      select: { id: true, status: true },
    })
  } else {
    // 获取批次：通过 batchId 查询
    resumes = await prisma.resume.findMany({
      where: { batchId: batchId },
      select: { id: true, status: true },
    })
  }
  const totalResumes = resumes.length

  // 解析阶段统计
  const parsingCount = resumes.filter((r) => r.status === 'PARSING').length
  const parsedCount = resumes.filter((r) =>
    ['PENDING', 'SCREENING', 'SCREENED'].includes(r.status)
  ).length

  // 查询哪些 ERROR 状态的简历曾经进入过筛选（有评估记录）
  const errorResumeIds = resumes.filter((r) => r.status === 'ERROR').map(r => r.id)
  const evaluations = await prisma.positionEvaluation.findMany({
    where: { resumeId: { in: errorResumeIds } },
    select: { resumeId: true },
  })
  const errorWithScreeningIds = new Set(evaluations.map(e => e.resumeId))

  // 根据批次类型区分异常类型
  let parseErrorCount: number
  let screenErrorCount: number

  if (batch.source === 'parse') {
    // 解析批次：所有 ERROR 都算解析异常
    parseErrorCount = errorResumeIds.length
    screenErrorCount = 0
  } else if ((batch.source === 'rescreen' || batch.source === 'reevaluate') || batch.source === 'reevaluate') {
    // 筛选/复用评估批次：所有 ERROR 都算筛选异常
    parseErrorCount = 0
    screenErrorCount = errorResumeIds.length
  } else {
    // 获取批次：根据是否有筛选记录区分
    parseErrorCount = errorResumeIds.filter(id => !errorWithScreeningIds.has(id)).length
    screenErrorCount = errorResumeIds.filter(id => errorWithScreeningIds.has(id)).length
  }

  // 筛选阶段统计（只统计解析成功的简历）
  const screeningCount = resumes.filter((r) => r.status === 'SCREENING').length
  const screenedCount = resumes.filter((r) => r.status === 'SCREENED').length

  // 判断批次状态：是否有简历在处理中
  const hasProcessing = parsingCount > 0 || screeningCount > 0
  const newStatus = hasProcessing ? 'processing' : 'completed'

  // 只在批次从 processing 变为 completed 时设置完成时间
  const completedAt = (batch.status === 'processing' && newStatus === 'completed')
    ? new Date()
    : batch.completedAt

  await prisma.taskBatch.update({
    where: { id: batchId },
    data: {
      totalResumes,
      parsedCount,
      screenedCount,
      errorCount: parseErrorCount,
      screenErrorCount,
      status: newStatus,
      completedAt: newStatus === 'processing' ? null : completedAt,
    },
  })

  // 批次完成时，清除关联简历的 screeningBatchId
  if (((batch.source === 'rescreen' || batch.source === 'reevaluate') || batch.source === 'reevaluate') && newStatus === 'completed' && batch.status === 'processing') {
    await prisma.resume.updateMany({
      where: { screeningBatchId: batchId },
      data: { screeningBatchId: null },
    })
  }
}

// 标记批次完成
export async function completeBatch(batchId: string): Promise<void> {
  await updateBatchProgress(batchId)
}

// 获取最近批次列表（默认10个）
export async function getRecentBatches(limit: number = 10): Promise<BatchWithResumes[]> {
  const batches = await prisma.taskBatch.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      emailConfig: {
        select: {
          id: true,
          alias: true,
          user: true,
        },
      },
    },
  })

  // 批量查询每个批次的筛选中数量（获取批次）
  const batchIds = batches.map(b => b.id)
  const screeningCounts = await prisma.resume.groupBy({
    by: ['batchId'],
    where: {
      batchId: { in: batchIds },
      status: 'SCREENING',
    },
    _count: true,
  })
  const screeningCountMap = new Map(
    screeningCounts.map(sc => [sc.batchId, sc._count])
  )

  // 批量查询筛选批次的筛选中数量
  const screeningBatchCounts = await prisma.resume.groupBy({
    by: ['screeningBatchId'],
    where: {
      screeningBatchId: { in: batchIds },
      status: 'SCREENING',
    },
    _count: true,
  })
  const screeningBatchCountMap = new Map(
    screeningBatchCounts.map(sc => [sc.screeningBatchId, sc._count])
  )

  return batches.map((batch) => ({
    ...batch,
    screeningCount: ((batch.source === 'rescreen' || batch.source === 'reevaluate') || batch.source === 'reevaluate')
      ? (screeningBatchCountMap.get(batch.id) || 0)
      : (screeningCountMap.get(batch.id) || 0),
    progress: {
      parsing: batch.totalResumes > 0 ? Math.round((batch.parsedCount / batch.totalResumes) * 100) : 0,
      screening: ((batch.source === 'rescreen' || batch.source === 'reevaluate') || batch.source === 'reevaluate')
        ? (batch.totalResumes > 0 ? Math.round(batch.screenedCount / batch.totalResumes * 100) : 0)
        : (batch.parsedCount > 0 ? Math.round(batch.screenedCount / batch.parsedCount * 100) : 0),
    },
  }))
}

// 获取批次详情（含简历列表）
export async function getBatchDetail(
  batchId: string
): Promise<(BatchWithResumes & { resumes: BatchResumeItem[] }) | null> {
  const batch = await prisma.taskBatch.findUnique({
    where: { id: batchId },
    include: {
      emailConfig: {
        select: {
          id: true,
          alias: true,
          user: true,
        },
      },
    },
  })

  if (!batch) return null

  // 根据批次类型查询不同的关联简历
  let resumes: BatchResumeItem[]
  if ((batch.source === 'rescreen' || batch.source === 'reevaluate')) {
    // 筛选批次：通过 screeningBatchId 查询，只显示筛选相关信息
    resumes = await prisma.resume.findMany({
      where: { screeningBatchId: batchId },
      select: {
        id: true,
        fileName: true,
        candidateName: true,
        status: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  } else {
    // 获取批次：通过 batchId 查询
    resumes = await prisma.resume.findMany({
      where: { batchId: batchId },
      select: {
        id: true,
        fileName: true,
        candidateName: true,
        status: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  const screeningCount = resumes.filter(r => r.status === 'SCREENING').length

  return {
    ...batch,
    resumes,
    screeningCount,
    progress: {
      parsing: batch.totalResumes > 0 ? Math.round((batch.parsedCount / batch.totalResumes) * 100) : 0,
      screening: ((batch.source === 'rescreen' || batch.source === 'reevaluate'))
        ? (batch.totalResumes > 0 ? Math.round(batch.screenedCount / batch.totalResumes * 100) : 0)
        : (batch.parsedCount > 0 ? Math.round(batch.screenedCount / batch.parsedCount * 100) : 0),
    },
  }
}

// 获取批次中的简历列表（带分页）
export async function getBatchResumes(
  batchId: string,
  page: number = 1,
  pageSize: number = 20,
  status?: string
): Promise<{ resumes: BatchResumeItem[]; total: number }> {
  // 先获取批次信息，确定查询字段
  const batch = await prisma.taskBatch.findUnique({
    where: { id: batchId },
    select: { source: true },
  })

  // 根据批次类型使用不同的查询字段
  const isScreeningBatch = batch?.source === 'rescreen' || batch?.source === 'reevaluate'
  const where: Prisma.ResumeWhereInput = isScreeningBatch
    ? { screeningBatchId: batchId }
    : { batchId: batchId }

  if (status) {
    where.status = status
  }

  const [resumes, total] = await Promise.all([
    prisma.resume.findMany({
      where,
      select: {
        id: true,
        fileName: true,
        candidateName: true,
        status: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.resume.count({ where }),
  ])

  return { resumes, total }
}

// 删除批次（清除关联简历的批次引用）
export async function deleteBatch(batchId: string): Promise<void> {
  const batch = await prisma.taskBatch.findUnique({
    where: { id: batchId },
  })

  if (!batch) {
    throw new Error('批次不存在')
  }

  // 清除关联简历的批次引用
  if ((batch.source === 'rescreen' || batch.source === 'reevaluate')) {
    // 筛选批次：清除 screeningBatchId
    await prisma.resume.updateMany({
      where: { screeningBatchId: batchId },
      data: { screeningBatchId: null },
    })
  } else {
    // 获取批次：清除 batchId
    await prisma.resume.updateMany({
      where: { batchId: batchId },
      data: { batchId: null },
    })
  }

  // 删除批次记录
  await prisma.taskBatch.delete({
    where: { id: batchId },
  })
}

// 停止批次（将处理中的简历状态重置）
export async function stopBatch(batchId: string): Promise<void> {
  const batch = await prisma.taskBatch.findUnique({
    where: { id: batchId },
  })

  if (!batch) {
    throw new Error('批次不存在')
  }

  if (batch.status !== 'processing') {
    throw new Error('批次已 completed，无法停止')
  }

  // 根据批次类型重置关联简历的状态
  if ((batch.source === 'rescreen' || batch.source === 'reevaluate')) {
    // 筛选批次：将 SCREENING 状态的简历改回 PENDING
    await prisma.resume.updateMany({
      where: {
        screeningBatchId: batchId,
        status: 'SCREENING',
      },
      data: {
        status: 'PENDING',
        screeningBatchId: null,
      },
    })
  } else if (batch.source === 'parse') {
    // 解析批次：将 PARSING 状态的简历改回 UNPARSED
    await prisma.resume.updateMany({
      where: {
        batchId: batchId,
        status: 'PARSING',
      },
      data: {
        status: 'UNPARSED',
      },
    })
  } else {
    // 获取批次：将 PARSING 状态的简历改回 UNPARSED
    await prisma.resume.updateMany({
      where: {
        batchId: batchId,
        status: 'PARSING',
      },
      data: {
        status: 'UNPARSED',
      },
    })
  }

  // 更新批次状态为 completed
  await prisma.taskBatch.update({
    where: { id: batchId },
    data: {
      status: 'completed',
      completedAt: new Date(),
    },
  })
}
