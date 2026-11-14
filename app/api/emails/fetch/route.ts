import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { fetchEmails } from '@/lib/services/email-fetcher'
import { resumeParsingQueue } from '@/lib/services/resume-parsing-queue'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const configId = (body as Record<string, string | boolean>).configId as string | undefined
    const full = !!(body as Record<string, string | boolean>).full
    const autoProcess = !!(body as Record<string, string | boolean>).autoProcess

    // 手动获取时创建批次
    const result = await fetchEmails(configId || undefined, full, 'manual', '手动获取')

    // 自动管道：收取 → 解析 → 结构化提取 → 筛选
    if (autoProcess && result.total.newResumeIds.length > 0) {
      try {
        const queued = await resumeParsingQueue.enqueue(result.total.newResumeIds, {
          autoScreen: true,
          autoExtract: true,
        })
        return NextResponse.json({
          ...result,
          autoProcess: { queued, newResumeIds: result.total.newResumeIds },
        })
      } catch (queueError: unknown) {
        const msg = queueError instanceof Error ? queueError.message : '未知错误'
        return NextResponse.json({
          ...result,
          autoProcess: { error: msg, newResumeIds: result.total.newResumeIds },
        })
      }
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
