/**
 * 解析流水线共享逻辑
 *
 * 收敛 parsing-worker-processor / reparse / refetch / extract 四处重复实现：
 * - 文本质量门禁（assertParseQuality）
 * - 结构化数据保存（saveStructuredData）
 * - PDF 文字层破碎拦截文案（FRAGMENTATION_REASON）
 *
 * 调用方只需传入各自的上下文（logPrefix、fallbackName、是否需要提取电话/邮箱等），
 * 由本服务统一执行提取 → AI 姓名校正 → 写回简历 → NameUpdate 日志。
 */

import { prisma } from '@/lib/prisma'
import { extractStructuredData } from '@/lib/services/resume-data-extractor'
import { extractAiName, correctAiName } from '@/lib/services/resume-parser'
import type { ItemProgress } from '@/types/resume'

/** 文本质量门禁阈值（此前 worker / reparse / refetch 三处各自硬编码 40/50） */
export const PARSE_QUALITY_THRESHOLD = 40
export const PARSE_MIN_TEXT_LENGTH = 50

/** PDF 文字层破碎拦截文案（spec §6.4 已知限制：垃圾进 → 垃圾出） */
export const FRAGMENTATION_REASON =
  'PDF 文字层破碎,OCR/vision 均无法恢复(spec §6.4 已知限制),数据不可信'

export interface ParseQualityCheck {
  pass: boolean
  reason: string | null
}

/**
 * 文本质量门禁：质量过低、内容过短或乱码时拒绝进入后续流程
 */
export function assertParseQuality(parseResult: {
  text?: string | null
  textQualityScore: number
  isGarbled: boolean
}): ParseQualityCheck {
  const textLength = parseResult.text?.trim().length ?? 0
  if (
    parseResult.textQualityScore < PARSE_QUALITY_THRESHOLD ||
    textLength < PARSE_MIN_TEXT_LENGTH ||
    parseResult.isGarbled
  ) {
    const reason =
      textLength < PARSE_MIN_TEXT_LENGTH
        ? `文本内容过短（${textLength} 字符，最低要求 ${PARSE_MIN_TEXT_LENGTH} 字符），可能为无效解析结果`
        : `文本质量不合格（得分 ${parseResult.textQualityScore}，阈值 ${PARSE_QUALITY_THRESHOLD}），疑似乱码或不可解析的内容`
    return { pass: false, reason }
  }
  return { pass: true, reason: null }
}

export interface SaveStructuredDataOptions {
  resumeId: string
  /** 日志前缀，如 [ParsingQueue] / [Reparse] / [Refetch] / [Extract] */
  logPrefix: string
  /** 姓名兜底值（邮件主题/正则解析结果），correctAiName 校验 AI 姓名无效时回退到它 */
  fallbackName: string
  /** 传给 extractStructuredData 的额外选项（worker 传 resumeId/onProgress；extract 路由传 configId） */
  extractOptions?: {
    configId?: string
    resumeId?: string
    onProgress?: (progress: ItemProgress) => void
  }
  /**
   * 是否从 AI 结果中提取电话/邮箱并写回简历
   * 仅 worker 场景为 true；路由场景（reparse/refetch/extract）保持原行为（不更新电话/邮箱）
   */
  extractPhoneEmail?: boolean
  /** extractPhoneEmail=true 时的电话/邮箱兜底值（来自 parseResult） */
  fallbackPhone?: string | null
  fallbackEmail?: string | null
}

export interface SaveStructuredDataResult {
  success: boolean
  error: string | null
  /** 成功时返回 AI 原始提取姓名，便于调用方日志/调试 */
  aiName?: string | null
  /** 成功时返回最终写回的姓名（已校正） */
  finalName?: string | null
  /** 成功时透传 extractStructuredData 的 data/model，供需要原始结果的调用方使用 */
  data?: unknown
  model?: string
}

/**
 * 结构化提取 + AI 姓名校正 + 写回简历 + NameUpdate 日志
 *
 * 行为对齐：取代 worker / reparse / refetch / extract 四处各自的 ~20 行重复块。
 * 差异点通过 opts 表达（logPrefix、是否提取电话/邮箱、extract 选项）。
 */
export async function saveStructuredData(
  text: string | null | undefined,
  opts: SaveStructuredDataOptions
): Promise<SaveStructuredDataResult> {
  const trimmedLen = text?.trim().length ?? 0
  if (trimmedLen <= 20) {
    // 与四处原行为一致：太短则跳过结构化提取，不算失败
    return { success: false, error: null }
  }

  console.log(`${opts.logPrefix} 开始自动提取结构化数据 for ${opts.resumeId}`)
  try {
    const extractionResult = await extractStructuredData(text!, opts.extractOptions)

    if (!extractionResult.data || !extractionResult.rawJson) {
      if (extractionResult.error) {
        console.warn(`${opts.logPrefix} 结构化提取失败: ${extractionResult.error}`)
        return { success: false, error: extractionResult.error }
      }
      return { success: false, error: null }
    }

    const aiName = extractAiName(extractionResult.data)

    // AI 姓名有效性校正：PDF 文本层缺失姓名时 LLM 可能把字段标签"姓名"当值返回，
    // 无效则回退到 fallbackName（邮件主题/正则兜底），并同步修正 structuredData.name
    const { name: finalName, rawJson: structuredRawJson } = correctAiName(
      aiName,
      opts.fallbackName,
      extractionResult.rawJson,
    )

    // 仅在 extractPhoneEmail=true 时计算并更新电话/邮箱（worker 独有行为）
    let phoneUpdate: { candidatePhone: string | null } | Record<string, never> = {}
    let emailUpdate: { candidateEmail: string | null } | Record<string, never> = {}
    if (opts.extractPhoneEmail) {
      const d = extractionResult.data as unknown as Record<string, unknown>
      const basic = (d.basicInfo as Record<string, unknown> | undefined) ?? null
      const aiPhone = (basic?.phone ?? d.phone) as string | undefined
      const aiEmail = (basic?.email ?? d.email) as string | undefined
      phoneUpdate = { candidatePhone: aiPhone || opts.fallbackPhone || null }
      emailUpdate = { candidateEmail: aiEmail || opts.fallbackEmail || null }
    }

    await prisma.resume.update({
      where: { id: opts.resumeId },
      data: {
        structuredData: structuredRawJson,
        candidateName: finalName,
        ...phoneUpdate,
        ...emailUpdate,
      },
    })

    if (aiName !== finalName) {
      console.log(
        `[NameUpdate] resumeId=${opts.resumeId} field=candidateName source=subject value="${finalName}" (AI name "${aiName ?? ''}" invalid) timestamp=${new Date().toISOString()}`
      )
    } else {
      console.log(
        `[NameUpdate] resumeId=${opts.resumeId} field=candidateName source=ai value="${finalName}" previous="${opts.fallbackName}" timestamp=${new Date().toISOString()}`
      )
    }
    console.log(`${opts.logPrefix} 结构化数据提取成功`)

    return {
      success: true,
      error: null,
      aiName,
      finalName,
      data: extractionResult.data,
      model: extractionResult.model,
    }
  } catch (extractError: unknown) {
    const msg = extractError instanceof Error ? extractError.message : '未知错误'
    console.error(`${opts.logPrefix} 结构化提取异常: ${msg}`)
    return { success: false, error: msg }
  }
}