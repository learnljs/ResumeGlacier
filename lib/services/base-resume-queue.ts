/**
 * 后台简历队列抽象基类
 *
 * 收敛 resume-parsing-queue 与 screening-queue 约 70% 的同构骨架（审计 B6）：
 * 队列字段、init（计数 + 孤儿恢复）、worker 循环、recoverOrphans、getStatus 全部上提到本类。
 * globalThis 单例由各子类文件负责。
 *
 * 差异点通过配置与抽象钩子表达：
 * - config：队列名/日志前缀/并发/处理中状态/崩溃文案/容量
 * - processItem：实际处理逻辑（解析单次 / AI 筛选带重试退避）
 * - takeNext：取项策略（默认 FIFO；筛选队列覆盖为 position 亲和调度）
 * - updateBatchProgressFor：批次进度字段（解析只更新 batchId，筛选还更新 screeningBatchId）
 * - buildItemFromResumeId：孤儿恢复时按 resumeId 构造队列项
 */

import { prisma } from '@/lib/prisma'
import {
  isCrashLoop,
  recordRecovery,
  resetCrashState,
} from '@/lib/services/crash-loop-detector'
import type { ItemProgress } from '@/types/resume'

export interface BaseResumeQueueConfig {
  /** 内部队列名（崩溃检测 key），如 'parsing' / 'screening' */
  queueName: string
  /** 日志前缀，如 'ParsingQueue'（产出 [ParsingQueue]） */
  logPrefix: string
  /** 中文名，用于错误文案，如 '解析'（产出「解析队列已满」） */
  queueLabel: string
  /** 并发环境变量名，如 PARSING_CONCURRENCY / SCREENING_CONCURRENCY */
  envConcurrencyVar: string
  /** 默认并发数 */
  defaultConcurrency: number
  /** 处理中状态（计数与孤儿恢复用），如 'PARSING' / 'SCREENING' */
  activeStatus: string
  /** 崩溃循环时标记 ERROR 的文案 */
  crashLoopErrorMessage: string
  /** 队列容量上限 */
  maxQueueSize: number
}

export abstract class BaseResumeQueue<T extends { resumeId: string }> {
  protected queue: T[] = []
  protected activeWorkers = 0
  protected currentResumeIds: Set<string> = new Set()
  protected initialized = false
  protected concurrency: number
  protected totalEnqueued = 0
  protected processedCount = 0
  protected itemProgressMap: Map<string, ItemProgress> = new Map()

  private readonly config: BaseResumeQueueConfig

  constructor(config: BaseResumeQueueConfig) {
    this.config = config
    const envConcurrency = parseInt(process.env[config.envConcurrencyVar] || '')
    this.concurrency = envConcurrency > 0 ? envConcurrency : config.defaultConcurrency
  }

  protected get logPrefix(): string {
    return this.config.logPrefix
  }

  protected get queueLabel(): string {
    return this.config.queueLabel
  }

  protected get maxQueueSize(): number {
    return this.config.maxQueueSize
  }

  /** 入队核心：推入队列、计数、拉起 worker。子类在各自的 enqueue 中完成容量校验与状态流转后调用。 */
  protected enqueueItems(toAdd: T[]): number {
    if (toAdd.length === 0) return 0
    this.queue.push(...toAdd)
    this.totalEnqueued += toAdd.length
    this.startWorkers()
    return toAdd.length
  }

  /** 取下一个任务：默认 FIFO；子类可覆盖实现优先级 / 亲和性调度 */
  protected takeNext(): T | null {
    return this.queue.shift() ?? null
  }

  /** 处理单个任务。抛错即视为失败，由基类标记 ERROR（子类内部可自行实现重试退避） */
  protected abstract processItem(item: T, onProgress: (p: ItemProgress) => void): Promise<void>

  /** 处理完成后更新该简历所属批次的进度（子类实现，如 batchId / screeningBatchId） */
  protected abstract updateBatchProgressFor(resumeId: string): Promise<void>

  /** 从 resumeId 构造队列项（孤儿恢复用） */
  protected abstract buildItemFromResumeId(resumeId: string): T

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    console.log(`[${this.config.logPrefix}] 并行数: ${this.concurrency}`)

    // 从数据库恢复已处理计数（处理服务器重启场景）
    const activeCount = await prisma.resume.count({ where: { status: this.config.activeStatus } })
    this.totalEnqueued = activeCount
    this.processedCount = 0

    await this.recoverOrphans()
    if (this.queue.length > 0) {
      this.startWorkers()
    }
  }

  private startWorkers(): void {
    while (this.activeWorkers < this.concurrency && this.queue.length > 0) {
      this.activeWorkers++
      this.runWorker()
    }
  }

  private async runWorker(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.takeNext()
      if (!item) break
      this.currentResumeIds.add(item.resumeId)

      try {
        await this.processItem(item, (progress) => {
          this.itemProgressMap.set(item.resumeId, progress)
        })
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '未知错误'
        console.error(`[${this.config.logPrefix}] 处理失败 resumeId=${item.resumeId}: ${msg}`)
        try {
          await prisma.resume.update({
            where: { id: item.resumeId },
            data: { status: 'ERROR', errorMessage: msg },
          })
        } catch {
          // ignore db error during error handling
        }
      }

      this.itemProgressMap.delete(item.resumeId)
      this.currentResumeIds.delete(item.resumeId)
      this.processedCount++

      await this.updateBatchProgressFor(item.resumeId)

      // 短暂延迟避免过度占用资源
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    this.activeWorkers--
  }

  private async recoverOrphans(): Promise<void> {
    try {
      const orphans = await prisma.resume.findMany({
        where: { status: this.config.activeStatus },
        select: { id: true },
      })

      if (orphans.length === 0) return

      // 崩溃循环检测：短时间反复恢复孤儿说明处理时会崩溃
      if (isCrashLoop(this.config.queueName)) {
        const orphanIds = orphans.map((o) => o.id)
        console.warn(
          `[${this.config.logPrefix}] 检测到崩溃循环，标记 ${orphanIds.length} 个孤儿为 ERROR`
        )
        await prisma.resume.updateMany({
          where: { id: { in: orphanIds } },
          data: { status: 'ERROR', errorMessage: this.config.crashLoopErrorMessage },
        })
        resetCrashState(this.config.queueName)
        return
      }

      // 记录本次恢复（返回 true 表示已达到崩溃阈值）
      const reachedThreshold = recordRecovery(this.config.queueName)
      if (reachedThreshold) {
        // 下次启动时会进入崩溃循环分支，本次先正常恢复
        console.warn(`[${this.config.logPrefix}] 恢复次数达到阈值，下次启动将标记为 ERROR`)
      }

      const inQueue = new Set(this.queue.map((q) => q.resumeId))
      const toRecover = orphans.filter(
        (o) => !inQueue.has(o.id) && !this.currentResumeIds.has(o.id)
      )

      if (toRecover.length > 0) {
        this.queue.push(...toRecover.map((o) => this.buildItemFromResumeId(o.id)))
        console.log(`[${this.config.logPrefix}] 恢复 ${toRecover.length} 个孤儿简历到队列`)
      }
    } catch (error: unknown) {
      console.error(`[${this.config.logPrefix}] 孤儿恢复失败:`, error)
    }
  }

  getStatus(): {
    queueLength: number
    isProcessing: boolean
    currentResumeIds: string[]
    concurrency: number
    activeWorkers: number
    totalEnqueued: number
    processedCount: number
    progress: number
    itemProgress: Record<string, ItemProgress>
  } {
    const total = this.totalEnqueued || (this.queue.length + this.processedCount)
    const itemProgress: Record<string, ItemProgress> = {}
    this.itemProgressMap.forEach((v, k) => { itemProgress[k] = v })
    return {
      queueLength: this.queue.length,
      isProcessing: this.activeWorkers > 0,
      currentResumeIds: Array.from(this.currentResumeIds),
      concurrency: this.concurrency,
      activeWorkers: this.activeWorkers,
      totalEnqueued: total,
      processedCount: this.processedCount,
      progress: total > 0 ? Math.round(this.processedCount / total * 100) : 0,
      itemProgress,
    }
  }
}
