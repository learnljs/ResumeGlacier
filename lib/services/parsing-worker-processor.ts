/**
 * 解析队列的 Worker 处理逻辑
 * 从类方法中抽离，通过动态 import 加载，确保 HMR 后始终使用最新代码
 */
import { prisma } from '@/lib/prisma'
import { screeningQueue } from '@/lib/services/screening-queue'
import { matchPositionForResume } from '@/lib/services/position-matcher'
import {
  assertParseQuality,
  saveStructuredData,
  FRAGMENTATION_REASON,
} from '@/lib/services/parse-pipeline'
import type { ItemProgress } from '@/types/resume'

export interface WorkerItem {
  resumeId: string
  autoScreen?: boolean
  autoExtract?: boolean
  onProgress?: (progress: ItemProgress) => void
}

export async function processQueueItem(item: WorkerItem): Promise<void> {
  // 动态导入确保 HMR 后始终使用最新代码
  const { parseResume, resolveCandidateName } = await import('@/lib/services/resume-parser')

  const resume = await prisma.resume.findUnique({
    where: { id: item.resumeId },
    select: {
      id: true,
      filePath: true,
      fileType: true,
      emailId: true,
      email: { select: { subject: true } },
      emailConfig: {
        select: {
          resumeSource: { select: { subjectPattern: true } },
        },
      },
    },
  })

  if (!resume) {
    console.warn(`[ParsingQueue] 简历 ${item.resumeId} 不存在`)
    return
  }

  // 设置状态为 PARSING
  await prisma.resume.update({
    where: { id: item.resumeId },
    data: { status: 'PARSING' },
  })

  // 先从邮件主题提取候选人姓名（作为解析失败时的兜底）
  const emailSubjectName = resolveCandidateName(
    resume.email?.subject || null,
    resume.emailConfig?.resumeSource?.subjectPattern || null,
    null
  )

  // 执行解析
  let parseResult
  try {
    parseResult = await parseResume(resume.filePath, resume.fileType, {
      emailId: resume.emailId ?? undefined,
      resumeId: resume.id,
      onProgress: item.onProgress,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    console.error(`[ParsingQueue] 简历 ${item.resumeId} 解析失败: ${msg}`)
    await prisma.resume.update({
      where: { id: item.resumeId },
      data: {
        status: 'ERROR',
        candidateName: emailSubjectName,
        errorMessage: msg,
      },
    })
    console.log(
      `[NameUpdate] resumeId=${item.resumeId} field=candidateName source=subject value="${emailSubjectName}" timestamp=${new Date().toISOString()}`
    )
    return
  }

  const candidateName = resolveCandidateName(
    resume.email?.subject || null,
    resume.emailConfig?.resumeSource?.subjectPattern || null,
    parseResult.name
  )

  // Worker 总是尝试自动匹配职位（不限未分配），与原行为一致
  const positionMatch = await matchPositionForResume(
    resume.filePath.split('/').pop() || '',
    resume.email?.subject || null
  )

  const errorMsg =
    parseResult.warnings.length > 0
      ? `[解析警告] 共${parseResult.warnings.length}条:\n${parseResult.warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
      : null

  await prisma.resume.update({
    where: { id: item.resumeId },
    data: {
      extractedText: parseResult.text,
      candidateName,
      candidatePhone: parseResult.phone || null,
      candidateEmail: parseResult.email || null,
      candidatePhoto: parseResult.photoPath || null,
      parseMethod: parseResult.parseMethod,
      status: 'PENDING',
      errorMessage: errorMsg,
      ...(positionMatch ? { positionId: positionMatch.positionId } : {}),
    },
  })
  console.log(
    `[NameUpdate] resumeId=${item.resumeId} field=candidateName source=subject value="${candidateName}" timestamp=${new Date().toISOString()}`
  )

  console.log(`[ParsingQueue] 简历 ${item.resumeId} 解析完成`)

  // === 文本质量门禁 ===
  const quality = assertParseQuality(parseResult)
  if (!quality.pass) {
    console.warn(`[ParsingQueue] 简历 ${item.resumeId} ${quality.reason}`)
    await prisma.resume.update({
      where: { id: item.resumeId },
      data: { status: 'ERROR', errorMessage: quality.reason },
    })
    return
  }

  // === 防御纵深：PDF 文字层破碎（spec §6.4，详见 parse-pipeline 注释） ===
  if (parseResult.hadFragmentation) {
    console.warn(`[ParsingQueue] 简历 ${item.resumeId} ${FRAGMENTATION_REASON}`)
    await prisma.resume.update({
      where: { id: item.resumeId },
      data: { status: 'ERROR', errorMessage: FRAGMENTATION_REASON },
    })
    return
  }

  // === 自动提取结构化数据 ===
  if (item.autoExtract) {
    if (parseResult.text && parseResult.text.trim().length > 20) {
      await saveStructuredData(parseResult.text, {
        resumeId: item.resumeId,
        logPrefix: '[ParsingQueue]',
        fallbackName: candidateName,
        extractOptions: {
          resumeId: item.resumeId,
          onProgress: item.onProgress,
        },
        // Worker 独有：把 AI 提取的电话/邮箱写回简历
        extractPhoneEmail: true,
        fallbackPhone: parseResult.phone || null,
        fallbackEmail: parseResult.email || null,
      })
    } else {
      console.warn(
        `[ParsingQueue] 简历 ${item.resumeId} 跳过结构化提取: ` +
          `text长度=${parseResult.text?.length || 0}, trimmed=${parseResult.text?.trim().length || 0}`
      )
    }
  }

  // === 自动进入筛选队列 ===
  if (item.autoScreen) {
    console.log(`[ParsingQueue] 简历 ${item.resumeId} 开始自动加入筛选队列...`)
    try {
      await screeningQueue.enqueue([
        {
          resumeId: item.resumeId,
          positionId: positionMatch?.positionId,
        },
      ])
      console.log(`[ParsingQueue] 简历 ${item.resumeId} 已自动加入筛选队列`)
    } catch (screenError: unknown) {
      const msg = screenError instanceof Error ? screenError.message : '未知错误'
      console.error(`[ParsingQueue] 自动入队筛选失败 resumeId=${item.resumeId}: ${msg}`)
    }
  }
}