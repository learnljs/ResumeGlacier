import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { getTrendData } from '@/lib/services/trend-service'
import { parseScope } from '@/lib/services/resume-scope'
import { TIME_RANGE_OPTIONS } from '@/types/trend'
import type { TrendGranularity, TimeRange } from '@/types/trend'

const VALID_GRANULARITIES: TrendGranularity[] = ['daily', 'weekly', 'monthly', 'yearly']

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const granularity = searchParams.get('granularity')
    const range = searchParams.get('range')

    // 参数校验：granularity
    if (!granularity || !VALID_GRANULARITIES.includes(granularity as TrendGranularity)) {
      return NextResponse.json(
        {
          error: `无效的统计粒度: ${granularity || '缺失'}`,
          validGranularities: VALID_GRANULARITIES,
        },
        { status: 400 }
      )
    }

    const g = granularity as TrendGranularity

    // 参数校验：range
    const validRanges = TIME_RANGE_OPTIONS[g]
    if (!range || !validRanges.includes(range as TimeRange)) {
      return NextResponse.json(
        {
          error: `无效的时间范围: ${range || '缺失'}`,
          validRanges,
        },
        { status: 400 }
      )
    }

    const r = range as TimeRange

    const scope = parseScope(searchParams)
    const data = await getTrendData(g, r, scope)
    return NextResponse.json(data)
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
