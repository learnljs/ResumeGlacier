/**
 * 趋势数据服务
 *
 * 提供统一的时间范围计算和趋势数据查询，供 Dashboard 总趋势
 * 和岗位维度趋势 API 共用。
 */

import { prisma } from '@/lib/prisma'
import {
  type TrendGranularity,
  type TimeRange,
  type TrendDataPoint,
  type TrendResponse,
  TIME_RANGE_LABELS,
  GRANULARITY_LABELS,
  SOFT_CAPS,
} from '@/types/trend'
import { receivedAtWhere } from '@/lib/services/date-utils'
import { scopedWhere, type ResumeScope } from '@/lib/services/resume-scope'

/** 趋势统计范围：岗位 + 邮箱 + 来源 */
export type TrendScope = ResumeScope & { positionId?: string }

/**
 * 日期区间
 */
export interface DateRange {
  start: Date
  end: Date
  label: string
}

/**
 * 根据粒度和时间范围生成要查询的日期区间列表。
 * 软上限在 range === 'all' 时生效。
 */

// ---- 日历对齐辅助函数 ----

/** 本周每日：周一到周日（满 7 天） */
function getThisWeekDaily(now: Date): DateRange[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - mondayOffset)

  const ranges: DateRange[] = []
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(monday)
    dayStart.setDate(monday.getDate() + i)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayStart.getDate() + 1)
    ranges.push({
      start: dayStart,
      end: dayEnd,
      label: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
    })
  }
  return ranges
}

/** 上周每日：上周一到上周日（满 7 天） */
function getLastWeekDaily(now: Date): DateRange[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - mondayOffset)
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)

  const ranges: DateRange[] = []
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(lastMonday)
    dayStart.setDate(lastMonday.getDate() + i)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayStart.getDate() + 1)
    ranges.push({
      start: dayStart,
      end: dayEnd,
      label: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
    })
  }
  return ranges
}

/** 本月每日：1 号到最后一天 */
function getThisMonthDaily(now: Date): DateRange[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()

  const ranges: DateRange[] = []
  for (let d = 1; d <= lastDay; d++) {
    const dayStart = new Date(year, month, d)
    const dayEnd = new Date(year, month, d + 1)
    ranges.push({
      start: dayStart,
      end: dayEnd,
      label: `${month + 1}/${d}`,
    })
  }
  return ranges
}

/** 上月每日：上月 1 号到最后一天 */
function getLastMonthDaily(now: Date): DateRange[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastMonth = month === 0 ? 11 : month - 1
  const lastMonthYear = month === 0 ? year - 1 : year
  const lastDay = new Date(lastMonthYear, lastMonth + 1, 0).getDate()

  const ranges: DateRange[] = []
  for (let d = 1; d <= lastDay; d++) {
    const dayStart = new Date(lastMonthYear, lastMonth, d)
    const dayEnd = new Date(lastMonthYear, lastMonth, d + 1)
    ranges.push({
      start: dayStart,
      end: dayEnd,
      label: `${lastMonth + 1}/${d}`,
    })
  }
  return ranges
}

/** 本月自然周：所有与本月有交集的完整周（周一~周日） */
function getThisMonthWeekly(now: Date): DateRange[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  return getMonthWeekly(year, month)
}

/** 上月自然周：所有与上月有交集的完整周（周一~周日） */
function getLastMonthWeekly(now: Date): DateRange[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastMonth = month === 0 ? 11 : month - 1
  const lastMonthYear = month === 0 ? year - 1 : year
  return getMonthWeekly(lastMonthYear, lastMonth)
}

/** 给定年月的所有覆盖自然周 */
function getMonthWeekly(year: number, month: number): DateRange[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // 包含本月 1 号的周一
  const firstDayOfWeek = firstDay.getDay()
  const firstMondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1
  const startMonday = new Date(firstDay)
  startMonday.setDate(firstDay.getDate() - firstMondayOffset)

  // 包含本月最后一天的周日
  const lastDayOfWeek = lastDay.getDay()
  const lastSundayOffset = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek
  const endSunday = new Date(lastDay)
  endSunday.setDate(lastDay.getDate() + lastSundayOffset)

  const ranges: DateRange[] = []
  let wStart = new Date(startMonday)
  while (wStart <= endSunday) {
    const wEnd = new Date(wStart)
    wEnd.setDate(wStart.getDate() + 7)
    const sunday = new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate() + 6)
    ranges.push({
      start: new Date(wStart),
      end: new Date(wEnd),
      label: `${sunday.getMonth() + 1}/${sunday.getDate()}止`,
    })
    wStart = new Date(wEnd)
  }
  return ranges
}

/** 本季度每月：当前季度首月到最后一个月（3 个 bucket） */
function getThisQuarterMonthly(now: Date): DateRange[] {
  const year = now.getFullYear()
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
  const ranges: DateRange[] = []
  for (let i = 0; i < 3; i++) {
    const mStart = new Date(year, quarterStartMonth + i, 1)
    const mEnd = new Date(year, quarterStartMonth + i + 1, 1)
    ranges.push({
      start: mStart,
      end: mEnd,
      label: `${mStart.getFullYear()}.${mStart.getMonth() + 1}`,
    })
  }
  return ranges
}

/** 上季度每月：上季度首月到最后一个月（3 个 bucket） */
function getLastQuarterMonthly(now: Date): DateRange[] {
  const year = now.getFullYear()
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
  const lastQuarterStartMonth = quarterStartMonth - 3
  const qYear = lastQuarterStartMonth < 0 ? year - 1 : year
  const qStartMonth = lastQuarterStartMonth < 0 ? lastQuarterStartMonth + 12 : lastQuarterStartMonth
  const ranges: DateRange[] = []
  for (let i = 0; i < 3; i++) {
    const mStart = new Date(qYear, qStartMonth + i, 1)
    const mEnd = new Date(qYear, qStartMonth + i + 1, 1)
    ranges.push({
      start: mStart,
      end: mEnd,
      label: `${mStart.getFullYear()}.${mStart.getMonth() + 1}`,
    })
  }
  return ranges
}

/** 本年每月：1月到12月（12 个 bucket） */
function getThisYearMonthly(now: Date): DateRange[] {
  const year = now.getFullYear()
  const ranges: DateRange[] = []
  for (let i = 0; i < 12; i++) {
    const mStart = new Date(year, i, 1)
    const mEnd = new Date(year, i + 1, 1)
    ranges.push({
      start: mStart,
      end: mEnd,
      label: `${mStart.getFullYear()}.${mStart.getMonth() + 1}`,
    })
  }
  return ranges
}

/** 上年每月：去年1月到12月（12 个 bucket） */
function getLastYearMonthly(now: Date): DateRange[] {
  const year = now.getFullYear() - 1
  const ranges: DateRange[] = []
  for (let i = 0; i < 12; i++) {
    const mStart = new Date(year, i, 1)
    const mEnd = new Date(year, i + 1, 1)
    ranges.push({
      start: mStart,
      end: mEnd,
      label: `${mStart.getFullYear()}.${mStart.getMonth() + 1}`,
    })
  }
  return ranges
}

export function getDateRanges(
  granularity: TrendGranularity,
  range: TimeRange
): { ranges: DateRange[]; truncated: boolean } {
  const now = new Date()

  // ---- 日历对齐的新范围（非 count 驱动，提前返回） ----

  if (granularity === 'daily') {
    switch (range) {
      case 'this_week':  return { ranges: getThisWeekDaily(now), truncated: false }
      case 'last_week':  return { ranges: getLastWeekDaily(now), truncated: false }
      case 'this_month': return { ranges: getThisMonthDaily(now), truncated: false }
      case 'last_month': return { ranges: getLastMonthDaily(now), truncated: false }
    }
  }

  if (granularity === 'weekly') {
    switch (range) {
      case 'this_month': return { ranges: getThisMonthWeekly(now), truncated: false }
      case 'last_month': return { ranges: getLastMonthWeekly(now), truncated: false }
    }
  }

  if (granularity === 'monthly') {
    switch (range) {
      case 'this_quarter': return { ranges: getThisQuarterMonthly(now), truncated: false }
      case 'last_quarter': return { ranges: getLastQuarterMonthly(now), truncated: false }
      case 'this_year':    return { ranges: getThisYearMonthly(now), truncated: false }
      case 'last_year':    return { ranges: getLastYearMonthly(now), truncated: false }
    }
  }

  // ---- 原有 count-based 逻辑 ----
  let count: number

  switch (granularity) {
    case 'daily': {
      switch (range) {
        case 'week':     count = 7;  break
        case 'month':    count = 30; break
        case 'all':      count = SOFT_CAPS.daily;   break  // 90
        default:         count = 7
      }
      break
    }
    case 'weekly': {
      switch (range) {
        case '4weeks':  count = 4;  break
        case '8weeks':  count = 8;  break
        case '12weeks': count = 12; break
        case 'all':     count = SOFT_CAPS.weekly;   break  // 26
        default:        count = 4
      }
      break
    }
    case 'monthly': {
      switch (range) {
        case '3months':  count = 3;  break
        case '6months':  count = 6;  break
        case '12months': count = 12; break
        case 'all':      count = SOFT_CAPS.monthly;  break  // 24
        default:         count = 3
      }
      break
    }
    case 'yearly': {
      switch (range) {
        case '3years':  count = 3;  break
        case '5years':  count = 5;  break
        case 'all':     count = SOFT_CAPS.yearly;   break  // 10
        default:        count = 3
      }
      break
    }
    default:
      count = 7
  }

  const truncated = range === 'all'
  const ranges: DateRange[] = []

  if (granularity === 'daily') {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    for (let i = count - 1; i >= 0; i--) {
      const dayStart = new Date(today)
      dayStart.setDate(dayStart.getDate() - i)
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1)
      const month = dayStart.getMonth() + 1
      const d = dayStart.getDate()
      ranges.push({
        start: dayStart,
        end: dayEnd,
        label: `${month}/${d}`,
      })
    }
  } else if (granularity === 'weekly') {
    // 以周一为起始的自然周
    const dayOfWeek = now.getDay() // 0=周日, 1=周一, ..., 6=周六
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    for (let i = count - 1; i >= 0; i--) {
      const wStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - mondayOffset - i * 7
      )
      const wEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - mondayOffset - (i - 1) * 7
      )
      const sunday = new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate() + 6)
      const wMonth = sunday.getMonth() + 1
      const wDay = sunday.getDate()
      ranges.push({
        start: wStart,
        end: wEnd,
        label: `${wMonth}/${wDay}止`,
      })
    }
  } else if (granularity === 'monthly') {
    // monthly — 以自然月 1 号为起始
    for (let i = count - 1; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      ranges.push({
        start: mStart,
        end: mEnd,
        label: `${mStart.getFullYear()}.${mStart.getMonth() + 1}`,
      })
    }
  } else {
    // yearly — 以自然年 1 月 1 号为起始
    for (let i = count - 1; i >= 0; i--) {
      const yStart = new Date(now.getFullYear() - i, 0, 1)
      const yEnd = new Date(now.getFullYear() - i + 1, 0, 1)
      ranges.push({
        start: yStart,
        end: yEnd,
        label: `${yStart.getFullYear()}`,
      })
    }
  }

  return { ranges, truncated }
}

/**
 * 对日期区间列表执行 COUNT 查询，返回每个 bucket 的计数值。
 * 同一请求中的所有 COUNT 通过 Promise.all 并发执行。
 */
export async function queryTrendCounts(
  ranges: DateRange[],
  scope?: TrendScope
): Promise<Array<{ label: string; count: number }>> {
  const results = await Promise.all(
    ranges.map(async (r) => {
      const count = await prisma.resume.count({
        where: scopedWhere(scope, receivedAtWhere(r.start, r.end)),
      })
      return { label: r.label, count }
    })
  )

  return results
}

/**
 * 获取趋势数据的入口函数。
 * 组合 getDateRanges + queryTrendCounts，返回 API 所需的完整响应结构。
 */
export async function getTrendData(
  granularity: TrendGranularity,
  range: TimeRange,
  scope?: TrendScope
): Promise<TrendResponse> {
  const { ranges, truncated } = getDateRanges(granularity, range)
  const counts = await queryTrendCounts(ranges, scope)

  const data: TrendDataPoint[] = ranges.map((r, i) => ({
    date: r.start.toISOString(),
    count: counts[i]?.count ?? 0,
    label: r.label,
  }))

  const rangeLabel = TIME_RANGE_LABELS[range]
  const granularityLabel = GRANULARITY_LABELS[granularity]
  let label = `${granularityLabel} · ${rangeLabel}`
  if (truncated) {
    const cap = SOFT_CAPS[granularity]
    const unit = granularity === 'daily' ? '天' : granularity === 'weekly' ? '周' : granularity === 'monthly' ? '个月' : '年'
    label += `（近 ${cap} ${unit}）`
  }

  return {
    granularity,
    range,
    label,
    truncated,
    data,
  }
}

