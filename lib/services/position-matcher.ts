import { prisma } from '@/lib/prisma'

/**
 * 从 fileName 中提取职位关键词
 * 格式：【XXX_YY_ZZ】AA_BB.pdf -> 提取 XXX
 */
export function extractPositionFromFileName(fileName: string): string | null {
  const match = fileName.match(/^【([^_】]+)/)
  return match?.[1]?.trim() || null
}

/**
 * 根据 fileName 自动匹配职位
 * 先精确匹配 Position.title，再模糊匹配（title 包含关键词）
 */
export async function matchPositionByFileName(fileName: string): Promise<{
  positionId: string
  positionTitle: string
} | null> {
  const keyword = extractPositionFromFileName(fileName)
  if (!keyword) return null

  // 精确匹配
  let position = await prisma.position.findFirst({
    where: { title: keyword, status: 'active' },
  })

  // 模糊匹配（title 包含 keyword）
  if (!position) {
    position = await prisma.position.findFirst({
      where: { title: { contains: keyword }, status: 'active' },
    })
  }

  return position ? { positionId: position.id, positionTitle: position.title } : null
}

/**
 * 从邮件主题中提取职位关键词
 * 优先级：1. 【KEYWORD】格式  2. Position.keywords 匹配  3. Position.title 包含匹配
 * 同优先级内优先匹配最长关键词/title（更精确）
 */
export async function matchPositionBySubject(subject: string): Promise<{
  positionId: string
  positionTitle: string
} | null> {
  if (!subject) return null

  // 1. 尝试从主题中提取【KEYWORD】格式（支持 Re:/Fwd: 前缀）
  const bracketMatch = subject.match(/【([^】]+)】/)
  if (bracketMatch) {
    const keyword = bracketMatch[1].trim()
    // 精确匹配
    let position = await prisma.position.findFirst({
      where: { title: keyword, status: 'active' },
    })
    // 模糊匹配
    if (!position) {
      position = await prisma.position.findFirst({
        where: { title: { contains: keyword }, status: 'active' },
      })
    }
    if (position) return { positionId: position.id, positionTitle: position.title }
  }

  // 2. 收集所有活跃职位
  const allPositions = await prisma.position.findMany({
    where: { status: 'active' },
    select: { id: true, title: true, keywords: true },
  })

  const lowerSubject = subject.toLowerCase()

  // 3. 用 keywords 匹配，取最长匹配关键词（更精确）
  let bestKeywordMatch: { positionId: string; positionTitle: string } | null = null
  let bestKeywordLen = 0

  for (const pos of allPositions) {
    if (pos.keywords) {
      const kwList = pos.keywords.split(/[,，\s]+/).filter(Boolean)
      for (const kw of kwList) {
        if (kw.length > bestKeywordLen && lowerSubject.includes(kw.toLowerCase())) {
          bestKeywordLen = kw.length
          bestKeywordMatch = { positionId: pos.id, positionTitle: pos.title }
        }
      }
    }
  }
  if (bestKeywordMatch) return bestKeywordMatch

  // 4. 用 Position.title 直接匹配，取最长匹配
  let bestTitleMatch: { positionId: string; positionTitle: string } | null = null
  let bestTitleLen = 0

  for (const pos of allPositions) {
    if (pos.title.length > bestTitleLen && lowerSubject.includes(pos.title.toLowerCase())) {
      bestTitleLen = pos.title.length
      bestTitleMatch = { positionId: pos.id, positionTitle: pos.title }
    }
  }
  if (bestTitleMatch) return bestTitleMatch

  return null
}

/**
 * 简历自动匹配职位的统一入口：先按文件名，再按邮件主题
 * 取代五处调用点（worker / reparse / refetch / match-position / batch-match-position）的重复链
 */
export async function matchPositionForResume(
  fileName: string,
  subject: string | null | undefined
): Promise<{ positionId: string; positionTitle: string } | null> {
  const byFileName = await matchPositionByFileName(fileName)
  if (byFileName) return byFileName
  return subject ? await matchPositionBySubject(subject) : null
}
