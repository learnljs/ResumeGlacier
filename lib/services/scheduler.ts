import cron, { ScheduledTask } from 'node-cron'
import * as fs from 'fs'
import * as path from 'path'

// 日志目录
const LOG_DIR = path.join(process.cwd(), 'data', 'logs')

// 确保日志目录存在
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

// 获取当前日期的日志文件路径
function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  return path.join(LOG_DIR, `scheduler-${date}.log`)
}

// 写入日志
function writeLog(level: 'INFO' | 'ERROR', message: string, data?: Record<string, unknown>) {
  ensureLogDir()
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  }
  const logLine = JSON.stringify(logEntry) + '\n'
  fs.appendFileSync(getLogFilePath(), logLine, 'utf-8')
}

// 执行邮件获取任务（force 参数保留以兼容手动触发 API，全天候调度下恒不跳过）
export async function executeFetchTask(force = false) {
  const taskStart = new Date()
  const taskId = `fetch-${taskStart.getTime()}`

  writeLog('INFO', '开始定时获取邮件', { taskId })

  try {
    // 动态导入以确保获取最新的模块代码
    const { fetchEmails } = await import('@/lib/services/email-fetcher')

    // 获取当前北京时间用于批次描述
    const beijingTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const result = await fetchEmails(undefined, false, 'scheduled', `定时任务 ${beijingTime}`)

    let autoProcessResult: { queued: number; error?: string } | null = null

    // 如果有新简历，自动加入解析队列
    if (result.total.newResumeIds.length > 0) {
      try {
        const { resumeParsingQueue } = await import('@/lib/services/resume-parsing-queue')
        const queued = await resumeParsingQueue.enqueue(result.total.newResumeIds, {
          autoScreen: true,
          autoExtract: true,
        })
        autoProcessResult = { queued }
      } catch (queueError: unknown) {
        const msg = queueError instanceof Error ? queueError.message : '未知错误'
        autoProcessResult = { queued: 0, error: msg }
      }
    }

    const duration = Date.now() - taskStart.getTime()

    writeLog('INFO', '定时获取邮件完成', {
      taskId,
      duration: `${duration}ms`,
      total: result.total,
      perConfig: result.perConfig.map(c => ({
        alias: c.alias,
        fetched: c.result?.fetched ?? 0,
        generated: c.result?.generated ?? 0,
        errors: c.result?.errors ?? 0,
        error: c.error,
      })),
      autoProcess: autoProcessResult,
    })

    return {
      success: true,
      taskId,
      duration: `${duration}ms`,
      total: result.total,
      autoProcess: autoProcessResult,
      batchId: result.batchId,
      batchNo: result.batchNo,
    }
  } catch (error: unknown) {
    const duration = Date.now() - taskStart.getTime()
    const errorMessage = error instanceof Error ? error.message : '未知错误'

    writeLog('ERROR', '定时获取邮件失败', {
      taskId,
      duration: `${duration}ms`,
      error: errorMessage,
    })

    return {
      success: false,
      taskId,
      duration: `${duration}ms`,
      error: errorMessage,
    }
  }
}

// 定时任务调度器
let scheduledTask: ScheduledTask | null = null
// Webhook 集成到期扫描任务
let webhookSyncTask: ScheduledTask | null = null

/**
 * 启动定时任务调度器
 * 全天候（含周末）每 30 分钟执行一次
 */
export function startScheduler() {
  if (scheduledTask) {
    console.log('[Scheduler] 定时任务已在运行中')
    return
  }

  // 时间表达式：全天候（含周末）每 30 分钟触发一次
  const schedules = [
    { cron: '0,30 * * * *', label: '每30分钟（全天候）' },
  ]

  let startedCount = 0

  // 包装函数，供 cron.schedule 调用（自动触发时 force=false）
  const scheduledFetchTask = () => executeFetchTask(false)

  for (const { cron: cronExpr, label } of schedules) {
    if (!cron.validate(cronExpr)) {
      console.error(`[Scheduler] 无效的 cron 表达式: ${cronExpr}`)
      continue
    }

    const task = cron.schedule(cronExpr, scheduledFetchTask, {
      timezone: 'Asia/Shanghai',
    })

    // 保存第一个任务的引用用于停止
    if (!scheduledTask) {
      scheduledTask = task
    }

    startedCount++
    console.log(`[Scheduler] 定时任务已启动: ${label} (${cronExpr})`)
  }

  writeLog('INFO', '定时任务调度器已启动', {
    schedules: schedules.map(s => ({ cron: s.cron, label: s.label })),
    timezone: 'Asia/Shanghai',
  })

  console.log(`[Scheduler] 调度器初始化完成，共启动 ${startedCount} 个定时任务`)
}

/**
 * 停止定时任务调度器
 */
export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
    console.log('[Scheduler] 定时任务已停止')
    writeLog('INFO', '定时任务调度器已停止')
  }
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    webhookSyncRunning: webhookSyncTask !== null,
    timezone: 'Asia/Shanghai',
    schedule: {
      weekday: '每天',
      timeRange: '全天候',
      interval: '每 30 分钟',
    },
  }
}

// ========== Webhook 集成到期扫描 ==========
// 每日凌晨扫描当日到期的离职记录，HR 侧生效后触发同步

export async function executeWecomSyncScan() {
  const taskStart = new Date()
  const taskId = `webhook-scan-${taskStart.getTime()}`

  writeLog('INFO', '开始Webhook 集成到期扫描', { taskId })

  try {
    // 动态导入确保获取最新代码
    const { prisma } = await import('@/lib/prisma')

    // 查找当日到期的离职记录（resignedAt 在今天或之前，但状态仍是 HIRED）
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const records = await prisma.followUpRecord.findMany({
      where: {
        status: 'HIRED',
        resignedAt: { not: null, lte: today },
        resignReason: { not: null },
      },
      select: { id: true, resignedAt: true, resignReason: true },
    })

    if (records.length === 0) {
      writeLog('INFO', '无到期离职记录', { taskId })
      return { scanned: 0, updated: 0 }
    }

    let updated = 0
    const { webhookDeliveryQueue: syncQueue } = await import('@/lib/services/webhook-delivery-queue')

    for (const record of records) {
      try {
        await prisma.followUpRecord.update({
          where: { id: record.id },
          data: {
            status: 'RESIGNED',
            statusChangedAt: new Date(),
            webhookSyncStatus: 'NOT_SYNCED',
          },
        })

        // 写入操作日志
        await prisma.followUpLog.create({
          data: {
            followUpRecordId: record.id,
            action: 'STATUS_CHANGE',
            detail: `定时扫描到期离职：到达离职日期 ${record.resignedAt?.toISOString()?.split('T')[0] || '未知'}，自动确认离职生效`,
            fromStatus: 'HIRED',
            toStatus: 'RESIGNED',
            transitionType: 'forward',
          },
        })

        // 触发同步
        void syncQueue.enqueue(record.id, 'UPDATE')
        updated++
      } catch (recordError: unknown) {
        writeLog('ERROR', '处理到期离职记录失败', {
          taskId,
          followUpRecordId: record.id,
          error: recordError instanceof Error ? recordError.message : String(recordError),
        })
      }
    }

    const duration = Date.now() - taskStart.getTime()
    writeLog('INFO', 'Webhook 集成到期扫描完成', {
      taskId,
      duration: `${duration}ms`,
      scanned: records.length,
      updated,
    })

    return { scanned: records.length, updated }
  } catch (error: unknown) {
    const duration = Date.now() - taskStart.getTime()
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    writeLog('ERROR', 'Webhook 集成到期扫描失败', { taskId, duration: `${duration}ms`, error: errorMessage })
    return { scanned: 0, updated: 0, error: errorMessage }
  }
}

/** 启动Webhook 集成到期扫描定时任务 */
export function startWebhookSyncScan() {
  if (webhookSyncTask) {
    console.log('[Scheduler] Webhook 集成扫描已在运行中')
    return
  }

  const cronExpr = '0 2 * * *'  // 每天凌晨 02:00

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] 无效的 cron 表达式: ${cronExpr}`)
    return
  }

  webhookSyncTask = cron.schedule(cronExpr, () => {
    void executeWecomSyncScan()
  }, {
    timezone: 'Asia/Shanghai',
  })

  console.log('[Scheduler] Webhook 集成到期扫描已启动: 每日 02:00')
  writeLog('INFO', 'Webhook 集成到期扫描已启动', { cron: cronExpr, timezone: 'Asia/Shanghai' })
}

/** 停止Webhook 集成到期扫描 */
export function stopWecomSyncScan() {
  if (webhookSyncTask) {
    webhookSyncTask.stop()
    webhookSyncTask = null
    console.log('[Scheduler] Webhook 集成到期扫描已停止')
    writeLog('INFO', 'Webhook 集成到期扫描已停止')
  }
}
