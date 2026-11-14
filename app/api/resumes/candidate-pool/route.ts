import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { matchesHardConditions, calculateWorkYears, getHighestEducation, getEffectiveGradYear, type HardConditions } from '@/lib/services/hard-condition-filter'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { positionId, appliedPositionIds, conditions } = body as {
      positionId?: string
      appliedPositionIds?: string[]
      conditions?: HardConditions
    }

    if (!positionId) {
      return NextResponse.json({ error: '请选择目标岗位' }, { status: 400 })
    }

    // 1. 查询目标岗位的 department
    const targetPosition = await prisma.position.findUnique({
      where: { id: positionId },
      select: { department: true },
    })
    if (!targetPosition) {
      return NextResponse.json({ error: '岗位不存在' }, { status: 404 })
    }

    // 2. 查询候选简历
    const resumes = await prisma.resume.findMany({
      where: {
        positionId: { not: null },
        structuredData: { not: null },
        // 候选池挑人：待筛选（PENDING，已解析）+ 已筛选（SCREENED）。PARSED 已废弃（迁移至 PENDING）
        status: { in: ['PENDING', 'SCREENED'] },
        position: targetPosition.department
          ? { department: targetPosition.department }
          : undefined,
        ...(appliedPositionIds && appliedPositionIds.length > 0
          ? { positionId: { in: appliedPositionIds } }
          : {}),
      },
      select: {
        id: true,
        candidateName: true,
        candidatePhone: true,
        candidateEmail: true,
        fileName: true,
        status: true,
        structuredData: true,
        positionId: true,
        position: { select: { id: true, title: true } },
        sourceEmailReceivedAt: true,
      },
      orderBy: { sourceEmailReceivedAt: 'desc' },
    })

    // 3. 排除跟进中的简历
    const activeFollowUpResumeIds = new Set(
      (
        await prisma.followUpRecord.findMany({
          where: { status: { not: 'UNSUITABLE' } },
          select: { resumeId: true },
        })
      ).map((r) => r.resumeId)
    )

    // 4. 应用层硬性条件过滤
    const filtered = resumes.filter((r) => {
      if (activeFollowUpResumeIds.has(r.id)) return false
      if (!r.structuredData) return false

      let data: Record<string, unknown>
      try {
        data = JSON.parse(r.structuredData)
      } catch {
        return false
      }

      // 从结构化数据提取展示字段
      const education = (data.education || []) as Array<{
        school?: string; degree?: string; major?: string; startDate?: string; endDate?: string
      }>
      const highestEdu = getHighestEducation(education)

      return conditions ? matchesHardConditions(data, conditions) : true
    })

    // 5. 查询历史评估数据
    const filteredIds = filtered.map((r) => r.id)
    const evaluations = await prisma.positionEvaluation.findMany({
      where: {
        resumeId: { in: filteredIds },
        positionId,
      },
      select: {
        id: true,
        resumeId: true,
        initialScore: true,
        aiTags: true,
      },
    })
    const evalMap = new Map(evaluations.map((e) => [e.resumeId, e]))

    const evalDims = await prisma.evaluationDimension.findMany({
      where: {
        resumeId: { in: filteredIds },
        positionId,
        dimension: { in: ['knowledge', 'skill'] },
      },
      select: { resumeId: true, dimension: true, rating: true },
    })
    const dimMap = new Map<string, { knowledge?: number; skill?: number }>()
    for (const d of evalDims) {
      const entry = dimMap.get(d.resumeId) || {}
      if (d.dimension === 'knowledge') entry.knowledge = d.rating ?? undefined
      if (d.dimension === 'skill') entry.skill = d.rating ?? undefined
      dimMap.set(d.resumeId, entry)
    }

    // 6. 组装响应
    const currentYear = new Date().getFullYear()
    const candidates = filtered.map((r) => {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(r.structuredData!)
      } catch {
        return null
      }
      const education = (data.education || []) as Array<{
        school?: string; degree?: string; major?: string; startDate?: string; endDate?: string
      }>
      const highestEdu = getHighestEducation(education)
      const graduationYear = getEffectiveGradYear(education, currentYear)
      const ev = evalMap.get(r.id)
      const dims = dimMap.get(r.id)

      return {
        id: r.id,
        sourceEmailReceivedAt: r.sourceEmailReceivedAt?.toISOString() ?? null,
        candidateName: r.candidateName || data.name || '-',
        gender: data.gender || null,
        candidatePhone: r.candidatePhone || data.phone || null,
        education: highestEdu?.degree || null,
        school: highestEdu?.school || null,
        major: highestEdu?.major || null,
        graduationYear,
        workYears: Math.round(calculateWorkYears(data) * 10) / 10,
        knowledgeRating: dims?.knowledge ?? null,
        skillRating: dims?.skill ?? null,
        initialScore: ev?.initialScore ?? null,
        evaluated: ev !== undefined,
        positionTitle: r.position?.title ?? null,
        evaluationId: ev?.id ?? null,
        aiTags: (() => {
          if (!ev?.aiTags) return []
          try { return JSON.parse(ev.aiTags) as string[] } catch { return [] }
        })(),
      }
    }).filter((c): c is NonNullable<typeof c> => c != null)

    return NextResponse.json({ candidates, total: candidates.length })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
