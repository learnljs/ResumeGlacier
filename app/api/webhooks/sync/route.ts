import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { webhookDeliveryQueue } from '@/lib/services/webhook-delivery-queue'

/**
 * POST /api/webhooks/sync
 * 手动触发单条跟进记录的全量同步（重新同步到Webhook）。
 *
 * 请求体：{ followUpRecordId: string }
 * 返回：{ success, message }
 *
 * 用于跟进详情页的「重新同步到Webhook」按钮和失败重试。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { followUpRecordId } = body as { followUpRecordId?: string }

    if (!followUpRecordId) {
      return NextResponse.json({ error: '缺少 followUpRecordId' }, { status: 400 })
    }

    const result = await webhookDeliveryQueue.syncNow(followUpRecordId)
    return NextResponse.json(result)
  } catch (error: unknown) {
    return apiErrorResponse(error, '同步失败')
  }
}
