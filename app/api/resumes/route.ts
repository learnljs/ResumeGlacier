import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseIntParam } from '@/lib/utils'
import { buildDateWhere } from '@/lib/services/date-utils'

// followUp=NO 时，未跟进简历 id 列表分批查询的每批大小。
// 原实现直接把全部 id 用于 `where: { id: { in: [...] } }`，当已筛选简历过多
// （未跟进 id 达到数百以上）时，大 IN + 关系字段排序（email.receivedAt）会触发
// Prisma Query Engine panic（no entry found for key），故改为分批查询 + 应用层排序分页。
const UNFOLLOWED_ID_BATCH = 500

interface SortCondition {
  key: string
  order: 'asc' | 'desc'
}

function parseSortConditions(sortsParam: string | null): SortCondition[] {
  if (!sortsParam) return []
  
  return sortsParam.split(',').map(sortStr => {
    const [key, order] = sortStr.split(':')
    return {
      key: key.trim(),
      order: (order?.trim() === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
    }
  }).filter(condition => condition.key)
}

function buildOrderBy(sortConditions: SortCondition[]): Record<string, unknown>[] {
  const orderBy: Record<string, unknown>[] = []

  for (const condition of sortConditions) {
    switch (condition.key) {
      case 'createdAt':
        orderBy.push({ createdAt: condition.order })
        break
      case 'receivedAt':
        orderBy.push({ email: { receivedAt: condition.order } })
        break
    }
  }

  return orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }]
}

/**
 * 简历数据兼容层转换：
 * - 按目标岗位筛选评估记录和维度评分
 * - 生成多岗位评分摘要供前端多岗位展示
 */
function flattenResume(
  r: Record<string, unknown>,
  queryPositionId: string | null,
  isSinglePosition: boolean
) {
  const allEvals = (Array.isArray(r.evaluations) ? r.evaluations : []) as Record<string, unknown>[]
  const allDims = (Array.isArray(r.evaluationDimensions) ? r.evaluationDimensions : []) as Record<string, unknown>[]
  const primaryPositionId = r.positionId as string | null

  // 确定目标岗位：如果前端传了单一岗位 ID 就用它，否则用主岗位
  let targetPositionId = primaryPositionId
  if (isSinglePosition) {
    targetPositionId = queryPositionId
  }

  // 取目标岗位的评估记录
  const targetEval = targetPositionId
    ? allEvals.find((e) => e.positionId === targetPositionId)
    : null
  const firstEval = targetEval || (
    // 按岗位筛选但没找到评估 → 不展示（避免混用其他岗位的分数）
    // 无主岗位的简历（UNASSIGNED）→ 不展示（没有锚定岗位）
    isSinglePosition || primaryPositionId === null
      ? null
      : allEvals[0] || null
  )

  // 过滤目标岗位的维度评分
  const targetDims = targetPositionId
    ? allDims.filter((d) => d.positionId === targetPositionId)
    : allDims

  // 所有岗位评分摘要（去重），供前端多岗位展示
  const seenPositions = new Set<string>()
  const positionScores = allEvals
    .filter((e) => {
      const posId = e.positionId as string
      if (!posId || seenPositions.has(posId)) return false
      seenPositions.add(posId)
      return true
    })
    .map((e) => ({
      positionId: e.positionId as string,
      positionTitle: ((e.position as Record<string, unknown>)?.title as string) || '',
      evaluationId: e.id as string,
      hasFollowUp: !!e.followUpRecord,
      initialScore: (e.initialScore as number | null) ?? null,
      compositeScore: (e.compositeScore as number | null) ?? null,
    }))

  return {
    ...r,
    evaluationDimensions: targetDims,
    screeningResult: firstEval
      ? { summary: firstEval.summary, aiTags: firstEval.aiTags }
      : null,
    screenedAt: firstEval?.screenedAt ?? null,
    positionScores,
    followUpRecord: Array.isArray(r.followUpRecords) && (r.followUpRecords as unknown[]).length > 0
      ? (r.followUpRecords as unknown[])[0]
      : null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const screenedStatus = searchParams.get('screenedStatus')
    const positionId = searchParams.get('positionId')
    const positionMatch = searchParams.get('positionMatch')
    const resumeSourceId = searchParams.get('resumeSourceId')
    const emailConfigId = searchParams.get('emailConfigId')
    const search = searchParams.get('search')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const sortsParam = searchParams.get('sorts')
    const sortConditions = parseSortConditions(sortsParam)

    if (sortConditions.length === 0) {
      const sortBy = searchParams.get('sortBy')
      const sortOrder = (searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
      if (sortBy) {
        sortConditions.push({ key: sortBy, order: sortOrder })
      }
    }

    const orderBy = buildOrderBy(sortConditions)

    const priorityIdsParam = searchParams.get('priorityIds')
    const priorityIds = priorityIdsParam ? priorityIdsParam.split(',').filter(Boolean) : []
    const page = parseIntParam(searchParams.get('page'), 1, { min: 1 })
    const pageSize = parseIntParam(searchParams.get('pageSize'), 20, { min: 1, max: 100 })

    // 判断是否筛选了单一岗位（用于兼容层按岗取分）
    const queryPositionId = searchParams.get('positionId')
    const isSinglePosition = !!queryPositionId && !queryPositionId.includes(',') && queryPositionId !== 'UNASSIGNED'

    // 使用 AND 数组模式构建 where，支持复杂条件组合（日期范围、搜索 OR 等）
    const andConditions: Record<string, unknown>[] = []

    if (status && status !== 'ALL') {
      if (status === 'SCREENED') {
        if (screenedStatus && screenedStatus !== 'ALL') {
          andConditions.push({ status: screenedStatus })
        } else {
          andConditions.push({ status: 'SCREENED' })
        }
      } else if (status.includes(',')) {
        andConditions.push({ status: { in: status.split(',').map(s => s.trim()) } })
      } else {
        andConditions.push({ status })
      }
    }
    if (positionId) {
      if (positionId === 'UNASSIGNED') {
        andConditions.push({ positionId: null })
        // 未分配列表排除异常状态，异常简历应仅出现在异常 tab
        if (!status || status === 'ALL') {
          andConditions.push({ status: { notIn: ['ERROR'] } })
        }
      } else {
        const positionIds = positionId.split(',').filter(Boolean)
        if (positionMatch === 'main') {
          // 已筛选界面：只认主岗位，不匹配复用评估岗位
          if (positionIds.length === 1) {
            andConditions.push({ positionId: positionIds[0] })
          } else if (positionIds.length > 1) {
            andConditions.push({ positionId: { in: positionIds } })
          }
        } else {
          // 默认：同时匹配主岗位和复用评估的岗位
          if (positionIds.length === 1) {
            andConditions.push({
              OR: [
                { positionId: positionIds[0] },
                { evaluations: { some: { positionId: positionIds[0] } } },
              ],
            })
          } else if (positionIds.length > 1) {
            andConditions.push({
              OR: [
                { positionId: { in: positionIds } },
                { evaluations: { some: { positionId: { in: positionIds } } } },
              ],
            })
          }
        }
      }
    }
    if (resumeSourceId) {
      andConditions.push({ resumeSourceId })
    }
    if (emailConfigId) {
      andConditions.push({ emailConfigId })
    }
    if (search) {
      andConditions.push({
        OR: [
          { candidateName: { contains: search } },
          { fileName: { contains: search } },
          { email: { subject: { contains: search } } },
        ],
      })
    }

    // 日期范围筛选
    andConditions.push(...buildDateWhere(dateFrom, dateTo))

    const followUp = searchParams.get('followUp')
    // followUp=NO 时未跟进简历 id 列表；过大时不直接进 andConditions（见下方分批处理）
    let unfollowedIds: string[] | null = null
    if (followUp === 'YES') {
      andConditions.push({ followUpRecords: { some: {} } })
    } else if (followUp === 'NO') {
      // 已筛选界面：只看主岗位（最初投递职位）评估是否已跟进
      // 复用评估产生的新岗位评估不影响此处判断
      const mainUnfollowed = await prisma.$queryRaw<{ id: string }[]>`
        SELECT r.id FROM Resume r
        JOIN PositionEvaluation e ON e.resumeId = r.id AND e.positionId = r.positionId
        LEFT JOIN FollowUpRecord f ON f.evaluationId = e.id
        WHERE f.id IS NULL
      `
      // 原实现直接把 id 列表 push 进 andConditions。当已筛选简历过多（未跟进 id 达到
      // 数百以上）时，`id: { in: 大列表 }` + 关系字段排序（email.receivedAt）会触发
      // Prisma Query Engine panic（no entry found for key）。这里改为记录 id 列表，
      // 由下方分批轻量查询 + 应用层排序分页处理，保证大列表下查询正确。
      unfollowedIds = mainUnfollowed.map(r => r.id)
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {}

    const includeFields = {
      email: { select: { subject: true, fromAddress: true, fromName: true, receivedAt: true } },
      position: { select: { id: true, title: true } },
      evaluations: {
        select: {
          id: true,
          positionId: true,
          summary: true, aiTags: true, initialScore: true, compositeScore: true, screenedAt: true,
          position: { select: { id: true, title: true } },
          followUpRecord: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      resumeSource: { select: { id: true, name: true } },
      emailConfig: { select: { id: true, alias: true } },
      followUpRecords: { select: { id: true } },
      evaluationDimensions: { select: { dimension: true, rating: true, comment: true, source: true, positionId: true } },
    }

    // followUp=NO 特殊路径：未跟进简历过多时，`id: { in: 大列表 }` 触发 Prisma engine
    // panic（no entry found for key），改为分批轻量查询排序键 → 应用层排序分页 →
    // 当前页 id 查完整数据。数据量小时（1 批）与原逻辑等价；数据量大时避免 panic。
    if (unfollowedIds) {
      const sortRows: { id: string; createdAt: Date; email: { receivedAt: Date | null } | null }[] = []
      for (let i = 0; i < unfollowedIds.length; i += UNFOLLOWED_ID_BATCH) {
        const chunk = unfollowedIds.slice(i, i + UNFOLLOWED_ID_BATCH)
        const rows = await prisma.resume.findMany({
          where: { AND: [...andConditions, { id: { in: chunk } }] },
          select: { id: true, createdAt: true, email: { select: { receivedAt: true } } },
        })
        sortRows.push(...rows)
      }

      // 数据库层未排序，按用户排序条件在应用层重排（receivedAt 取 email.receivedAt）
      const effectiveSorts = sortConditions.length > 0
        ? sortConditions
        : [{ key: 'createdAt' as const, order: 'desc' as const }]
      sortRows.sort((a, b) => {
        for (const c of effectiveSorts) {
          const av = c.key === 'receivedAt' ? a.email?.receivedAt : a.createdAt
          const bv = c.key === 'receivedAt' ? b.email?.receivedAt : b.createdAt
          const at = av ? new Date(av).getTime() : 0
          const bt = bv ? new Date(bv).getTime() : 0
          if (at === bt) continue
          return c.order === 'asc' ? at - bt : bt - at
        }
        return 0
      })

      // 置顶简历优先
      const orderedRows = priorityIds.length > 0
        ? [...sortRows.filter(r => priorityIds.includes(r.id)), ...sortRows.filter(r => !priorityIds.includes(r.id))]
        : sortRows
      const total = orderedRows.length
      const start = (page - 1) * pageSize
      const pageIds = orderedRows.slice(start, start + pageSize).map(r => r.id)

      // 当前页 id 数量小（≤ pageSize），安全地查完整数据
      const pageRows = await prisma.resume.findMany({
        where: { id: { in: pageIds } },
        include: includeFields,
        orderBy: [{ createdAt: 'desc' as const }],
      })
      const rowsById = new Map(pageRows.map(r => [r.id, r]))
      const resumes = pageIds
        .map(id => rowsById.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => flattenResume(r as Record<string, unknown>, queryPositionId, isSinglePosition))

      return NextResponse.json({
        resumes,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      })
    }

    if (priorityIds.length > 0 && page === 1) {
      const [priorityResumes, rest, total] = await Promise.all([
        prisma.resume.findMany({
          where: { ...where, id: { in: priorityIds } },
          include: includeFields,
          orderBy,
        }),
        prisma.resume.findMany({
          where: { ...where, NOT: { id: { in: priorityIds } } },
          include: includeFields,
          orderBy,
          take: pageSize,
        }),
        prisma.resume.count({ where }),
      ])

      const remainingSlots = pageSize - priorityResumes.length
      const resumes = [...priorityResumes, ...rest.slice(0, Math.max(0, remainingSlots))]

      const compatResumes2 = resumes.map((r: Record<string, unknown>) =>
        flattenResume(r, queryPositionId, isSinglePosition)
      )

      return NextResponse.json({
        resumes: compatResumes2,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      })
    }

    const finalWhere = priorityIds.length > 0
      ? { ...where, NOT: { id: { in: priorityIds } } }
      : where
    const skip = priorityIds.length > 0
      ? Math.max(0, (page - 1) * pageSize - priorityIds.length)
      : (page - 1) * pageSize

    const [resumes, total] = await Promise.all([
      prisma.resume.findMany({
        where: finalWhere,
        include: includeFields,
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.resume.count({ where }),
    ])

    // 转换兼容层：evaluations[] → screeningResult/initialScore/compositeScore, 支持多岗位评分
    const compatResumes = resumes.map((r: Record<string, unknown>) =>
      flattenResume(r, queryPositionId, isSinglePosition)
    )

    return NextResponse.json({
      resumes: compatResumes,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Error fetching resumes:', error)
    return NextResponse.json({ error: 'Failed to fetch resumes' }, { status: 500 })
  }
}
