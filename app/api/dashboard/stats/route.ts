import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { parseScope } from '@/lib/services/resume-scope'
import { getDashboardStats } from '@/lib/services/dashboard-stats'

/** GET /api/dashboard/stats — 统计逻辑见 lib/services/dashboard-stats.ts */
export async function GET(request: NextRequest) {
  try {
    const scope = parseScope(new URL(request.url).searchParams)
    return NextResponse.json(await getDashboardStats(scope))
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
