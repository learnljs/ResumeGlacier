import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { fetchEmails } from '@/lib/services/email-fetcher'

export async function GET(request: NextRequest) {
  // Verify cron secret（fail-closed：CRON_SECRET 缺失直接 401，避免鉴权旁路）
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const result = await fetchEmails()
    return NextResponse.json(result)
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
