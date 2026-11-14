/**
 * 跟进管理服务
 *
 * 提供跟进相关的共享业务逻辑。当前核心是「为跟进操作获取或创建 PositionEvaluation」，
 * 供单条跟进（records/route.ts）与批量跟进（records/batch/route.ts）两处复用。
 *
 * 背景（B7-1）：UNASSIGNED 简历（resume.positionId === null）走跟随时，旧实现用
 * 魔法字符串 `'unassigned'` 做 positionId → 外键违规 P2003 → 500。本服务改为：
 * 简历未分配职位时抛出 PositionRequiredError，由路由返回 400「请先分配职位」。
 */

import { prisma } from '@/lib/prisma'

/**
 * 简历未分配职位时创建评估抛出的业务错误。
 * 路由层捕获后返回 400，替代旧实现的外键违规 500。
 */
export class PositionRequiredError extends Error {
  constructor(message = '请先分配职位') {
    super(message)
    this.name = 'PositionRequiredError'
  }
}

// 事务客户端或全局 prisma 的最小接口，供 findOrCreate 内部使用
type DbClient = Pick<
  typeof prisma,
  'positionEvaluation'
> & {
  resume: Pick<typeof prisma.resume, 'findUnique'>
}

/**
 * 为跟进操作获取或创建 PositionEvaluation。
 *
 * @param client 执行请求的客户端（批量事务里传 tx，单条传 prisma）
 * @param resumeId 简历 ID（调用方需先确认简历存在）
 * @returns 评估 ID
 * @throws PositionRequiredError 简历未分配职位时
 */
export async function findOrCreateEvaluationForFollowUp(
  client: DbClient,
  resume: { id: string; positionId: string | null }
): Promise<string> {
  if (!resume.positionId) {
    throw new PositionRequiredError()
  }

  // 查找该简历在该职位下已有的评估记录
  const existingEval = await client.positionEvaluation.findFirst({
    where: { resumeId: resume.id, positionId: resume.positionId },
    orderBy: { createdAt: 'desc' },
  })
  if (existingEval) return existingEval.id

  // 创建占位评估（手动跟进场景）
  const newEval = await client.positionEvaluation.create({
    data: {
      resumeId: resume.id,
      positionId: resume.positionId,
      summary: '',
      strengths: '[]',
      weaknesses: '[]',
      aiModel: 'manual',
    },
  })
  return newEval.id
}

/** 跟进筛选参数（records GET 与 export POST 共享） */
export interface FollowUpFilterParams {
  recordStatus?: string
  contacted?: string
  search?: string
  positionIds?: string
  dateFrom?: string
  dateTo?: string
  tagIds?: string
  tagLogic?: string
}

/**
 * 构建跟进记录查询的 where（B7-6：统一 records GET 与 export POST 的筛选逻辑）。
 * 返回 { where, resumeWhere }，resume 层条件由调用方挂到 where.resume。
 * 兼容逗号分隔串（records GET）与数组（export POST）。
 */
export function buildFollowUpWhere(params: FollowUpFilterParams): {
  where: Record<string, unknown>
  resumeWhere: Record<string, unknown>
} {
  const where: Record<string, unknown> = {}
  const resumeWhere: Record<string, unknown> = {}

  if (params.recordStatus) {
    where.status = params.recordStatus
  }

  // 联系结果筛选（multi-select）
  if (params.contacted) {
    const list = params.contacted.split(',').filter(Boolean)
    if (list.length > 0) where.contacted = { in: list }
  }

  // 候选人搜索
  if (params.search) {
    resumeWhere.OR = [
      { candidateName: { contains: params.search } },
      { candidateEmail: { contains: params.search } },
      { candidatePhone: { contains: params.search } },
    ]
  }

  // 职位筛选（multi-select）
  const positionIdList = params.positionIds
    ? params.positionIds.split(',').filter(Boolean)
    : []
  if (positionIdList.length > 0) resumeWhere.positionId = { in: positionIdList }

  // 日期范围
  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, Date> = {}
    if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
    if (params.dateTo) dateFilter.lte = new Date(params.dateTo + 'T23:59:59.999Z')
    where.createdAt = dateFilter
  }

  if (Object.keys(resumeWhere).length > 0) where.resume = resumeWhere

  // 标签筛选
  const tagIdList = params.tagIds ? params.tagIds.split(',').filter(Boolean) : []
  if (tagIdList.length > 0) {
    if (params.tagLogic === 'AND') {
      where.AND = tagIdList.map((tagId) => ({
        tags: { some: { followUpTagId: tagId } },
      }))
    } else {
      where.tags = { some: { followUpTagId: { in: tagIdList } } }
    }
  }

  return { where, resumeWhere }
}
