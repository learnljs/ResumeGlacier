/**
 * 数据概览页的数据契约。
 *
 * 服务端首屏直出 与 /api/dashboard/stats 共用这份形状，
 * 避免「页面先渲染空壳、再回头要一次接口」时两边字段对不上。
 */

export interface DashboardScopeOption {
  id: string
  label: string
  /** 邮箱维度的完整地址，用于 tooltip */
  address?: string
}

export interface DashboardScopeValue {
  emailConfigId?: string
  resumeSourceId?: string
}

export interface DashboardTrendPoint {
  date?: string
  week?: string
  month?: string
  count: number
  label: string
}

export interface DashboardData {
  stats: {
    totalResumes: number
    todayResumes: number
    weekResumes: number
    monthResumes: number
    pendingResumes: number
    screenedResumes: number
    errorResumes: number
    unparsedResumes: number
    parsingResumes: number
    passRate: number
  }
  positionStats: Array<{ id: string; title: string; resumeCount: number }>
  unassignedCount: number
  filters: {
    emailConfigs: DashboardScopeOption[]
    sources: DashboardScopeOption[]
    applied: DashboardScopeValue
  }
  kpi: {
    screenedDoneDaily: number[]
    errorDaily: number[]
    passRateDaily: Array<number | null>
    today: { screenedDone: number; errors: number; passRate: number | null }
    yesterday: { screenedDone: number; errors: number; passRate: number | null }
    weekErrors: number
    weekScreenedDone: number
  }
  emailConfigs: Array<{
    id: string
    alias: string
    user: string
    lastFetchedAt: string | null
  }>
  /** 近 7 日收取序列，供横幅微型走势首屏直出 */
  dailyData: DashboardTrendPoint[]
  weeklyData: DashboardTrendPoint[]
  monthlyData: DashboardTrendPoint[]
}
