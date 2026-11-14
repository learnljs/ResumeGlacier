/**
 * Webhook字段映射引擎
 *
 * 职责：将 HR 系统的跟进记录数据，按 WebhookIntegration 配置翻译成Webhook 所需的 values 格式。
 *
 * 核心函数：translateRecord(context, mappings) -> { values, warnings }
 *   - 根据每个 mapping 的 transformType 执行取值/转换
 *   - 根据 targetFieldType 决定输出格式（Text 直接字符串、SingleSelect 包成 [{"text":"..."}] 等）
 *   - 转换失败/枚举未命中时该字段留空，记录告警
 */

import type { WebhookRecordValues } from '@/lib/services/webhook-delivery-client'
import { calculateWorkYears, getEffectiveGradYear } from '@/lib/services/hard-condition-filter'
import { HR_FIELD_MAP } from '@/lib/constants/webhook-fields'
import type { TransformType, TargetFieldType } from '@/lib/constants/webhook-fields'

// 映射配置（与 Prisma WebhookIntegration 模型对应，去掉非必要字段）
export interface FieldMapping {
  id: string
  hrField: string
  targetFieldId: string | null
  targetFieldName: string | null
  targetFieldType: string | null
  transformType: string
  transformConfig: string | null
  isEnabled: boolean
}

// 翻译上下文：HR 系统数据（已通过 Prisma 查询组装好）
export interface TranslateContext {
  // 嵌套对象，字段路径如 "resume.candidateName" 从中取值
  resume?: Record<string, unknown>
  position?: Record<string, unknown>
  followUpRecord?: Record<string, unknown>
  evaluation?: Record<string, unknown>
}

// 翻译结果
export interface TranslateResult {
  values: WebhookRecordValues
  // 转换过程中的告警（字段名 + 原因），供日志记录
  warnings: string[]
}

// 解析 transformConfig JSON（容错）
function parseConfig(config: string | null): Record<string, unknown> | string | null {
  if (!config) return null
  try {
    return JSON.parse(config)
  } catch {
    // 非 JSON（如 FIXED 的纯字符串值、Webhook URL），原样返回
    return config
  }
}

/** 解析简历 structuredData JSON，失败返回 null */
function parseStructuredData(context: TranslateContext): Record<string, unknown> | null {
  const obj = context.resume
  if (!obj || typeof obj !== 'object') return null
  const sd = (obj as Record<string, unknown>).structuredData
  if (typeof sd !== 'string' || !sd) return null
  try {
    const parsed = JSON.parse(sd) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 学历排序权重（数字越小越高）
const DEGREE_RANK: Record<string, number> = {
  '博士': 0, '博士研究生': 0,
  '硕士': 1, '硕士研究生': 1, 'MBA': 1, 'EMBA': 1,
  '本科': 2, '学士': 2,
  '大专': 3, '专科': 3,
  '中专': 4, '中技': 4,
  '高中': 5, '职高': 5,
  '初中': 6,
}

/** 获取学历权重，未匹配的排最后 */
function getDegreeRank(degree: string): number {
  const d = degree?.trim()
  return DEGREE_RANK[d] ?? 99
}

/**
 * 将 structuredData 中的数组类型字段格式化为可读文本
 * education → 只取最高学历："武汉工程大学 硕士 土木工程"
 * skills → "技能1, 技能2"
 */
function formatStructuredArray(key: string, arr: unknown[]): string {
  if (arr.length === 0) return ''
  const first = arr[0]
  if (typeof first === 'string') return arr.join(', ')

  if (typeof first === 'object' && first !== null) {
    // education 特殊处理：只取最高学历，不走 per-item map
    if (key === 'education') {
      const sorted = [...arr].sort((a, b) => {
        const oa = a as Record<string, unknown>
        const ob = b as Record<string, unknown>
        return getDegreeRank(String(oa.degree || '')) - getDegreeRank(String(ob.degree || ''))
      })
      const best = sorted[0] as Record<string, unknown>
      return [best.school, best.degree, best.major]
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .join(' ')
        || String(best.school || best.degree || best.major || '')
    }

    const items = arr.map((item) => {
      const o = item as Record<string, unknown>
      switch (key) {
        case 'experience':
          return [o.company, o.position]
            .filter((v): v is string => typeof v === 'string' && v.length > 0)
            .join(' - ')
            || String(o.company || o.position || '')
        case 'projects':
          return String(o.name || o.title || '')
        default:
          return JSON.stringify(o)
      }
    })
    return items.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0).join('；')
  }

  return arr.map(String).join(', ')
}

/**
 * 按字段路径从上下文取值
 * 支持点号路径，如 "resume.candidateName" -> context.resume.candidateName
 * 特殊路径：
 *   - resume.structuredData.<key> -> 解析 structuredData JSON，取 <key>
 *   - followUpRecord.tagNames -> 拼接标签名（逗号分隔）
 *   - resume.candidateName -> 直接取字段
 */
function getValueByPath(context: TranslateContext, path: string): unknown {
  // 进入待面试时间（从跟进日志取第一条"沟通中→待面试"的时间）
  if (path === 'followUpRecord.scheduledAt') {
    const obj = context.followUpRecord
    if (!obj || typeof obj !== 'object') return undefined
    const record = obj as Record<string, unknown>
    const logs = record.logs as Array<{ action?: string; detail?: string; createdAt?: string | Date }> | undefined
    if (logs && Array.isArray(logs)) {
      const statusLog = logs.find(
        (l) => l.detail?.includes('沟通中') && l.detail?.includes('待面试')
      )
      if (statusLog?.createdAt) {
        return new Date(statusLog.createdAt)
      }
    }
    return undefined
  }

  // 标签拼接
  if (path === 'followUpRecord.tagNames') {
    const obj = context.followUpRecord
    if (!obj || typeof obj !== 'object') return undefined
    const record = obj as Record<string, unknown>
    const tags = record.tags as Array<{ followUpTag?: { name?: string } }> | undefined
    if (tags && Array.isArray(tags)) {
      const names = tags
        .map((t) => t.followUpTag?.name)
        .filter((n): n is string => !!n)
      return names.length > 0 ? names.join(', ') : null
    }
    return null
  }

  // structuredData JSON 解析
  if (path.startsWith('resume.structuredData.')) {
    const obj = context.resume
    if (!obj || typeof obj !== 'object') return undefined
    const resume = obj as Record<string, unknown>
    const sd = resume.structuredData
    if (typeof sd !== 'string' || !sd) return undefined
    try {
      const parsed = JSON.parse(sd) as Record<string, unknown>
      const key = path.slice('resume.structuredData.'.length)
      const value = parsed[key]
      // 数组类型自动格式化为人可读文本
      if (Array.isArray(value)) {
        return formatStructuredArray(key, value)
      }
      return value
    } catch {
      return undefined
    }
  }

  const parts = path.split('.')
  if (parts.length < 2) return undefined
  const [table, ...fieldParts] = parts
  const field = fieldParts.join('.')
  const obj = context[table as keyof TranslateContext]
  if (!obj || typeof obj !== 'object') return undefined
  return (obj as Record<string, unknown>)[field]
}

/**
 * 将 HR 系统时间转换为Webhook日期字段的毫秒时间戳字符串
 * 输入可能是：Date 对象、ISO 字符串、"YYYY-MM-DDTHH:mm"（datetime-local）、"YYYY-MM-DD" 等
 * - HR 系统的时间输入均为北京时间（东八区）语义，无时区字符串显式按 +08:00 解析，不依赖容器本地时区
 * - Webhook日期字段支持毫秒时间戳字符串（见Webhook文档 path/101240），绝对时刻无时区歧义，按企业时区显示
 */
function formatDateTime(value: unknown): string | null {
  if (value == null) return null

  let ms: number
  if (value instanceof Date) {
    ms = value.getTime()
  } else if (typeof value === 'string') {
    // 已是毫秒时间戳字符串（TIMESTAMP 转换后可能被 DATE_TIME 分支二次调用），原样返回
    if (/^\d{13}$/.test(value.trim())) {
      return value.trim()
    }
    // datetime-local 格式 "YYYY-MM-DDTHH:mm" -> 替换 T 为空格
    const normalized = value.includes('T') ? value.replace('T', ' ') : value
    // 如果只有日期 "YYYY-MM-DD"，补全为 "YYYY-MM-DD 00:00:00"
    const full = /^\d{4}-\d{2}-\d{2}$/.test(normalized.trim())
      ? `${normalized.trim()} 00:00:00`
      : normalized
    // 无时区字符串按北京时间（+08:00）解析，带时区（Z / +08:00 等）的字符串原样解析
    const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(full)
    const date = new Date(hasTimezone ? full : `${full}+08:00`)
    if (isNaN(date.getTime())) return null
    ms = date.getTime()
  } else {
    return null
  }

  // Webhook日期字段以字符串形式传毫秒时间戳（绝对时刻，按企业时区显示）
  return String(ms)
}

/**
 * 按 transformType 取原始值
 */
function extractRawValue(mapping: FieldMapping, context: TranslateContext): { value: unknown; warning?: string } {
  const transformType = mapping.transformType as TransformType
  const config = parseConfig(mapping.transformConfig)

  switch (transformType) {
    case 'DIRECT': {
      const value = getValueByPath(context, mapping.hrField)
      return { value }
    }

    case 'TIMESTAMP': {
      const raw = getValueByPath(context, mapping.hrField)
      const formatted = formatDateTime(raw)
      if (raw != null && formatted == null) {
        return { value: null, warning: `字段 ${mapping.hrField} 的时间格式无法解析（原值: ${String(raw)}）` }
      }
      return { value: formatted }
    }

    case 'ENUM_MAP': {
      const raw = getValueByPath(context, mapping.hrField)
      if (raw == null) return { value: null }
      const enumMap = (config && typeof config === 'object' ? config : {}) as Record<string, string>
      const rawKey = String(raw)
      if (!(rawKey in enumMap)) {
        return { value: null, warning: `字段 ${mapping.hrField} 的枚举值「${rawKey}」未在映射表中命中` }
      }
      return { value: enumMap[rawKey] }
    }

    case 'CONCAT': {
      // config 是模板字符串，如 "{resume.candidateName} - {position.title}"
      if (typeof config !== 'string') {
        return { value: null, warning: `拼接字段 ${mapping.targetFieldName || mapping.hrField} 的模板配置缺失` }
      }
      const template = config
      const result = template.replace(/\{([^}]+)\}/g, (_match, path: string) => {
        const v = getValueByPath(context, path.trim())
        return v != null ? String(v) : ''
      })
      return { value: result }
    }

    case 'FIXED': {
      // config 是固定值字符串
      if (typeof config !== 'string') {
        return { value: null, warning: `固定值字段 ${mapping.targetFieldName || mapping.hrField} 未配置值` }
      }
      return { value: config }
    }

    case 'WORK_YEARS_RANGE': {
      // 工作年限档位映射：毕业年份从 education 推断（getEffectiveGradYear），工作年限从 experience 计算（calculateWorkYears）
      // 在校=未毕业(graduationYear>当前年)，应届=今年毕业(不看工作时间)，
      // 已毕业/无法推断按 workYears 分档，workYears=0 留空
      // 枚举需与Webhook表格选项完全一致：应届 / 1-3 年 / 3-5 年 / 5-10 年 / 10 年以上 / 在校
      const data = parseStructuredData(context)
      const currentYear = new Date().getFullYear()
      const gradYear = data
        ? getEffectiveGradYear(
            Array.isArray(data.education) ? data.education : [],
            currentYear
          )
        : null
      const workYears = data ? calculateWorkYears(data) : 0

      if (gradYear != null) {
        if (gradYear > currentYear) return { value: '在校' }
        if (gradYear === currentYear) return { value: '应届' }
      }
      // 已毕业（gradYear < 当前年）或无法推断：按 workYears 分档
      if (workYears > 0 && workYears < 3) return { value: '1-3 年' }
      if (workYears >= 3 && workYears < 5) return { value: '3-5 年' }
      if (workYears >= 5 && workYears < 10) return { value: '5-10 年' }
      if (workYears >= 10) return { value: '10 年以上' }
      // workYears == 0：留空
      return { value: null }
    }

    default:
      return { value: null, warning: `未知的转换方式：${mapping.transformType}` }
  }
}

/**
 * 按 targetFieldType 将原始值包装成Webhook要求的格式
 * 文档：https://developer.work.weixin.qq.com/document/path/101240 Value 部分
 */
function wrapByFieldType(
  rawValue: unknown,
  fieldType: string | null
): unknown {
  if (rawValue == null) return null

  const type = (fieldType || 'TEXT') as TargetFieldType

  switch (type) {
    case 'TEXT':
    case 'PHONE_NUMBER':
    case 'EMAIL':
    case 'BARCODE':
      // 文本类：简单模式直接传字符串
      return String(rawValue)

    case 'NUMBER':
    case 'PROGRESS':
    case 'CURRENCY':
    case 'PERCENTAGE':
      // 数值类：转 number
      const num = Number(rawValue)
      return isNaN(num) ? null : num

    case 'CHECKBOX':
      // 复选框：布尔值
      if (typeof rawValue === 'boolean') return rawValue
      if (typeof rawValue === 'string') {
        return rawValue === 'true' || rawValue === '1'
      }
      return Boolean(rawValue)

    case 'DATE_TIME':
      // 日期：毫秒时间戳字符串（formatDateTime 已转换为Webhook支持的格式）
      // extractRawValue 的 TIMESTAMP 已转换；DIRECT 传来的可能未转换，这里兜底
      if (rawValue instanceof Date || typeof rawValue === 'string') {
        const formatted = formatDateTime(rawValue)
        return formatted
      }
      return String(rawValue)

    case 'SINGLE_SELECT':
      // 单选：[{"text":"选项内容"}]
      return [{ text: String(rawValue) }]

    case 'SELECT':
      // 多选：[{"text":"选项1"},{"text":"选项2"}]
      // 支持逗号分隔字符串（如标签拼接结果 "标签A, 标签B"）
      if (Array.isArray(rawValue)) {
        return rawValue.map((v) => ({ text: String(v) }))
      }
      const str = String(rawValue)
      return str
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => ({ text: s }))

    case 'URL':
      // 链接：[{"text":"显示文本","link":"url"}]
      return [{ text: String(rawValue), link: String(rawValue) }]

    case 'USER':
      // 成员字段：MVP 跳过关联档案，按 user_id 模式留空（不写入）
      // 传 null 让上层留空
      return null

    case 'REFERENCE':
      // 关联字段：传入被关联表的 record_id（单条或数组），格式 [{"record_id":"xxx"}]
      if (Array.isArray(rawValue)) {
        return rawValue.map((v) => ({ record_id: String(v) }))
      }
      const refId = String(rawValue)
      return refId ? [{ record_id: refId }] : null

    case 'IMAGE':
    case 'LOCATION':
      // 图片/地理位置：结构复杂，MVP 不支持，留空
      return null

    default:
      // 未知类型，按文本处理
      return String(rawValue)
  }
}

/**
 * 翻译单条跟进记录为Webhook values
 * @param context HR 系统数据上下文
 * @param mappings 启用的字段映射列表（已过滤掉 Webhook URL 行和禁用行）
 */
export function translateRecord(
  context: TranslateContext,
  mappings: FieldMapping[]
): TranslateResult {
  const values: WebhookRecordValues = {}
  const warnings: string[] = []

  for (const mapping of mappings) {
    if (!mapping.isEnabled) continue
    if (!mapping.targetFieldId) {
      // 没有Webhook字段 ID 的行无法写入（Webhook URL 行也属于此类，调用方应已过滤）
      continue
    }

    const { value: rawValue, warning } = extractRawValue(mapping, context)
    if (warning) {
      warnings.push(warning)
    }

    const wrapped = wrapByFieldType(rawValue, mapping.targetFieldType)

    // null 值不写入该字段（留空），避免覆盖Webhook端已有值
    if (wrapped != null) {
      values[mapping.targetFieldId] = wrapped
    }
  }

  return { values, warnings }
}

/**
 * 校验字段路径是否在 HR 可用字段列表中
 * 用于配置页保存前的校验
 */
export function isValidHrField(path: string): boolean {
  return path in HR_FIELD_MAP
}
