/**
 * Webhook 集成队列
 *
 * 职责：
 * - 接收跟进记录的同步请求（enqueue），不阻塞调用方
 * - 聚合窗口（50 条或 5 秒超时）批量推送到Webhook
 * - 调用字段映射引擎翻译数据
 * - 成功更新 FollowUpRecord.webhookTargetRecordId/webhookSyncStatus
 * - 失败指数退避重试（最多 3 次），仍失败标记 SYNC_FAILED
 * - 写入 data/logs/webhook-delivery-YYYY-MM-DD.log
 *
 * 复刻 lib/services/resume-parsing-queue.ts 的 globalThis 单例模式。
 */

import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { translateRecord } from '@/lib/services/webhook-field-mapper'
import type { FieldMapping } from '@/lib/services/webhook-field-mapper'
import {
  addRecords,
  updateRecords,
} from '@/lib/services/webhook-delivery-client'
import { loadStoredWebhookUrl } from '@/lib/services/webhook-integration-store'
import {
  WEBHOOK_URL_FIELD,
  DEFAULT_CONFIG_KEY,
  WEBHOOK_SYNC_STATUS,
} from '@/lib/constants/webhook-fields'
import type { SyncAction } from '@/lib/constants/webhook-fields'

// 跟进记录完整载荷类型（loadRecords 返回值的精确类型，避免 Map<string, any>）
type FollowUpRecordWithRelations = Prisma.FollowUpRecordGetPayload<{
  include: {
    resume: {
      include: {
        position: true,
      },
    },
    evaluation: true,
    tags: { include: { followUpTag: true } },
    logs: { orderBy: { createdAt: 'asc' } },
  },
}>

// ========== 配置（环境变量，带默认值） ==========
const BATCH_SIZE = parseInt(process.env.WEBHOOK_BATCH_SIZE || '50', 10) || 50
const FLUSH_INTERVAL_MS = parseInt(process.env.WEBHOOK_FLUSH_INTERVAL_MS || '5000', 10) || 5000
const MAX_RETRY = 3
const MAX_QUEUE_SIZE = 1000

// ========== 日志 ==========
const LOG_DIR = path.join(process.cwd(), 'data', 'logs')

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0]
  return path.join(LOG_DIR, `webhook-delivery-${date}.log`)
}

function writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: Record<string, unknown>) {
  try {
    ensureLogDir()
    const timestamp = new Date().toISOString()
    const entry = { timestamp, level, message, ...data }
    fs.appendFileSync(getLogFilePath(), JSON.stringify(entry) + '\n', 'utf-8')
  } catch {
    // 日志写入失败不影响主流程
  }
}

// ========== 队列项 ==========
interface SyncQueueItem {
  followUpRecordId: string
  action: SyncAction
  enqueuedAt: number
}

// ========== 队列类 ==========
class WebhookDeliveryQueue {
  private queue: SyncQueueItem[] = []
  private processing: Set<string> = new Set()  // 正在处理的 followUpRecordId
  private initialized = false
  private flushTimer: NodeJS.Timeout | null = null
  private isFlushing = false

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    console.log(`[WebhookDeliveryQueue] 初始化完成，批量大小: ${BATCH_SIZE}，刷新间隔: ${FLUSH_INTERVAL_MS}ms`)

    // 启动定时刷新（聚合窗口）
    this.scheduleFlush()
  }

  /**
   * 入队
   * @returns 入队数量（0 表示未入队，如沟通中阶段或队列已满）
   */
  async enqueue(followUpRecordId: string, action: SyncAction): Promise<number> {
    // 已在队列或处理中，不重复入队（同一记录合并）
    if (this.queue.some((q) => q.followUpRecordId === followUpRecordId) || this.processing.has(followUpRecordId)) {
      // 已存在时，若新 action 是 ADD，升级队列项的 action（ADD 优先于 UPDATE）
      const existing = this.queue.find((q) => q.followUpRecordId === followUpRecordId)
      if (existing && action === 'ADD') {
        existing.action = 'ADD'
      }
      return 0
    }

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      writeLog('WARN', '同步队列已满，丢弃入队请求', { followUpRecordId, queueSize: this.queue.length })
      return 0
    }

    this.queue.push({ followUpRecordId, action, enqueuedAt: Date.now() })
    writeLog('INFO', '入队同步任务', { followUpRecordId, action, queueSize: this.queue.length })

    // 确保定时刷新已调度：生产构建中 instrumentation 与路由 chunk 可能持有不同实例，
    // 不能依赖 init() 的定时器，入队即自启动（与解析/筛选队列一致）
    this.scheduleFlush()

    // 达到批量大小立即刷新
    if (this.queue.length >= BATCH_SIZE) {
      void this.flush()
    }

    return 1
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => {
      void this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  /**
   * 刷新队列：取出待处理项，按 action 分组批量推送
   */
  private async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) {
      this.scheduleFlush()
      return
    }

    this.isFlushing = true

    try {
      // 取出当前批次
      const batch = this.queue.splice(0, BATCH_SIZE)
      if (batch.length === 0) {
        this.scheduleFlush()
        return
      }

      batch.forEach((item) => this.processing.add(item.followUpRecordId))

      // 加载映射配置
      const mappings = await this.loadMappings()
      const webhookUrl = await this.loadWebhookUrl()

      if (!webhookUrl) {
        // 未配置 Webhook URL，全部标记失败
        writeLog('WARN', '未配置 URL，跳过同步批次', { batchSize: batch.length })
        for (const item of batch) {
          await this.markFailed(item.followUpRecordId, '未配置 URL')
          this.processing.delete(item.followUpRecordId)
        }
        this.scheduleFlush()
        return
      }

      if (mappings.length === 0) {
        writeLog('WARN', '未配置字段映射，跳过同步批次', { batchSize: batch.length })
        for (const item of batch) {
          await this.markFailed(item.followUpRecordId, '未配置字段映射')
          this.processing.delete(item.followUpRecordId)
        }
        this.scheduleFlush()
        return
      }

      // 按 action 分组
      const addItems = batch.filter((b) => b.action === 'ADD')
      const updateItems = batch.filter((b) => b.action === 'UPDATE')

      // 处理新增
      if (addItems.length > 0) {
        await this.processBatch(addItems, 'ADD', webhookUrl, mappings)
      }

      // 处理更新
      if (updateItems.length > 0) {
        await this.processBatch(updateItems, 'UPDATE', webhookUrl, mappings)
      }

      // 清理 processing
      batch.forEach((item) => this.processing.delete(item.followUpRecordId))
    } catch (error: unknown) {
      writeLog('ERROR', '刷新批次异常', { error: error instanceof Error ? error.message : String(error) })
    } finally {
      this.isFlushing = false
      this.scheduleFlush()
    }
  }

  /**
   * 处理一批同步项（统一 action）
   */
  private async processBatch(
    items: SyncQueueItem[],
    action: SyncAction,
    webhookUrl: string,
    mappings: FieldMapping[]
  ): Promise<void> {
    // 加载所有跟进记录数据
    const records = await this.loadRecords(items.map((i) => i.followUpRecordId))

    // 翻译每条记录
    const translated: Array<{ item: SyncQueueItem; values: Record<string, unknown>; warnings: string[] }> = []
    for (const item of items) {
      const record = records.get(item.followUpRecordId)
      if (!record) {
        await this.markFailed(item.followUpRecordId, '跟进记录不存在')
        continue
      }

      const context = {
        resume: record.resume as Record<string, unknown>,
        position: (record.resume?.position ?? undefined) as Record<string, unknown> | undefined,
        followUpRecord: record as Record<string, unknown>,
        evaluation: (record.evaluation ?? undefined) as Record<string, unknown> | undefined,
      }

      const { values, warnings } = translateRecord(context, mappings)
      if (warnings.length > 0) {
        writeLog('WARN', '字段翻译告警', { followUpRecordId: item.followUpRecordId, warnings })
      }

      // ADD 需要 webhookTargetRecordId 为空；UPDATE 需要 webhookTargetRecordId 存在
      if (action === 'UPDATE' && !record.webhookTargetRecordId) {
        // 没有Webhook记录 ID，降级为 ADD
        await this.processBatch([{ ...item, action: 'ADD' }], 'ADD', webhookUrl, mappings)
        continue
      }
      if (action === 'ADD' && record.webhookTargetRecordId) {
        // 已有Webhook记录 ID，降级为 UPDATE
        await this.processBatch([{ ...item, action: 'UPDATE' }], 'UPDATE', webhookUrl, mappings)
        continue
      }

      translated.push({ item, values, warnings })
    }

    if (translated.length === 0) return

    // 构造请求并推送（带重试）
    if (action === 'ADD') {
      const payload = translated.map((t) => ({ values: t.values }))
      const result = await this.pushWithRetry(() => addRecords(webhookUrl, payload))

      if (result.success) {
        // 新增成功：更新 webhookTargetRecordId（按顺序对应）
        for (let i = 0; i < translated.length; i++) {
          const recordId = result.recordIds[i]
          if (recordId) {
            await this.markSuccess(translated[i].item.followUpRecordId, recordId)
          } else {
            await this.markFailed(translated[i].item.followUpRecordId, 'Webhook未返回 record_id')
          }
        }
      } else {
        for (const t of translated) {
          await this.markFailed(t.item.followUpRecordId, result.errmsg)
        }
      }
    } else {
      // UPDATE
      const payload = translated.map((t) => ({
        record_id: records.get(t.item.followUpRecordId)!.webhookTargetRecordId!,
        values: t.values,
      }))
      const result = await this.pushWithRetry(() => updateRecords(webhookUrl, payload))

      if (result.success) {
        for (const t of translated) {
          await this.markSuccess(t.item.followUpRecordId, records.get(t.item.followUpRecordId)!.webhookTargetRecordId!)
        }
      } else {
        for (const t of translated) {
          await this.markFailed(t.item.followUpRecordId, result.errmsg)
        }
      }
    }
  }

  /**
   * 带指数退避重试的推送
   */
  private async pushWithRetry<T extends { success: boolean; errmsg: string; retryable: boolean }>(
    pushFn: () => Promise<T>
  ): Promise<T> {
    let lastResult: T | null = null
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      const result = await pushFn()
      lastResult = result

      if (result.success) return result

      // 不可重试（4xx），直接返回
      if (!result.retryable) {
        writeLog('WARN', '推送失败（不可重试）', { errmsg: result.errmsg, attempt })
        return result
      }

      // 可重试但已达上限
      if (attempt >= MAX_RETRY) {
        writeLog('ERROR', '推送失败（重试耗尽）', { errmsg: result.errmsg, attempts: attempt })
        return result
      }

      // 指数退避：1s, 2s, 4s
      const delayMs = Math.pow(2, attempt - 1) * 1000
      writeLog('WARN', `推送失败，${delayMs}ms 后重试`, { errmsg: result.errmsg, attempt, nextAttempt: attempt + 1 })
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    return lastResult!
  }

  /**
   * 加载启用的字段映射（排除 Webhook URL 行）
   */
  private async loadMappings(): Promise<FieldMapping[]> {
    const rows = await prisma.webhookIntegration.findMany({
      where: {
        configKey: DEFAULT_CONFIG_KEY,
        isEnabled: true,
        hrField: { not: WEBHOOK_URL_FIELD },
        targetFieldId: { not: null },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      hrField: r.hrField,
      targetFieldId: r.targetFieldId,
      targetFieldName: r.targetFieldName,
      targetFieldType: r.targetFieldType,
      transformType: r.transformType,
      transformConfig: r.transformConfig,
      isEnabled: r.isEnabled,
    }))
  }

  /**
   * 加载 Webhook URL（解密后返回）
   */
  private async loadWebhookUrl(): Promise<string | null> {
    return loadStoredWebhookUrl()
  }

  /**
   * 加载跟进记录数据（含关联的 resume、position、evaluation）
   */
  private async loadRecords(ids: string[]): Promise<Map<string, FollowUpRecordWithRelations>> {
    const records = await prisma.followUpRecord.findMany({
      where: { id: { in: ids } },
      include: {
        resume: {
          include: {
            position: true,
          },
        },
        evaluation: true,
        tags: { include: { followUpTag: true } },
        logs: { orderBy: { createdAt: 'asc' } },
      },
    })
    const map = new Map<string, FollowUpRecordWithRelations>()
    for (const r of records) {
      map.set(r.id, r)
    }
    return map
  }

  /**
   * 标记同步成功
   */
  private async markSuccess(followUpRecordId: string, webhookTargetRecordId: string): Promise<void> {
    try {
      await prisma.followUpRecord.update({
        where: { id: followUpRecordId },
        data: {
          webhookTargetRecordId,
          webhookSyncStatus: WEBHOOK_SYNC_STATUS.SYNCED,
          webhookLastSyncedAt: new Date(),
          webhookSyncError: null,
        },
      })
      writeLog('INFO', '同步成功', { followUpRecordId, webhookTargetRecordId })
    } catch (error: unknown) {
      writeLog('ERROR', '标记同步成功失败', { followUpRecordId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * 标记同步失败
   */
  private async markFailed(followUpRecordId: string, errorMsg: string): Promise<void> {
    try {
      await prisma.followUpRecord.update({
        where: { id: followUpRecordId },
        data: {
          webhookSyncStatus: WEBHOOK_SYNC_STATUS.SYNC_FAILED,
          webhookSyncError: errorMsg,
        },
      })
      writeLog('WARN', '同步失败', { followUpRecordId, error: errorMsg })
    } catch (error: unknown) {
      writeLog('ERROR', '标记同步失败时出错', { followUpRecordId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * 获取队列状态（供 API 查询）
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isFlushing,
      processingCount: this.processing.size,
      batchSize: BATCH_SIZE,
      flushIntervalMs: FLUSH_INTERVAL_MS,
    }
  }

  /**
   * 立即同步单条记录（绕过聚合窗口）
   * 用于跟进详情页的「重新同步到Webhook」按钮。
   * @param followUpRecordId 跟进记录 ID
   * @returns { success, message }
   */
  async syncNow(followUpRecordId: string): Promise<{ success: boolean; message: string }> {
    try {
      const record = await prisma.followUpRecord.findUnique({
        where: { id: followUpRecordId },
        select: { status: true, webhookTargetRecordId: true },
      })
      if (!record) {
        return { success: false, message: '跟进记录不存在' }
      }

      if (record.status === 'CONTACTING') {
        return { success: false, message: '沟通中阶段不触发同步' }
      }

      const action: SyncAction = record.webhookTargetRecordId ? 'UPDATE' : 'ADD'
      const mappings = await this.loadMappings()
      const webhookUrl = await this.loadWebhookUrl()

      if (!webhookUrl) {
        return { success: false, message: '未配置 URL' }
      }
      if (mappings.length === 0) {
        return { success: false, message: '未配置字段映射' }
      }

      this.processing.add(followUpRecordId)
      try {
        await this.processBatch(
          [{ followUpRecordId, action, enqueuedAt: Date.now() }],
          action,
          webhookUrl,
          mappings
        )
      } finally {
        this.processing.delete(followUpRecordId)
      }

      // 查询最终状态
      const updated = await prisma.followUpRecord.findUnique({
        where: { id: followUpRecordId },
        select: { webhookSyncStatus: true, webhookSyncError: true },
      })
      if (updated?.webhookSyncStatus === WEBHOOK_SYNC_STATUS.SYNCED) {
        return { success: true, message: '同步成功' }
      }
      return {
        success: false,
        message: updated?.webhookSyncError || '同步失败',
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '未知错误'
      writeLog('ERROR', '立即同步异常', { followUpRecordId, error: msg })
      return { success: false, message: msg }
    }
  }
}

// ========== globalThis 单例 ==========
const globalForQueue = globalThis as unknown as {
  webhookDeliveryQueue: WebhookDeliveryQueue | undefined
}

export const webhookDeliveryQueue = globalForQueue.webhookDeliveryQueue ?? new WebhookDeliveryQueue()

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.webhookDeliveryQueue = webhookDeliveryQueue
}
