import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { getTrendData } from '@/lib/services/trend-service'
import { TIME_RANGE_OPTIONS } from '@/types/trend'
import type { TrendGranularity, TimeRange } from '@/types/trend'

const VALID_GRANULARITIES: TrendGranularity[] = ['daily', 'weekly', 'monthly', 'yearly']

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const positionId = searchParams.get('positionId')
    const granularity = searchParams.get('granularity')
    const range = searchParams.get('range')

    if (!positionId) {
      return NextResponse.json({ error: 'positionId 必填' }, { status: 400 })
    }

    // 验证岗位存在
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      select: { id: true, title: true },
    })

    if (!position) {
      return NextResponse.json({ error: '岗位不存在' }, { status: 404 })
    }

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

    const trendData = await getTrendData(g, r, { positionId })
    return NextResponse.json({
      positionName: position.title,
      ...trendData,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
