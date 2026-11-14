import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseIntParam } from '@/lib/utils'
import { apiErrorResponse } from '@/lib/services/api-error'
import {
  findOrCreateEvaluationForFollowUp,
  buildFollowUpWhere,
  PositionRequiredError,
} from '@/lib/services/follow-up-service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseIntParam(searchParams.get('page'), 1, { min: 1 })
    const pageSize = parseIntParam(searchParams.get('pageSize'), 20, { min: 1, max: 100 })
    const search = searchParams.get('search') || ''
    const tagIds = searchParams.get('tagIds') || ''
    const tagLogic = searchParams.get('tagLogic') || 'OR' // OR | AND
    const positionIds = searchParams.get('positionIds') || ''
    const status = searchParams.get('status') || ''
    const scoreMin = searchParams.get('scoreMin') || ''
    const scoreMax = searchParams.get('scoreMax') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const resumeSourceId = searchParams.get('resumeSourceId') || ''
    const recordStatus = searchParams.get('recordStatus') || ''
    const contacted = searchParams.get('contacted') || ''
    // 排序方向：asc | desc，默认 desc（非法值回落 desc）
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    // 公共筛选复用 buildFollowUpWhere（B7-6，与 export POST 保持一致）
    const { where, resumeWhere } = buildFollowUpWhere({
      recordStatus,
      contacted,
      search,
      positionIds,
      dateFrom,
      dateTo,
      tagIds,
      tagLogic,
    })

    // records GET 特有的简历层筛选
    if (resumeSourceId) {
      resumeWhere.resumeSourceId = resumeSourceId
    }
    if (status) {
      resumeWhere.status = status === 'SCREENED' ? 'SCREENED' : status
    }

    if (scoreMin || scoreMax) {
      // 得分筛选通过 evaluation 关联查询（非法值回落 undefined，不参与过滤）
      const evalWhere: Record<string, number> = {}
      if (scoreMin) {
        const min = parseIntParam(scoreMin, NaN, { min: 0 })
        if (!Number.isNaN(min)) evalWhere.gte = min
      }
      if (scoreMax) {
        const max = parseIntParam(scoreMax, NaN, { min: 0 })
        if (!Number.isNaN(max)) evalWhere.lte = max
      }
      if (Object.keys(evalWhere).length > 0) {
        where.evaluation = { initialScore: evalWhere }
      }
    }

    // 补充简历层条件（共享函数已挂公共部分，这里确保特殊条件也挂载）
    if (Object.keys(resumeWhere).length > 0) {
      where.resume = resumeWhere
    }

    const tagIdList = tagIds ? tagIds.split(',').filter(Boolean) : []
    if (tagIdList.length > 0) {
      if (tagLogic === 'AND') {
        where.AND = tagIdList.map((tagId) => ({
          tags: { some: { followUpTagId: tagId } },
        }))
      } else {
        where.tags = { some: { followUpTagId: { in: tagIdList } } }
      }
    }

    const [records, total] = await Promise.all([
      prisma.followUpRecord.findMany({
        where,
        include: {
          tags: { include: { followUpTag: true } },
          evaluation: {
            select: {
              positionId: true,
              initialScore: true, compositeScore: true, strengths: true,
              position: { select: { id: true, title: true } },
            },
          },
          resume: {
            select: {
              id: true,
              candidateName: true,
              candidatePhone: true,
              candidateEmail: true,
              status: true,
              position: { select: { id: true, title: true } },
              resumeSource: { select: { id: true, name: true } },
              email: { select: { subject: true, fromAddress: true, receivedAt: true } },
              evaluationDimensions: { select: { dimension: true, rating: true, comment: true, source: true, positionId: true } },
            },
          },
        },
        orderBy: [
          { statusChangedAt: sortOrder },
          { createdAt: sortOrder },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.followUpRecord.count({ where }),
    ])

    // 扁平化处理：将 evaluation 的字段合并到 resume 层级，保持前端兼容
    const flatRecords = records.map((r) => ({
      ...r,
      resume: {
        ...r.resume,
        screeningResult: r.evaluation?.strengths ? { summary: r.evaluation.strengths } : null,
        evaluationPosition: r.evaluation?.position ?? null,
        // 按评估关联的岗位过滤维度评分，避免混用其他岗位的评分
        evaluationDimensions: r.evaluation?.positionId
          ? (r.resume.evaluationDimensions || []).filter(
              (d) => d.positionId === r.evaluation!.positionId
            )
          : r.resume.evaluationDimensions,
      },
    }))

    return NextResponse.json({
      records: flatRecords,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '获取跟进记录失败')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resumeId, evaluationId, tagIds, note, status, rejectReason } = body

    if (!resumeId && !evaluationId) {
      return NextResponse.json({ error: '请提供 resumeId 或 evaluationId' }, { status: 400 })
    }

    // UNSUITABLE 场景不需要标签，其他场景标签必填
    const effectiveStatus = status || 'CONTACTING'
    if (effectiveStatus !== 'UNSUITABLE') {
      if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
        return NextResponse.json({ error: '至少选择一个标签' }, { status: 400 })
      }
    }

    const safeTagIds: string[] = tagIds && Array.isArray(tagIds) ? tagIds : []

    let effectiveEvaluationId = evaluationId
    let effectiveResumeId = resumeId

    // 如果传了 resumeId 但没有 evaluationId，尝试找到或创建 evaluation
    if (!effectiveEvaluationId && effectiveResumeId) {
      const resume = await prisma.resume.findUnique({
        where: { id: effectiveResumeId },
        select: { id: true, positionId: true },
      })
      if (!resume) {
        return NextResponse.json({ error: '简历不存在' }, { status: 404 })
      }

      // 复用共享服务：未分配职位时抛 PositionRequiredError（400 而非 500）
      effectiveEvaluationId = await findOrCreateEvaluationForFollowUp(prisma, resume)
    }

    if (!effectiveEvaluationId || !effectiveResumeId) {
      // 如果只有 evaluationId，从中推断 resumeId
      if (effectiveEvaluationId && !effectiveResumeId) {
        const evalRecord = await prisma.positionEvaluation.findUnique({
          where: { id: effectiveEvaluationId },
          select: { resumeId: true },
        })
        if (evalRecord) effectiveResumeId = evalRecord.resumeId
      }
    }

    // Check if follow-up record already exists for this evaluation
    const existing = await prisma.followUpRecord.findUnique({
      where: { evaluationId: effectiveEvaluationId! },
    })

    const tagRecords = await prisma.followUpTag.findMany({ where: { id: { in: safeTagIds } } })
    const tagNames = tagRecords.map((t) => t.name).join('、')

    if (existing) {
      // 标签替换 + 状态更新 + 日志原子提交（A12：避免 deleteMany 与 update 之间崩溃丢标签）
      const record = await prisma.$transaction(async (tx) => {
        await tx.followUpRecordTag.deleteMany({ where: { followUpRecordId: existing.id } })
        return tx.followUpRecord.update({
          where: { id: existing.id },
          data: {
            status: effectiveStatus,
            statusChangedAt: new Date(),
            note: note || null,
            ...(effectiveStatus === 'UNSUITABLE' && rejectReason !== undefined ? { rejectReason } : {}),
            ...(effectiveStatus === 'UNSUITABLE' ? { unsuitableAt: new Date() } : {}),
            ...(safeTagIds.length > 0 ? {
              tags: {
                create: safeTagIds.map((tagId: string) => ({ followUpTagId: tagId })),
              },
            } : {}),
            logs: {
              create: {
                action: effectiveStatus === 'UNSUITABLE' ? 'UNSUITABLE' : 'REFOLLOW',
                detail: effectiveStatus === 'UNSUITABLE'
                  ? `标记为不合适${rejectReason ? `，原因: ${rejectReason}` : ''}`
                  : `重新跟进${tagNames ? `，标签: ${tagNames}` : ''}${note ? `，备注: ${note}` : ''}`,
                fromStatus: existing.status,
                toStatus: effectiveStatus,
                transitionType: effectiveStatus === 'UNSUITABLE' ? 'forward' : 'reset',
              },
            },
          },
          include: {
            tags: { include: { followUpTag: true } },
            resume: { select: { candidateName: true } },
          },
        })
      })
      return NextResponse.json({ record })
    }

    const record = await prisma.followUpRecord.create({
      data: {
        evaluationId: effectiveEvaluationId!,
        resumeId: effectiveResumeId!,
        status: effectiveStatus,
        statusChangedAt: new Date(),
        note: note || null,
        ...(effectiveStatus === 'UNSUITABLE' && rejectReason !== undefined ? { rejectReason } : {}),
        ...(effectiveStatus === 'UNSUITABLE' ? { unsuitableAt: new Date() } : {}),
        ...(safeTagIds.length > 0 ? {
          tags: {
            create: safeTagIds.map((tagId: string) => ({ followUpTagId: tagId })),
          },
        } : {}),
        logs: {
          create: {
            action: effectiveStatus === 'UNSUITABLE' ? 'UNSUITABLE' : 'CREATE',
            detail: effectiveStatus === 'UNSUITABLE'
              ? `标记为不合适${rejectReason ? `，原因: ${rejectReason}` : ''}`
              : `创建跟进记录${tagNames ? `，标签: ${tagNames}` : ''}${note ? `，备注: ${note}` : ''}`,
            fromStatus: 'SCREENED',
            toStatus: effectiveStatus,
            transitionType: 'enter',
          },
        },
      },
      include: {
        tags: { include: { followUpTag: true } },
        resume: { select: { candidateName: true } },
      },
    })

    return NextResponse.json({ record })
  } catch (error: unknown) {
    if (error instanceof PositionRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return apiErrorResponse(error, '创建跟进记录失败')
  }
}
