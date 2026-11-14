/**
 * 趋势图表相关的类型定义
 */

// 统计粒度
export type TrendGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly'

// 时间范围
// daily: this_week | week | last_week | this_month | month | last_month | all
// weekly: this_month | 4weeks | last_month | 8weeks | 12weeks | all
// monthly: 3months | 6months | 12months | all
export type TimeRange =
  | 'week' | 'month' | 'all'
  | 'this_week' | 'last_week' | 'this_month' | 'last_month'
  | '4weeks' | '8weeks' | '12weeks'
  | '3months' | '6months' | '12months'
  | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year'
  | '3years' | '5years'

// 趋势数据点
export interface TrendDataPoint {
  date: string
  count: number
  label: string
}

// API 响应
export interface TrendResponse {
  granularity: TrendGranularity
  range: TimeRange
  label: string           // 图表副标题，如「每日 · 近一个月」
  truncated: boolean       // 软上限是否截断
  data: TrendDataPoint[]
}

// 每个粒度对应的可用时间范围
export const TIME_RANGE_OPTIONS: Record<TrendGranularity, TimeRange[]> = {
  daily:   ['this_week', 'last_week', 'week', 'this_month', 'last_month', 'month', 'all'],
  weekly:  ['this_month', 'last_month', '4weeks', '8weeks', '12weeks', 'all'],
  monthly: ['this_quarter', 'last_quarter', '3months', '6months', 'this_year', 'last_year', '12months', 'all'],
  yearly: ['3years', '5years', 'all'],
}

// 每个粒度的默认时间范围
export const DEFAULT_TIME_RANGE: Record<TrendGranularity, TimeRange> = {
  daily: 'week',
  weekly: '4weeks',
  monthly: '3months',
  yearly: '3years',
}

// 时间范围的中文显示名
export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  'this_week': '本周',
  week: '近一周',
  'last_week': '上周',
  'this_month': '本月',
  month: '近一个月',
  'last_month': '上月',
  all: '全部',
  '4weeks': '近 4 周',
  '8weeks': '近 8 周',
  '12weeks': '近 12 周',
  '3months': '近 3 个月',
  '6months': '近 6 个月',
  '12months': '近 12 个月',
  'this_quarter': '本季度',
  'last_quarter': '上季度',
  'this_year': '本年',
  'last_year': '上年',
  '3years': '近 3 年',
  '5years': '近 5 年',
}

// 软上限：每个粒度下「全部」选项的最大数据点数
export const SOFT_CAPS: Record<TrendGranularity, number> = {
  daily: 90,    // 天
  weekly: 26,   // 周
  monthly: 24,  // 月
  yearly: 10,   // 年
}

// 粒度中文显示名
export const GRANULARITY_LABELS: Record<TrendGranularity, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
}
