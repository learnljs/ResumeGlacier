'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendGranularitySelector } from '@/components/resume/TrendGranularitySelector'
import { TimeRangeDropdown } from '@/components/resume/TimeRangeDropdown'
import { CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { TrendGranularity, TimeRange, TrendResponse } from '@/types/trend'
import { DEFAULT_TIME_RANGE } from '@/types/trend'
import { apiGet } from '@/lib/api/client'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { CHART_SEMANTIC, chartColor } from '@/lib/constants/chart'
import { getEvenlySpacedTicks, niceCeil, integerTicks } from '@/lib/utils/chart-axis'

// -------------------------------------------------------
// 自定义 Tooltip：白卡 + 圆角，日期加粗、数值右对齐
// -------------------------------------------------------

/** Recharts Tooltip 传递给 content 组件的 payload 项 */
interface TooltipPayloadEntry {
  value: number
  payload?: { count?: number; _delta?: number | null }
}

interface TrendTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  const count = point?.count ?? 0
  const delta = point?._delta ?? null

  return (
    <div className="min-w-[132px] rounded-lg border border-border bg-card px-3 py-2 shadow-soft">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline justify-between gap-4">
        <span className="text-xs text-muted-foreground">简历数</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">{count} 份</span>
      </div>
      {delta !== null && (
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <span className="text-xs text-muted-foreground">较上期</span>
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: delta >= 0 ? CHART_SEMANTIC.success : CHART_SEMANTIC.destructive }}
          >
            {delta >= 0 ? '+' : ''}{delta}
          </span>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------
// 主组件
// -------------------------------------------------------

/**
 * 简历收取趋势图（单序列面积图）。
 *
 * 表达要点：
 *   • 面积渐变代替纯折线，让「量级」有体积感而不只是线的位置
 *   • 均值虚线提供基线，单点高低可以直接和自身周期比较
 *   • tooltip 额外给出与上一期的差值，比单看一个数字更有信息量
 */
interface PositionTrendCompareChartProps {
  /** 数据范围：邮箱维度；不传表示全部 */
  emailConfigId?: string
  /** 数据范围：来源维度；不传表示全部 */
  resumeSourceId?: string
}

export function PositionTrendCompareChart({
  emailConfigId,
  resumeSourceId,
}: PositionTrendCompareChartProps = {}) {
  // ---------- 粒度与时间范围 ----------
  const [granularity, setGranularity] = useState<TrendGranularity>('daily')
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE.daily)

  // ---------- 数据与加载 ----------
  const [data, setData] = useState<TrendResponse | null>(null)
  const [loading, setLoading] = useState(false)

  // ---------- 数据获取 ----------
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        granularity,
        range: timeRange,
      })
      if (emailConfigId) params.set('emailConfigId', emailConfigId)
      if (resumeSourceId) params.set('resumeSourceId', resumeSourceId)
      const json = await apiGet<TrendResponse>(`/api/dashboard/trends?${params.toString()}`)
      setData(json)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '获取趋势数据失败'
      toast.error(msg)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [granularity, timeRange, emailConfigId, resumeSourceId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------- 控件回调 ----------
  const handleGranularityChange = (g: TrendGranularity) => {
    setGranularity(g)
    setTimeRange(DEFAULT_TIME_RANGE[g])
  }

  const handleTimeRangeChange = (r: TimeRange) => {
    setTimeRange(r)
  }

  // ---------- 数据转换：API 分列式 → Recharts 行式 ----------
  const chartData = useMemo(
    () =>
      data?.data.map((d, i, arr) => ({
        label: d.label,
        count: d.count,
        // 与上一个数据点的差值，供 tooltip 显示环比
        _delta: i === 0 ? null : d.count - arr[i - 1].count,
      })) ?? [],
    [data]
  )

  const average = useMemo(() => {
    if (!chartData.length) return 0
    const sum = chartData.reduce((acc, d) => acc + d.count, 0)
    return Math.round((sum / chartData.length) * 10) / 10
  }, [chartData])

  // 窄屏放不下 8 个日期刻度，降到 4 个避免贴在一起
  const isWide = useMediaQuery('(min-width: 640px)')
  const visibleTicks = useMemo(
    () => getEvenlySpacedTicks(chartData.map((d) => d.label as string), isWide ? 8 : 4),
    [chartData, isWide]
  )

  const isEmpty = !loading && data != null && chartData.length === 0
  const isInsufficient = !loading && data != null && chartData.length === 1

  // 纵轴上限跟随当期峰值，收到上百份也不会顶到天花板
  const yMax = useMemo(
    () => niceCeil(chartData.reduce((m, d) => (d.count > m ? d.count : m), 0)),
    [chartData]
  )

  const primaryColor = chartColor(1)

  return (
    <Card>
      <CardContent className="p-4">
        {/* Row 1: 标题 + 控件 */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <CalendarRange className="h-4 w-4 text-accent" />
            </div>
            <span className="text-sm font-medium">收取趋势</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <TrendGranularitySelector value={granularity} onChange={handleGranularityChange} />
            <TimeRangeDropdown granularity={granularity} value={timeRange} onChange={handleTimeRangeChange} />
          </div>
        </div>

        {/* 副标题 */}
        {data?.label && !isEmpty && (
          <p className="text-xs text-muted-foreground mb-2">{data.label}</p>
        )}

        {/* Row 2: 面积图 */}
        <div className="h-[300px] w-full [&_*]:outline-none [&_svg]:focus:outline-none [&_svg]:outline-none">
          {loading ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <CalendarRange className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">暂无趋势数据</p>
            </div>
          ) : (
            <>
              {isInsufficient && (
                <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  数据点较少，建议切换更长时间范围
                  <button
                    type="button"
                    className="ml-2 underline underline-offset-2 hover:opacity-80"
                    onClick={() => handleTimeRangeChange(DEFAULT_TIME_RANGE[granularity])}
                  >
                    查看默认范围
                  </button>
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 24, right: 56, bottom: 8, left: 0 }}
                >
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={primaryColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_SEMANTIC.grid}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: CHART_SEMANTIC.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_SEMANTIC.grid }}
                    ticks={visibleTicks}
                    padding={{ left: 8, right: 8 }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: CHART_SEMANTIC.axis }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={44}
                    domain={[0, yMax]}
                    ticks={integerTicks(yMax)}
                  />
                  <Tooltip
                    content={<TrendTooltip />}
                    cursor={{ stroke: CHART_SEMANTIC.grid, strokeWidth: 1 }}
                  />

                  {/* 周期均值基线 */}
                  {average > 0 && (
                    <ReferenceLine
                      y={average}
                      stroke={CHART_SEMANTIC.muted}
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                      label={{
                        value: `均值 ${average}`,
                        position: 'right',
                        fill: CHART_SEMANTIC.muted,
                        fontSize: 11,
                      }}
                    />
                  )}

                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={primaryColor}
                    strokeWidth={2}
                    fill="url(#trendFill)"
                    dot={false}
                    activeDot={{
                      r: 4.5,
                      fill: primaryColor,
                      stroke: 'hsl(var(--card))',
                      strokeWidth: 2,
                    }}
                  />

                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
