import { prisma } from '@/lib/prisma'
import { updateBatchProgress } from '@/lib/services/task-batch-service'
import { BaseResumeQueue } from '@/lib/services/base-resume-queue'
import type { ItemProgress } from '@/types/resume'

interface ParsingQueueItem {
  resumeId: string
  autoScreen?: boolean
  autoExtract?: boolean
}

class ResumeParsingQueue extends BaseResumeQueue<ParsingQueueItem> {
  constructor() {
    super({
      queueName: 'parsing',
      logPrefix: 'ParsingQueue',
      queueLabel: '解析',
      envConcurrencyVar: 'PARSING_CONCURRENCY',
      defaultConcurrency: 1,
      activeStatus: 'PARSING',
      crashLoopErrorMessage: 'OCR处理反复崩溃，已自动跳过。请检查canvas/cairo兼容性后重新解析。',
      maxQueueSize: 500,
    })
  }

  async enqueue(
    resumeIds: string[],
    options?: { autoScreen?: boolean; autoExtract?: boolean }
  ): Promise<number> {
    const available = this.maxQueueSize - this.queue.length
    if (available <= 0) {
      throw new Error(`解析队列已满（上限 ${this.maxQueueSize}），请稍后再试`)
    }

    const toAdd = resumeIds.slice(0, available).map((id) => ({
      resumeId: id,
      autoScreen: options?.autoScreen,
      autoExtract: options?.autoExtract,
    }))
    if (toAdd.length === 0) return 0

    // 入队时立即将简历状态改为 PARSING，让所有排队简历在 UI 中可见
    const ids = toAdd.map((item) => item.resumeId)
    await prisma.resume.updateMany({
      where: { id: { in: ids }, status: 'UNPARSED' },
      data: { status: 'PARSING' },
    })

    this.enqueueItems(toAdd)
    return toAdd.length
  }

  protected takeNext(): ParsingQueueItem | null {
    return this.queue.shift() ?? null
  }

  protected async processItem(
    item: ParsingQueueItem,
    onProgress: (progress: ItemProgress) => void
  ): Promise<void> {
    // 动态导入核心处理逻辑，确保 HMR 后始终使用最新代码
    // 即使类实例通过 globalThis 持久化，Worker 逻辑每次都会重新加载
    const { processQueueItem } = await import('@/lib/services/parsing-worker-processor')
    await processQueueItem({
      ...item,
      onProgress,
    })
  }

  protected async updateBatchProgressFor(resumeId: string): Promise<void> {
    try {
      const resume = await prisma.resume.findUnique({
        where: { id: resumeId },
        select: { batchId: true },
      })
      if (resume?.batchId) {
        await updateBatchProgress(resume.batchId)
      }
    } catch {
      // 批次进度更新失败不影响主流程
    }
  }

  protected buildItemFromResumeId(resumeId: string): ParsingQueueItem {
    return { resumeId }
  }
}

const globalForQueue = globalThis as unknown as {
  resumeParsingQueue: ResumeParsingQueue | undefined
}
export const resumeParsingQueue =
  globalForQueue.resumeParsingQueue ?? new ResumeParsingQueue()
if (process.env.NODE_ENV !== 'production') {
  globalForQueue.resumeParsingQueue = resumeParsingQueue
}
