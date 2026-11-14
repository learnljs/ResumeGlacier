/**
 * 简历数据提取器
 * 使用 AI 将简历文本转换为结构化数据
 */

import type OpenAI from 'openai'
import { getAIConfigByPurpose } from './ai-config-helper'
import {
  STRUCTURED_EXTRACTION_SYSTEM_PROMPT,
  structuredExtractionUserPrompt,
} from '@/lib/prompts/extraction'
import type { StructuredResumeData, ItemProgress } from '@/types/resume'
import { logAiUsage } from '@/lib/services/ai-usage-log'

/**
 * 思考链控制参数（GLM 等模型扩展，OpenAI SDK 类型未收录；显式声明以保留其余字段的类型检查）
 */
type ChatCompletionCreateParamsWithThinking = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  thinking?: { type: 'disabled' | 'enabled' }
}

export interface ExtractionResult {
  data: StructuredResumeData | null
  rawJson: string | null
  error: string | null
  model: string
  /** 字段级置信度评分（0-100），key 为字段路径 */
  fieldConfidence?: Record<string, number>
  /** 检测到的问题列表 */
  issues?: { field: string; issue: string; severity: 'warning' | 'error' }[]
}

/**
 * 字段级验证结果
 */
interface FieldValidation {
  field: string
  score: number          // 0-100
  valid: boolean
  issue?: string
  suggestion?: string
  corrected?: string | number | null
}

/**
 * 结构化数据后置验证
 * 对 AI 提取的结构化数据进行规则校验、格式验证和交叉验证
 */
function validateExtractedData(
  data: unknown,
  rawText: string
): { confidence: Record<string, number>; issues: { field: string; issue: string; severity: 'warning' | 'error' }[] } {
  const validations: FieldValidation[] = []
  const d = data as Record<string, unknown> | null
  if (!d) {
    return { confidence: {}, issues: [{ field: 'root', issue: '数据为空', severity: 'error' }] }
  }

  // === 姓名验证 ===
  validateName(d, validations, rawText)

  // === 手机号验证 ===
  validatePhone(d, validations, rawText)

  // === 邮箱验证 ===
  validateEmail(d, validations, rawText)

  // === 教育经历验证 ===
  validateEducation(d, validations)

  // === 工作经历验证 ===
  validateExperience(d, validations)

  // === 日期格式验证 ===
  validateDates(d, validations)

  // === 技能验证 ===
  validateSkills(d, validations)

  // 汇总置信度和问题
  const confidence: Record<string, number> = {}
  const issues: { field: string; issue: string; severity: 'warning' | 'error' }[] = []

  for (const v of validations) {
    confidence[v.field] = v.score
    if (!v.valid) {
      issues.push({
        field: v.field,
        issue: v.issue || '验证失败',
        severity: v.score < 30 ? 'error' : 'warning',
      })
    }
  }

  return { confidence, issues }
}

/**
 * 验证姓名
 */
function validateName(data: Record<string, unknown>, validations: FieldValidation[], rawText: string): void {
  const aiName = ((data.name as string | undefined) || (data.basicInfo as Record<string, unknown> | undefined)?.name)
  const normalizedName = typeof aiName === 'string' ? aiName.trim() : ''

  if (!normalizedName) {
    validations.push({ field: 'name', score: 0, valid: false, issue: '姓名为空' })
    return
  }

  let score = 100
  let valid = true
  let issue: string | undefined

  // 检查是否为无效占位值
  const invalidNames = ['姓名', '名字', 'name', '未知', '未知名称', '无', '暂无', 'null', 'none']
  if (invalidNames.includes(normalizedName.toLowerCase())) {
    score = 0
    valid = false
    issue = `姓名为无效占位值: "${normalizedName}"`
  }

  // 检查长度
  if (normalizedName.length > 20) {
    score = 20
    valid = false
    issue = `姓名过长 (${normalizedName.length} 字符)`
  }

  // 交叉验证：检查姓名是否在原文中出现
  if (valid && !rawText.includes(normalizedName)) {
    score = Math.min(score, 60)
    issue = `AI 提取的姓名 "${normalizedName}" 在原文中未找到匹配`
  }

  validations.push({ field: 'name', score, valid, issue })
}

/**
 * 验证手机号
 */
function validatePhone(data: Record<string, unknown>, validations: FieldValidation[], rawText: string): void {
  const aiPhone = ((data.phone as string | undefined) || (data.basicInfo as Record<string, unknown> | undefined)?.phone)
  const phone = typeof aiPhone === 'string' ? aiPhone.replace(/\D/g, '') : ''

  if (!phone) {
    validations.push({ field: 'phone', score: 0, valid: false, issue: '手机号为空' })
    return
  }

  let score = 100
  let valid = true
  let issue: string | undefined

  // 检查格式
  const isValidMobile = /^1[3-9]\d{9}$/.test(phone)
  const isValidLandline = /^0\d{2,3}\d{7,8}$/.test(phone)

  if (!isValidMobile && !isValidLandline) {
    score = 30
    valid = false
    issue = `手机号格式无效: "${phone}"`
  }

  // 交叉验证：检查是否在原文中出现
  if (valid && !rawText.includes(phone)) {
    // 可能是 AI 格式化了号码（加了/减了分隔符），尝试模糊匹配
    const rawDigits = rawText.replace(/\D/g, '')
    if (!rawDigits.includes(phone)) {
      score = Math.min(score, 70)
      issue = `AI 提取的手机号 "${phone}" 在原文中未找到精确匹配`
    }
  }

  validations.push({ field: 'phone', score, valid, issue })
}

/**
 * 验证邮箱
 */
function validateEmail(data: Record<string, unknown>, validations: FieldValidation[], rawText: string): void {
  const aiEmail = ((data.email as string | undefined) || (data.basicInfo as Record<string, unknown> | undefined)?.email)
  const email = typeof aiEmail === 'string' ? aiEmail.trim() : ''

  if (!email) {
    validations.push({ field: 'email', score: 0, valid: false, issue: '邮箱为空' })
    return
  }

  let score = 100
  let valid = true
  let issue: string | undefined

  // 邮箱格式校验
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/
  if (!emailRegex.test(email)) {
    score = 30
    valid = false
    issue = `邮箱格式无效: "${email}"`
  }

  // 交叉验证
  if (valid && !rawText.includes(email)) {
    score = Math.min(score, 70)
    issue = `AI 提取的邮箱 "${email}" 在原文中未找到匹配`
  }

  validations.push({ field: 'email', score, valid, issue })
}

/**
 * 验证教育经历
 */
function validateEducation(data: Record<string, unknown>, validations: FieldValidation[]): void {
  const edu = data.education
  if (!Array.isArray(edu) || edu.length === 0) {
    validations.push({ field: 'education', score: 20, valid: false, issue: '教育经历为空' })
    return
  }

  let totalScore = 0
  let validCount = 0

  for (let i = 0; i < edu.length; i++) {
    const entry = edu[i] as Record<string, unknown>
    let entryScore = 100

    // 学校名称验证
    const school = typeof entry.school === 'string' ? entry.school.trim() : ''
    if (!school || school.length < 2) {
      entryScore -= 40
    }

    // 学历验证
    const degree = typeof entry.degree === 'string' ? entry.degree.trim() : ''
    const validDegrees = ['初中', '高中', '中专', '大专', '专科', '本科', '硕士', '博士', 'MBA', 'EMBA', '其他']
    if (degree && !validDegrees.some((d) => degree.includes(d))) {
      entryScore -= 20
    }

    // 时间逻辑验证
    const startDate = typeof entry.startDate === 'string' ? entry.startDate : ''
    const endDate = typeof entry.endDate === 'string' ? entry.endDate : ''
    if (startDate && endDate && endDate !== '在读' && endDate !== '至今') {
      if (startDate > endDate) {
        entryScore -= 30
      }
    }

    if (entryScore >= 60) validCount++
    totalScore += entryScore
  }

  const avgScore = Math.round(totalScore / edu.length)
  const valid = validCount === edu.length
  const issue = valid ? undefined : `${edu.length} 条教育经历中有 ${edu.length - validCount} 条信息不完整`

  validations.push({ field: 'education', score: avgScore, valid, issue })
}

/**
 * 验证工作/实习经历
 */
function validateExperience(data: Record<string, unknown>, validations: FieldValidation[]): void {
  const exp = data.experience
  if (!Array.isArray(exp) || exp.length === 0) {
    validations.push({ field: 'experience', score: 50, valid: true, issue: undefined })
    return
  }

  let totalScore = 0
  let validCount = 0

  for (let i = 0; i < exp.length; i++) {
    const entry = exp[i] as Record<string, unknown>
    let entryScore = 100

    const company = typeof entry.company === 'string' ? entry.company.trim() : ''
    const position = typeof entry.position === 'string' ? entry.position.trim() : ''

    if (!company || company.length < 2) entryScore -= 25
    if (!position || position.length < 2) entryScore -= 25

    // type 字段验证
    const type = typeof entry.type === 'string' ? entry.type : ''
    if (type && !['internship', 'fulltime'].includes(type)) {
      entryScore -= 15
    }

    if (entryScore >= 50) validCount++
    totalScore += entryScore
  }

  const avgScore = Math.round(totalScore / exp.length)
  const valid = validCount === exp.length

  validations.push({
    field: 'experience',
    score: avgScore,
    valid,
    issue: valid ? undefined : `${exp.length} 条经历中有 ${exp.length - validCount} 条信息不完整`,
  })
}

/**
 * 验证日期格式
 */
function validateDates(data: Record<string, unknown>, validations: FieldValidation[]): void {
  const dateFields: { path: string; value: unknown }[] = []

  // 收集所有日期字段
  const collectDates = (obj: unknown, path: string) => {
    if (!obj || typeof obj !== 'object') return
    const o = obj as Record<string, unknown>
    for (const [key, val] of Object.entries(o)) {
      const curPath = path ? `${path}.${key}` : key
      if (typeof val === 'string' && /Date|date/i.test(key)) {
        dateFields.push({ path: curPath, value: val })
      } else if (Array.isArray(val)) {
        val.forEach((item, i) => collectDates(item, `${curPath}[${i}]`))
      } else if (val && typeof val === 'object') {
        collectDates(val, curPath)
      }
    }
  }
  collectDates(data, '')

  let invalidCount = 0
  for (const { path, value } of dateFields) {
    const dateStr = value as string
    // 允许的格式: YYYY-MM, YYYY, YYYY-MM-DD, 至今, 在读
    const validPatterns = [
      /^\d{4}-\d{2}$/,       // YYYY-MM
      /^\d{4}$/,             // YYYY
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^(至今|在读|在学)$/,
    ]
    if (!validPatterns.some((p) => p.test(dateStr))) {
      invalidCount++
      validations.push({
        field: path,
        score: 0,
        valid: false,
        issue: `日期格式无效: "${dateStr}"`,
      })
    }
  }

  if (invalidCount === 0 && dateFields.length > 0) {
    validations.push({ field: 'dates', score: 100, valid: true })
  }
}

/**
 * 验证技能数据
 */
function validateSkills(data: Record<string, unknown>, validations: FieldValidation[]): void {
  const skills = data.skills
  if (!skills) {
    validations.push({ field: 'skills', score: 70, valid: true })
    return
  }

  // 处理两种可能的格式：数组或对象
  if (Array.isArray(skills)) {
    const arr = skills as unknown[]
    const nonEmpty = arr.filter((s) => typeof s === 'string' && s.trim().length > 0)
    const score = arr.length === 0 ? 40 : Math.round((nonEmpty.length / arr.length) * 100)
    validations.push({ field: 'skills', score, valid: score >= 60 })
  } else if (typeof skills === 'object') {
    const s = skills as Record<string, unknown>
    let total = 0
    let validCount = 0
    for (const val of Object.values(s)) {
      if (Array.isArray(val)) {
        total += val.length
        validCount += val.filter((v) => typeof v === 'string' && v.trim().length > 0).length
      }
    }
    const score = total === 0 ? 50 : Math.round((validCount / total) * 100)
    validations.push({ field: 'skills', score, valid: score >= 60 })
  }
}

/**
 * 从 AI 返回内容中提取纯 JSON
 * 处理以下情况：
 * 1. markdown 代码块包裹（```json ... ```）
 * 2. JSON 后面跟了解释文字
 * 3. 前后有多余空白
 */
function extractJsonFromContent(content: string): string {
  let cleaned = content.trim()

  // 1. 移除 markdown 代码块包裹
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  }

  // 2. 尝试直接解析（可能已经是纯 JSON）
  try {
    JSON.parse(cleaned)
    return cleaned
  } catch {
    // 不是纯 JSON，继续处理
  }

  // 3. 用花括号匹配提取完整的 JSON 对象
  const start = cleaned.indexOf('{')
  if (start === -1) return cleaned

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return cleaned.substring(start, i + 1)
      }
    }
  }

  // 未找到匹配的闭合括号，返回从第一个 { 开始的内容
  return cleaned.substring(start)
}

/**
 * 根据 experience 条目的 section 字段（简历小节标题原文）确定性校正 type。
 * LLM 对"先识别小节归属再定 type"的两步推理不可靠，故把"标题->type"的确定性映射拿到代码层。
 * section 含"实习/见习/Intern" -> internship；含"工作/就业/Work" -> fulltime；无 section 保留 AI 判断。
 * 就地修改 data，返回重新序列化后的 JSON 字符串（rawJson 需同步更新，否则存库仍是旧 type）。
 */
function applySectionBasedTypeCorrection(data: StructuredResumeData, rawJson: string): string {
  const experience = (data as unknown as Record<string, unknown>).experience
  if (!Array.isArray(experience)) return rawJson
  let changed = false
  for (const exp of experience as Array<Record<string, unknown>>) {
    if (!exp) continue
    const section = typeof exp.section === 'string' ? exp.section : ''
    if (section.includes('实习') || section.includes('见习') || /intern/i.test(section)) {
      if (exp.type !== 'internship') { exp.type = 'internship'; changed = true }
    } else if (section.includes('工作') || section.includes('就业') || /work/i.test(section)) {
      if (exp.type !== 'fulltime') { exp.type = 'fulltime'; changed = true }
    }
  }
  return changed ? JSON.stringify(data) : rawJson
}

/**
 * 提取结构化简历数据
 */
export async function extractStructuredData(
  resumeText: string,
  options: { configId?: string; resumeId?: string; onProgress?: (progress: ItemProgress) => void } = {}
): Promise<ExtractionResult> {
  const { client, model } = await getAIConfigByPurpose('extraction', options.configId)
  options.onProgress?.({ stage: 'AI结构化提取', percent: 80 })

  try {
    const apiStart = Date.now()
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: STRUCTURED_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: structuredExtractionUserPrompt(resumeText) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 6000,
      thinking: { type: 'disabled' },
    } as ChatCompletionCreateParamsWithThinking)

    const apiMs = Date.now() - apiStart
    const usageDetail = response.usage as unknown as {
      prompt_tokens_details?: { cached_tokens?: number }
      completion_tokens_details?: { reasoning_tokens?: number }
      input_tokens_details?: { cached_tokens?: number }
      output_tokens_details?: { reasoning_tokens?: number }
    } | undefined
    const cachedTokens =
      usageDetail?.prompt_tokens_details?.cached_tokens ??
      usageDetail?.input_tokens_details?.cached_tokens ??
      0
    const reasoningTokens =
      usageDetail?.completion_tokens_details?.reasoning_tokens ??
      usageDetail?.output_tokens_details?.reasoning_tokens ??
      0
    logAiUsage({
      ts: new Date().toISOString(),
      resumeId: options.resumeId || '',
      stage: 'extraction',
      model: response.model || model,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      cachedTokens,
      reasoningTokens,
      totalTokens: response.usage?.total_tokens || 0,
      apiMs,
    })

    const content = response.choices[0]?.message?.content

    if (!content) {
      return {
        data: null,
        rawJson: null,
        error: 'AI 返回内容为空',
        model,
      }
    }

    // 解析 JSON（清理 AI 返回的多余内容）
    const cleanedJson = extractJsonFromContent(content)
    let data: StructuredResumeData
    let parsedJson: string  // 记录实际解析成功的 JSON 字符串
    try {
      data = JSON.parse(cleanedJson)
      parsedJson = cleanedJson
    } catch (parseErr) {
      // 清理失败时，尝试原始内容直接解析
      try {
        data = JSON.parse(content)
        parsedJson = content
      } catch {
        return {
          data: null,
          rawJson: content,
          error: `JSON 解析失败: ${parseErr instanceof Error ? parseErr.message : '未知错误'}`,
          model,
        }
      }
    }

    options.onProgress?.({ stage: 'AI结构化提取完成', percent: 95 })

    // 根据 section 字段确定性校正 experience.type，同步 rawJson
    parsedJson = applySectionBasedTypeCorrection(data, parsedJson)

    // 后置验证：字段校验 + 规则交叉验证 + 置信度评分
    const { confidence, issues } = validateExtractedData(data, resumeText)

    // 记录验证日志（严重问题）
    const errorIssues = issues.filter((i) => i.severity === 'error')
    if (errorIssues.length > 0) {
      console.log(`[ExtractionValidation] model=${model}, errors=${errorIssues.map((i) => `${i.field}:${i.issue}`).join('; ')}`)
    }

    return {
      data,
      rawJson: parsedJson,
      error: null,
      model,
      fieldConfidence: confidence,
      issues: issues.length > 0 ? issues : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'

    // 检查是否是模型不支持 JSON mode 的错误
    if (message.includes('json_object') || message.includes('not support')) {
      // 降级：不使用 response_format
      return extractStructuredDataWithoutJsonMode(resumeText, options)
    }

    return {
      data: null,
      rawJson: null,
      error: `结构化提取失败: ${message}`,
      model,
    }
  }
}

/**
 * 不使用 response_format 的降级方案
 */
async function extractStructuredDataWithoutJsonMode(
  resumeText: string,
  options: { configId?: string } = {}
): Promise<ExtractionResult> {
  const { client, model } = await getAIConfigByPurpose('extraction', options.configId)

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: STRUCTURED_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: structuredExtractionUserPrompt(resumeText) },
      ],
      temperature: 0.1,
      max_tokens: 6000,
      thinking: { type: 'disabled' },
    } as ChatCompletionCreateParamsWithThinking)

    const content = response.choices[0]?.message?.content

    if (!content) {
      return {
        data: null,
        rawJson: null,
        error: 'AI 返回内容为空',
        model,
      }
    }

    // 尝试从返回内容中提取 JSON
    const extractedJson = extractJsonFromContent(content)
    if (!extractedJson || !extractedJson.startsWith('{')) {
      return {
        data: null,
        rawJson: content,
        error: '无法从返回内容中提取 JSON',
        model,
      }
    }

    let data: StructuredResumeData
    try {
      data = JSON.parse(extractedJson)
    } catch (parseErr) {
      return {
        data: null,
        rawJson: content,
        error: `JSON 解析失败: ${parseErr instanceof Error ? parseErr.message : '未知错误'}`,
        model,
      }
    }

    // 根据 section 字段确定性校正 experience.type，同步 rawJson
    const correctedJson = applySectionBasedTypeCorrection(data, extractedJson)

    return {
      data,
      rawJson: correctedJson,
      error: null,
      model,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return {
      data: null,
      rawJson: null,
      error: `结构化提取失败: ${message}`,
      model,
    }
  }
}
