import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { getFollowUpBoardFlow } from '@/lib/services/follow-up-board-flow'
import { parseBoardDateRange } from '@/lib/services/date-utils'
import { parseScope } from '@/lib/services/resume-scope'

/**
 * 跟进看板 · 周报流转图
 *
 * 批次 = 所选时间窗口内首次进入「已筛选」的投递（PositionEvaluation）；
 * 对批内投递的 FollowUpLog 净重放，返回 7 正向节点到达/停留数与 7 条流失分支计数。
 * 岗位/时间参数与 stats 接口口径一致：positionIds 空 = 全部岗位，
 * from/to（YYYY-MM-DD，含首尾）圈定投递时间。
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const positionIds = (searchParams.get('positionIds') || '')
      .split(',')
      .filter(Boolean)

    // 时间段参数校验（与 stats API 一致）
    const dateRange = parseBoardDateRange(searchParams.get('from'), searchParams.get('to'))
    if (!dateRange) {
      return NextResponse.json(
        { error: '无效的时间范围: from/to 需为 YYYY-MM-DD 且 from <= to' },
        { status: 400 }
      )
    }

    const scope = parseScope(searchParams)
    const flow = await getFollowUpBoardFlow(positionIds, dateRange.from, dateRange.to, scope)
    return NextResponse.json(flow)
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
