import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { receivedAtWhere } from '@/lib/services/date-utils'
import { parseScope, scopedWhere } from '@/lib/services/resume-scope'

// 星期映射
const weekDayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 获取过去7天（包括周末）
function getPast7Days(now: Date): Date[] {
  const days: Date[] = []
  let current = new Date(now)

  // 从今天往前找7天
  for (let i = 0; i < 7; i++) {
    days.unshift(new Date(current))
    current.setDate(current.getDate() - 1)
  }

  return days
}

export async function GET(request: NextRequest) {
  try {
    const scope = parseScope(new URL(request.url).searchParams)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 本周一（周一为一周开始）
    const dayOfWeek = now.getDay() // 0=周日, 1=周一, ..., 6=周六
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)

    // 本月1号
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // 过去7天每天的起止时间（包括周末）
    const past7Days = getPast7Days(now)
    const dailyData: Array<{ date: string; count: number; label: string }> = []
    // KPI 方案 B：存量指标无历史，改用可回算的"流水"口径
    // - 每日完成筛选数：status=SCREENED 且当天有过状态推进（updatedAt 即推进时刻）
    // - 每日新增错误：status=ERROR 且当天推进到该状态
    // - 每日通过率：当天入库的简历中最终通过初筛的占比；当天无入库为 null（曲线断开）
    const screenedDoneDaily: number[] = []
    const errorDaily: number[] = []
    const passRateDaily: Array<number | null> = []
    for (const day of past7Days) {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      const receivedSameDay = receivedAtWhere(dayStart, dayEnd)

      const [count, screenedDone, errorNew, receivedGroups] = await Promise.all([
        prisma.resume.count({ where: scopedWhere(scope, receivedSameDay) }),
        prisma.resume.count({
          where: scopedWhere(scope, { status: 'SCREENED', updatedAt: { gte: dayStart, lt: dayEnd } }),
        }),
        prisma.resume.count({
          where: scopedWhere(scope, { status: 'ERROR', updatedAt: { gte: dayStart, lt: dayEnd } }),
        }),
        // 当天入库者的状态分布：通过率分母只取「已出结果」的，避免把还没筛的算成未通过
        prisma.resume.groupBy({
          by: ['status'],
          where: scopedWhere(scope, receivedSameDay),
          _count: { _all: true },
        }),
      ])

      const dayCounts = new Map(receivedGroups.map((g) => [g.status, g._count._all]))
      const receivedScreened = dayCounts.get('SCREENED') ?? 0
      const receivedDecided = receivedScreened + (dayCounts.get('ERROR') ?? 0)

      screenedDoneDaily.push(screenedDone)
      errorDaily.push(errorNew)
      passRateDaily.push(receivedDecided > 0 ? Math.round((receivedScreened / receivedDecided) * 100) : null)

      const month = dayStart.getMonth() + 1
      const d = dayStart.getDate()
      const weekDay = weekDayNames[dayStart.getDay()]
      dailyData.push({
        date: `${month}/${d}`,
        count,
        label: `${month}月${d}日 ${weekDay}`,
      })
    }

    const lastIdx = screenedDoneDaily.length - 1
    const kpi = {
      screenedDoneDaily,
      errorDaily,
      passRateDaily,
      today: {
        screenedDone: screenedDoneDaily[lastIdx] ?? 0,
        errors: errorDaily[lastIdx] ?? 0,
        passRate: passRateDaily[lastIdx] ?? null,
      },
      yesterday: {
        screenedDone: screenedDoneDaily[lastIdx - 1] ?? 0,
        errors: errorDaily[lastIdx - 1] ?? 0,
        passRate: passRateDaily[lastIdx - 1] ?? null,
      },
      weekErrors: errorDaily.reduce((sum, n) => sum + n, 0),
      weekScreenedDone: screenedDoneDaily.reduce((sum, n) => sum + n, 0),
    }

    // 过去4周每周的起止时间（周一到周五）
    const weeklyData: Array<{ week: string; count: number; label: string }> = []
    for (let i = 3; i >= 0; i--) {
      const wStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset - i * 7)
      const wEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset - (i - 1) * 7)
      const count = await prisma.resume.count({
        where: scopedWhere(scope, receivedAtWhere(wStart, wEnd)),
      })
      const wMonth = wStart.getMonth() + 1
      const wDay = wStart.getDate()
      weeklyData.push({
        week: `${wMonth}/${wDay}`,
        count,
        label: `第${4 - i}周 (${wMonth}/${wDay}起)`,
      })
    }

    // 过去3个月每月的起止时间（统计工作日）
    const monthlyData: Array<{ month: string; count: number; label: string }> = []
    for (let i = 2; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const count = await prisma.resume.count({
        where: scopedWhere(scope, receivedAtWhere(mStart, mEnd)),
      })
      monthlyData.push({
        month: `${mStart.getMonth() + 1}月`,
        count,
        label: `${mStart.getFullYear()}年${mStart.getMonth() + 1}月`,
      })
    }

    const [
      totalResumes,
      todayResumes,
      weekResumes,
      monthResumes,
      pendingResumes,
      screenedResumes,
      errorResumes,
      unparsedResumes,
      parsingResumes,
      unassignedCount,
      activePositions,
      positionGroups,
      emailConfigs,
      sourceList,
    ] = await Promise.all([
      prisma.resume.count({ where: scopedWhere(scope) }),
      prisma.resume.count({
        where: scopedWhere(scope, receivedAtWhere(todayStart, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))),
      }),
      prisma.resume.count({
        where: scopedWhere(scope, receivedAtWhere(weekStart, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))),
      }),
      prisma.resume.count({
        where: scopedWhere(scope, receivedAtWhere(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1))),
      }),
      prisma.resume.count({ where: scopedWhere(scope, { status: 'PENDING' }) }),
      prisma.resume.count({ where: scopedWhere(scope, { status: 'SCREENED' }) }),
      prisma.resume.count({ where: scopedWhere(scope, { status: 'ERROR' }) }),
      prisma.resume.count({ where: scopedWhere(scope, { status: 'UNPARSED' }) }),
      prisma.resume.count({ where: scopedWhere(scope, { status: 'PARSING' }) }),
      prisma.resume.count({ where: scopedWhere(scope, { positionId: null }) }),
      prisma.position.findMany({
        where: { status: 'active' },
        select: { id: true, title: true },
      }),
      // 岗位分布跟随当前统计范围，避免筛选后总数与分项对不上
      prisma.resume.groupBy({
        by: ['positionId'],
        where: scopedWhere(scope),
        _count: { _all: true },
      }),
      prisma.emailConfig.findMany({
        where: { isActive: true },
        select: {
          id: true,
          alias: true,
          user: true,
          lastFetchedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.resumeSource.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const groupCount = new Map<string | null, number>()
    for (const g of positionGroups) {
      groupCount.set(g.positionId, g._count._all)
    }

    const positionStats = activePositions
      .map((p) => ({
        id: p.id,
        title: p.title,
        resumeCount: groupCount.get(p.id) ?? 0,
      }))
      .filter((p) => p.resumeCount > 0)

    return NextResponse.json({
      stats: {
        totalResumes,
        todayResumes,
        weekResumes,
        monthResumes,
        pendingResumes,
        screenedResumes,
        errorResumes,
        unparsedResumes,
        parsingResumes,
        // 通过率 = 已筛选（通过初筛）/ 简历总量；总量为 0 时不计算
        passRate: totalResumes > 0 ? Math.round((screenedResumes / totalResumes) * 100) : 0,
      },
      dailyData,
      weeklyData,
      monthlyData,
      kpi,
      unassignedCount,
      positionStats,
      emailConfigs: emailConfigs.map((c) => ({
        id: c.id,
        alias: c.alias,
        user: c.user,
        lastFetchedAt: c.lastFetchedAt,
      })),
      // 维度筛选的可选项：数量 ≥2 时才在前端展示切换器
      // 选项文案只放名称，不再带「（份数）」——总量已经在横幅左侧单独给出
      filters: {
        emailConfigs: emailConfigs.map((c) => ({
          id: c.id,
          label: c.alias || c.user,
          address: c.user,
        })),
        sources: sourceList.map((s) => ({
          id: s.id,
          label: s.name,
        })),
        applied: scope,
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
