import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { startScheduler, stopScheduler, getSchedulerStatus, executeFetchTask } from '@/lib/services/scheduler'

export async function POST(request: NextRequest) {
  // 验证 cron secret（fail-closed：CRON_SECRET 缺失直接 401，避免鉴权旁路）
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action } = body

    if (action === 'start') {
      startScheduler()
      return NextResponse.json({
        message: '定时任务调度器已启动',
        status: getSchedulerStatus(),
      })
    } else if (action === 'stop') {
      stopScheduler()
      return NextResponse.json({
        message: '定时任务调度器已停止',
        status: getSchedulerStatus(),
      })
    } else if (action === 'run') {
      // 手动触发一次任务（跳过工作时间检查）
      const result = await executeFetchTask(true)
      return NextResponse.json({
        message: '手动触发任务执行完成',
        result,
      })
    } else {
      return NextResponse.json({ error: '无效的操作，请使用 start、stop 或 run' }, { status: 400 })
    }
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
