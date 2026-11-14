import { prisma } from '@/lib/prisma'
import { updateBatchProgress } from '@/lib/services/task-batch-service'
import { BaseResumeQueue } from '@/lib/services/base-resume-queue'
import type { ItemProgress } from '@/types/resume'

interface QueueItem {
  resumeId: string
  aiConfigId?: string
  positionId?: string
  type?: 'initial' | 'reevaluate'
  conditions?: Record<string, unknown>
  batchId?: string
}

const MAX_RETRY = 3
const RETRY_BASE_DELAY_MS = 2000 // 首次重试延迟 2s，后续指数退避：2s → 4s → 8s

/**
 * 判断错误是否可在应用层重试
 * 503/502/504：服务端临时不可用；429：频率限制；网络错误：连接中断
 */
function isRetryableError(error: unknown): boolean {
  // OpenAI SDK v6 的 APIError 有 status 属性
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    if (status === 502 || status === 503 || status === 504) return true
    if (status === 429) return true
  }
  // 网络错误（连接中断、DNS 解析失败、超时等）
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNRESET') ||
    message.includes('ECONNREFUSED') ||
    message.includes('fetch failed') ||
    message.includes('Connection error') ||
    message.includes('timed out')
  ) {
    return true
  }
  return false
}

class ScreeningQueue extends BaseResumeQueue<QueueItem> {
  // 当前活跃岗位：worker 优先取同 positionId 的任务，让同岗位连续处理以命中 DeepSeek 缓存
  private activePosition: string | null = null

  constructor() {
    super({
      queueName: 'screening',
      logPrefix: 'ScreeningQueue',
      queueLabel: '筛选',
      envConcurrencyVar: 'SCREENING_CONCURRENCY',
      defaultConcurrency: 2,
      activeStatus: 'SCREENING',
      crashLoopErrorMessage: 'AI筛选反复崩溃，已自动跳过。',
      maxQueueSize: 500,
    })
  }

  async enqueue(items: QueueItem[]): Promise<void> {
    const available = this.maxQueueSize - this.queue.length
    if (available <= 0) {
      throw new Error(`筛选队列已满（上限 ${this.maxQueueSize}），请稍后再试`)
    }

    const toAdd = items.slice(0, available)
    if (toAdd.length === 0) return

    // 入队时立即将简历状态改为 SCREENING，让所有排队简历在 UI 中可见
    // 同时设置 screeningBatchId，确保 updateBatchProgress 能正确计算进度
    const ids = toAdd.map((item) => item.resumeId)
    await prisma.resume.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'SCREENING' },
    })

    // 按 batchId 分组设置 screeningBatchId
    const itemsByBatch = new Map<string, string[]>()
    for (const item of toAdd) {
      if (item.batchId) {
        const list = itemsByBatch.get(item.batchId) || []
        list.push(item.resumeId)
        itemsByBatch.set(item.batchId, list)
      }
    }
    for (const [batchId, resumeIds] of itemsByBatch) {
      await prisma.resume.updateMany({
        where: { id: { in: resumeIds } },
        data: { screeningBatchId: batchId },
      })
    }

    this.enqueueItems(toAdd)
  }

  /**
   * 取下一个任务：优先取与当前活跃岗位相同 positionId 的任务，让同岗位连续处理以命中缓存。
   * positionId 为空的 item 不更新 activePosition，穿插快速失败不干扰分组调度。
   */
  protected takeNext(): QueueItem | null {
    if (this.activePosition) {
      const idx = this.queue.findIndex((i) => i.positionId === this.activePosition)
      if (idx >= 0) {
        return this.queue.splice(idx, 1)[0]
      }
    }
    const item = this.queue.shift()
    if (item && item.positionId) {
      this.activePosition = item.positionId
    }
    return item ?? null
  }

  protected async processItem(
    item: QueueItem,
    onProgress: (progress: ItemProgress) => void
  ): Promise<void> {
    // 带指数退避重试的 AI 调用
    let lastError: unknown
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        // 动态导入确保 HMR 后始终使用最新代码
        const { screenResume } = await import('@/lib/services/ai-screener')
        await screenResume({
          resumeId: item.resumeId,
          aiConfigId: item.aiConfigId,
          positionId: item.positionId,
          type: item.type,
          onProgress,
        })
        return // 成功，退出重试循环
      } catch (error: unknown) {
        lastError = error
        if (attempt >= MAX_RETRY || !isRetryableError(error)) {
          break // 不可重试或已达上限
        }
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        console.warn(
          `[ScreeningQueue] AI调用失败，${delayMs / 1000}s 后重试 (${attempt + 1}/${MAX_RETRY}) resumeId=${item.resumeId}: ${error instanceof Error ? error.message : error}`
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    // 重试耗尽：抛给基类统一标记 ERROR
    throw lastError instanceof Error ? lastError : new Error('未知错误')
  }

  protected async updateBatchProgressFor(resumeId: string): Promise<void> {
    try {
      const resume = await prisma.resume.findUnique({
        where: { id: resumeId },
        select: { batchId: true, screeningBatchId: true },
      })
      if (resume?.batchId) {
        await updateBatchProgress(resume.batchId)
      }
      if (resume?.screeningBatchId) {
        await updateBatchProgress(resume.screeningBatchId)
      }
    } catch {
      // 批次进度更新失败不影响主流程
    }
  }

  protected buildItemFromResumeId(resumeId: string): QueueItem {
    return { resumeId }
  }
}

const globalForQueue = globalThis as unknown as { screeningQueue: ScreeningQueue | undefined }
export const screeningQueue = globalForQueue.screeningQueue ?? new ScreeningQueue()
if (process.env.NODE_ENV !== 'production') globalForQueue.screeningQueue = screeningQueue
