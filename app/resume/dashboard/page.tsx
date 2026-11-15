import { getDashboardStats } from '@/lib/services/dashboard-stats'
import type { DashboardData } from '@/types/dashboard'
import DashboardView from './DashboardView'

/**
 * 数据概览（服务端首屏直出）。
 *
 * 旧版先发一个空壳页面到浏览器，再由 useEffect 回头请求 /api/dashboard/stats，
 * 网络稍慢时用户会先看到空表格再突然填满。这里在服务端把统计结果一起塞进
 * 首屏 HTML，浏览器第一帧就有真实数字；客户端只在切换筛选范围时才重新取数。
 *
 * 查询失败时不让整页报错，降级回原来的客户端取数（initialData=null）。
 */
export const dynamic = 'force-dynamic'

export default async function DashboardPage(): Promise<React.ReactElement> {
  let initialData: DashboardData | null = null
  try {
    initialData = await getDashboardStats({})
  } catch (error) {
    console.error('[dashboard] 首屏统计预取失败，降级为客户端加载:', error)
  }

  return <DashboardView initialData={initialData} />
}
