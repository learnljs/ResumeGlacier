import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { FOLLOW_UP_STATUSES } from '@/lib/services/follow-up-transitions'
import { parseBoardDateRange } from '@/lib/services/date-utils'
import { parseScope, scopeRelationWhere } from '@/lib/services/resume-scope'

/**
 * 跟进看板 · 当前状态统计
 *
 * 统计单位 = 投递（PositionEvaluation），每条 FollowUpRecord 对应一条投递。
 * 岗位过滤：evaluation.positionId 命中所选岗位；evaluation 为空的历史记录按 resume.positionId 兜底。
 * 投递时间过滤：from/to（YYYY-MM-DD，含首尾）圈定，evaluation.screenedAt（为空按 evaluation.createdAt，
 * evaluation 为空按记录 createdAt）。
 * positionIds 为空 = 全部岗位。
 * 是否联系上：仅统计范围内「沟通中」投递的 contacted 分布（NOT_CONTACTED/CONTACTED/CONTACT_FAILED）。
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const positionIds = (searchParams.get('positionIds') || '')
      .split(',')
      .filter(Boolean)

    // 时间段参数校验（from/to 必填，YYYY-MM-DD 且 from <= to）
    const dateRange = parseBoardDateRange(searchParams.get('from'), searchParams.get('to'))
    if (!dateRange) {
      return NextResponse.json(
        { error: '无效的时间范围: from/to 需为 YYYY-MM-DD 且 from <= to' },
        { status: 400 }
      )
    }
    const { from, to } = dateRange

    // 邮箱 / 来源维度：跟进记录自身不存这两个字段，经 resume 关联收敛
    const scope = parseScope(searchParams)
    const relationScope = scopeRelationWhere(scope) as Prisma.FollowUpRecordWhereInput | undefined

    const conditions: Prisma.FollowUpRecordWhereInput[] = []

    if (relationScope) conditions.push(relationScope)

    // 岗位条件（未选岗位 = 全部）
    if (positionIds.length > 0) {
      conditions.push({
        OR: [
          { evaluation: { positionId: { in: positionIds } } },
          { evaluation: null, resume: { positionId: { in: positionIds } } },
        ],
      })
    }

    // 投递时间条件
    conditions.push({
      OR: [
        { evaluation: { screenedAt: { gte: from, lt: to } } },
        { evaluation: { screenedAt: null, createdAt: { gte: from, lt: to } } },
        { evaluation: null, createdAt: { gte: from, lt: to } },
      ],
    })

    const grouped = await prisma.followUpRecord.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: conditions.length > 0 ? { AND: conditions } : {},
    })

    // 按 10 个状态枚举顺序补全，缺失补 0
    const statusCounts: Record<string, number> = {}
    for (const status of FOLLOW_UP_STATUSES) {
      statusCounts[status] = 0
    }
    let total = 0
    for (const item of grouped) {
      statusCounts[item.status] = item._count._all
      total += item._count._all
    }

    // 是否联系上（仅统计范围内「沟通中」投递的 contacted）
    const contactedGrouped = await prisma.followUpRecord.groupBy({
      by: ['contacted'],
      _count: { _all: true },
      where: { AND: [...conditions, { status: 'CONTACTING' }] },
    })
    const contactedCounts: Record<string, number> = {
      NOT_CONTACTED: 0,
      CONTACTED: 0,
      CONTACT_FAILED: 0,
    }
    let contactedTotal = 0
    for (const item of contactedGrouped) {
      contactedCounts[item.contacted] = item._count._all
      contactedTotal += item._count._all
    }

    // 批次总数：与流转图同口径（窗口内进入「已筛选」的 PositionEvaluation 数），
    // 含尚未创建跟进记录的投递；与 total（已跟进）的差值 = 尚未跟进数。
    const evalConditions: Prisma.PositionEvaluationWhereInput[] = []
    if (positionIds.length > 0) {
      evalConditions.push({ positionId: { in: positionIds } })
    }
    if (scope.emailConfigId || scope.resumeSourceId) {
      evalConditions.push({
        resume: {
          ...(scope.emailConfigId ? { emailConfigId: scope.emailConfigId } : {}),
          ...(scope.resumeSourceId ? { resumeSourceId: scope.resumeSourceId } : {}),
        },
      })
    }
    evalConditions.push({
      OR: [
        { screenedAt: { gte: from, lt: to } },
        { screenedAt: null, createdAt: { gte: from, lt: to } },
      ],
    })
    const batchTotal = await prisma.positionEvaluation.count({
      where: evalConditions.length > 0 ? { AND: evalConditions } : {},
    })
    // evaluationId 为空的历史记录：无投递关联，按记录 createdAt 兜底圈定（与 flow 接口同口径）
    // 一次性构造简历侧条件：Prisma 对可空关系的 Xor 类型不接受分次 spread 赋值
    const orphanResumeFilter: Prisma.ResumeWhereInput = {
      ...(positionIds.length > 0 ? { positionId: { in: positionIds } } : {}),
      ...(scope.emailConfigId ? { emailConfigId: scope.emailConfigId } : {}),
      ...(scope.resumeSourceId ? { resumeSourceId: scope.resumeSourceId } : {}),
    }
    const orphanWhere: Prisma.FollowUpRecordWhereInput = {
      evaluationId: null,
      createdAt: { gte: from, lt: to },
    }
    if (Object.keys(orphanResumeFilter).length > 0) {
      orphanWhere.resume = orphanResumeFilter
    }
    const orphanCount = await prisma.followUpRecord.count({ where: orphanWhere })

    return NextResponse.json({
      statusCounts,
      total,
      batchTotal: batchTotal + orphanCount,
      contacted: { total: contactedTotal, counts: contactedCounts },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
