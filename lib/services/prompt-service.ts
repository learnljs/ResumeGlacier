/**
 * 提示词配置读写服务（开发方案 6、8、11）
 *
 * 集中所有 PromptRecord 写入路径（保存、回滚），用 Prisma 交互式事务包裹，
 * 保证 isCurrent 一致性（开发方案 11：所有写入路径走统一服务函数，不裸写 SQL）。
 */

import { prisma } from '@/lib/prisma'
import { validateDimensionMarkdown, REQUIRED_PLACEHOLDER } from './prompt-assembler'

// === 字段长度上限（开发方案 三） ===
export const MAX_BODY = 64 * 1024
export const MAX_DIMENSION = 64 * 1024
export const MAX_OVERALL = 32 * 1024

export interface PromptContent {
  bodyText: string
  knowledgeContent: string
  skillContent: string
  overallRules: string
}

export interface SavePromptParams extends PromptContent {
  changeNote?: string
  savedBy?: string
}

/**
 * 静态校验（开发方案 8 保存流程前置校验）
 * - bodyText 非空 + 含 {{resumeText}}
 * - overallRules 非空
 * - knowledgeContent / skillContent 可解析为合法结构（≥1 方向、每方向≥1 题）
 * - 字段长度上限
 */
export function validatePromptContent(content: PromptContent): string[] {
  const errors: string[] = []
  if (!content.bodyText.trim()) {
    errors.push('提示词主体不能为空')
  } else if (!content.bodyText.includes(REQUIRED_PLACEHOLDER)) {
    errors.push(`提示词主体必须包含 ${REQUIRED_PLACEHOLDER} 占位符`)
  }
  if (!content.overallRules.trim()) {
    errors.push('通用评分规则不能为空')
  }
  validateDimensionMarkdown(content.knowledgeContent).forEach((e) =>
    errors.push(`知识维度：${e}`),
  )
  validateDimensionMarkdown(content.skillContent).forEach((e) =>
    errors.push(`技能维度：${e}`),
  )
  if (content.bodyText.length > MAX_BODY) errors.push('提示词主体超过 64KB')
  if (content.knowledgeContent.length > MAX_DIMENSION) errors.push('知识维度内容超过 64KB')
  if (content.skillContent.length > MAX_DIMENSION) errors.push('技能维度内容超过 64KB')
  if (content.overallRules.length > MAX_OVERALL) errors.push('通用评分规则超过 32KB')
  return errors
}

/**
 * 保存为新版本（开发方案 8 事务写入）
 * - 查当前生效行：WHERE positionId AND isCurrent=true
 * - 有则 UPDATE 旧行 isCurrent=false，INSERT 新行 version+1
 * - 无则 INSERT 新行 version=1
 */
export async function savePromptAsNewVersion(
  positionId: string,
  params: SavePromptParams,
): Promise<{ success: true; record: PromptRecordResult } | { success: false; errors: string[] }> {
  const errors = validatePromptContent(params)
  if (errors.length > 0) {
    return { success: false, errors }
  }

  const record = await prisma.$transaction(async (tx) => {
    const current = await tx.promptRecord.findFirst({
      where: { positionId, isCurrent: true },
      orderBy: { version: 'desc' },
    })
    // 版本号取历史最大值+1（非 current+1，支持回滚后版本号不重叠）
    const maxVer = await tx.promptRecord.aggregate({
      where: { positionId },
      _max: { version: true },
    })
    const newVersion = (maxVer._max.version || 0) + 1
    if (current) {
      await tx.promptRecord.update({
        where: { id: current.id },
        data: { isCurrent: false },
      })
    }
    return tx.promptRecord.create({
      data: {
        positionId,
        version: newVersion,
        bodyText: params.bodyText,
        knowledgeContent: params.knowledgeContent,
        skillContent: params.skillContent,
        overallRules: params.overallRules,
        isCurrent: true,
        changeNote: params.changeNote || null,
        savedBy: params.savedBy || null,
      },
    })
  })

  return { success: true, record }
}

/**
 * 回滚到指定版本（直接切换 isCurrent，不新增版本）
 * 将旧当前行 isCurrent = false，目标版本 isCurrent = true
 */
export async function rollbackToVersion(
  positionId: string,
  targetVersion: number,
): Promise<PromptRecordResult> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.promptRecord.findUnique({
      where: { positionId_version: { positionId, version: targetVersion } },
    })
    if (!target) {
      throw new Error(`版本 v${targetVersion} 不存在`)
    }
    if (target.isCurrent) {
      return target // 已是当前版本，无需操作
    }
    // 禁用所有当前行
    await tx.promptRecord.updateMany({
      where: { positionId, isCurrent: true },
      data: { isCurrent: false },
    })
    // 启用目标版本
    return tx.promptRecord.update({
      where: { id: target.id },
      data: { isCurrent: true },
    })
  })
}

/**
 * 删除指定版本（仅非当前生效版本可删）
 */
export async function deletePromptVersion(
  positionId: string,
  version: number,
): Promise<void> {
  const record = await prisma.promptRecord.findUnique({
    where: { positionId_version: { positionId, version } },
  })
  if (!record) {
    throw new Error(`版本 v${version} 不存在`)
  }
  if (record.isCurrent) {
    throw new Error('不能删除当前生效的版本，请先切换到其他版本')
  }
  await prisma.promptRecord.delete({ where: { id: record.id } })
}

/**
 * 启动自检修复（开发方案 11）
 * 每个职位有且仅有一条 isCurrent=true，异常时取 version 最大的行作为 current。
 * 在职位提示词列表接口懒调用，避免侵入 instrumentation。
 */
export async function repairCurrentFlags(): Promise<number> {
  let repaired = 0
  const positions = await prisma.promptRecord.findMany({
    where: { isCurrent: true },
    select: { positionId: true },
    distinct: ['positionId'],
  })
  for (const p of positions) {
    const currents = await prisma.promptRecord.findMany({
      where: { positionId: p.positionId, isCurrent: true },
      orderBy: { version: 'desc' },
    })
    if (currents.length <= 1) continue
    // 多条 current，保留 version 最大的一条，其余置 false
    const keep = currents[0]
    await prisma.promptRecord.updateMany({
      where: { positionId: p.positionId, isCurrent: true, id: { not: keep.id } },
      data: { isCurrent: false },
    })
    repaired += currents.length - 1
  }
  return repaired
}

// === 版本对比 diff（开发方案 7.3 行级文本 diff） ===

export type DiffLineType = 'same' | 'add' | 'del'
export interface DiffLine {
  type: DiffLineType
  text: string
}

/** 行级 diff（基于 LCS），新增行 add，删除行 del，相同行 same */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const m = oldLines.length
  const n = newLines.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'same', text: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'del', text: oldLines[i] })
      i++
    } else {
      result.push({ type: 'add', text: newLines[j] })
      j++
    }
  }
  while (i < m) {
    result.push({ type: 'del', text: oldLines[i++] })
  }
  while (j < n) {
    result.push({ type: 'add', text: newLines[j++] })
  }
  return result
}

// === 返回类型 ===

export interface PromptRecordResult {
  id: string
  positionId: string
  version: number
  bodyText: string
  knowledgeContent: string
  skillContent: string
  overallRules: string
  isCurrent: boolean
  changeNote: string | null
  savedBy: string | null
  createdAt: Date
}
