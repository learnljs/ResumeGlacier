export async function register() {
  // 仅在 Node.js 运行时执行（排除 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 设置 process.getBuiltinModule polyfill（必须在其他模块加载前）
    if (typeof globalThis.process.getBuiltinModule !== 'function') {
      const { createRequire } = require('module')
      const polyfillRequire = createRequire(__filename)
      globalThis.process.getBuiltinModule = (name: string) => {
        try {
          return polyfillRequire(name)
        } catch {
          return undefined
        }
      }
      console.log('[Instrumentation] process.getBuiltinModule polyfill 已设置')
    }

    const { screeningQueue } = await import('@/lib/services/screening-queue')
    await screeningQueue.init()

    const { resumeParsingQueue } = await import('@/lib/services/resume-parsing-queue')
    await resumeParsingQueue.init()

    const { webhookDeliveryQueue } = await import('@/lib/services/webhook-delivery-queue')
    await webhookDeliveryQueue.init()

    // 启动定时任务调度器（仅生产环境）
    if (process.env.NODE_ENV === 'production') {
      const { startScheduler, startWebhookSyncScan } = await import('@/lib/services/scheduler')
      startScheduler()
      startWebhookSyncScan()
    }
  }
}
