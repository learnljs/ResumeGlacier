import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import {
  findOrCreateEvaluationForFollowUp,
  PositionRequiredError,
} from '@/lib/services/follow-up-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resumeIds, evaluationIds, tagIds } = body

    if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
      return NextResponse.json({ error: '请选择至少一份简历' }, { status: 400 })
    }
    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      return NextResponse.json({ error: '请至少选择一个标签' }, { status: 400 })
    }

    // 构建 resumeId → evaluationId 映射（若提供了 evaluationIds）
    const evalIdMap = new Map<string, string>()
    if (evaluationIds && Array.isArray(evaluationIds) && evaluationIds.length === resumeIds.length) {
      for (let i = 0; i < resumeIds.length; i++) {
        if (evaluationIds[i]) evalIdMap.set(resumeIds[i], evaluationIds[i])
      }
    }

    // 查找选中简历的已有跟进记录
    const resumes = await prisma.resume.findMany({
      where: { id: { in: resumeIds } },
      select: {
        id: true,
        candidateName: true,
        positionId: true,
        followUpRecords: { select: { id: true } },
      },
    })

    // 找出已有跟进记录的简历（静默跳过）
    const existingIds = new Set(
      resumes.filter((r) => r.followUpRecords.length > 0).map((r) => r.id)
    )
    const newResumeIds = resumeIds.filter((id) => !existingIds.has(id))

    const tagRecords = await prisma.followUpTag.findMany({
      where: { id: { in: tagIds } },
    })
    const tagNames = tagRecords.map((t) => t.name).join('、')

    let created = 0
    if (newResumeIds.length > 0) {
      // 为每份简历获取或创建 PositionEvaluation
      const resumeMap = new Map(resumes.map((r) => [r.id, r]))

      await prisma.$transaction(async (tx) => {
        for (const resumeId of newResumeIds) {
          const resume = resumeMap.get(resumeId)
          if (!resume) continue

          // 优先使用传入的 evaluationId
          const providedEvalId = evalIdMap.get(resumeId)
          let evaluationId = ''

          if (providedEvalId) {
            // 验证该 evaluation 确实存在且属于该简历
            const existing = await tx.positionEvaluation.findFirst({
              where: { id: providedEvalId, resumeId },
            })
            if (existing) {
              evaluationId = existing.id
            }
            // 如果验证失败（evaluationId 无效），回退到下方 find-or-create
          }
          if (!evaluationId) {
            // 复用共享服务：未分配职位的简历抛 PositionRequiredError（400 而非 500），并回滚整批
            evaluationId = await findOrCreateEvaluationForFollowUp(tx, resume)
          }

          // 跳过已有跟进记录的评估
          const existingRecord = await tx.followUpRecord.findUnique({
            where: { evaluationId },
          })
          if (existingRecord) continue

          await tx.followUpRecord.create({
            data: {
              evaluationId,
              resumeId,
              statusChangedAt: new Date(),
              tags: {
                create: tagIds.map((tagId: string) => ({
                  followUpTagId: tagId,
                })),
              },
              logs: {
                create: {
                  action: 'BATCH_CREATE',
                  detail: `批量创建跟进记录，标签: ${tagNames}`,
                  fromStatus: 'SCREENED',
                  toStatus: 'CONTACTING',
                  transitionType: 'enter',
                },
              },
            },
          })
          created++
        }
      })
    }

    const skipped = resumeIds.length - created

    return NextResponse.json({ created, skipped })
  } catch (error: unknown) {
    if (error instanceof PositionRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return apiErrorResponse(error, '批量创建跟进记录失败')
  }
}
