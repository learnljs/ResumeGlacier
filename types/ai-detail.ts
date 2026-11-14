/**
 * AI 评分依据（EvaluationDimension.aiDetail）的类型与归一化解析。
 *
 * 数据库以 JSON 字符串存储，历史上存在三代格式：
 * - `new`            新版（开发方案 4.4）：`{ star, comment, scoringApplied?, directions[] }`
 * - `legacy-scored`  旧版 ScoredDimension 31 题：`{ rating, questions, directions(Map), voting, insurance }`
 * - `legacy-aspects` 更早的 `{ aspects, reasoning }`
 *
 * 统一为带判别字段（`kind`）的 discriminated union，
 * 组件层用 `parseAiDetail()` 做一次运行时归一化即可安全收窄，无需 `as unknown as X` 双断言。
 */

/** 新版：单题作答 */
export interface AiDetailQuestion {
  key: string
  /** 阶段二输出瘦身后由 AI 回吐，旧数据缺失，缺失时由前端按 key 从 prompt 配置取 */
  text?: string
  answer: boolean
  evidence: string | null
}

/** 新版：单个方向 */
export interface AiDetailDirection {
  name?: string
  star: number
  comment?: string
  questions: AiDetailQuestion[]
}

/** 新版维度依据（开发方案 4.4） */
export interface AiDetailNew {
  kind: 'new'
  star: number
  comment: string
  scoringApplied?: string
  directions: AiDetailDirection[]
}

/** 旧版：单题作答 */
export interface LegacyQuestionAnswer {
  answer: boolean
  evidence: string | null
}

/** 旧版：单个方向得分 */
export interface LegacyDirectionScore {
  yesCount: number
  totalCount: number
  star: number
}

/** 旧版 ScoredDimension 31 题依据（只读兼容） */
export interface AiDetailLegacyScored {
  kind: 'legacy-scored'
  rating: number
  questions: Record<string, LegacyQuestionAnswer>
  directions: Record<string, LegacyDirectionScore>
  voting: {
    directionStars?: number[]
    majorityStar?: number | null
    adjustments?: string[]
  }
  insurance: {
    applied?: string[]
    overrides?: string[]
  }
}

/** 更早版本的单个方面 */
export interface LegacyAspectItem {
  signal: string
  excerpt: string
}

/** 更早的 aspects + reasoning 依据（只读兼容） */
export interface AiDetailLegacyAspects {
  kind: 'legacy-aspects'
  aspects: Record<string, LegacyAspectItem>
  reasoning: string
}

/** 无法识别 / 空数据 */
export interface AiDetailUnknown {
  kind: 'unknown'
}

export type AiDetail =
  | AiDetailNew
  | AiDetailLegacyScored
  | AiDetailLegacyAspects
  | AiDetailUnknown

/** 把任意来源的 aiDetail（对象 / JSON 字符串 / 其它）收成普通对象 */
function toRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return toRecord(JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return null
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/**
 * 归一化 aiDetail：识别格式并补判别字段 `kind`。
 * 识别顺序与原渲染逻辑一致：new（directions 为数组）→ legacy-scored（有 voting）→ legacy-aspects（有 aspects）。
 */
export function parseAiDetail(raw: unknown): AiDetail {
  const obj = toRecord(raw)
  if (!obj) return { kind: 'unknown' }

  if (Array.isArray(obj.directions)) {
    return {
      kind: 'new',
      star: asNumber(obj.star),
      comment: asString(obj.comment),
      scoringApplied: typeof obj.scoringApplied === 'string' ? obj.scoringApplied : undefined,
      directions: obj.directions as AiDetailDirection[],
    }
  }

  if ('voting' in obj) {
    return {
      kind: 'legacy-scored',
      rating: asNumber(obj.rating),
      questions: (obj.questions as Record<string, LegacyQuestionAnswer>) ?? {},
      directions: (obj.directions as Record<string, LegacyDirectionScore>) ?? {},
      voting: (obj.voting as AiDetailLegacyScored['voting']) ?? {},
      insurance: (obj.insurance as AiDetailLegacyScored['insurance']) ?? {},
    }
  }

  if ('aspects' in obj) {
    return {
      kind: 'legacy-aspects',
      aspects: (obj.aspects as Record<string, LegacyAspectItem>) ?? {},
      reasoning: asString(obj.reasoning),
    }
  }

  return { kind: 'unknown' }
}
