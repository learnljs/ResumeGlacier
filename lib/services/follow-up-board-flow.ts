/**
 * 跟进看板 · 周报流转图数据服务
 *
 * 批次圈定：PositionEvaluation 的投递时间（screenedAt，为空回退 createdAt）
 * 落在所选时间窗口内的投递视为一批；对批内每条投递的 FollowUpLog 做净流转重放，
 * 汇总出 7 正向节点的到达/停留数与 7 条流失分支的流出数量。
 *
 * 重放算法与口径见 doc/dev/跟进管理模块/跟进看板-开发文档.md §4.2~§4.4。
 */

import { scopeRelationWhere, type ResumeScope } from '@/lib/services/resume-scope'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { FORWARD_TRANSITIONS } from '@/lib/services/follow-up-transitions'

// ==================== 流转图固定结构 ====================

/** 正向 7 节点（已筛选为批次入口，非跟进状态） */
export const FLOW_FORWARD_NODES = [
  'SCREENED',
  'CONTACTING',
  'INTERVIEW_SCHEDULED',
  'INTERVIEWED',
  'OFFER_SENT',
  'PENDING_ONBOARD',
  'HIRED',
] as const

/** 流失 / 终止 7 条边（固定顺序，缺失补 0） */
export const FLOW_BRANCHES: Array<{ from: string; to: string }> = [
  { from: 'SCREENED', to: 'UNSUITABLE' },
  { from: 'CONTACTING', to: 'UNSUITABLE' },
  { from: 'INTERVIEW_SCHEDULED', to: 'INTERVIEW_CANCELLED' },
  { from: 'INTERVIEWED', to: 'UNSUITABLE' },
  { from: 'OFFER_SENT', to: 'OFFER_REJECTED' },
  { from: 'PENDING_ONBOARD', to: 'OFFER_REJECTED' },
  { from: 'HIRED', to: 'RESIGNED' },
]

const FLOW_NODE_SET = new Set<string>(FLOW_FORWARD_NODES)

type ForwardNode = (typeof FLOW_FORWARD_NODES)[number]

/** 终态（流失）状态集合 */
const TERMINAL_STATUSES = new Set<string>(
  FLOW_BRANCHES.filter((b) => !FLOW_NODE_SET.has(b.to)).map((b) => b.to)
)

/** 状态机合法正向流转目标（from -> 合法 to 集合） */
const LEGAL_FORWARD_TARGETS = new Map<string, Set<string>>()
for (const [from, list] of Object.entries(FORWARD_TRANSITIONS)) {
  LEGAL_FORWARD_TARGETS.set(from, new Set(list.map((x) => x.target)))
}

/** 各正向节点的流出边（用于逐投递判定停留） */
const OUT_EDGES_BY_NODE = new Map<string, string[]>()
FLOW_FORWARD_NODES.forEach((status, i) => {
  const outEdges: string[] = []
  const next = FLOW_FORWARD_NODES[i + 1]
  if (next) outEdges.push(`${status}->${next}`)
  for (const branch of FLOW_BRANCHES) {
    if (branch.from === status) outEdges.push(`${branch.from}->${branch.to}`)
  }
  OUT_EDGES_BY_NODE.set(status, outEdges)
})

// ==================== 响应类型 ====================

export interface FlowNodeData {
  status: string
  reached: number
  stayed: number
}

export interface FlowBranchData {
  from: string
  to: string
  count: number
}

export interface FollowUpBoardFlowResponse {
  batchTotal: number
  nodes: FlowNodeData[]
  branches: FlowBranchData[]
}

// ==================== 净流转重放 ====================

interface FlowLogRow {
  fromStatus: string | null
  toStatus: string | null
  transitionType: string | null
}

/**
 * 对单条投递的日志按时间顺序做净流转重放。
 * reached 集合 = 最终仍成立的到达状态；lines 集合 = 最终仍成立的流转线。
 *
 * 历史数据存在状态机之外的操作（旧版「待面试→不合适」、enter 直达终态、
 * 跳级入职等），重放时做归一化，并在最后按记录当前状态（权威）对齐终态线，
 * 保证流转图与状态卡的计数口径一致。
 */
function replayDelivery(
  logs: FlowLogRow[],
  finalStatus: string
): { reached: Set<string>; lines: Set<string> } {
  const reached = new Set<string>()
  const lines = new Set<string>()

  for (const log of logs) {
    const { fromStatus, toStatus, transitionType } = log
    if (!transitionType || !toStatus) continue

    switch (transitionType) {
      case 'enter':
        // 从已筛选进入跟进（fromStatus 统一为 SCREENED）
        reached.add(toStatus)
        lines.add(`SCREENED->${toStatus}`)
        break
      case 'forward': {
        // 降级行（来源未知）跳过
        if (!fromStatus) continue
        if (LEGAL_FORWARD_TARGETS.get(fromStatus)?.has(toStatus)) {
          reached.add(toStatus)
          lines.add(`${fromStatus}->${toStatus}`)
          break
        }
        // 历史「待面试→不合适」：旧版本以不合适表达取消面试，按记录最终状态归并
        if (fromStatus === 'INTERVIEW_SCHEDULED' && toStatus === 'UNSUITABLE') {
          if (finalStatus === 'UNSUITABLE') {
            reached.add('INTERVIEWED')
            lines.add('INTERVIEW_SCHEDULED->INTERVIEWED')
            reached.add('UNSUITABLE')
            lines.add('INTERVIEWED->UNSUITABLE')
          } else {
            reached.add('INTERVIEW_CANCELLED')
            lines.add('INTERVIEW_SCHEDULED->INTERVIEW_CANCELLED')
          }
          break
        }
        // 其余到终态的非法 forward（来源为终态/未知）忽略
        if (TERMINAL_STATUSES.has(toStatus)) break
        // 跳级正向（如 已面试→已入职）：沿正向链逐级展开
        const fromIdx = FLOW_FORWARD_NODES.indexOf(fromStatus as ForwardNode)
        const toIdx = FLOW_FORWARD_NODES.indexOf(toStatus as ForwardNode)
        if (fromIdx >= 0 && toIdx > fromIdx) {
          for (let i = fromIdx + 1; i <= toIdx; i++) {
            reached.add(FLOW_FORWARD_NODES[i])
            lines.add(`${FLOW_FORWARD_NODES[i - 1]}->${FLOW_FORWARD_NODES[i]}`)
          }
        }
        break
      }
      case 'rollback': {
        // 撤销回退前状态及所有流入它的线。合法回退时入线唯一（to->from），
        // 与旧语义等价；对 enter 直达终态的历史数据（如 SCREENED->UNSUITABLE
        // 后回退到沟通中）也能正确清理残留线。
        if (!fromStatus) continue
        reached.delete(fromStatus)
        for (const line of [...lines]) {
          const [, to] = line.split('->')
          if (to === fromStatus) lines.delete(line)
        }
        // 回退后的目标状态：业务上候选人回到了该状态，建立其到达。
        // 正常数据下 toStatus 早已到达（幂等）；仅对「enter 直达终态 + 回退」
        // 的脏数据（如 SCREENED->UNSUITABLE 后回退到待面试）真正生效，
        // 否则会留下流出线却缺失到达。
        if (toStatus && FLOW_NODE_SET.has(toStatus)) reached.add(toStatus)
        break
      }
      case 'reset':
        // REFOLLOW 复活：整链退回沟通中
        reached.clear()
        reached.add('CONTACTING')
        lines.clear()
        lines.add('SCREENED->CONTACTING')
        break
      default:
        break
    }
  }

  // 终态对齐：历史脏数据下重放结果可能与记录当前状态不符，以记录为准校正
  if (TERMINAL_STATUSES.has(finalStatus)) {
    // 最终在终态：保证只有该终态的流出线，并清理残留的正向停留
    const termLines = FLOW_BRANCHES.filter((b) => b.to === finalStatus).map((b) => `${b.from}->${b.to}`)
    if (!termLines.some((key) => lines.has(key))) {
      // 缺终态线时补一条（选重放中已到达的最下游合法上游）
      const upstreams = FLOW_BRANCHES.filter((b) => b.to === finalStatus).map((b) => b.from)
      let added = false
      for (let i = FLOW_FORWARD_NODES.length - 1; i >= 0; i--) {
        if (reached.has(FLOW_FORWARD_NODES[i]) && upstreams.includes(FLOW_FORWARD_NODES[i])) {
          lines.add(`${FLOW_FORWARD_NODES[i]}->${finalStatus}`)
          added = true
          break
        }
      }
      if (!added) lines.add(`${upstreams[0]}->${finalStatus}`)
    }
    // 删除其他终态的残留线（如非法流转归并产生的线）
    for (const line of [...lines]) {
      if (FLOW_BRANCHES.some((b) => `${b.from}->${b.to}` === line) && !termLines.includes(line)) {
        lines.delete(line)
      }
    }
    // 清理无流出线的正向节点到达（最终在终态，不可能仍停留在正向节点）
    for (const status of FLOW_FORWARD_NODES) {
      if (status === 'SCREENED' || !reached.has(status)) continue
      const outEdges = OUT_EDGES_BY_NODE.get(status) ?? []
      if (!outEdges.some((edge) => lines.has(edge))) {
        reached.delete(status)
      }
    }
  } else {
    // 最终在正向状态：清掉残留的终态线
    for (const line of [...lines]) {
      if (FLOW_BRANCHES.some((b) => `${b.from}->${b.to}` === line)) lines.delete(line)
    }
  }

  return { reached, lines }
}

// ==================== 主入口 ====================

/**
 * 获取周报流转图数据。
 * 岗位过滤口径与看板 stats 接口一致：未选岗位 = 全部；时间窗口由调用方传入的 from/to（含首尾）决定。
 */
export async function getFollowUpBoardFlow(
  positionIds: string[],
  from: Date,
  to: Date,
  scope?: ResumeScope
): Promise<FollowUpBoardFlowResponse> {
  const conditions: Prisma.PositionEvaluationWhereInput[] = []

  if (positionIds.length > 0) {
    conditions.push({ positionId: { in: positionIds } })
  }

  // 邮箱 / 来源维度：投递经 resume 关联归属
  const relationScope = scopeRelationWhere(scope)
  if (relationScope) {
    conditions.push(relationScope as Prisma.PositionEvaluationWhereInput)
  }

  // 投递时间条件（screenedAt 为空回退 createdAt）
  conditions.push({
    OR: [
      { screenedAt: { gte: from, lt: to } },
      { screenedAt: null, createdAt: { gte: from, lt: to } },
    ],
  })

  // 批次 = 窗口内进入「已筛选」的投递（PositionEvaluation）
  const evaluations = await prisma.positionEvaluation.findMany({
    where: conditions.length > 0 ? { AND: conditions } : {},
    select: { id: true },
  })

  // evaluationId 为空的历史记录：无投递关联，按记录 createdAt 兜底圈定，
  // 岗位口径与 stats 接口一致（resume.positionId）
  const orphanResumeFilter: Prisma.ResumeWhereInput = {
    ...(positionIds.length > 0 ? { positionId: { in: positionIds } } : {}),
    ...(scope?.emailConfigId ? { emailConfigId: scope.emailConfigId } : {}),
    ...(scope?.resumeSourceId ? { resumeSourceId: scope.resumeSourceId } : {}),
  }
  const orphanWhere: Prisma.FollowUpRecordWhereInput = {
    evaluationId: null,
    createdAt: { gte: from, lt: to },
  }
  if (Object.keys(orphanResumeFilter).length > 0) {
    orphanWhere.resume = orphanResumeFilter
  }
  const orphanRecords = await prisma.followUpRecord.findMany({
    where: orphanWhere,
    select: {
      status: true,
      logs: {
        select: { fromStatus: true, toStatus: true, transitionType: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  const batchTotal = evaluations.length + orphanRecords.length

  const nodeReached = new Map<string, number>()
  const nodeStayed = new Map<string, number>()
  const lineCount = new Map<string, number>()

  // 从「已筛选」流出的投递数 = 已创建跟进记录的投递数
  // （已筛选停留 = 批次总数 − 该值，即尚未开始跟进的投递数）
  let screenedOutflow = 0

  if (batchTotal > 0) {
    const evaluationIds = evaluations.map((e) => e.id)

    // 分批查询：Prisma 5.22 对 SQLite 大 in 数组（>999）会引擎 panic
    const CHUNK_SIZE = 500
    const records: Array<{ status: string; logs: FlowLogRow[] }> = []
    for (let i = 0; i < evaluationIds.length; i += CHUNK_SIZE) {
      const part = await prisma.followUpRecord.findMany({
        where: { evaluationId: { in: evaluationIds.slice(i, i + CHUNK_SIZE) } },
        select: {
          status: true,
          logs: {
            select: { fromStatus: true, toStatus: true, transitionType: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      records.push(...part)
    }

    for (const record of [...records, ...orphanRecords]) {
      const { reached, lines } = replayDelivery(record.logs, record.status)
      for (const status of reached) {
        if (FLOW_NODE_SET.has(status)) {
          nodeReached.set(status, (nodeReached.get(status) ?? 0) + 1)
        }
      }
      for (const line of lines) {
        lineCount.set(line, (lineCount.get(line) ?? 0) + 1)
      }
      // 停留按投递判定：到达该节点且无任何流出线 → 当前仍留在该节点
      for (const status of FLOW_FORWARD_NODES) {
        if (!reached.has(status)) continue
        const outEdges = OUT_EDGES_BY_NODE.get(status) ?? []
        if (!outEdges.some((edge) => lines.has(edge))) {
          nodeStayed.set(status, (nodeStayed.get(status) ?? 0) + 1)
        }
      }
    }

    screenedOutflow = records.length + orphanRecords.length
  }

  // 正向节点：已筛选到达 = 批次总数、停留 = 尚未跟进数；其余停留按逐投递判定
  const nodes: FlowNodeData[] = FLOW_FORWARD_NODES.map((status) => {
    const reached = status === 'SCREENED' ? batchTotal : (nodeReached.get(status) ?? 0)
    const stayed = status === 'SCREENED' ? batchTotal - screenedOutflow : (nodeStayed.get(status) ?? 0)

    return { status, reached, stayed: Math.max(0, stayed) }
  })

  const branches: FlowBranchData[] = FLOW_BRANCHES.map((branch) => ({
    from: branch.from,
    to: branch.to,
    count: lineCount.get(`${branch.from}->${branch.to}`) ?? 0,
  }))

  return { batchTotal, nodes, branches }
}
